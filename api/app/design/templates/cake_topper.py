"""cake-topper: upright extruded text on a bar with two cake spikes."""

import os

import numpy as np
import trimesh

from .. import common

TEXT_DEPTH = 3.0     # extrusion (== constraints.reliefDepthMm)
BAR_DEPTH = 6.0
BAR_HEIGHT = 8.0
SPIKE_LEN = 45.0
SPIKE_TOP_W = 5.0
SPIKE_TIP_W = 1.5


def build(params, spec, repo_root):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    width = p["widthMm"]

    # Text scaled so its width fills widthMm (4 mm bar margin), never smaller
    # than minTextHeightMm cap height.
    geom, cap_h = common.text_geometry(p["text"], common.font_path(repo_root, p["font"]))
    if geom is None or geom.is_empty:
        raise common.InvalidParams("invalid_params: text renders to empty geometry")
    minx, _, maxx, _ = geom.bounds
    ratio = (maxx - minx) / cap_h  # text width per unit cap height
    cap_target = max(cons["minTextHeightMm"], (width - 4.0) / ratio)
    text, _ = common.text_mesh(
        p["text"], common.font_path(repo_root, p["font"]),
        cap_height_mm=cap_target, depth_mm=TEXT_DEPTH, max_width_mm=width - 4.0,
    )

    # Stand the letters up: XY plane -> XZ plane, extrusion along +Y.
    rot = trimesh.transformations.rotation_matrix(np.pi / 2.0, [1.0, 0.0, 0.0])
    text.apply_transform(rot)
    b = text.bounds
    # centre in X and Y, bottom of glyphs embedded 1 mm into the bar top
    bar_top = SPIKE_LEN + BAR_HEIGHT
    text.apply_translation([
        -(b[0][0] + b[1][0]) / 2.0,
        -(b[0][1] + b[1][1]) / 2.0,
        bar_top - 1.0 - b[0][2],
    ])

    # Connecting bar widthMm x 6 x 8 under the letters.
    bar = trimesh.creation.box((width, BAR_DEPTH, BAR_HEIGHT))
    bar.apply_translation([0.0, 0.0, SPIKE_LEN + BAR_HEIGHT / 2.0])

    # Two spikes descending from the bar at 20 % and 80 % of width.
    spikes = []
    for frac in (0.2, 0.8):
        spike = common.tapered_spike(SPIKE_TOP_W, SPIKE_TIP_W, BAR_DEPTH, SPIKE_LEN + 1.0)
        spike.apply_translation([-width / 2.0 + frac * width, 0.0, SPIKE_LEN + 1.0])
        spikes.append(spike)

    mesh = common.boolean_union([text, bar] + spikes)
    mesh.apply_translation([0.0, 0.0, -mesh.bounds[0][2]])
    return mesh
