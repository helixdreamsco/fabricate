"""nameplate-desk: triangular-prism wedge with text on the 70-degree sloped face."""

import math
import os

import numpy as np
import trimesh

from .. import common

BASE_DEPTH = 32.0
HEIGHT = 38.0
FACE_ANGLE_DEG = 70.0


def build(params, spec, repo_root):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    width = p["widthMm"]
    relief = cons["reliefDepthMm"]

    # Wedge cross-section in (y, z), extruded along X.
    run = HEIGHT / math.tan(math.radians(FACE_ANGLE_DEG))  # horizontal run of the slope
    from shapely.geometry import Polygon

    section = Polygon([(0.0, 0.0), (BASE_DEPTH, 0.0), (BASE_DEPTH, HEIGHT), (run, HEIGHT)])
    wedge = trimesh.creation.extrude_polygon(section, width)
    # extrude_polygon extrudes +Z from the XY plane; remap so the section lies
    # in YZ and the extrusion runs along X: (x,y,z) -> (z, x, y)
    wedge.vertices = wedge.vertices[:, [2, 0, 1]]  # cyclic permutation, handedness kept
    wedge.apply_translation([-width / 2.0, 0.0, 0.0])

    # Sloped face plane: passes through y=0,z=0 rising to (run, HEIGHT).
    theta = math.radians(FACE_ANGLE_DEG)
    slope_len = math.hypot(run, HEIGHT)
    d = np.array([0.0, math.cos(theta), math.sin(theta)])   # up-slope direction
    n = np.array([0.0, -math.sin(theta), math.cos(theta)])  # outward face normal

    margin = 6.0
    avail_w = width - 2.0 * margin
    avail_h = slope_len - 2.0 * margin
    cap_target = max(cons["minTextHeightMm"], min(avail_h, 16.0))
    embed = 2.0
    text, _ = common.text_mesh(
        p["text"], common.font_path(repo_root, p["font"]),
        cap_height_mm=cap_target, depth_mm=relief + embed, max_width_mm=avail_w,
    )
    if text is None:
        raise common.InvalidParams("invalid_params: text renders to empty geometry")

    # Rotate text (XY plane, +Z extrusion) onto the sloped face: Y -> d, Z -> n.
    rot = trimesh.transformations.rotation_matrix(theta, [1.0, 0.0, 0.0])
    text.apply_transform(rot)
    face_centre = np.array([0.0, run / 2.0, HEIGHT / 2.0])

    if p["mode"] == "emboss":
        # sink `embed` into the face, protrude `relief` out along the normal
        text.apply_translation(face_centre - n * embed)
        return common.boolean_union([wedge, text])
    # deboss: cut `relief` deep into the face
    text.apply_translation(face_centre - n * (relief + embed))
    cutter = text
    cutter.apply_translation(n * embed)  # cutter spans [-relief, +embed] about the face
    return common.boolean_difference(wedge, cutter)
