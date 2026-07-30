"""qr-stand: URL handling, geometry, and the decode gate.

The point of this template is that the printed object scans. A QR stand that
looks right and doesn't decode fails in front of a customer, so the decode
round-trip is treated as a correctness test, not a smoke test.
"""

import json
import os

import numpy as np
import pytest

from app.design import common, pipeline, qr as qr_mod
from app.design.templates import qr_stand

REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
SPEC = json.load(
    open(os.path.join(REPO_ROOT, "design", "templates", "qr-stand.json"))
)

BASE = {"url": "https://example.com", "faceMm": 80, "text": "", "font": "sans-bold"}

# Five URLs spanning the realistic range: bare domain through a long path
# with query parameters. Each pushes the code into a different QR version.
URLS = [
    "https://a.co",
    "https://example.com",
    "https://fabricate.helixdreams.co",
    "https://fabricate.helixdreams.co/m/acme",
    "https://fabricate.helixdreams.co/m/acme?t=1",
]


def build(**overrides):
    return qr_stand.build({**BASE, **overrides}, SPEC, REPO_ROOT)


# ---------------------------------------------------------------------------
# URL normalisation
# ---------------------------------------------------------------------------

def test_bare_domain_is_upgraded_to_https():
    assert qr_mod.normalise_url("example.com") == "https://example.com"
    assert qr_mod.normalise_url("  example.com/menu  ") == "https://example.com/menu"


def test_https_url_passes_through_unchanged():
    for url in URLS:
        assert qr_mod.normalise_url(url) == url


def test_plain_http_is_rejected_with_a_reason():
    with pytest.raises(common.InvalidParams) as exc:
        qr_mod.normalise_url("http://example.com")
    assert "url_not_https" in str(exc.value)


@pytest.mark.parametrize(
    "bad",
    ["ftp://example.com", "javascript:alert(1)", "mailto:a@b.co", "", "   ",
     "notadomain", "has space.com"],
)
def test_non_web_and_malformed_addresses_are_rejected(bad):
    with pytest.raises(common.InvalidParams):
        qr_mod.normalise_url(bad)


def test_overlong_url_is_rejected_before_we_try_to_encode_it():
    long_url = "https://example.com/" + "x" * 400
    with pytest.raises(common.InvalidParams) as exc:
        qr_mod.normalise_url(long_url)
    assert "url_too_long" in str(exc.value)


# ---------------------------------------------------------------------------
# Generation + decode round-trip
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("url", URLS)
def test_generate_geometry_decode_round_trip(url):
    """The brief's core requirement, end to end for five URLs.

    Builds the real geometry, then decodes the same matrix that drove it and
    checks it comes back as the URL we started from.
    """
    matrix, module_mm, version = qr_mod.plan(url, 80)
    assert module_mm >= qr_mod.MIN_MODULE_MM
    assert qr_mod.assert_decodes(matrix, url) == url

    # Asserted on the PIPELINE output, because that is what ships. Unioning
    # a few hundred module solids leaves a few non-manifold edges on some
    # matrices; the repair stage exists to resolve exactly that, and the
    # builder heals what it can before handing over.
    mesh, _metrics, badge = pipeline.process(build(url=url), kind="preset")
    assert mesh.is_watertight
    assert len(mesh.split(only_watertight=False)) == 1
    assert badge in ("ready", "needs_supports")


@pytest.mark.parametrize("url", URLS)
def test_every_face_size_either_decodes_or_refuses_honestly(url):
    """No middle ground: a face either produces a scannable code or says no.

    A long URL genuinely won't fit on a 60 mm face at a printable module
    size, so QrTooDense is the correct outcome there — what must never happen
    is geometry that builds but doesn't scan.
    """
    for face in (60, 80, 100):
        try:
            matrix, module_mm, _ = qr_mod.plan(url, face)
        except qr_mod.QrTooDense as exc:
            assert "qr_too_dense" in str(exc)
            continue
        assert module_mm >= qr_mod.MIN_MODULE_MM
        assert qr_mod.assert_decodes(matrix, url) == url


def test_decode_gate_actually_fails_on_a_corrupted_matrix():
    """Proves the gate has teeth.

    If assert_decodes passed everything, every other decode test would be
    vacuous — so corrupt the matrix past what error correction can recover
    and check it is rejected.
    """
    matrix, _version = qr_mod.build_matrix("https://example.com")
    corrupted = matrix.copy()
    # Level M recovers ~15%; flipping the whole data region is far past that,
    # and wrecks the finder patterns too.
    corrupted[6:, 6:] = ~corrupted[6:, 6:]
    with pytest.raises(common.InvalidParams) as exc:
        qr_mod.assert_decodes(corrupted, "https://example.com")
    assert "qr_undecodable" in str(exc.value)


def test_error_correction_is_level_m():
    # Level M is what the brief specifies: ~15% damage tolerance without the
    # module-count inflation of Q or H.
    from qrcode.constants import ERROR_CORRECT_M
    import qrcode

    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=1, border=4)
    qr.add_data("https://example.com")
    qr.make(fit=True)
    expected = np.array(qr.get_matrix(), dtype=bool)
    actual, _ = qr_mod.build_matrix("https://example.com")
    assert np.array_equal(actual, expected)


# ---------------------------------------------------------------------------
# Module size / density
# ---------------------------------------------------------------------------

def test_quiet_zone_is_present_on_all_four_sides():
    matrix, _ = qr_mod.build_matrix("https://example.com")
    z = qr_mod.QUIET_ZONE_MODULES
    assert not matrix[:z, :].any(), "top quiet zone is not clear"
    assert not matrix[-z:, :].any(), "bottom quiet zone is not clear"
    assert not matrix[:, :z].any(), "left quiet zone is not clear"
    assert not matrix[:, -z:].any(), "right quiet zone is not clear"


def test_a_url_too_dense_for_the_face_gives_a_friendly_error():
    # Long enough to need a bigger QR version than a 60 mm face can hold at
    # a printable module size.
    dense = "https://fabricate.helixdreams.co/menu/spring-2026?table=12"
    with pytest.raises(qr_mod.QrTooDense) as exc:
        qr_mod.plan(dense, 60)
    msg = str(exc.value)
    assert "qr_too_dense" in msg
    # It must say what to do, and name a face size that would actually work.
    assert "shorten" in msg.lower()
    assert "at least" in msg.lower()

    # And that suggested size must genuinely resolve it.
    matrix, _ = qr_mod.build_matrix(dense)
    needed = matrix.shape[0] * qr_mod.MIN_MODULE_MM
    ok_matrix, module_mm, _ = qr_mod.plan(dense, needed)
    assert module_mm >= qr_mod.MIN_MODULE_MM
    assert qr_mod.assert_decodes(ok_matrix, dense) == dense


def test_module_size_never_drops_below_the_printable_floor():
    """plan() has exactly two outcomes, and neither is an unprintable code."""
    for url in URLS:
        for face in (60, 80, 100):
            try:
                _, module_mm, _ = qr_mod.plan(url, face)
            except qr_mod.QrTooDense:
                continue  # refused rather than returning something unprintable
            assert module_mm >= qr_mod.MIN_MODULE_MM


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("face", [60, 80, 100])
def test_stand_builds_as_one_printable_solid(face):
    mesh = build(faceMm=face)
    assert mesh.is_watertight
    assert len(mesh.split(only_watertight=False)) == 1
    _, _, badge = pipeline.process(mesh, kind="preset")
    assert badge in ("ready", "needs_supports")


@pytest.mark.parametrize("face", [60, 80, 100])
@pytest.mark.parametrize("caption", ["", "SCAN TO ORDER"])
def test_the_stand_does_not_topple(face, caption):
    """Centre of mass must sit over the base footprint.

    A leaning panel on a shallow base is exactly the shape that tips over on
    a counter, so this is checked rather than assumed.
    """
    mesh = build(faceMm=face, text=caption)
    com = mesh.center_mass
    zmin = mesh.bounds[0][2]
    section = mesh.section(plane_origin=[0, 0, zmin + 0.4], plane_normal=[0, 0, 1])
    assert section is not None
    ys = np.asarray(section.vertices)[:, 1]
    assert ys.min() < com[1] < ys.max(), (
        f"centre of mass y={com[1]:.2f} outside base [{ys.min():.2f}, {ys.max():.2f}]"
    )


def test_caption_is_optional_and_adds_height_when_present():
    without = build(text="")
    with_caption = build(text="SCAN TO ORDER")
    assert with_caption.extents[2] > without.extents[2]


def test_face_is_angled_not_flat():
    # A flat plate would be a coaster, not a stand: the code has to face the
    # customer. Check the panel actually rises.
    mesh = build()
    assert mesh.extents[2] > mesh.extents[1], "stand should be taller than it is deep"


def test_build_rejects_a_bad_url_before_producing_geometry():
    with pytest.raises(common.InvalidParams):
        build(url="http://example.com")


def test_build_is_deterministic():
    a = build(text="SCAN")
    b = build(text="SCAN")
    assert np.allclose(a.vertices, b.vertices)
    assert np.array_equal(a.faces, b.faces)
