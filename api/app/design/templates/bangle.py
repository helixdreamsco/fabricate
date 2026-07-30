"""bangle: annular wrist band with optional text wrapped around the outside.

Text is built flat (common.text_mesh) then cylindrically wrapped: x -> angle
around the band, extrude depth -> radial direction, y -> band axis. Bending
moves vertices only (topology unchanged), so watertightness is preserved.
"""

import math
import os

import numpy as np

from .. import common

EMBED = 1.0          # radial embed into the band so booleans overlap cleanly
MAX_WRAP_RAD = 4.2   # cap text arc at ~240 degrees so the band stays wearable


def _wrap_on_cylinder(mesh, r_base, width):
    """Map a flat XY text solid onto the outer wall of a Z-axis cylinder.

    x -> angle (arc length preserved at r_base), z (extrude) -> radial
    offset from r_base, y -> position along the band axis (centred).
    """
    v = mesh.vertices.copy()
    theta = v[:, 0] / r_base
    radius = r_base + v[:, 2]
    out = np.column_stack([
        radius * np.sin(theta),
        -radius * np.cos(theta),
        v[:, 1] + width / 2.0,
    ])
    mesh.vertices = out
    return mesh


def build(params, spec, repo_root, assets=None):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    r_in = p["innerDiameterMm"] / 2.0
    wall = p["wallMm"]
    width = p["widthMm"]
    relief = cons["reliefDepthMm"]
    r_out = r_in + wall

    outer = common.cylinder(r_out, width)
    bore = common.cylinder(r_in, width + 2.0)
    bore.apply_translation([0.0, 0.0, -1.0])
    band = common.boolean_difference(outer, bore)

    if p["text"].strip() == "":
        return band

    cap_height = max(cons["minTextHeightMm"], min(10.0, width - 4.0))
    if p["mode"] == "emboss":
        r_base = r_out - EMBED
    else:
        r_base = r_out - relief
    text, _ = common.text_mesh(
        p["text"], common.font_path(repo_root, p["font"]),
        cap_height_mm=cap_height, depth_mm=relief + EMBED,
        max_width_mm=MAX_WRAP_RAD * r_base,
    )
    if text is None:
        return band

    # No subdivision: trimesh's subdivide_to_size leaves T-junctions (not
    # watertight). Chord error from bending straight strokes is <0.15 mm at
    # these radii and the EMBED depth absorbs it.
    text = _wrap_on_cylinder(text, r_base, width)

    if p["mode"] == "emboss":
        return common.boolean_union([band, text])
    return common.boolean_difference(band, text)
