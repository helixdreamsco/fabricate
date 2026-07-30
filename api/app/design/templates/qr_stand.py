"""qr-stand: a counter stand whose angled face carries a scannable QR code.

Modules are raised rather than printed dark, so the code reads by shadow.
That works, but it depends on the modules holding a crisp edge — which is why
the module size floor is enforced up front and the matrix is decode-tested
before any geometry is returned.

The face leans back ~70° from horizontal: steep enough to read and photograph
from standing height, shallow enough that the whole thing prints face-up
without supports.
"""

import numpy as np
import trimesh

from .. import common
from .. import qr as qr_mod

FACE_ANGLE_DEG = 70.0
FACE_THICKNESS_MM = 4.0
BASE_DEPTH_RATIO = 0.55      # base depth as a fraction of face size
BASE_HEIGHT_MM = 8.0
MODULE_HEIGHT_MM = 1.2       # how far modules stand proud of the face
CAPTION_GAP_MM = 4.0
# Relief sinks this far INTO the plate before standing proud. Meeting the
# plate on a perfectly coincident plane makes the union numerically fragile —
# modules were surviving as separate shells and the stand came out in pieces.
RELIEF_EMBED_MM = 0.6
# How far the panel sinks into the plinth. Deep enough to be the structural
# joint in its own right, now that there is no separate buttress.
PANEL_SINK_MM = BASE_HEIGHT_MM * 0.6
# Blank band at the bottom of the panel. Keeps the code clear of the plinth
# both structurally and visually — see the note in build().
FOOT_MM = 14.0


def _module_meshes(matrix, module_mm, height_mm):
    """Raised modules as a list of solids, ready to union.

    Merged in 2D first, then extruded — the same route the text path takes,
    and for the same reason. Extruding each module to its own box and
    3D-unioning them leaves adjacent boxes meeting on exactly coincident
    planes, which the boolean resolves into degenerate inverted shells: the
    stand came out as three pieces, two of them with negative volume.
    Shapely resolves that adjacency in 2D where it is exact.
    """
    from shapely.geometry import box as shapely_box
    from shapely.ops import unary_union

    rows, cols = matrix.shape
    total = cols * module_mm
    # Grow every run by a hair. Diagonally adjacent dark modules otherwise
    # meet at a single point, which is a non-manifold vertex, and QR patterns
    # are full of them — the boolean turned those points into negative-volume
    # shells. A 2% overlap turns each point contact into a real overlap; the
    # light gaps shrink by ~4% of a module, which no reader notices and FDM
    # slightly prefers.
    eps = module_mm * 0.02
    rects = []
    for r in range(rows):
        c = 0
        while c < cols:
            if not matrix[r, c]:
                c += 1
                continue
            start = c
            while c < cols and matrix[r, c]:
                c += 1
            run = c - start
            x0 = -total / 2.0 + start * module_mm
            # Matrix row 0 is the TOP of the code; y grows upward here.
            y1 = total / 2.0 - r * module_mm
            rects.append(
                shapely_box(
                    x0 - eps, y1 - module_mm - eps,
                    x0 + run * module_mm + eps, y1 + eps,
                )
            )
    if not rects:
        return None

    merged = unary_union(rects)
    # Returned as a LIST, not concatenated. Concatenating disjoint shells
    # yields a mesh trimesh reports as non-watertight, and handing that to
    # manifold3d produces silent garbage — strays and negative-volume shells
    # in the finished stand. Each polygon extrudes to its own valid solid and
    # the caller unions them through manifold3d properly.
    return [
        trimesh.creation.extrude_polygon(poly, height_mm)
        for poly in common._iter_polygons(merged)
    ]


def build(params, spec, repo_root, assets=None):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    face = p["faceMm"]

    url = qr_mod.normalise_url(p["url"])
    # Raises QrTooDense with a usable suggestion when the URL won't fit.
    matrix, module_mm, _version = qr_mod.plan(url, face)
    # Hard gate: never build geometry from a matrix that doesn't scan back.
    qr_mod.assert_decodes(matrix, url)

    has_caption = p["text"].strip() != ""
    caption_h = cons["minTextHeightMm"] if has_caption else 0.0
    # Plate = foot + optional caption strip + code face, bottom to top.
    #
    # The foot matters structurally, not just visually: it is the band the
    # plinth cuts through when the panel seats into it. Without it the QR
    # modules ran right down to the plate's bottom edge, the base sliced
    # through them, and the boolean left slivers that cost watertightness.
    plate_w = face
    plate_h = FOOT_MM + face + (caption_h + CAPTION_GAP_MM * 2 if has_caption else 0.0)

    plate = common.rounded_plate(plate_w, plate_h, 3.0, FACE_THICKNESS_MM)

    # Modules sit on the front of the plate. The code occupies the top
    # `face` square; the caption takes the strip beneath.
    parts = [plate]
    for module in _module_meshes(matrix, module_mm, MODULE_HEIGHT_MM + RELIEF_EMBED_MM):
        module.apply_translation([
            0.0,
            plate_h / 2.0 - face / 2.0,
            FACE_THICKNESS_MM - RELIEF_EMBED_MM,
        ])
        parts.append(module)

    if has_caption:
        caption, _ = common.text_mesh(
            p["text"],
            common.font_path(repo_root, p["font"]),
            cap_height_mm=caption_h,
            depth_mm=MODULE_HEIGHT_MM + RELIEF_EMBED_MM,
            max_width_mm=plate_w * 0.86,
        )
        if caption is not None:
            caption.apply_translation([
                0.0,
                -plate_h / 2.0 + FOOT_MM + CAPTION_GAP_MM + caption_h / 2.0,
                FACE_THICKNESS_MM - RELIEF_EMBED_MM,
            ])
            parts.append(caption)

    panel = common.boolean_union(parts)

    # Stand the panel up at FACE_ANGLE_DEG and sit it on a wedge base.
    tilt = np.radians(90.0 - FACE_ANGLE_DEG)
    panel.apply_transform(
        trimesh.transformations.rotation_matrix(np.pi / 2.0 - tilt, [1, 0, 0])
    )
    # Sink the panel deep INTO the plinth rather than resting it on the top
    # plane. Parts that merely touch share a coincident face, and the boolean
    # turns those into sliver shells.
    panel.apply_translation([
        0.0, 0.0, -panel.bounds[0][2] + BASE_HEIGHT_MM - PANEL_SINK_MM,
    ])

    base_depth = max(face * BASE_DEPTH_RATIO, 30.0)
    base = common.rounded_plate(plate_w, base_depth, 4.0, BASE_HEIGHT_MM)
    # Shift the base backward so the leaning panel's weight stays over it —
    # a stand that topples on a counter is a failed product.
    base.apply_translation([0.0, -base_depth / 2.0 + plate_h * 0.12, 0.0])

    # No separate buttress. An earlier version fused a wedge strut between the
    # base and the panel, but a wedge meets a leaning panel at a near-tangent
    # angle, and that intersection produced non-manifold edges and zero-volume
    # slivers on every build — which then dragged the repair pipeline down its
    # lossy voxel path. Sinking the panel a third of the way into a solid
    # plinth gives the same rigidity from one well-conditioned intersection.
    return _single_body(common.boolean_union([base, panel]))


def _single_body(mesh):
    """Return the stand as one clean, manifold solid.

    Unioning a rotated panel onto the base reliably leaves a handful of
    non-manifold edges and a couple of zero-volume sliver shells. Left alone
    they are quietly expensive: the repair pipeline's first merge_vertices()
    turns those edges into holes, the mesh stops being watertight, and it
    falls all the way through to the voxel remesh — which is lossy, triples
    the triangle count and fragments the result.

    Order matters here. Manifoldise FIRST (a manifold3d self-union rebuilds
    valid topology), because on the raw mesh trimesh's own connectivity is
    unreliable and reports one body where there are three. Only then is
    dropping the slivers meaningful.
    """
    pieces = mesh.split(only_watertight=False)
    if len(pieces) > 1:
        mesh = max(pieces, key=lambda p: abs(p.volume))

    body = mesh.copy()
    body.merge_vertices()
    body.update_faces(body.nondegenerate_faces())
    body.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(body)
    if body.is_watertight and body.volume < 0:
        body.invert()
    if body.is_watertight:
        return body

    # Unioning a few hundred module solids occasionally leaves a handful of
    # non-manifold edges. Heal them here with a manifold3d self-union while
    # the mesh is still a few thousand triangles: left to the repair pipeline,
    # the same defect sends it down the voxel remesh path, which is lossy and
    # triples the triangle count. Only reached when something is actually
    # wrong — a self-union on a healthy mesh is pure cost.
    try:
        man = common.to_manifold(body)
        if man.status().name == "NoError" and not man.is_empty():
            healed = common.from_manifold(man + man)
            if healed.is_watertight:
                pieces = healed.split(only_watertight=False)
                if len(pieces) > 1:
                    healed = max(pieces, key=lambda p: abs(p.volume))
                return healed
    except Exception:
        pass
    return body


def _wedge(width, depth, height):
    """Right-triangular prism: tall at the front (y=0), tapering back."""
    verts = np.array([
        [-width / 2.0, 0.0, 0.0], [width / 2.0, 0.0, 0.0],
        [-width / 2.0, 0.0, height], [width / 2.0, 0.0, height],
        [-width / 2.0, -depth, 0.0], [width / 2.0, -depth, 0.0],
    ])
    faces = np.array([
        [0, 1, 2], [1, 3, 2],       # front
        [4, 0, 5], [5, 0, 1],       # bottom
        [0, 4, 2], [2, 4, 5],       # left/slope
        [1, 5, 3], [3, 5, 4],
        [2, 3, 4], [3, 5, 4],
    ])
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    # The explicit face list above is fiddly to keep watertight; the convex
    # hull of these six points is exactly the wedge we want and is guaranteed
    # manifold.
    return mesh.convex_hull
