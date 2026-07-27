"""figure-modular: chunky character = base + body + head + accessory (+ base text)."""

import math
import os

import numpy as np
import trimesh

from .. import common

BASE_H = 8.0
OVERLAP = 2.0


def _body(kind, bh, radius, z0):
    if kind == "capsule":
        cyl_h = max(bh - 2.0 * radius, 1.0)
        m = common.capsule(cyl_h, radius)
        m.apply_translation([0.0, 0.0, z0])
        return m
    if kind == "box":
        side = 1.8 * radius
        m = common.rounded_plate(side, side, 3.0, bh)
        m.apply_translation([0.0, 0.0, z0])
        return m
    # round: sphere squashed 0.85
    m = common.sphere(bh / 2.0)
    m.apply_scale([1.0, 1.0, 0.85])
    m.apply_translation([0.0, 0.0, z0 + 0.425 * bh])
    return m


def _head(kind, r_h, bottom_z):
    """Head parts sitting on the neck socket: lowest point at bottom_z.

    Returns (parts, accessory_socket_top_z).
    """
    parts = []
    if kind == "cube":
        side = 1.7 * r_h
        m = common.rounded_plate(side, side, 3.0, side)
        m.apply_translation([0.0, 0.0, bottom_z])
        parts.append(m)
        top = bottom_z + side
    else:
        centre_z = bottom_z + r_h
        m = common.sphere(r_h)
        m.apply_translation([0.0, 0.0, centre_z])
        parts.append(m)
        top = centre_z + r_h
        if kind == "cat":
            for sx in (-1.0, 1.0):
                ear = common.frustum(0.45 * r_h, 1.6, 0.9 * r_h)
                ear.apply_translation([sx * 0.5 * r_h, 0.0, centre_z + 0.5 * r_h])
                parts.append(ear)
            # accessories still sit on the skull (between the ears), not the
            # ear tips, so the socket stays at the sphere top
    return parts, top


def _accessory(kind, r_h, head_top, acc_h):
    parts = []
    z0 = head_top - OVERLAP
    if kind == "hat":
        parts.append(_at(common.frustum(0.85 * r_h, 2.0, acc_h + OVERLAP), z0))
    elif kind == "antenna":
        rod = common.cylinder(1.75, acc_h + OVERLAP)
        parts.append(_at(rod, z0))
        ball = common.sphere(3.0)
        ball.apply_translation([0.0, 0.0, z0 + acc_h + OVERLAP - 2.0])
        parts.append(ball)
    elif kind == "crown":
        band_h = max(0.45 * acc_h, 3.0)
        band = common.cylinder(0.7 * r_h, band_h + OVERLAP)
        parts.append(_at(band, z0))
        spike_h = max(acc_h - band_h, 3.0)
        for i in range(4):
            ang = i * math.pi / 2.0
            spike = common.frustum(2.2, 1.6, spike_h + 1.0)
            spike.apply_translation([
                0.5 * r_h * math.cos(ang), 0.5 * r_h * math.sin(ang),
                z0 + band_h + OVERLAP - 1.0,
            ])
            parts.append(spike)
    return parts


def _at(mesh, z):
    mesh.apply_translation([0.0, 0.0, z])
    return mesh


def build(params, spec, repo_root):
    p = common.validate_params(params, spec)
    cons = spec["constraints"]
    H = p["heightMm"]

    r_base = 0.3 * H
    avail = H - BASE_H
    acc_budget = {"none": 0.0, "hat": 0.16, "antenna": 0.16, "crown": 0.10}[p["accessory"]]
    acc_h = acc_budget * avail
    rest = avail - acc_h
    body_h = 0.55 * rest
    r_head = 0.20 * rest
    r_body = min(0.20 * H, 0.85 * r_base)

    base = common.cylinder(r_base, BASE_H)
    body_z0 = BASE_H - OVERLAP
    body = _body(p["body"], body_h, r_body, body_z0)
    body_top = body_z0 + (0.85 * body_h if p["body"] == "round" else body_h)
    head_parts, head_top = _head(p["head"], r_head, body_top - OVERLAP)
    acc_parts = _accessory(p["accessory"], r_head, head_top, acc_h)

    parts = [base, body] + head_parts + acc_parts

    # Optional baseText embossed on the front rim of the base.
    if p["baseText"].strip():
        cap = cons["minTextHeightMm"]
        relief = cons["reliefDepthMm"]
        text, _ = common.text_mesh(
            p["baseText"], common.font_path(repo_root, p["font"]),
            cap_height_mm=cap, depth_mm=1.0, max_width_mm=1.2 * r_base,
        )
        if text is not None:
            w2 = (text.bounds[1][0] - text.bounds[0][0]) / 2.0
            sagitta = r_base - math.sqrt(max(r_base ** 2 - w2 ** 2, 0.0))
            depth_total = relief + sagitta + 2.0
            # re-extrude at the adaptive depth so the panel reaches the curved rim
            text.apply_scale([1.0, 1.0, depth_total])
            rot = trimesh.transformations.rotation_matrix(np.pi / 2.0, [1.0, 0.0, 0.0])
            text.apply_transform(rot)
            b = text.bounds
            text.apply_translation([
                -(b[0][0] + b[1][0]) / 2.0,
                -(r_base + relief) - b[0][1],
                4.0 - (b[0][2] + b[1][2]) / 2.0,
            ])
            parts.append(text)

    mesh = common.boolean_union(parts)

    # Scale the whole model so total height == heightMm, resting on Z=0.
    mesh.apply_translation([0.0, 0.0, -mesh.bounds[0][2]])
    total = mesh.bounds[1][2]
    mesh.apply_scale(H / total)
    mesh.apply_translation([0.0, 0.0, -mesh.bounds[0][2]])
    return mesh
