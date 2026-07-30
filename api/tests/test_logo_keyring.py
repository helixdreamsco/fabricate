"""logo-keyring: the flagship brand template.

The bar here is that a real, messy logo goes through without babysitting, and
that cut-through never ships a tag that would print as loose fragments.
"""

import json
import os

import numpy as np
import pytest

from app.design import common
from app.design.templates import logo_keyring

SPEC = json.load(
    open(
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "design", "templates", "logo-keyring.json",
        )
    )
)
REPO_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
ASSET_ID = "asset_" + "0" * 24

BASE = {
    "logo": "",
    "shape": "rounded-rect",
    "mode": "emboss",
    "text": "",
    "font": "sans-bold",
    "widthMm": 40,
    "thicknessMm": 3,
}


def ring(x0, y0, x1, y1):
    return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]


def asset(shapes, bounds=(0, 0, 100, 100)):
    return {"shapes": shapes, "bounds": list(bounds)}


# A solid L-shaped mark: no enclosed areas, safe to cut through.
SOLID_MARK = asset([
    {"rings": [[20, 20, 80, 20, 80, 45, 55, 45, 55, 80, 20, 80, 20, 20]],
     "fillRule": "nonzero"},
])
# A ring mark: the counter drops out if cut through.
COUNTER_MARK = asset([
    {"rings": [ring(0, 0, 100, 100), ring(30, 30, 70, 70)], "fillRule": "evenodd"},
])
# Several disjoint marks plus a counter — closer to a real wordmark+icon lockup.
MESSY_MARK = asset([
    {"rings": [ring(0, 0, 40, 40)], "fillRule": "nonzero"},
    {"rings": [ring(50, 0, 90, 40), ring(60, 10, 80, 30)], "fillRule": "evenodd"},
    {"rings": [[100, 0, 140, 20, 100, 40, 100, 0]], "fillRule": "nonzero"},
    {"rings": [ring(0, 55, 140, 75)], "fillRule": "nonzero"},
], bounds=(0, 0, 140, 75))


def build(**overrides):
    params = {**BASE, **overrides}
    assets = {ASSET_ID: params.pop("_asset")} if "_asset" in params else {}
    return logo_keyring.build(params, SPEC, REPO_ROOT, assets=assets)


def test_bare_tag_is_a_single_watertight_solid():
    mesh = build()
    assert mesh.is_watertight
    assert len(mesh.split(only_watertight=False)) == 1


def test_hanging_hole_clears_a_split_ring():
    # The brief requires >= 4 mm. Measure the actual void rather than trusting
    # the constant: a hole that closed up would still pass a constant check.
    mesh = build()
    zmid = mesh.bounds[1][2] / 2.0
    # Cast a horizontal line through the hole's centre height and measure the
    # gap in the solid.
    top_y = mesh.bounds[1][1]
    hole_cy = top_y - 3.0 - 2.5
    section = mesh.section(plane_origin=[0, hole_cy, zmid], plane_normal=[0, 0, 1])
    assert section is not None
    xs = np.asarray(section.vertices)[:, 0]
    # Two disjoint spans of material either side of the hole.
    interior = xs[(xs > -6) & (xs < 6)]
    assert len(interior) > 0, "expected the hole to open a gap in this section"
    assert interior.max() - interior.min() >= 4.0


@pytest.mark.parametrize("shape", ["rounded-rect", "dog-tag"])
def test_both_silhouettes_build(shape):
    mesh = build(shape=shape)
    assert mesh.is_watertight
    assert abs(mesh.extents[0] - 40) < 0.5


@pytest.mark.parametrize("width", [30, 40, 50, 60])
def test_width_is_honoured_across_the_range(width):
    mesh = build(widthMm=width)
    assert abs(mesh.extents[0] - width) < 0.5


@pytest.mark.parametrize("mode", ["emboss", "deboss"])
def test_relief_modes_keep_one_piece_even_with_counters(mode):
    # Counters only matter when cutting through — embossing an O is fine.
    mesh = build(mode=mode, logo=ASSET_ID, text="ACME", _asset=COUNTER_MARK)
    assert mesh.is_watertight
    assert len(mesh.split(only_watertight=False)) == 1


def test_emboss_adds_material_and_deboss_removes_it():
    plain = build()
    embossed = build(mode="emboss", logo=ASSET_ID, _asset=SOLID_MARK)
    debossed = build(mode="deboss", logo=ASSET_ID, _asset=SOLID_MARK)
    assert embossed.volume > plain.volume
    assert debossed.volume < plain.volume
    # Emboss stands proud of the face; deboss must not change the envelope.
    assert embossed.extents[2] > plain.extents[2]
    assert abs(debossed.extents[2] - plain.extents[2]) < 1e-6


def test_cut_through_solid_mark_is_allowed():
    mesh = build(mode="cut-through", logo=ASSET_ID, _asset=SOLID_MARK)
    assert len(mesh.split(only_watertight=False)) == 1
    # It really did cut a void, not just skim the surface.
    assert mesh.volume < build().volume


def test_cut_through_rejects_a_logo_that_would_sever_the_tag():
    with pytest.raises(common.InvalidParams) as exc:
        build(mode="cut-through", logo=ASSET_ID, _asset=COUNTER_MARK)
    msg = str(exc.value)
    assert "cut_through_splits_tag" in msg
    assert "emboss" in msg, "the error must tell the user what to do instead"


def test_cut_through_rejects_text_with_enclosed_letters():
    with pytest.raises(common.InvalidParams) as exc:
        build(mode="cut-through", text="ACME", logo=ASSET_ID, _asset=SOLID_MARK)
    # The advice should name the real culprit — the letters, not the logo.
    assert "A, O and R" in str(exc.value)


def test_cut_through_text_without_counters_is_allowed():
    mesh = build(mode="cut-through", text="XL", logo=ASSET_ID, _asset=SOLID_MARK)
    assert len(mesh.split(only_watertight=False)) == 1


def test_a_messy_multi_mark_logo_builds_without_babysitting():
    # Disjoint marks, a counter, a triangle and a long bar — the sort of
    # lockup that arrives from a real brand's asset pack.
    for mode in ("emboss", "deboss"):
        mesh = build(mode=mode, logo=ASSET_ID, text="ACME LTD", _asset=MESSY_MARK)
        assert mesh.is_watertight, f"{mode} produced a non-watertight tag"
        assert len(mesh.split(only_watertight=False)) == 1


def test_logo_stays_inside_the_tag_footprint():
    mesh = build(mode="emboss", logo=ASSET_ID, text="ACME", _asset=MESSY_MARK)
    plain = build()
    # Relief must not overhang the silhouette in XY.
    assert mesh.extents[0] <= plain.extents[0] + 1e-6
    assert mesh.extents[1] <= plain.extents[1] + 1e-6


def test_missing_asset_degrades_to_a_plain_tag_rather_than_failing():
    # The param can name an asset the worker wasn't given (it travels inline);
    # better to build the tag than to 500. The Node side treats an
    # unresolvable asset as a hard error before it ever gets here.
    mesh = logo_keyring.build(
        {**BASE, "logo": ASSET_ID}, SPEC, REPO_ROOT, assets={}
    )
    assert mesh.is_watertight


@pytest.mark.parametrize("width", [30, 40, 50, 60])
@pytest.mark.parametrize("shape", ["rounded-rect", "dog-tag"])
def test_a_logo_tag_is_printable_at_every_size(width, shape):
    """The core promise: pick any size, add your logo, get a printable tag.

    Runs the real pipeline (not just the builder) so the thin-feature and
    slice checks actually vote.
    """
    from app.design import pipeline

    mesh = build(logo=ASSET_ID, shape=shape, widthMm=width, _asset=MESSY_MARK)
    mesh, metrics, badge = pipeline.process(mesh, kind="preset")
    # The badge already encodes the thin-area threshold; asserting a raw
    # count on top of it would just pin raster noise.
    assert badge == "ready", (
        f"{shape} at {width}mm came out {badge} "
        f"({metrics['thinAreas']} thin samples)"
    )


def test_text_needs_a_tag_big_enough_to_print_it():
    """Text strokes are the limiting feature, and the badge says so.

    At 7 mm cap height a bold stroke is ~1.3 mm — just clear of what a nozzle
    can hold. Squeeze that onto a 30 mm tag and it shrinks below the floor.
    That is a real constraint, so the pipeline must flag it rather than let
    someone order an unreadable tag; on a 40 mm tag the same text is fine.
    """
    from app.design import pipeline

    _, _, small = pipeline.process(
        build(text="ACME", widthMm=30), kind="preset"
    )
    assert small == "too_fragile"

    _, _, roomy = pipeline.process(
        build(text="ACME", widthMm=40), kind="preset"
    )
    assert roomy == "ready"


def test_build_is_deterministic():
    a = build(mode="emboss", logo=ASSET_ID, text="ACME", _asset=MESSY_MARK)
    b = build(mode="emboss", logo=ASSET_ID, text="ACME", _asset=MESSY_MARK)
    assert np.allclose(a.vertices, b.vertices)
    assert np.array_equal(a.faces, b.faces)
