"""Shared geometry helpers for the Fabricate worker.

All geometry is deterministic: fixed segment counts everywhere, no RNG.
Units are mm, Z-up.
"""

import json
import os
import re
import warnings

warnings.filterwarnings("ignore")

import numpy as np
import trimesh
from manifold3d import Manifold, Mesh
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath
from shapely.geometry import Polygon
from shapely.ops import unary_union

# Fixed tessellation constants (determinism is a hard requirement).
CIRCLE_SECTIONS = 64          # cylinder/cone side count
BUFFER_QUAD_SEGS = 8          # shapely round-corner buffer segments per quarter
SPHERE_SUBDIVISIONS = 3       # icosphere subdivisions
TEXTPATH_SIZE = 100.0         # fixed matplotlib TextPath render size (scaled after)

FONT_MAP = {
    "sans-bold": "DejaVuSans-Bold.ttf",
    "serif-bold": "DejaVuSerif-Bold.ttf",
    "mono-bold": "DejaVuSansMono-Bold.ttf",
}


# Must stay in step with ASSET_ID_RE in src/lib/design/schema.ts.
ASSET_ID_PATTERN = r"asset_[a-f0-9]{24}"


class InvalidParams(ValueError):
    """Raised when job params fail spec validation."""


def font_path(repo_root, font_id):
    fname = FONT_MAP.get(font_id)
    if fname is None:
        raise InvalidParams("invalid_params: unknown font %r" % font_id)
    path = os.path.join(repo_root, "public", "fonts", fname)
    if not os.path.isfile(path):
        raise FileNotFoundError("font file missing: %s" % path)
    return path


# ---------------------------------------------------------------------------
# Parameter validation
# ---------------------------------------------------------------------------

def validate_params(params, spec):
    """Validate params against a template spec JSON.

    Returns a complete dict (defaults filled in for missing keys).
    Raises InvalidParams('invalid_params: ...') on any violation.
    """
    if not isinstance(params, dict):
        raise InvalidParams("invalid_params: params must be an object")
    spec_params = spec.get("params", {})
    unknown = set(params) - set(spec_params)
    if unknown:
        raise InvalidParams("invalid_params: unknown keys %s" % ", ".join(sorted(unknown)))
    out = {}
    for name, p in spec_params.items():
        kind = p["kind"]
        if name in params:
            value = params[name]
        else:
            value = p.get("default")
        if kind == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise InvalidParams("invalid_params: %s must be a number" % name)
            value = float(value)
            if value < p["min"] or value > p["max"]:
                raise InvalidParams(
                    "invalid_params: %s=%g out of range [%g, %g]"
                    % (name, value, p["min"], p["max"])
                )
        elif kind == "text":
            if not isinstance(value, str):
                raise InvalidParams("invalid_params: %s must be a string" % name)
            if len(value) < p.get("minLength", 0) or len(value) > p.get("maxLength", 10 ** 6):
                raise InvalidParams(
                    "invalid_params: %s length %d outside [%d, %d]"
                    % (name, len(value), p.get("minLength", 0), p.get("maxLength", 0))
                )
            pattern = p.get("pattern")
            if pattern is not None and re.fullmatch(pattern, value) is None:
                raise InvalidParams("invalid_params: %s contains disallowed characters" % name)
        elif kind in ("enum", "part"):
            if value not in p["options"]:
                raise InvalidParams(
                    "invalid_params: %s=%r not one of %s" % (name, value, p["options"])
                )
        elif kind == "icon":
            if not isinstance(value, str) or re.fullmatch(r"[a-z0-9-]+", value) is None:
                raise InvalidParams("invalid_params: %s is not a valid icon id" % name)
        elif kind == "asset":
            # Value is an opaque asset id; the artwork itself arrives out of
            # band in the request's `assets` map (this service has no access
            # to the Node side's storage). "" means no asset supplied.
            if not isinstance(value, str):
                raise InvalidParams("invalid_params: %s must be a string" % name)
            if value == "":
                if p.get("required"):
                    raise InvalidParams("invalid_params: %s is required" % name)
            elif re.fullmatch(ASSET_ID_PATTERN, value) is None:
                raise InvalidParams("invalid_params: %s is not a valid asset id" % name)
        else:
            raise InvalidParams("invalid_params: unsupported param kind %r" % kind)
        out[name] = value
    return out


def canonical_params_json(params):
    """Canonical JSON used for hashing: sorted keys, compact separators."""
    return json.dumps(params, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


# ---------------------------------------------------------------------------
# Text -> shapely polygons -> mesh
# ---------------------------------------------------------------------------

def _combine_even_odd(rings):
    """Combine glyph rings even-odd by symmetric difference in descending-area order."""
    polys = []
    for ring in rings:
        if len(ring) < 3:
            continue
        poly = Polygon(ring)
        if poly.is_valid is False:
            poly = poly.buffer(0)
        if poly.is_empty or poly.area <= 0:
            continue
        polys.append(poly)
    polys.sort(key=lambda p: -p.area)
    combined = None
    for poly in polys:
        combined = poly if combined is None else combined.symmetric_difference(poly)
    return combined


def _iter_polygons(geom):
    if geom is None or geom.is_empty:
        return
    if geom.geom_type == "Polygon":
        yield geom
    elif geom.geom_type in ("MultiPolygon", "GeometryCollection"):
        for g in geom.geoms:
            yield from _iter_polygons(g)


def text_geometry(text, font_file):
    """Render text to a shapely geometry (even-odd combined) at TEXTPATH_SIZE.

    Returns (geometry, cap_height) where cap_height is the height of 'H' at
    the same render size (used to scale to a requested cap height in mm).
    Text is DATA ONLY -- it never touches code paths.
    """
    prop = FontProperties(fname=font_file)
    tp = TextPath((0, 0), text, size=TEXTPATH_SIZE, prop=prop)
    geom = _combine_even_odd([np.asarray(p) for p in tp.to_polygons()])
    cap_tp = TextPath((0, 0), "H", size=TEXTPATH_SIZE, prop=prop)
    cap_geom = _combine_even_odd([np.asarray(p) for p in cap_tp.to_polygons()])
    if cap_geom is None or cap_geom.is_empty:
        cap_height = TEXTPATH_SIZE * 0.7
    else:
        cminx, miny, maxx, maxy = cap_geom.bounds
        cap_height = maxy - miny
    return geom, cap_height


def text_mesh(text, font_file, cap_height_mm, depth_mm, max_width_mm=None):
    """Extruded text solid, XY-centred at the origin, base at z=0.

    Scaled so cap height == cap_height_mm; if the resulting width exceeds
    max_width_mm the whole text is shrunk uniformly to fit.
    Returns (mesh, actual_cap_height_mm) or (None, 0) for empty/whitespace text.
    """
    geom, cap_h = text_geometry(text, font_file)
    if geom is None or geom.is_empty:
        return None, 0.0
    scale = cap_height_mm / cap_h
    minx, miny, maxx, maxy = geom.bounds
    width = (maxx - minx) * scale
    if max_width_mm is not None and width > max_width_mm and width > 0:
        scale *= max_width_mm / width
    meshes = []
    for poly in _iter_polygons(geom):
        m = trimesh.creation.extrude_polygon(poly, depth_mm / scale)
        meshes.append(m)
    if not meshes:
        return None, 0.0
    mesh = trimesh.util.concatenate(meshes)
    mesh.apply_scale([scale, scale, scale])
    # z was scaled too; restore requested depth exactly
    zmin, zmax = mesh.bounds[0][2], mesh.bounds[1][2]
    if zmax - zmin > 0:
        mesh.apply_scale([1.0, 1.0, depth_mm / (zmax - zmin)])
    b = mesh.bounds
    mesh.apply_translation([-(b[0][0] + b[1][0]) / 2.0, -(b[0][1] + b[1][1]) / 2.0, -b[0][2]])
    return mesh, cap_h * scale


# ---------------------------------------------------------------------------
# Icon SVG -> mesh
# ---------------------------------------------------------------------------

_POLYGON_RE = re.compile(r"<polygon[^>]*\bpoints\s*=\s*\"([^\"]+)\"", re.IGNORECASE)
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")


def icon_geometry(svg_path):
    """Parse a polygon-only SVG (viewBox 0 0 100 100, y-down) into a shapely
    geometry, y-flipped to y-up and centred at the origin."""
    with open(svg_path, "r", encoding="utf-8") as fh:
        svg = fh.read()
    polys = []
    for match in _POLYGON_RE.finditer(svg):
        nums = [float(n) for n in _NUM_RE.findall(match.group(1))]
        pts = [(nums[i], 100.0 - nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
        if len(pts) < 3:
            continue
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if not poly.is_empty:
            polys.append(poly)
    if not polys:
        raise ValueError("icon svg contains no polygons: %s" % svg_path)
    geom = unary_union(polys)
    minx, miny, maxx, maxy = geom.bounds
    from shapely.affinity import translate

    return translate(geom, -(minx + maxx) / 2.0, -(miny + maxy) / 2.0)


def icon_mesh(svg_path, target_mm, depth_mm):
    """Extruded icon solid scaled so its largest XY extent == target_mm,
    XY-centred at origin, base at z=0."""
    geom = icon_geometry(svg_path)
    minx, miny, maxx, maxy = geom.bounds
    extent = max(maxx - minx, maxy - miny)
    scale = target_mm / extent
    meshes = [trimesh.creation.extrude_polygon(p, depth_mm / scale) for p in _iter_polygons(geom)]
    mesh = trimesh.util.concatenate(meshes)
    mesh.apply_scale([scale, scale, scale])
    zmin, zmax = mesh.bounds[0][2], mesh.bounds[1][2]
    if zmax - zmin > 0:
        mesh.apply_scale([1.0, 1.0, depth_mm / (zmax - zmin)])
    b = mesh.bounds
    mesh.apply_translation([-(b[0][0] + b[1][0]) / 2.0, -(b[0][1] + b[1][1]) / 2.0, -b[0][2]])
    return mesh


# ---------------------------------------------------------------------------
# Uploaded logo assets -> mesh
# ---------------------------------------------------------------------------

def _shape_geometry(shape):
    """One shape's rings resolved into a shapely geometry, y-flipped to y-up."""
    rings = shape.get("rings") or []
    rule = shape.get("fillRule", "nonzero")
    # SVG y grows downward; every consumer here works y-up.
    flipped = [[(float(r[i]), -float(r[i + 1])) for i in range(0, len(r) - 1, 2)]
               for r in rings]
    if rule == "evenodd":
        return _combine_even_odd([np.asarray(r) for r in flipped if len(r) >= 3])
    # Nonzero: the outer ring is the largest; anything strictly inside it is a
    # hole. Shapely has no winding-aware union, and this containment rule
    # matches how logos are actually drawn.
    polys = []
    for ring in flipped:
        if len(ring) < 3:
            continue
        poly = Polygon(ring)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if not poly.is_empty and poly.area > 0:
            polys.append(poly)
    if not polys:
        return None
    polys.sort(key=lambda p: -p.area)
    geom = polys[0]
    for poly in polys[1:]:
        geom = geom.difference(poly) if geom.contains(poly) else geom.union(poly)
    return geom


def asset_geometry(asset):
    """Shapely geometry for an inline logo asset, y-flipped to y-up.

    The asset arrives as flat rings already extracted and tagged by the Node
    side (see src/lib/design/svg/geometry.ts). Parsing the SVG again here
    would risk the worker and the browser preview disagreeing about the same
    logo, so this deliberately consumes polygons rather than markup.

    Layered artwork is resolved by INK, not by union. A logo drawn as stacked
    shapes — a disc, a plate on top, grooves on top of that, a label, a
    letterform — is nearly all interior detail, and unioning it returns the
    outermost silhouette and nothing else. A vinyl-record mark came back as a
    plain filled circle.

    So: consecutive shapes sharing a paint are merged (same ink, one mark),
    and each new ink is symmetric-differenced against what is already there,
    which is what "painted on top of" means once colour is gone and only
    height is left. A mark over a plate becomes a recess in it; two shapes of
    one colour still merge as before.
    """
    if not isinstance(asset, dict):
        raise InvalidParams("invalid_params: malformed asset payload")
    shapes = asset.get("shapes") or []

    combined = None
    group = None          # accumulated geometry for the current ink
    group_paint = None
    for shape in shapes:
        geom = _shape_geometry(shape)
        if geom is None or geom.is_empty:
            continue
        # Assets predating paint tagging have no paint; treat them as one ink
        # so their behaviour (plain union) is unchanged.
        paint = shape.get("paint")
        if group is not None and paint == group_paint:
            group = group.union(geom)
            continue
        if group is not None:
            combined = group if combined is None else combined.symmetric_difference(group)
        group, group_paint = geom, paint
    if group is not None:
        combined = group if combined is None else combined.symmetric_difference(group)

    if combined is None or combined.is_empty:
        return None
    from shapely.affinity import translate

    minx, miny, maxx, maxy = combined.bounds
    return translate(combined, -(minx + maxx) / 2.0, -(miny + maxy) / 2.0)


def asset_mesh(asset, target_mm, depth_mm):
    """Extruded logo solid scaled so its largest XY extent == target_mm,
    XY-centred at the origin, base at z=0. None when the asset is empty."""
    geom = asset_geometry(asset)
    if geom is None:
        return None
    minx, miny, maxx, maxy = geom.bounds
    extent = max(maxx - minx, maxy - miny)
    if extent <= 0:
        return None
    scale = target_mm / extent
    meshes = [trimesh.creation.extrude_polygon(p, depth_mm / scale)
              for p in _iter_polygons(geom)]
    if not meshes:
        return None
    mesh = trimesh.util.concatenate(meshes)
    mesh.apply_scale([scale, scale, scale])
    zmin, zmax = mesh.bounds[0][2], mesh.bounds[1][2]
    if zmax - zmin > 0:
        mesh.apply_scale([1.0, 1.0, depth_mm / (zmax - zmin)])
    b = mesh.bounds
    mesh.apply_translation([-(b[0][0] + b[1][0]) / 2.0, -(b[0][1] + b[1][1]) / 2.0, -b[0][2]])
    return mesh


# ---------------------------------------------------------------------------
# manifold3d boolean helpers
# ---------------------------------------------------------------------------

def to_manifold(mesh):
    return Manifold(
        Mesh(
            vert_properties=np.ascontiguousarray(mesh.vertices, dtype=np.float32),
            tri_verts=np.ascontiguousarray(mesh.faces, dtype=np.uint32),
        )
    )


def from_manifold(man):
    mm = man.to_mesh()
    verts = np.asarray(mm.vert_properties, dtype=np.float64)[:, :3]
    faces = np.asarray(mm.tri_verts, dtype=np.int64)
    # manifold3d output is already indexed/manifold; process=True vertex
    # merging can collapse thin intersection regions and break watertightness.
    return trimesh.Trimesh(vertices=verts, faces=faces, process=False)


def boolean_union(meshes):
    """Union a list of trimesh solids via manifold3d. Returns one Trimesh."""
    mans = [to_manifold(m) for m in meshes if m is not None and len(m.faces) > 0]
    if not mans:
        raise ValueError("boolean_union: no input meshes")
    acc = mans[0]
    for man in mans[1:]:
        acc = acc + man
    return from_manifold(acc)


def boolean_difference(mesh, *cutters):
    acc = to_manifold(mesh)
    for cutter in cutters:
        if cutter is None or len(cutter.faces) == 0:
            continue
        acc = acc - to_manifold(cutter)
    return from_manifold(acc)


# ---------------------------------------------------------------------------
# Deterministic primitives
# ---------------------------------------------------------------------------

def circle_polygon(radius):
    from shapely.geometry import Point

    return Point(0.0, 0.0).buffer(radius, quad_segs=CIRCLE_SECTIONS // 4)


def cylinder(radius, height, sections=CIRCLE_SECTIONS):
    """Cylinder, base at z=0, centred on the Z axis."""
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    m.apply_translation([0, 0, height / 2.0])
    return m


def cone(radius, height, sections=CIRCLE_SECTIONS):
    """Cone, base at z=0."""
    return trimesh.creation.cone(radius=radius, height=height, sections=sections)


def frustum(r_bottom, r_top, height, sections=CIRCLE_SECTIONS):
    """Truncated cone, base at z=0 (deterministic manual construction)."""
    ang = np.linspace(0.0, 2.0 * np.pi, sections, endpoint=False)
    bot = np.column_stack([r_bottom * np.cos(ang), r_bottom * np.sin(ang), np.zeros(sections)])
    top = np.column_stack([r_top * np.cos(ang), r_top * np.sin(ang), np.full(sections, height)])
    verts = np.vstack([bot, top, [[0, 0, 0]], [[0, 0, height]]])
    ib, it, cb, ct = 0, sections, 2 * sections, 2 * sections + 1
    faces = []
    for i in range(sections):
        j = (i + 1) % sections
        faces.append([ib + i, ib + j, it + i])
        faces.append([ib + j, it + j, it + i])
        faces.append([cb, ib + j, ib + i])          # bottom cap (facing -z)
        faces.append([ct, it + i, it + j])          # top cap (facing +z)
    return trimesh.Trimesh(vertices=verts, faces=np.asarray(faces), process=False)


def sphere(radius):
    return trimesh.creation.icosphere(subdivisions=SPHERE_SUBDIVISIONS, radius=radius)


def capsule(cyl_height, radius):
    """Capsule (cylinder + hemispheres), base at z=0, total height cyl_height + 2r."""
    m = trimesh.creation.capsule(height=cyl_height, radius=radius, count=(32, 32))
    m.apply_translation([0, 0, -m.bounds[0][2]])
    return m


def rounded_rect_polygon(width, height, radius):
    """Rounded rectangle centred at the origin."""
    from shapely.geometry import box as shapely_box

    radius = min(radius, width / 2.0 - 1e-6, height / 2.0 - 1e-6)
    core = shapely_box(-width / 2.0 + radius, -height / 2.0 + radius,
                       width / 2.0 - radius, height / 2.0 - radius)
    return core.buffer(radius, quad_segs=BUFFER_QUAD_SEGS)


def extrude_polygon_solid(polygon, thickness):
    """Extruded shapely polygon, base at z=0."""
    return trimesh.creation.extrude_polygon(polygon, thickness)


def rounded_plate(width, height, radius, thickness):
    """Extruded rounded rectangle, base at z=0, centred in XY."""
    return trimesh.creation.extrude_polygon(rounded_rect_polygon(width, height, radius), thickness)


def tapered_spike(top_width, bottom_width, depth, length):
    """Tapered box (frustum with rectangular cross-section), top at z=0,
    tapering downward to z=-length. Centred on the Z axis in XY."""
    tw, bw = top_width / 2.0, bottom_width / 2.0
    td, bd = min(depth, top_width) / 2.0, min(depth, bottom_width) / 2.0
    verts = np.array([
        [-tw, -td, 0], [tw, -td, 0], [tw, td, 0], [-tw, td, 0],
        [-bw, -bd, -length], [bw, -bd, -length], [bw, bd, -length], [-bw, bd, -length],
    ])
    hull = trimesh.Trimesh(vertices=verts).convex_hull
    return hull
