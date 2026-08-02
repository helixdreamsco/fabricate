"""Printability verdicts, and the advice attached to them.

The badge used to tell everyone with a fragile model to "scale up or
regenerate". Measured on a real generated dragon, that was false: it still
failed at 200 mm. Advice that doesn't work is worse than none, so the worker
now says whether scaling would actually help.
"""

import numpy as np
import trimesh

from app.design import pipeline


def thin_walled_box(wall_mm, size_mm=40.0):
    """Hollow box with a known wall thickness — thickness is unambiguous."""
    outer = trimesh.creation.box(extents=[size_mm, size_mm, size_mm])
    inner = trimesh.creation.box(
        extents=[size_mm - 2 * wall_mm] * 3
    )
    return outer.difference(inner)


def test_a_chunky_solid_is_not_fragile():
    thin, fragile, scale = pipeline.thickness_check(
        trimesh.creation.box(extents=[30, 30, 30])
    )
    assert not fragile
    assert scale is None, "nothing to fix, so nothing to suggest"


def test_a_thin_shell_is_flagged_and_scaling_is_offered():
    # 0.6 mm walls: under the 1.2 mm floor, and doubling the model fixes it.
    mesh = thin_walled_box(0.6)
    thin, fragile, scale = pipeline.thickness_check(mesh)
    assert fragile
    assert scale is not None, "doubling this shell would clear the threshold"
    assert 1.0 < scale <= 3.0


def test_the_suggested_scale_actually_works():
    """The number has to be true — it is shown to the user as a promise."""
    mesh = thin_walled_box(0.6)
    _, fragile, scale = pipeline.thickness_check(mesh)
    assert fragile and scale

    bigger = mesh.copy()
    bigger.apply_scale(scale)
    _, still_fragile, _ = pipeline.thickness_check(bigger)
    assert not still_fragile, "the advice we give must leave the model printable"


def test_no_scale_is_offered_when_the_model_would_exceed_the_build_volume():
    # Already near the size cap, so there is no room to scale into.
    mesh = thin_walled_box(0.3, size_mm=pipeline.MAX_BBOX_MM * 0.9)
    _, fragile, scale = pipeline.thickness_check(mesh)
    assert fragile
    assert scale is None, "must not suggest a size that cannot be printed"


def t_bar():
    """Wide flat cap on a narrow post.

    Post-down, the cap's underside is a horizontal ceiling the printer has to
    bridge. Cap-down, it rests on the plate and nothing overhangs — an
    unambiguous right answer for the orientation search.
    """
    post = trimesh.creation.box(extents=[10, 10, 40])
    post.apply_translation([0, 0, 20])
    cap = trimesh.creation.box(extents=[40, 40, 6])
    cap.apply_translation([0, 0, 43])
    mesh = post.union(cap)
    mesh.apply_translation([0, 0, -mesh.bounds[0][2]])
    return mesh


def test_orientation_search_finds_the_flat_side():
    mesh = t_bar()
    before = pipeline.overhang_fraction(mesh)
    assert before > pipeline.OVERHANG_AREA_FRACTION, "fixture should start bad"

    after = pipeline.overhang_fraction(pipeline.orient_for_printing(mesh))
    assert after < before
    assert after <= pipeline.OVERHANG_AREA_FRACTION, (
        f"flipping the cap down should clear the support threshold, got {after}"
    )


def test_orientation_removes_the_supports_badge():
    """The whole point: fewer supports, so less material and a lower quote."""
    _, _metrics, badge = pipeline.process(t_bar(), kind="ai")
    assert badge != "needs_supports"


def test_orientation_is_deterministic_and_leaves_good_poses_alone():
    box = trimesh.creation.box(extents=[30, 30, 10])
    box.apply_translation([0, 0, -box.bounds[0][2]])
    a = pipeline.orient_for_printing(box)
    b = pipeline.orient_for_printing(box)
    assert np.allclose(a.vertices, b.vertices)
    # A flat box has no overhang either way up; ties keep the original pose so
    # the result still matches what the customer previewed.
    assert np.allclose(a.extents, box.extents)


def test_templates_are_never_reoriented():
    """A nameplate that stands up was designed to. Only AI output is posed."""
    plate = trimesh.creation.box(extents=[60, 10, 40])
    plate.apply_translation([0, 0, -plate.bounds[0][2]])
    out, _metrics, _badge = pipeline.process(plate.copy(), kind="preset")
    assert np.allclose(sorted(out.extents), sorted(plate.extents))
    assert abs(out.extents[2] - 40) < 1e-6, "height must survive as authored"
