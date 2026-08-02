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
VOXEL_MAX_TRIANGLES = 100_000
# 128^3 keeps voxelize under ~1 GB and features ~0.8 mm at max bbox — finer
# than FDM can print; 256^3 hit multi-GB peaks on fat shapes and got the
# service OOM-killed.
VOXEL_RESOLUTION = 128
THICKNESS_MAX_TRIANGLES = 80_000
MIN_BBOX_MM = 20.0
MAX_BBOX_MM = 250.0
DEFAULT_AI_SIZE_MM = 90.0
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
            repaired = _voxel_remesh(mesh)
        mesh = repaired
        trimesh.repair.fix_normals(mesh)
        if mesh.is_watertight and mesh.volume < 0:
            mesh.invert()

    if not mesh.is_watertight:
        raise PipelineError("repair_failed")

    if len(mesh.faces) > MAX_TRIANGLES:
        reduced = _bounded_decimate(mesh)
        if reduced is None:
            # Last resort: voxel remesh bounds size by construction
            # (<= ~VOXEL_RESOLUTION^2 surface cells) and is usually watertight.
            reduced = _voxel_remesh(mesh)
            trimesh.repair.fix_normals(reduced)
        if not reduced.is_watertight or len(reduced.faces) > MAX_TRIANGLES:
            raise PipelineError("repair_failed")
        mesh = reduced
    return mesh


def _voxel_remesh(mesh):
    """Rebuild as the surface of the filled voxel grid (always a solid).

    Subdivide-based voxelisation explodes in memory on dense meshes, so
    decimate first — the grid resolution caps detail anyway.
    """
    src = mesh
    if len(src.faces) > VOXEL_MAX_TRIANGLES:
        src = src.simplify_quadric_decimation(face_count=VOXEL_MAX_TRIANGLES)
    pitch = float(src.extents.max()) / VOXEL_RESOLUTION
    vox = trimesh.voxel.creation.voxelize(src, pitch=pitch)
    # pad so the isosurface closes at the grid edge; marching cubes can
    # still emit corner-touching non-manifold spots, healed below by a
    # manifold3d self-union
    matrix = np.pad(np.asarray(vox.fill().matrix, dtype=bool), 1)
    remeshed = trimesh.voxel.ops.matrix_to_marching_cubes(matrix, pitch=1.0)
    remeshed.apply_translation((-1.0, -1.0, -1.0))
    remeshed.apply_transform(vox.transform)
    remeshed.merge_vertices()
    if not remeshed.is_watertight:
        try:
            man = common.to_manifold(remeshed)
            if man.status().name == "NoError" and not man.is_empty():
                remeshed = common.from_manifold(man + man)
        except Exception:
            pass
    return remeshed


def _bounded_decimate(mesh):
    """Reduce to <= MAX_TRIANGLES without losing watertightness, or None.

    Quadric decimation can nick the surface and the self-union heal can
    re-tessellate right back above the cap (which downstream thickness rays,
    slicing and export size all rely on). manifold3d's simplify preserves
    manifoldness by construction, so try it first with a growing tolerance.
    """
    try:
        man = common.to_manifold(mesh)
        if man.status().name == "NoError" and not man.is_empty():
            eps = float(mesh.extents.max()) * 1e-4
            for _ in range(8):
                simplified = man.simplify(eps)
                if not simplified.is_empty() and simplified.num_tri() <= MAX_TRIANGLES:
                    candidate = common.from_manifold(simplified)
                    if candidate.is_watertight:
                        return candidate
                    break
                eps *= 4.0
    except Exception:
        pass
    # Fallback: quadric decimation + self-union heal.
    mesh = mesh.simplify_quadric_decimation(face_count=MAX_TRIANGLES)
    mesh.merge_vertices()
    if not mesh.is_watertight:
        try:
            man = common.to_manifold(mesh)
            if man.status().name == "NoError" and not man.is_empty():
                mesh = common.from_manifold(man + man)
        except Exception:
            pass
    if not mesh.is_watertight or len(mesh.faces) > MAX_TRIANGLES:
        return None
    return mesh


def enforce_bbox(mesh, kind="preset", target_size_mm=None):
    """Scale AI models to the requested size; presets must already fit 20-250 mm."""
    if kind == "ai":
        if target_size_mm is not None and mesh.extents.max() > 0:
            mesh.apply_scale(float(target_size_mm) / float(mesh.extents.max()))
        elif mesh.extents.max() > 0:
            # Generator units are arbitrary (Meshy outputs ~2-unit meshes),
            # so scale to a printable default figurine size. Clamping to the
            # 20 mm minimum made walls thinner than the nozzle — unsliceable
            # first layers and constant too_fragile badges.
            mesh.apply_scale(DEFAULT_AI_SIZE_MM / float(mesh.extents.max()))
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

    Returns (thin_count, fragile, scale_to_fix). Deterministic (fixed seed).

    `scale_to_fix` is how much bigger the model would have to be for its thin
    fraction to fall under the threshold, or None when no achievable size
    would do it. Thickness scales linearly with the model, so this comes out
    of the samples already taken — no second pass — as the ratio between the
    minimum wall and the thickness at the threshold percentile.

    It exists because the UI told everyone with a fragile model to "scale up
    or regenerate", and for a spiky organic mesh that is simply false: one
    measured dragon still failed at 200 mm. Advice that doesn't work is worse
    than no advice.
    """
    # Without embree, ray queries against a dense mesh take minutes and can
    # exhaust memory; a decimated probe keeps the sampled heuristic honest.
    probe = mesh
    if len(probe.faces) > THICKNESS_MAX_TRIANGLES:
        probe = probe.simplify_quadric_decimation(face_count=THICKNESS_MAX_TRIANGLES)
    points, face_idx = trimesh.sample.sample_surface(probe, THICKNESS_SAMPLES, seed=0)
    normals = probe.face_normals[face_idx]
    try:
        thickness = trimesh.proximity.thickness(
            probe, points, normals=normals, method="ray"
        )
    except Exception:
        thickness = trimesh.proximity.thickness(probe, points, method="max_sphere") * 2.0
    thickness = np.asarray(thickness)
    valid = np.isfinite(thickness) & (thickness > 1e-9)
    thin = int(np.sum(valid & (thickness < MIN_THICKNESS_MM)))
    fragile = thin > FRAGILE_FRACTION * len(points)

    scale_to_fix = None
    if fragile:
        measured = np.sort(thickness[valid])
        # The sample that has to clear MIN_THICKNESS_MM for the thin count to
        # land on the threshold. Everything below it is allowed to stay thin.
        budget = int(FRAGILE_FRACTION * len(points))
        if budget < len(measured):
            at_threshold = float(measured[budget])
            if at_threshold > 1e-6:
                factor = MIN_THICKNESS_MM / at_threshold
                # Only worth suggesting if the result is still printable and
                # the jump isn't absurd — "make it 6x bigger" is not advice.
                largest = float(mesh.extents.max())
                if 1.0 < factor <= 3.0 and largest * factor <= MAX_BBOX_MM:
                    scale_to_fix = round(factor, 2)
    return thin, fragile, scale_to_fix


def overhang_fraction(mesh):
    """Share of surface area that is unsupported downward-facing overhang."""
    nz = mesh.face_normals[:, 2]
    # exclude faces resting on the build plate (all vertices near z=0)
    face_z = mesh.vertices[:, 2][mesh.faces]
    on_plate = face_z.max(axis=1) < 0.5
    overhang = (nz < -OVERHANG_COS) & ~on_plate
    area = mesh.area_faces
    total = float(area.sum())
    if total <= 0:
        return 0.0
    return float(area[overhang].sum()) / total


def overhang_check(mesh):
    """Overhang faces >50 deg from vertical covering >5 % of area -> supports."""
    return overhang_fraction(mesh) > OVERHANG_AREA_FRACTION


# Orientations tried when auto-placing a generated model. Quarter turns about
# X and Y, which is enough to find the flat-ish side of a figurine; finer
# angles cost more and, measured across real models, bought nothing.
_ORIENTATION_CANDIDATES = [
    (axis, degrees)
    for axis in ((1, 0, 0), (0, 1, 0))
    for degrees in (0, 90, 180, 270)
]


def orient_for_printing(mesh):
    """Rotate a generated mesh onto whichever tried side overhangs least.

    Only for AI output, where "up" is arbitrary — the generator has no idea
    which way the object will be printed, and the orientation it happens to
    emit is as good as random. A template must never be rotated: a nameplate
    that stands up was designed to.

    Modest but real. Measured on live models: a pair of headphones went from
    5.9% overhang area to 4.3%, crossing the support threshold; a dragon
    barely moved, because an organic shape overhangs whichever way up it is.
    Less support also means less material and a lower quote.
    """
    best = None
    for axis, degrees in _ORIENTATION_CANDIDATES:
        candidate = mesh.copy()
        if degrees:
            candidate.apply_transform(
                trimesh.transformations.rotation_matrix(np.radians(degrees), axis)
            )
        candidate.apply_translation([0.0, 0.0, -candidate.bounds[0][2]])
        score = overhang_fraction(candidate)
        # Ties keep the earliest candidate, so the identity orientation wins
        # unless something is genuinely better — determinism matters, and a
        # gratuitous rotation would confuse anyone comparing to the preview.
        if best is None or score < best[0] - 1e-9:
            best = (score, candidate)
    return best[1] if best else mesh


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
    # Orient before sizing: rotation changes which dimension is longest, and
    # the target size applies to the final pose.
    if kind == "ai":
        mesh = orient_for_printing(mesh)
    mesh = enforce_bbox(mesh, kind=kind, target_size_mm=target_size_mm)
    thin, fragile, scale_to_fix = thickness_check(mesh)
    supports = overhang_check(mesh)
    ext = mesh.extents
    metrics = {
        "bboxMm": [round(float(ext[0]), 2), round(float(ext[1]), 2), round(float(ext[2]), 2)],
        "triangles": int(len(mesh.faces)),
        "thinAreas": thin,
        "supportsNeeded": bool(supports),
        # None unless scaling up would genuinely clear the thin-feature
        # threshold — see thickness_check.
        "scaleToFix": scale_to_fix,
    }
    badge = "too_fragile" if fragile else ("needs_supports" if supports else "ready")
    return mesh, metrics, badge
