"""coaster-set: a branded coaster with a functional condensation recess.

Deliberately the simplest of the three brand templates — it is the proof that
the shared layers paid off. Everything here is assembly: the logo comes from
common.asset_mesh (Phase 2), the run size comes from the template's quantity
block (Phase 1), and the icon fallback is the existing icon machinery. The
only geometry this file owns is the disc and its recess.
"""

import os

from .. import common

# Recess depth and wall. Shallow enough not to weaken a 4 mm coaster, deep
# enough to actually hold the ring off a table — which is the whole point.
RECESS_DEPTH_MM = 0.8
RECESS_WALL_MM = 4.0
RELIEF_EMBED_MM = 0.6


def _outline(shape, size):
    if shape == "rounded-square":
        return common.rounded_rect_polygon(size, size, size * 0.16)
    return common.circle_polygon(size / 2.0)


def build(params, spec, repo_root, assets=None):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    size = p["sizeMm"]
    thickness = p["thicknessMm"]
    relief = cons["reliefDepthMm"]

    body = common.extrude_polygon_solid(_outline(p["shape"], size), thickness)

    # Condensation recess: the same outline inset by the wall thickness,
    # sunk into the top face.
    recess_outline = _outline(p["shape"], size - RECESS_WALL_MM * 2.0)
    recess = common.extrude_polygon_solid(recess_outline, RECESS_DEPTH_MM + 1.0)
    recess.apply_translation([0.0, 0.0, thickness - RECESS_DEPTH_MM])
    base = common.boolean_difference(body, recess)

    # Artwork sits on the recessed floor, so it reads inside the dish.
    floor_z = thickness - RECESS_DEPTH_MM
    art_area = (size - RECESS_WALL_MM * 2.0) * spec["params"]["logo"]["areaFraction"]

    # Embossed artwork may only rise as far as the rim. The recess is the
    # entire height budget: any taller and the coasters stop stacking and rock
    # on a table. Debossed artwork cuts down from the floor and has no such
    # limit, so it gets the template's full relief depth.
    art_depth = (
        RECESS_DEPTH_MM if p["mode"] == "emboss" else relief
    ) + RELIEF_EMBED_MM

    asset_id = p.get("logo", "")
    asset = (assets or {}).get(asset_id) if asset_id else None

    if asset is not None:
        art = common.asset_mesh(asset, target_mm=art_area, depth_mm=art_depth)
    else:
        # No logo uploaded — fall back to the icon library, which every
        # existing template already uses.
        icon_path = os.path.join(
            repo_root, "public", "design-icons", "%s.svg" % p["icon"]
        )
        if not os.path.isfile(icon_path):
            raise common.InvalidParams("invalid_params: unknown icon %r" % p["icon"])
        art = common.icon_mesh(
            icon_path, target_mm=art_area, depth_mm=art_depth
        )

    if art is None:
        return base

    if p["mode"] == "emboss":
        # Rises from the recess floor to exactly the rim — flush, never proud.
        art.apply_translation([0.0, 0.0, floor_z - RELIEF_EMBED_MM])
        return common.boolean_union([base, art])

    art.apply_translation([0.0, 0.0, floor_z - relief])
    return common.boolean_difference(base, art)
