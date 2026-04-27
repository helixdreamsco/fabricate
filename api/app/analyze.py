"""Server-side mesh analysis using Trimesh.

Given a mesh file, returns:
  * Aggregated stats (triangle count, bbox, total volume, watertightness).
  * `parts` list — one entry per discrete body in the file. STL/OBJ collapse
    to one part; 3MF files with multiple objects expose each separately so
    the UI can offer per-part colour configuration / multi-material pricing.
"""
from __future__ import annotations

import io
from dataclasses import asdict, dataclass

import numpy as np
import trimesh


@dataclass
class MeshPart:
    index: int
    name: str
    triangle_count: int
    volume_cm3: float
    is_watertight: bool


@dataclass
class MeshAnalysis:
    triangle_count: int
    dims_mm: dict
    volume_cm3: float
    surface_area_cm2: float
    is_watertight: bool
    used_convex_hull: bool
    warnings: list[str]
    parts: list[MeshPart]
    is_multi_material: bool


def _volume_safe(m: trimesh.Trimesh) -> tuple[float, bool]:
    """Return (volume_mm3, used_convex_hull). Falls back to hull when the
    mesh isn't watertight / has flipped normals."""
    if m.is_watertight and m.volume > 0:
        return float(abs(m.volume)), False
    return float(abs(m.convex_hull.volume)), True


def analyze_bytes(data: bytes, suffix: str = "stl") -> MeshAnalysis:
    warnings: list[str] = []
    try:
        loaded = trimesh.load(io.BytesIO(data), file_type=suffix.lower())
    except Exception as exc:
        raise ValueError(f"unable to parse mesh: {exc}") from exc

    # `trimesh.load` returns either a Trimesh (single body) or a Scene
    # (multi-object 3MF). We normalise to a list of (name, Trimesh).
    bodies: list[tuple[str, trimesh.Trimesh]] = []
    if isinstance(loaded, trimesh.Trimesh):
        bodies.append(("Body", loaded))
    elif isinstance(loaded, trimesh.Scene):
        for name, geom in loaded.geometry.items():
            if isinstance(geom, trimesh.Trimesh) and geom.faces.shape[0] > 0:
                bodies.append((str(name) or f"Part {len(bodies) + 1}", geom))
    else:
        raise ValueError("file did not contain a recognisable mesh")

    if not bodies:
        raise ValueError("file contained no mesh geometry")

    parts: list[MeshPart] = []
    total_volume_mm3 = 0.0
    total_triangles = 0
    overall_min = np.array([np.inf, np.inf, np.inf])
    overall_max = np.array([-np.inf, -np.inf, -np.inf])
    surface_area_mm2_total = 0.0
    any_used_hull = False
    all_watertight = True

    for i, (name, body) in enumerate(bodies):
        b_volume_mm3, used_hull = _volume_safe(body)
        any_used_hull = any_used_hull or used_hull
        is_wt = bool(body.is_watertight)
        all_watertight = all_watertight and is_wt

        bounds = body.bounds  # (2,3)
        overall_min = np.minimum(overall_min, bounds[0])
        overall_max = np.maximum(overall_max, bounds[1])

        tris = int(body.faces.shape[0])
        total_triangles += tris
        total_volume_mm3 += b_volume_mm3
        surface_area_mm2_total += float(body.area)

        parts.append(
            MeshPart(
                index=i,
                name=name,
                triangle_count=tris,
                volume_cm3=b_volume_mm3 / 1000.0,
                is_watertight=is_wt,
            )
        )

    extents = overall_max - overall_min
    dims_mm = {
        "x": float(extents[0]),
        "y": float(extents[1]),
        "z": float(extents[2]),
    }

    if not all_watertight:
        warnings.append("Mesh is not watertight — volume is approximated.")
    if any_used_hull:
        warnings.append("Using convex-hull volume as a fallback.")
    if total_triangles < 12:
        warnings.append("Mesh has fewer than 12 triangles — likely invalid.")
    if np.any(extents <= 0):
        warnings.append("Mesh has zero-length bounding-box axis.")

    return MeshAnalysis(
        triangle_count=total_triangles,
        dims_mm=dims_mm,
        volume_cm3=total_volume_mm3 / 1000.0,
        surface_area_cm2=surface_area_mm2_total / 100.0,
        is_watertight=all_watertight,
        used_convex_hull=any_used_hull,
        warnings=warnings,
        parts=parts,
        is_multi_material=len(parts) > 1,
    )


def as_dict(a: MeshAnalysis) -> dict:
    return asdict(a)
