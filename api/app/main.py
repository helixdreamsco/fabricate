"""FastAPI app for server-side mesh analysis & slicing (Stage 2).

Endpoints:
  GET  /health  - status + slicer availability
  POST /analyze - multipart STL, returns mesh metrics
  POST /quote   - multipart STL + config, returns real slicer-based quote
                  (falls back to volume estimate when PrusaSlicer not present)
"""
from __future__ import annotations

import logging
from fastapi import FastAPI, Form, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from .analyze import analyze_bytes, as_dict as analysis_dict
from .design.routes import router as design_router, template_count
from .slicer import find_slicer, slice_mesh, slicer_version
from .pricing import (
    MATERIAL_DENSITY,
    QUALITY_LAYER_MM,
    as_dict as quote_dict,
    quote,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("fabricate.api")

app = FastAPI(title="Fabricate API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(design_router)


@app.get("/health")
def health():
    bin_path = find_slicer()
    return {
        "status": "ok",
        "service": "fabricate-api",
        "version": "0.1.0",
        "slicer": {
            "available": bin_path is not None,
            "path": bin_path,
            "version": slicer_version(bin_path) if bin_path else None,
            "engine": "PrusaSlicer",
        },
        "design": {
            "templates": template_count(),
            "ok": True,
        },
    }


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "file name required")
    suffix = file.filename.rsplit(".", 1)[-1].lower()
    if suffix not in ("stl", "3mf", "obj", "step", "stp"):
        raise HTTPException(415, f"unsupported file type: {suffix}")

    data = await file.read()
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(413, "file too large (max 80 MB)")

    # STEP is a parametric B-rep format — Trimesh can't tessellate it. We
    # accept the upload but return a stub analysis so the creator can still
    # configure + post the job. Auto-pricing won't fire (volume is unknown);
    # the creator sets a manual price at /checkout, and the maker slices
    # the STEP directly in their preferred CAD/slicer software.
    if suffix in ("step", "stp"):
        log.info("analyze: %s — STEP file, skipping mesh analysis", file.filename)
        return {
            "filename": file.filename,
            "size_bytes": len(data),
            "triangle_count": 0,
            "dims_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
            "volume_cm3": 0.0,
            "surface_area_cm2": 0.0,
            "is_watertight": False,
            "used_convex_hull": False,
            "warnings": [
                "STEP file — geometry not analysed in-browser. The maker will "
                "slice it directly. Set your price manually at checkout."
            ],
            "parts": [],
            "is_multi_material": False,
        }

    try:
        result = analyze_bytes(data, suffix=suffix)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    log.info(
        "analyze: %s — %d tris · %.2f cm³ · watertight=%s",
        file.filename,
        result.triangle_count,
        result.volume_cm3,
        result.is_watertight,
    )

    return {
        "filename": file.filename,
        "size_bytes": len(data),
        **analysis_dict(result),
    }


@app.post("/quote")
async def quote_endpoint(
    file: UploadFile = File(...),
    material: str = Form(...),
    quality: str = Form(...),
    infill: int = Form(...),
    quantity: int = Form(...),
    delivery: str = Form(...),
    discount_pct: int = Form(0),
    free_mode: bool = Form(False),
    color_count: int = Form(1),
):
    if material not in MATERIAL_DENSITY:
        raise HTTPException(400, f"unknown material: {material}")
    if quality not in QUALITY_LAYER_MM:
        raise HTTPException(400, f"unknown quality: {quality}")
    if delivery not in ("pickup", "courier"):
        raise HTTPException(400, f"unknown delivery: {delivery}")

    data = await file.read()
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(413, "file too large (max 80 MB)")

    suffix = (file.filename or "part.stl").rsplit(".", 1)[-1].lower()

    # STEP can't be quoted via the volume-based engine — return a zero-volume
    # quote stub. The frontend's CheckoutForm picks up `quote.engine == "step"`
    # and surfaces a manual price input.
    if suffix in ("step", "stp"):
        log.info("quote: %s — STEP file, manual pricing required", file.filename)
        return {
            "analysis": {
                "filename": file.filename,
                "size_bytes": len(data),
                "triangle_count": 0,
                "dims_mm": {"x": 0.0, "y": 0.0, "z": 0.0},
                "volume_cm3": 0.0,
                "surface_area_cm2": 0.0,
                "is_watertight": False,
                "used_convex_hull": False,
                "warnings": ["STEP file — manual pricing required."],
                "parts": [],
                "is_multi_material": False,
            },
            "quote": {
                "weight_g": 0.0,
                "time_minutes": 0.0,
                "material_cost": 0.0,
                "machine_cost": 0.0,
                "service_fee": 0.0,
                "delivery": 0.0,
                "subtotal": 0.0,
                "discount_applied": 0.0,
                "multi_material_surcharge": 0.0,
                "total": 0.0,
                "engine": "step",
            },
        }

    try:
        analysis = analyze_bytes(data, suffix=suffix)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    slice_result = slice_mesh(
        data,
        filament_density_g_per_cm3=MATERIAL_DENSITY[material],
        infill_pct=infill,
        layer_height_mm=QUALITY_LAYER_MM[quality],
    )

    if slice_result is not None:
        q = quote(
            volume_cm3=analysis.volume_cm3,
            surface_area_cm2=analysis.surface_area_cm2,
            material=material,
            quality=quality,
            infill_pct=infill,
            quantity=quantity,
            delivery=delivery,
            weight_g_override=slice_result.weight_g,
            time_minutes_override=slice_result.time_minutes,
            engine=f"{slice_result.engine} {slice_result.engine_version or ''}".strip(),
            discount_pct=discount_pct,
            free_mode=free_mode,
            color_count=color_count,
        )
        log.info(
            "quote: %s · real slicer · weight=%.2fg time=%.1fmin",
            file.filename,
            slice_result.weight_g,
            slice_result.time_minutes,
        )
    else:
        q = quote(
            volume_cm3=analysis.volume_cm3,
            surface_area_cm2=analysis.surface_area_cm2,
            material=material,
            quality=quality,
            infill_pct=infill,
            quantity=quantity,
            delivery=delivery,
            engine="volume-estimate",
            discount_pct=discount_pct,
            free_mode=free_mode,
            color_count=color_count,
        )
        log.info(
            "quote: %s · volume estimate (slicer not available)",
            file.filename,
        )

    return {
        "analysis": analysis_dict(analysis),
        "quote": quote_dict(q),
    }
