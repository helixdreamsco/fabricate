"""keychain-text: rounded-rect plate + ring loop + embossed/debossed text."""

import os

from .. import common


def build(params, spec, repo_root, assets=None):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    length = p["lengthMm"]
    height = length * 0.42
    thickness = p["thicknessMm"]
    relief = cons["reliefDepthMm"]

    plate = common.rounded_plate(length, height, 6.0, thickness)

    # Ring loop on the left edge: outer r 6, hole r 3, same thickness.
    loop_cx = -length / 2.0 - 3.5
    disk = common.cylinder(6.0, thickness)
    disk.apply_translation([loop_cx, 0.0, 0.0])
    hole = common.cylinder(3.0, thickness + 2.0)
    hole.apply_translation([loop_cx, 0.0, -1.0])

    base = common.boolean_union([plate, disk])
    base = common.boolean_difference(base, hole)

    # Text on top face, auto-fit with 4 mm margins (loop excluded, plate only).
    margin = 4.0
    avail_w = length - 2.0 * margin
    avail_h = height - 2.0 * margin
    cap_target = max(cons["minTextHeightMm"], min(avail_h, height * 0.5))
    text, _ = common.text_mesh(
        p["text"], common.font_path(repo_root, p["font"]),
        cap_height_mm=cap_target, depth_mm=relief + 1.0, max_width_mm=avail_w,
    )
    if text is None:
        raise common.InvalidParams("invalid_params: text renders to empty geometry")

    if p["mode"] == "emboss":
        text.apply_translation([0.0, 0.0, thickness - 1.0])
        return common.boolean_union([base, text])
    # deboss: sink relief deep into the top face (base stays >= 1.2 mm beneath).
    text.apply_translation([0.0, 0.0, thickness - relief])
    return common.boolean_difference(base, text)
