"""coaster-set: the cheap-to-add template.

This one exists partly as evidence: if the shared layers were built right,
a third brand template should be assembly rather than invention. The tests
here are correspondingly about behaviour, not novel geometry.
"""

import json
import os

import numpy as np
import pytest

from app.design import common, pipeline
from app.design.templates import coaster_set

REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
SPEC = json.load(
    open(os.path.join(REPO_ROOT, "design", "templates", "coaster-set.json"))
)
ASSET_ID = "asset_" + "0" * 24
LOGO = {
    "shapes": [{
        "rings": [[20, 20, 80, 20, 80, 45, 55, 45, 55, 80, 20, 80, 20, 20]],
        "fillRule": "nonzero",
    }],
    "bounds": [20, 20, 80, 80],
}

BASE = {
    "logo": "",
    "icon": "star",
    "shape": "circle",
    "mode": "deboss",
    "sizeMm": 95,
    "thicknessMm": 4,
}


def build(**overrides):
    params = {**BASE, **overrides}
    assets = {ASSET_ID: LOGO} if params.get("logo") else {}
    return coaster_set.build(params, SPEC, REPO_ROOT, assets=assets)


@pytest.mark.parametrize("shape", ["circle", "rounded-square"])
@pytest.mark.parametrize("mode", ["emboss", "deboss"])
@pytest.mark.parametrize("size", [90, 95, 100])
def test_every_combination_is_one_printable_solid(shape, mode, size):
    mesh = build(shape=shape, mode=mode, sizeMm=size, logo=ASSET_ID)
    mesh, _metrics, badge = pipeline.process(mesh, kind="preset")
    assert mesh.is_watertight
    assert len(mesh.split(only_watertight=False)) == 1
    assert badge != "too_fragile"


def test_size_and_thickness_are_honoured():
    for size in (90, 95, 100):
        mesh = build(sizeMm=size)
        assert abs(mesh.extents[0] - size) < 0.5
        assert abs(mesh.extents[1] - size) < 0.5
    for thickness in (4, 4.5, 5):
        assert abs(build(thicknessMm=thickness).extents[2] - thickness) < 1e-6


def test_the_recess_is_real_and_holds_condensation():
    """The recess is functional, not decorative — check it actually exists."""
    plain = build(icon="star", mode="deboss")
    # A solid disc of the same footprint would have this volume.
    solid = np.pi * (95 / 2.0) ** 2 * 4
    assert plain.volume < solid, "no material was removed for the recess"
    # And the rim must survive: the coaster is still full thickness at its edge.
    assert abs(plain.extents[2] - 4) < 1e-6


def test_falls_back_to_the_icon_library_when_no_logo_is_uploaded():
    # Brands upload a logo; everyone else picks an icon. Both must work.
    with_icon = build(logo="", icon="heart")
    assert with_icon.is_watertight
    with_logo = build(logo=ASSET_ID)
    assert with_logo.is_watertight
    # They are genuinely different artwork, not the same fallback twice.
    assert not np.isclose(with_icon.volume, with_logo.volume)


def test_an_unknown_icon_is_rejected():
    with pytest.raises(common.InvalidParams):
        build(logo="", icon="definitely-not-an-icon")


def test_emboss_adds_material_and_deboss_removes_it():
    embossed = build(mode="emboss", logo=ASSET_ID)
    debossed = build(mode="deboss", logo=ASSET_ID)
    assert embossed.volume > debossed.volume


def test_embossed_artwork_stays_below_the_rim_so_coasters_stack():
    # Relief sits on the recess floor; if it stood proud of the rim the set
    # wouldn't stack and would rock on a table.
    embossed = build(mode="emboss", logo=ASSET_ID, thicknessMm=4)
    assert embossed.extents[2] <= 4 + 1e-6


def test_quantity_block_offers_set_sizes():
    # The run-size machinery from Phase 1 is what makes this a "set".
    quantity = SPEC["quantity"]
    assert quantity["presets"] == [4, 6, 12]
    assert quantity["min"] <= quantity["default"] <= quantity["max"]


def test_build_is_deterministic():
    a = build(logo=ASSET_ID)
    b = build(logo=ASSET_ID)
    assert np.allclose(a.vertices, b.vertices)
    assert np.array_equal(a.faces, b.faces)
