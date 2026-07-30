"""Design endpoints: template generation and mesh repair.

POST /design/generate  - deterministic template build -> repair -> validate -> slice-check
POST /design/repair    - uploaded mesh (.glb/.obj/.stl) through the same pipeline (AI mode)

Artifacts are returned base64-encoded and never persisted by this service.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import tempfile
import threading

import trimesh
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import common, pipeline, repo_root
from . import slicer as design_slicer
from .templates import REGISTRY

log = logging.getLogger("fabricate.api.design")

router = APIRouter(prefix="/design", tags=["design"])

MAX_UPLOAD_BYTES = 60 * 1024 * 1024
ALLOWED_UPLOAD_EXTS = ("glb", "obj", "stl")

# One repair/generate through the geometry stack at a time, per container.
#
# A dense AI mesh (~300k triangles in, 150k out) peaks around 2 GB across the
# trimesh pipeline, the PrusaSlicer child process and the G-code it writes to
# /tmp — which is a tmpfs on Cloud Run and so counts against the same limit.
# Two of those in parallel exceeded the 4 GiB container and got the service
# OOM-killed mid-request, surfacing to the user as a 503 from /design/repair.
#
# The platform's own concurrency setting can bound this, but only as long as
# nobody re-deploys with a different value, so the ceiling is enforced here
# too. Waiters queue; the service's request timeout is comfortably longer than
# a pipeline run.
_PIPELINE_SLOT = threading.BoundedSemaphore(1)


def load_spec(template_id):
    """Load a template spec JSON from <repo>/design/templates, or None."""
    if not isinstance(template_id, str) or "/" in template_id or "\\" in template_id:
        return None
    path = os.path.join(repo_root(), "design", "templates", "%s.json" % template_id)
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def template_count():
    """Number of templates with both a registered builder and a spec JSON."""
    return sum(1 for tid in REGISTRY if load_spec(tid) is not None)


class GenerateRequest(BaseModel):
    template_id: str
    template_version: int
    params: dict
    # Inline logo artwork keyed by asset id. This service is stateless and
    # cannot read the Node side's storage, so `asset` params carry their
    # polygons in the request rather than a storage key.
    assets: dict = {}


def _finish(mesh, metrics, badge):
    """Slice-check + export artifacts. Returns the 200 response payload."""
    with tempfile.TemporaryDirectory(prefix="fab-design-") as tmp:
        stl_path = os.path.join(tmp, "model.stl")
        stl_bytes = mesh.export(file_type="stl")  # binary STL
        with open(stl_path, "wb") as fh:
            fh.write(stl_bytes)
        estimate = design_slicer.slice_stl(stl_path, volume_mm3=float(mesh.volume))
    glb_bytes = pipeline.make_preview(mesh).export(file_type="glb")
    ordered = {
        "printTimeS": int(estimate["printTimeS"]),
        "filamentG": float(estimate["filamentG"]),
        "bboxMm": metrics["bboxMm"],
        "triangles": metrics["triangles"],
        "thinAreas": metrics["thinAreas"],
        "sliced": bool(estimate["sliced"]),
        "supportsNeeded": metrics["supportsNeeded"],
    }
    return {
        "metrics": ordered,
        "badge": badge,
        "stl_b64": base64.b64encode(stl_bytes).decode("ascii"),
        "glb_b64": base64.b64encode(glb_bytes).decode("ascii"),
    }


def _slice_failed_response(exc):
    return JSONResponse(
        status_code=422,
        content={"error": "slice_failed", "message": str(exc) or "slice_failed"},
    )


@router.post("/generate")
def generate(req: GenerateRequest):
    spec = load_spec(req.template_id)
    build = REGISTRY.get(req.template_id)
    if spec is None or build is None:
        raise HTTPException(404, "unknown template: %s" % req.template_id)
    if req.template_version != spec.get("version"):
        raise HTTPException(
            409,
            "template_version_mismatch: requested %s, current %s"
            % (req.template_version, spec.get("version")),
        )
    root = repo_root()
    with _PIPELINE_SLOT:
        try:
            mesh = build(req.params, spec, root, assets=req.assets)
            mesh, metrics, badge = pipeline.process(mesh, kind="preset")
        except common.InvalidParams as exc:
            raise HTTPException(422, str(exc))
        except pipeline.PipelineError as exc:
            raise HTTPException(422, str(exc))
        try:
            payload = _finish(mesh, metrics, badge)
        except design_slicer.SliceError as exc:
            return _slice_failed_response(exc)
    log.info(
        "design/generate: %s v%d -> badge=%s tris=%d sliced=%s",
        req.template_id, spec["version"], payload["badge"],
        payload["metrics"]["triangles"], payload["metrics"]["sliced"],
    )
    return payload


# Sync (not async) on purpose: the body is CPU-bound geometry work, so FastAPI
# runs it in the threadpool instead of stalling the event loop for its duration.
@router.post("/repair")
def repair(file: UploadFile = File(...)):
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_UPLOAD_EXTS:
        raise HTTPException(
            422, "unsupported file type: %r (expected .glb, .obj or .stl)" % ext
        )
    data = file.file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large (max 60 MB)")
    if not data:
        raise HTTPException(422, "uploaded file is empty")

    with _PIPELINE_SLOT:
        try:
            mesh = trimesh.load(io.BytesIO(data), file_type=ext, force="mesh")
        except Exception as exc:
            raise HTTPException(422, "could not load mesh: %s" % exc)
        del data
        if mesh is None or not hasattr(mesh, "faces") or len(mesh.faces) == 0:
            raise HTTPException(422, "mesh is empty or contains no triangles")

        try:
            mesh, metrics, badge = pipeline.process(mesh, kind="ai")
        except pipeline.PipelineError as exc:
            raise HTTPException(422, str(exc))
        try:
            payload = _finish(mesh, metrics, badge)
        except design_slicer.SliceError as exc:
            return _slice_failed_response(exc)
    log.info(
        "design/repair: %s -> badge=%s tris=%d sliced=%s",
        filename, payload["badge"],
        payload["metrics"]["triangles"], payload["metrics"]["sliced"],
    )
    return payload


# ---------------------------------------------------------------------------
# Demo generator (no Meshy key): deterministic prompt-seeded placeholder
# model, served as a GLB. The Node side treats it like any provider download.
# ---------------------------------------------------------------------------
from fastapi import Query
from fastapi.responses import Response

from . import mock_generator


@router.get("/mock-model")
def mock_model(prompt: str = Query(..., max_length=700), seed: int = Query(0, ge=0)):
    mesh = mock_generator.build_mock_model(prompt, seed)
    data = trimesh.exchange.gltf.export_glb(mesh)
    return Response(content=data, media_type="model/gltf-binary")
