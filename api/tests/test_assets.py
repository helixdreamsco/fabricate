"""Inline logo assets -> mesh, on the worker side.

The worker never parses SVG: the Node side extracts polygons once at upload
and sends them inline, precisely so the browser preview and this rebuild
cannot drift apart. These tests pin the polygon contract.
"""

import numpy as np
import pytest

from app.design import common


def square(x0, y0, x1, y1):
    """Closed CCW ring as the flat [x,y,x,y,...] the Node side emits."""
    return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]


def asset(shapes):
    return {"shapes": shapes, "bounds": [0, 0, 100, 100]}


def test_single_filled_shape_becomes_a_solid():
    a = asset([{"rings": [square(0, 0, 50, 50)], "fillRule": "nonzero"}])
    mesh = common.asset_mesh(a, target_mm=20.0, depth_mm=1.5)
    assert mesh is not None
    assert mesh.is_watertight
    ext = mesh.extents
    # Scaled so the largest XY extent is exactly the target.
    assert abs(max(ext[0], ext[1]) - 20.0) < 1e-6
    assert abs(ext[2] - 1.5) < 1e-6
    # Base sits on z=0 so callers can place it by translation alone.
    assert abs(mesh.bounds[0][2]) < 1e-9


def test_even_odd_counter_becomes_a_hole():
    # An "O": outer ring with a smaller ring inside, evenodd.
    a = asset([{
        "rings": [square(0, 0, 100, 100), square(30, 30, 70, 70)],
        "fillRule": "evenodd",
    }])
    geom = common.asset_geometry(a)
    assert geom is not None
    # Ring area minus counter = 100^2 - 40^2. If the counter were filled in,
    # the area would be 10000 and the letter would print as a blob.
    assert abs(geom.area - (10000 - 1600)) < 1.0


def test_nonzero_contained_ring_also_becomes_a_hole():
    a = asset([{
        "rings": [square(0, 0, 100, 100), square(30, 30, 70, 70)],
        "fillRule": "nonzero",
    }])
    geom = common.asset_geometry(a)
    assert abs(geom.area - (10000 - 1600)) < 1.0


def test_disjoint_shapes_are_unioned_not_merged_into_one_ring():
    a = asset([
        {"rings": [square(0, 0, 20, 20)], "fillRule": "nonzero"},
        {"rings": [square(60, 60, 80, 80)], "fillRule": "nonzero"},
    ])
    geom = common.asset_geometry(a)
    assert geom.geom_type == "MultiPolygon"
    assert abs(geom.area - 800) < 1.0
    mesh = common.asset_mesh(a, target_mm=40.0, depth_mm=1.0)
    assert mesh is not None
    assert len(mesh.faces) > 0


def test_geometry_is_centred_on_the_origin():
    # Callers place the logo by translating from centre; an off-centre result
    # would silently shift every logo on every part.
    a = asset([{"rings": [square(200, 300, 260, 340)], "fillRule": "nonzero"}])
    geom = common.asset_geometry(a)
    minx, miny, maxx, maxy = geom.bounds
    assert abs((minx + maxx) / 2.0) < 1e-6
    assert abs((miny + maxy) / 2.0) < 1e-6


def test_y_is_flipped_from_svg_convention():
    # SVG y grows downward. A shape in the upper half of the viewBox must end
    # up in the upper half of the part, not mirrored.
    a = asset([
        {"rings": [square(0, 0, 100, 10)], "fillRule": "nonzero"},   # top in SVG
        {"rings": [square(0, 90, 100, 100)], "fillRule": "nonzero"},  # bottom
    ])
    geom = common.asset_geometry(a)
    # After flipping and centring, the SVG-top band sits at positive y.
    top_band = [p for p in geom.geoms if p.centroid.y > 0]
    assert len(top_band) == 1
    # It is the thin band that was at SVG y=0..10.
    assert abs(top_band[0].bounds[3] - 50.0) < 1e-6


def test_empty_asset_returns_none_rather_than_a_degenerate_mesh():
    assert common.asset_geometry(asset([])) is None
    assert common.asset_mesh(asset([]), target_mm=20.0, depth_mm=1.0) is None
    # Rings too short to enclose area are not geometry either.
    degenerate = asset([{"rings": [[0, 0, 1, 1]], "fillRule": "nonzero"}])
    assert common.asset_mesh(degenerate, target_mm=20.0, depth_mm=1.0) is None


def test_malformed_asset_payload_is_rejected():
    with pytest.raises(common.InvalidParams):
        common.asset_geometry("not a dict")


def test_asset_param_validation():
    spec = {
        "params": {
            "logo": {"kind": "asset", "label": "Logo", "accept": "svg",
                     "areaFraction": 0.6, "required": False, "default": ""},
        }
    }
    valid = "asset_" + "0123456789abcdef01234567"
    assert common.validate_params({"logo": valid}, spec)["logo"] == valid
    # Empty is fine when optional.
    assert common.validate_params({"logo": ""}, spec)["logo"] == ""

    for bad in ["asset_short", "../../etc/passwd", "asset_" + "F" * 24, 42]:
        with pytest.raises(common.InvalidParams):
            common.validate_params({"logo": bad}, spec)


def test_required_asset_rejects_empty():
    spec = {
        "params": {
            "logo": {"kind": "asset", "label": "Logo", "accept": "svg",
                     "areaFraction": 0.6, "required": True, "default": ""},
        }
    }
    with pytest.raises(common.InvalidParams):
        common.validate_params({"logo": ""}, spec)


def test_mesh_is_deterministic():
    # The same asset must rebuild to the same mesh on every order, or a
    # reprint would not match what the customer approved.
    a = asset([{"rings": [square(0, 0, 60, 40)], "fillRule": "nonzero"}])
    m1 = common.asset_mesh(a, target_mm=25.0, depth_mm=1.2)
    m2 = common.asset_mesh(a, target_mm=25.0, depth_mm=1.2)
    assert np.allclose(m1.vertices, m2.vertices)
    assert np.array_equal(m1.faces, m2.faces)
