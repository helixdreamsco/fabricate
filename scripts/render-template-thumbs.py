#!/usr/bin/env python3
"""Render template gallery thumbnails from the real geometry.

The gallery used to show hand-drawn flat SVG icons. Those were quick to make
but they lied a little: a customer picked a card and then met a different
looking object. These are snapshots of the actual mesh each template
produces, shaded in Fabricate purple so the card matches the 3D preview and
the /configure viewer.

Deliberately a software renderer — project the triangles, depth-sort them,
hand matplotlib a pile of 2D polygons with per-face colours. No GPU, no
headless browser, no OpenGL context to fight with in CI, and byte-identical
output on every machine.

Usage:
    python3 scripts/render-template-thumbs.py            # all templates
    python3 scripts/render-template-thumbs.py qr-stand   # just one

Re-run after changing a template's geometry or its showcase params.
"""

import json
import os
import sys

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import PolyCollection

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "api"))

from app.design import pipeline  # noqa: E402
from app.design.templates import REGISTRY  # noqa: E402

OUT_DIR = os.path.join(REPO_ROOT, "public", "design-thumbs")
TEMPLATES_DIR = os.path.join(REPO_ROOT, "design", "templates")

# Fabricate purple — MATERIALS[0].colors[0].hex, the same filament the
# /configure viewer and the design preview default to.
BASE_RGB = np.array([0x7C, 0x3A, 0xED]) / 255.0

# Display pose, not a print-bed view.
#
# Meshes come out of the pipeline Z-up and resting on z=0 — how they sit on
# the bed, which is the wrong way to photograph them. A flat tag viewed from
# a generic orbit camera lies down and its text runs sideways.
#
# So each model is rotated into a pose first: turn its readable face toward
# the viewer, then tip it back enough to show thickness. YAW adds the slight
# three-quarter twist that keeps it from looking like a flat icon.
YAW_DEG = -20.0
# Plates (tags, coasters) read face-on from above; tall parts (the QR stand)
# read from the front at roughly eye level.
PLATE_TILT_DEG = 32.0
UPRIGHT_TILT_DEG = 74.0
# z-extent / footprint below this counts as a plate.
FLATNESS_THRESHOLD = 0.45

# 2x the 200x140 CSS box so the cards stay sharp on retina.
WIDTH_PX, HEIGHT_PX = 400, 280
DPI = 100
MARGIN = 0.10          # fraction of the frame left as breathing room
MAX_FACES = 40_000     # decimate before rendering; plenty at thumbnail size

# Showcase parameters. A thumbnail should show the template doing its job, so
# these fill in the text/icon a bare default would leave empty — an unlabelled
# blank tag tells a customer nothing.
SHOWCASE = {
    "logo-keyring": {"text": "ACME", "shape": "dog-tag", "mode": "emboss", "widthMm": 50},
    "qr-stand": {"url": "https://fabricate.helixdreams.co", "text": "SCAN TO ORDER"},
    # Embossed rather than the template's debossed default: a recessed groove
    # is nearly invisible at card size, a raised mark reads instantly.
    "coaster-set": {"icon": "star", "mode": "emboss", "shape": "circle"},
    "keychain-text": {"text": "ALEX"},
    "bangle": {"text": "FABRICATE"},
}


def load_spec(template_id):
    with open(os.path.join(TEMPLATES_DIR, "%s.json" % template_id), "r") as fh:
        return json.load(fh)


def default_params(spec):
    return {name: p.get("default") for name, p in spec["params"].items()}


def _rot_x(deg):
    a = np.radians(deg)
    return np.array([[1, 0, 0], [0, np.cos(a), -np.sin(a)], [0, np.sin(a), np.cos(a)]])


def _rot_z(deg):
    a = np.radians(deg)
    return np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])


def display_rotation(mesh):
    """Rotation that poses the mesh for the camera.

    Afterwards the projection is a plain orthographic drop of x/y with z as
    depth, so screen-right is model +X and screen-up is model +Y — which is
    what keeps embossed text the right way up.
    """
    ex, ey, ez = mesh.extents
    flatness = ez / max(ex, ey, 1e-6)
    tilt = PLATE_TILT_DEG if flatness < FLATNESS_THRESHOLD else UPRIGHT_TILT_DEG
    # Yaw in the model's own plane first, then tip the top away from the
    # viewer so the near edge and its thickness stay visible.
    return _rot_x(-tilt) @ _rot_z(YAW_DEG)


def render(mesh, out_path):
    if len(mesh.faces) > MAX_FACES:
        mesh = mesh.simplify_quadric_decimation(face_count=MAX_FACES)

    rotation = display_rotation(mesh)
    verts = (mesh.vertices - mesh.centroid) @ rotation.T
    normals = mesh.face_normals @ rotation.T
    # Posed, so the camera is simply +Z looking back at the origin.
    eye = np.array([0.0, 0.0, 1.0])

    screen = verts[:, :2]
    depth = verts[:, 2]                              # larger = nearer the camera

    tri = screen[mesh.faces]                         # (F, 3, 2)
    tri_depth = depth[mesh.faces].mean(axis=1)

    # Backface cull: with a closed solid the far half is never visible, and
    # dropping it halves the polygons matplotlib has to composite.
    keep = (normals @ eye) > 0
    tri, tri_depth, normals = tri[keep], tri_depth[keep], normals[keep]

    # Lambert term from a key light over the viewer's left shoulder, lifted by
    # a generous ambient so unlit faces stay purple rather than going muddy.
    key = np.array([-0.45, 0.55, 0.70])
    lambert = np.clip(normals @ key, 0.0, 1.0)
    shade = 0.42 + 0.58 * lambert
    colors = np.clip(BASE_RGB[None, :] * shade[:, None], 0.0, 1.0)
    # Nudge lit faces toward white so highlights read as sheen, not just a
    # lighter purple — flat lambert on a saturated colour looks like plastic
    # in the worst way.
    colors = colors + (1.0 - colors) * (lambert[:, None] ** 3) * 0.28

    order = np.argsort(tri_depth)                    # painter's algorithm
    tri, colors = tri[order], colors[order]

    fig = plt.figure(figsize=(WIDTH_PX / DPI, HEIGHT_PX / DPI), dpi=DPI)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    fig.patch.set_alpha(0.0)
    ax.patch.set_alpha(0.0)

    # linewidth>0 on the same colour as the fill closes the hairline seams
    # antialiasing leaves between adjacent triangles.
    ax.add_collection(
        PolyCollection(tri, facecolors=colors, edgecolors=colors,
                       linewidths=0.35, antialiaseds=True)
    )

    # Fit with a uniform scale so the aspect ratio is preserved.
    (x0, y0), (x1, y1) = tri.reshape(-1, 2).min(axis=0), tri.reshape(-1, 2).max(axis=0)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    half = max(x1 - x0, (y1 - y0) * WIDTH_PX / HEIGHT_PX) / 2.0 / (1.0 - 2 * MARGIN)
    ax.set_xlim(cx - half, cx + half)
    ax.set_ylim(cy - half * HEIGHT_PX / WIDTH_PX, cy + half * HEIGHT_PX / WIDTH_PX)

    fig.savefig(out_path, transparent=True, dpi=DPI)
    plt.close(fig)


def main(argv):
    wanted = argv[1:] or sorted(REGISTRY)
    os.makedirs(OUT_DIR, exist_ok=True)
    for template_id in wanted:
        if template_id not in REGISTRY:
            print("  ! unknown template: %s" % template_id)
            continue
        spec = load_spec(template_id)
        params = {**default_params(spec), **SHOWCASE.get(template_id, {})}
        mesh = REGISTRY[template_id](params, spec, REPO_ROOT, assets={})
        mesh, _metrics, _badge = pipeline.process(mesh, kind="preset")
        out = os.path.join(OUT_DIR, "%s.png" % template_id)
        render(mesh, out)
        print("  %-14s %6d faces -> %s" % (
            template_id, len(mesh.faces), os.path.relpath(out, REPO_ROOT)))


if __name__ == "__main__":
    main(sys.argv)
