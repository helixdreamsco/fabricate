"""Slice caching, and what a quote does when the slicer can't help.

The rule these pin down: a failed slice must never cost the creator a quote.
/quote always answers 200 with usable numbers — the engine's when it has
them, the geometric estimate when it doesn't — and says which it used.
"""

import struct

import pytest

from app import slicer as slicer_mod
from app.pricing import estimate_printed_volume_cm3, quote


def cube_stl(size_mm: float = 40.0) -> bytes:
    """Binary STL of an axis-aligned cube, with real facet normals."""
    s = size_mm
    v = [
        (0, 0, 0), (s, 0, 0), (s, s, 0), (0, s, 0),
        (0, 0, s), (s, 0, s), (s, s, s), (0, s, s),
    ]
    faces = [
        ((0, 3, 2), (0, 0, -1)), ((0, 2, 1), (0, 0, -1)),
        ((4, 5, 6), (0, 0, 1)),  ((4, 6, 7), (0, 0, 1)),
        ((0, 1, 5), (0, -1, 0)), ((0, 5, 4), (0, -1, 0)),
        ((1, 2, 6), (1, 0, 0)),  ((1, 6, 5), (1, 0, 0)),
        ((2, 3, 7), (0, 1, 0)),  ((2, 7, 6), (0, 1, 0)),
        ((3, 0, 4), (-1, 0, 0)), ((3, 4, 7), (-1, 0, 0)),
    ]
    out = b"\0" * 80 + struct.pack("<I", len(faces))
    for tri, normal in faces:
        out += struct.pack("<3f", *normal)
        for i in tri:
            out += struct.pack("<3f", *v[i])
        out += struct.pack("<H", 0)
    return out


@pytest.fixture(autouse=True)
def clear_slice_cache():
    with slicer_mod._cache_lock:
        slicer_mod._cache.clear()
    yield
    with slicer_mod._cache_lock:
        slicer_mod._cache.clear()


# ── The geometric estimate ────────────────────────────────────────────

def test_printed_volume_matches_the_typescript_estimator():
    # 40mm cube: 64cm³ solid, 96cm² surface, 15% infill.
    # Must equal src/lib/filament.ts to the last decimal, or the creator
    # watches the price jump when the server answers.
    assert estimate_printed_volume_cm3(
        volume_cm3=64, surface_area_cm2=96, infill_pct=15
    ) == pytest.approx(16.944, abs=1e-6)


def test_printed_volume_clamps_to_solid_for_thin_walls():
    # Shell would be 36cm³ against a 2cm³ part — the interior term must not
    # go negative.
    assert estimate_printed_volume_cm3(
        volume_cm3=2, surface_area_cm2=400, infill_pct=15
    ) == pytest.approx(2.0)


def test_printed_volume_falls_back_when_area_is_unknown():
    # A STEP file that never tessellated has volume but no triangles.
    assert estimate_printed_volume_cm3(
        volume_cm3=64, surface_area_cm2=0, infill_pct=15
    ) == pytest.approx(16.944, abs=1e-6)


def test_quote_estimate_is_far_below_solid_mass():
    q = quote(
        volume_cm3=64, surface_area_cm2=96, material="PLA", quality="standard",
        infill_pct=15, quantity=1, delivery="pickup",
    )
    assert q.weight_g == pytest.approx(22.48, abs=0.05)
    assert q.weight_g < 64 * 1.24 * 0.3  # nowhere near solid


def test_quote_takes_a_maker_filament_rate():
    args = dict(
        volume_cm3=64, surface_area_cm2=96, material="PLA", quality="standard",
        infill_pct=15, quantity=1, delivery="pickup",
    )
    platform = quote(**args)
    maker = quote(**args, price_per_g_override=0.09)
    assert maker.material_cost > platform.material_cost
    assert maker.material_cost == pytest.approx(maker.weight_g * 0.09, abs=0.01)


# ── Slice caching ─────────────────────────────────────────────────────

def test_identical_requests_slice_once(monkeypatch):
    calls = []

    def fake_run(bin_path, mesh_bytes, *, digest, **kw):
        calls.append(digest)
        return slicer_mod.SliceResult(
            weight_g=22.8, time_minutes=66.0, layer_count=200,
            filament_used_mm=7658.0, engine="PrusaSlicer",
            engine_version="2.9.6", gcode_path=None,
        )

    monkeypatch.setattr(slicer_mod, "find_slicer", lambda: "/fake/prusa-slicer")
    monkeypatch.setattr(slicer_mod, "_run_slice", fake_run)

    kw = dict(filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.2)
    data = cube_stl()
    first = slicer_mod.slice_mesh(data, **kw)
    second = slicer_mod.slice_mesh(data, **kw)

    assert len(calls) == 1
    assert first is second


def test_settings_that_change_the_gcode_miss_the_cache(monkeypatch):
    calls = []
    monkeypatch.setattr(slicer_mod, "find_slicer", lambda: "/fake/prusa-slicer")
    monkeypatch.setattr(
        slicer_mod,
        "_run_slice",
        lambda b, m, *, digest, **kw: (calls.append(kw), slicer_mod.SliceResult(
            weight_g=1.0, time_minutes=1.0, layer_count=1, filament_used_mm=1.0,
            engine="PrusaSlicer", engine_version="2.9.6", gcode_path=None,
        ))[1],
    )
    data = cube_stl()
    slicer_mod.slice_mesh(data, filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.2)
    slicer_mod.slice_mesh(data, filament_density_g_per_cm3=1.24, infill_pct=25, layer_height_mm=0.2)
    slicer_mod.slice_mesh(data, filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.12)
    assert len(calls) == 3


def test_a_different_mesh_misses_the_cache(monkeypatch):
    calls = []
    monkeypatch.setattr(slicer_mod, "find_slicer", lambda: "/fake/prusa-slicer")
    monkeypatch.setattr(
        slicer_mod,
        "_run_slice",
        lambda b, m, *, digest, **kw: (calls.append(digest), None)[1],
    )
    kw = dict(filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.2)
    slicer_mod.slice_mesh(cube_stl(40), **kw)
    slicer_mod.slice_mesh(cube_stl(50), **kw)
    assert len(set(calls)) == 2


def test_a_failing_mesh_is_not_retried_on_every_keystroke(monkeypatch):
    """A mesh PrusaSlicer chokes on will choke again. Retrying it once per
    debounce is how one bad upload pins a CPU."""
    calls = []
    monkeypatch.setattr(slicer_mod, "find_slicer", lambda: "/fake/prusa-slicer")
    monkeypatch.setattr(
        slicer_mod,
        "_run_slice",
        lambda b, m, *, digest, **kw: (calls.append(digest), None)[1],
    )
    kw = dict(filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.2)
    data = cube_stl()
    assert slicer_mod.slice_mesh(data, **kw) is None
    assert slicer_mod.slice_mesh(data, **kw) is None
    assert len(calls) == 1


def test_cache_evicts_oldest_beyond_the_cap(monkeypatch):
    monkeypatch.setattr(slicer_mod, "find_slicer", lambda: "/fake/prusa-slicer")
    monkeypatch.setattr(slicer_mod, "_run_slice", lambda b, m, *, digest, **kw: None)
    kw = dict(filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.2)
    for i in range(slicer_mod._CACHE_MAX_ENTRIES + 20):
        slicer_mod.slice_mesh(cube_stl(10 + i * 0.1), **kw)
    assert slicer_mod.cache_stats()["entries"] == slicer_mod._CACHE_MAX_ENTRIES


def test_no_slicer_means_no_cache_entry(monkeypatch):
    monkeypatch.setattr(slicer_mod, "find_slicer", lambda: None)
    slicer_mod.slice_mesh(
        cube_stl(), filament_density_g_per_cm3=1.24, infill_pct=15, layer_height_mm=0.2
    )
    # Nothing was attempted, so nothing should be remembered — otherwise a
    # container that starts before the binary is ready caches "no" forever.
    assert slicer_mod.cache_stats()["entries"] == 0


# ── The endpoint never blocks on a bad slice ──────────────────────────

def test_quote_falls_back_to_the_estimate_when_slicing_fails(client, monkeypatch):
    from app import main as main_mod

    monkeypatch.setattr(main_mod, "slice_mesh", lambda *a, **kw: None)
    res = client.post(
        "/quote",
        files={"file": ("cube.stl", cube_stl(), "application/octet-stream")},
        data={
            "material": "PLA", "quality": "standard", "infill": "15",
            "quantity": "1", "delivery": "pickup",
        },
    )
    assert res.status_code == 200
    q = res.json()["quote"]
    assert q["engine"] == "volume-estimate"  # the badge stays "client estimate"
    assert q["weight_g"] == pytest.approx(22.48, abs=0.2)
    assert q["total"] > 0  # checkout is still possible


def test_quote_uses_the_slicer_when_it_succeeds(client, monkeypatch):
    from app import main as main_mod

    monkeypatch.setattr(
        main_mod,
        "slice_mesh",
        lambda *a, **kw: slicer_mod.SliceResult(
            weight_g=22.84, time_minutes=66.58, layer_count=200,
            filament_used_mm=7658.97, engine="PrusaSlicer",
            engine_version="2.9.6", gcode_path=None,
        ),
    )
    res = client.post(
        "/quote",
        files={"file": ("cube.stl", cube_stl(), "application/octet-stream")},
        data={
            "material": "PLA", "quality": "standard", "infill": "15",
            "quantity": "2", "delivery": "pickup",
        },
    )
    assert res.status_code == 200
    q = res.json()["quote"]
    assert q["engine"].startswith("PrusaSlicer")
    assert q["weight_g"] == pytest.approx(45.68, abs=0.01)  # per-unit × qty
    assert q["time_minutes"] == pytest.approx(133.16, abs=0.1)
