"""badge-round: cylinder token + loop tab + centred icon and optional text."""

import os

from .. import common


def build(params, spec, repo_root):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    d = p["diameterMm"]
    r = d / 2.0
    thickness = p["thicknessMm"]
    relief = cons["reliefDepthMm"]

    icon_path = os.path.join(repo_root, "public", "design-icons", "%s.svg" % p["icon"])
    if not os.path.isfile(icon_path):
        raise common.InvalidParams("invalid_params: unknown icon %r" % p["icon"])

    disk = common.cylinder(r, thickness)  # 64 segments (contract asks 48+)

    # Small loop tab at top: outer r 5, hole r 2.5.
    tab_cy = r + 3.0
    tab = common.cylinder(5.0, thickness)
    tab.apply_translation([0.0, tab_cy, 0.0])
    hole = common.cylinder(2.5, thickness + 2.0)
    hole.apply_translation([0.0, tab_cy, -1.0])
    base = common.boolean_difference(common.boolean_union([disk, tab]), hole)

    has_text = p["text"].strip() != ""
    embed = 1.0
    reliefs = []

    icon = common.icon_mesh(icon_path, target_mm=0.45 * d, depth_mm=relief + embed)
    icon_cy = 0.12 * d if has_text else 0.0
    icon.apply_translation([0.0, icon_cy, 0.0])
    reliefs.append(icon)

    if has_text:
        chord = 0.8 * d
        text, _ = common.text_mesh(
            p["text"], common.font_path(repo_root, p["font"]),
            cap_height_mm=cons["minTextHeightMm"], depth_mm=relief + embed,
            max_width_mm=chord,
        )
        if text is not None:
            text.apply_translation([0.0, -0.26 * d, 0.0])
            reliefs.append(text)

    if p["mode"] == "emboss":
        for m in reliefs:
            m.apply_translation([0.0, 0.0, thickness - embed])
        return common.boolean_union([base] + reliefs)
    for m in reliefs:
        m.apply_translation([0.0, 0.0, thickness - relief])
    return common.boolean_difference(base, *reliefs)
