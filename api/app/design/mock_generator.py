"""Demo text-to-3D generator used when no Meshy API key is configured.

Builds a chunky, deterministic "creature/object" from a prompt+seed hash so
the AI flow (moderation → generate → repair → slice → quote) is exercisable
end-to-end without a paid generation provider. The output is intentionally
raw (overlapping unwelded shells, occasional floating debris) so the repair
pipeline does real work, exactly as with provider output.
"""
from __future__ import annotations

import hashlib
import struct

import numpy as np
import trimesh

from . import common


def _rng(prompt: str, seed: int):
    digest = hashlib.sha256(("%s|%d" % (prompt.strip().lower(), seed)).encode()).digest()
    (a,) = struct.unpack("<Q", digest[:8])
    return np.random.default_rng(a)


def build_mock_model(prompt: str, seed: int) -> trimesh.Trimesh:
    rng = _rng(prompt, seed)
    parts: list[trimesh.Trimesh] = []

    # Body: squashed sphere or capsule, 28-40mm tall.
    body_h = float(rng.uniform(28.0, 40.0))
    body_r = body_h * float(rng.uniform(0.32, 0.45))
    if rng.random() < 0.5:
        body = common.sphere(body_h / 2.0)
        body.apply_scale([1.0, float(rng.uniform(0.75, 1.0)), 1.0])
    else:
        body = common.capsule(body_h - 2 * body_r, body_r)
    body.apply_translation([0.0, 0.0, body_h / 2.0])
    parts.append(body)

    # Head: smaller sphere overlapping the body top.
    head_r = body_r * float(rng.uniform(0.55, 0.8))
    head_z = body_h + head_r * 0.55
    head = common.sphere(head_r)
    head.apply_translation([0.0, 0.0, head_z])
    parts.append(head)

    # 2-5 appendages: cones/spikes/ears around the body, chunky (>=3mm).
    for i in range(int(rng.integers(2, 6))):
        angle = float(rng.uniform(0.0, 2.0 * np.pi))
        kind = rng.random()
        if kind < 0.5:
            r_base = float(rng.uniform(4.0, 7.0))
            # frustum, not cone: pointed tips would flag too_fragile
            limb = common.frustum(r_base, max(2.5, r_base * 0.5), float(rng.uniform(8.0, 16.0)))
            limb.apply_transform(
                trimesh.transformations.rotation_matrix(
                    float(rng.uniform(0.25, 0.7)), [np.sin(angle), -np.cos(angle), 0.0]
                )
            )
            # embedded well into the body so junctions are steep, not grazing
            limb.apply_translation([
                np.cos(angle) * body_r * 0.55,
                np.sin(angle) * body_r * 0.55,
                body_h * float(rng.uniform(0.4, 0.7)),
            ])
        else:
            limb = common.sphere(float(rng.uniform(4.5, 6.5)))
            limb.apply_translation([
                np.cos(angle) * body_r * 0.9,
                np.sin(angle) * body_r * 0.9,
                body_h * float(rng.uniform(0.35, 0.75)),
            ])
        parts.append(limb)

    # Ears on the head half the time.
    if rng.random() < 0.5:
        for side in (-1.0, 1.0):
            ear = common.frustum(head_r * 0.45, max(2.5, head_r * 0.2), head_r * 1.1)
            ear.apply_translation([side * head_r * 0.55, 0.0, head_z + head_r * 0.7])
            parts.append(ear)

    # Base disc so it stands.
    base = common.cylinder(body_r * 1.35, 4.0)
    parts.append(base)

    # Occasionally add floating debris the repair pipeline must drop —
    # mimics real generator output.
    debris_parts = []
    if rng.random() < 0.4:
        debris = trimesh.creation.box(extents=[1.2, 1.2, 1.2])
        debris.apply_translation([body_r * 4.0, body_r * 4.0, body_h * 1.5])
        debris_parts.append(debris)

    # Union the solid parts so junctions are clean; leave any debris
    # concatenated raw so the repair pipeline still does island-drop work.
    solid = common.boolean_union(parts)
    if debris_parts:
        return trimesh.util.concatenate([solid] + debris_parts)
    return solid
