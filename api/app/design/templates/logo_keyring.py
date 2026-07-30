"""logo-keyring: a tag carrying an uploaded brand logo.

The flagship brand template. Three ways to apply the logo:
  emboss       raised on the face
  deboss       recessed into the face
  cut-through  a void through the whole tag

Cut-through is the one that can produce a broken part rather than an ugly
one: subtracting a logo that spans the tag can slice it into loose pieces, or
detach the ring loop from the body. That is checked explicitly here rather
than left for the customer to discover.
"""

import numpy as np

from .. import common

# Hanging hole. 5 mm across comfortably clears a split ring and keeps the
# brief's >= 4 mm floor even after the slicer's first-layer squish.
HOLE_DIAMETER_MM = 5.0
HOLE_MARGIN_MM = 3.0      # material left between the hole and the top edge
LOGO_EMBED_MM = 1.0       # overlap into the body so booleans are clean


def _body_polygon(shape, width, height):
    """Tag silhouette as a shapely polygon, centred on the origin."""
    if shape == "dog-tag":
        # Fully rounded ends — a capsule, the classic dog-tag profile.
        return common.rounded_rect_polygon(width, height, height / 2.0)
    return common.rounded_rect_polygon(width, height, min(width, height) * 0.18)


def build(params, spec, repo_root, assets=None):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    width = p["widthMm"]
    thickness = p["thicknessMm"]
    relief = cons["reliefDepthMm"]
    mode = p["mode"]

    # Dog tags read as taller and narrower than a plain rounded rectangle.
    height = width * (0.72 if p["shape"] == "dog-tag" else 0.62)

    body = common.extrude_polygon_solid(
        _body_polygon(p["shape"], width, height), thickness
    )

    # Hanging hole, punched near the top edge.
    hole_r = HOLE_DIAMETER_MM / 2.0
    hole_cy = height / 2.0 - HOLE_MARGIN_MM - hole_r
    hole = common.cylinder(hole_r, thickness + 2.0)
    hole.apply_translation([0.0, hole_cy, -1.0])
    base = common.boolean_difference(body, hole)

    # Everything below the hole is usable face.
    face_top = hole_cy - hole_r - 1.5
    face_bottom = -height / 2.0 + 2.0

    has_text = p["text"].strip() != ""
    text_h = cons["minTextHeightMm"] if has_text else 0.0
    # Reserve a strip at the bottom for the text line.
    logo_top = face_top
    logo_bottom = face_bottom + (text_h + 2.0 if has_text else 0.0)
    logo_span = max(1.0, logo_top - logo_bottom)

    asset_id = p.get("logo", "")
    asset = (assets or {}).get(asset_id) if asset_id else None

    reliefs = []
    logo_mesh = None
    if asset is not None:
        logo_spec = spec["params"]["logo"]
        target = min(width * logo_spec["areaFraction"], logo_span)
        depth = thickness + 2.0 if mode == "cut-through" else relief + LOGO_EMBED_MM
        logo_mesh = common.asset_mesh(asset, target_mm=target, depth_mm=depth)
        if logo_mesh is not None:
            b = logo_mesh.bounds
            logo_mesh.apply_translation([
                0.0,
                (logo_top + logo_bottom) / 2.0 - (b[0][1] + b[1][1]) / 2.0,
                0.0,
            ])
            reliefs.append(logo_mesh)

    if has_text:
        text, _ = common.text_mesh(
            p["text"],
            common.font_path(repo_root, p["font"]),
            cap_height_mm=text_h,
            depth_mm=(thickness + 2.0 if mode == "cut-through" else relief + LOGO_EMBED_MM),
            # Generous width allowance: text_mesh shrinks to fit, and shrinking
            # below the spec's cap height is what produces sub-nozzle strokes
            # and a too_fragile badge. More width means less shrinking.
            max_width_mm=width * 0.86,
        )
        if text is not None:
            text.apply_translation([0.0, face_bottom + text_h / 2.0, 0.0])
            reliefs.append(text)

    if not reliefs:
        return base

    if mode == "cut-through":
        for m in reliefs:
            m.apply_translation([0.0, 0.0, -1.0])
        result = common.boolean_difference(base, *reliefs)
        _assert_single_piece(result, has_text=has_text)
        return result

    if mode == "emboss":
        for m in reliefs:
            m.apply_translation([0.0, 0.0, thickness - LOGO_EMBED_MM])
        return common.boolean_union([base] + reliefs)

    # deboss
    for m in reliefs:
        m.apply_translation([0.0, 0.0, thickness - relief])
    return common.boolean_difference(base, *reliefs)


def _assert_single_piece(mesh, has_text=False):
    """Cut-through must leave ONE connected solid.

    A closed counter — the middle of an O, the triangle in an A — becomes a
    loose chip the moment you cut all the way through, and artwork reaching
    the tag's edge can sever the body from the ring loop. Printing either
    yields a bag of fragments, so this fails validation with advice the
    customer can act on rather than a generic error.
    """
    pieces = mesh.split(only_watertight=False)
    if len(pieces) == 1:
        return
    fix = (
        "Letters like A, O and R have enclosed centres that drop out when cut "
        "through — switch to emboss or deboss, or remove the text."
        if has_text
        else "Switch to emboss or deboss, or use a logo without enclosed shapes."
    )
    raise common.InvalidParams(
        "invalid_params: cut_through_splits_tag: cutting through would break "
        "this tag into %d loose pieces. %s" % (len(pieces), fix)
    )
