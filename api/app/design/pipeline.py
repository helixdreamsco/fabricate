"""Repair/validate pipeline shared by preset and AI jobs.

Order (per contract): load -> merge vertices -> drop degenerate faces -> keep
components >=2 % of volume -> manifoldise (manifold3d, voxel fallback) ->
decimate <=300k tris -> scale AI models -> bbox 20-250 mm -> thickness check ->
overhang heuristic -> export STL + preview GLB.
"""

import warnings

warnings.filterwarnings("ignore")

import numpy as np
import trimesh

from . import common

MAX_TRIANGLES = 300_000
PREVIEW_MAX_TRIANGLES = 80_000
MIN_BBOX_MM = 20.0
MAX_BBOX_MM = 250.0
MIN_THICKNESS_MM = 1.2
THICKNESS_SAMPLES = 2000
FRAGILE_FRACTION = 0.02          # >2 % thin samples -> too_fragile
OVERHANG_COS = np.sin(np.radians(50.0))   # face >50 deg from vertical: nz < -sin(50)
OVERHANG_AREA_FRACTION = 0.05
ISLAND_VOLUME_FRACTION = 0.02


class PipelineError(Exception):
    """Handled failure; message is the short fail_reason."""


def _component_volume(comp):
    if comp.is_watertight:
        return abs(comp.volume)
    try:
        return float(comp.convex_hull.volume)
    except Exception:
        return float(np.prod(comp.extents))


def repair(mesh):
    """Repair a mesh into a single watertight, manifold, positive-volume solid."""
    mesh = mesh.copy()
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()

    # Drop floating islands < 2 % of total volume (always keep the largest).
    components = mesh.split(only_watertight=False)
    if len(components) > 1:
        volumes = np.array([_component_volume(c) for c in components])
        total = volumes.sum()
        keep = [c for c, v in zip(components, volumes)
                if v >= ISLAND_VOLUME_FRACTION * total or v == volumes.max()]
        mesh = trimesh.util.concatenate(keep)

    # Consistent winding / outward normals.
    trimesh.repair.fix_normals(mesh)
    if mesh.is_watertight and mesh.volume < 0:
        mesh.invert()

    # Manifoldise: boolean-with-self via manifold3d, voxel remesh fallback.
    if not (mesh.is_watertight and mesh.is_winding_consistent):
        repaired = None
        try:
            man = common.to_manifold(mesh)
            if man.status().name == "NoError" and not man.is_empty():
                candidate = common.from_manifold(man + man)
                if candidate.is_watertight:
                    repaired = candidate
        except Exception:
            repaired = None
        if repaired is None:
            pitch = float(mesh.extents.max()) / 256.0
            vox = trimesh.voxel.creation.voxelize(mesh, pitch=pitch)
            remeshed = vox.fill().marching_cubes
            remeshed.apply_transform(vox.transform)
            repaired = remeshed
        mesh = repaired
        trimesh.repair.fix_normals(mesh)
        if mesh.is_watertight and mesh.volume < 0:
            mesh.invert()

    if not mesh.is_watertight:
        raise PipelineError("repair_failed")

    if len(mesh.faces) > MAX_TRIANGLES:
        mesh = mesh.simplify_quadric_decimation(face_count=MAX_TRIANGLES)
        mesh.merge_vertices()
        if not mesh.is_watertight:
            # decimation can nick the surface; a manifold3d self-union heals it
            try:
                man = common.to_manifold(mesh)
                if man.status().name == "NoError" and not man.is_empty():
                    mesh = common.from_manifold(man + man)
            except Exception:
                pass
        if not mesh.is_watertight:
            raise PipelineError("repair_failed")
    return mesh


def enforce_bbox(mesh, kind="preset", target_size_mm=None):
    """Scale AI models to the requested size; presets must already fit 20-250 mm."""
    if kind == "ai":
        if target_size_mm is not None and mesh.extents.max() > 0:
            mesh.apply_scale(float(target_size_mm) / float(mesh.extents.max()))
        else:
            # clamp into the printable range without changing valid models
            largest = float(mesh.extents.max())
            if largest > MAX_BBOX_MM:
                mesh.apply_scale(MAX_BBOX_MM / largest)
            elif largest < MIN_BBOX_MM and largest > 0:
                mesh.apply_scale(MIN_BBOX_MM / largest)
    largest = float(mesh.extents.max())
    if largest < MIN_BBOX_MM:
        raise PipelineError("too_small")
    if largest > MAX_BBOX_MM:
        raise PipelineError("too_large")
    # rest on Z=0, centred in XY
    b = mesh.bounds
    mesh.apply_translation([-(b[0][0] + b[1][0]) / 2.0, -(b[0][1] + b[1][1]) / 2.0, -b[0][2]])
    return mesh


def thickness_check(mesh):
    """Sample ~2000 surface points and ray-measure local thickness.

    Returns (thin_count, fragile). Deterministic (fixed seed).
    """
    points, face_idx = trimesh.sample.sample_surface(mesh, THICKNESS_SAMPLES, seed=0)
    normals = mesh.face_normals[face_idx]
    try:
        thickness = trimesh.proximity.thickness(
            mesh, points, normals=normals, method="ray"
        )
    except Exception:
        thickness = trimesh.proximity.thickness(mesh, points, method="max_sphere") * 2.0
    thickness = np.asarray(thickness)
    valid = np.isfinite(thickness) & (thickness > 1e-9)
    thin = int(np.sum(valid & (thickness < MIN_THICKNESS_MM)))
    fragile = thin > FRAGILE_FRACTION * len(points)
    return thin, fragile


def overhang_check(mesh):
    """Overhang faces >50 deg from vertical covering >5 % of area -> supports."""
    nz = mesh.face_normals[:, 2]
    # exclude faces resting on the build plate (all vertices near z=0)
    face_z = mesh.vertices[:, 2][mesh.faces]
    on_plate = face_z.max(axis=1) < 0.5
    overhang = (nz < -OVERHANG_COS) & ~on_plate
    area = mesh.area_faces
    total = float(area.sum())
    if total <= 0:
        return False
    return float(area[overhang].sum()) / total > OVERHANG_AREA_FRACTION


def make_preview(mesh):
    preview = mesh.copy()
    if len(preview.faces) > PREVIEW_MAX_TRIANGLES:
        preview = preview.simplify_quadric_decimation(face_count=PREVIEW_MAX_TRIANGLES)
    return preview


def export_artifacts(mesh, stl_path, glb_path):
    stl_bytes = mesh.export(file_type="stl")  # binary STL
    with open(stl_path, "wb") as fh:
        fh.write(stl_bytes)
    make_preview(mesh).export(glb_path)
    return stl_bytes


def process(mesh, kind="preset", target_size_mm=None):
    """Full repair + validation. Returns (mesh, partial_metrics dict)."""
    mesh = repair(mesh)
    mesh = enforce_bbox(mesh, kind=kind, target_size_mm=target_size_mm)
    thin, fragile = thickness_check(mesh)
    supports = overhang_check(mesh)
    ext = mesh.extents
    metrics = {
        "bboxMm": [round(float(ext[0]), 2), round(float(ext[1]), 2), round(float(ext[2]), 2)],
        "triangles": int(len(mesh.faces)),
        "thinAreas": thin,
        "supportsNeeded": bool(supports),
    }
    badge = "too_fragile" if fragile else ("needs_supports" if supports else "ready")
    return mesh, metrics, badge
