"""Tests for the /design endpoints and /health extension."""

import base64
import hashlib
import json
import os
import struct

PRUSA_BIN = "/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer"

# keychain-text defaults from design/templates/keychain-text.json
KEYCHAIN_DEFAULTS = {
    "text": "ALEX",
    "font": "sans-bold",
    "mode": "emboss",
    "lengthMm": 60,
    "thicknessMm": 4,
}

VALID_BADGES = ("ready", "needs_supports", "too_fragile")


def _decode_stl(b64):
    stl = base64.b64decode(b64)
    assert len(stl) > 84, "binary STL must exceed the 84-byte header"
    (tri_count,) = struct.unpack("<I", stl[80:84])
    assert len(stl) == 84 + 50 * tri_count, "binary STL length mismatch"
    return stl, tri_count


def _assert_metrics(metrics):
    assert isinstance(metrics["printTimeS"], int) and metrics["printTimeS"] > 0
    assert metrics["filamentG"] > 0
    assert len(metrics["bboxMm"]) == 3 and all(v > 0 for v in metrics["bboxMm"])
    assert metrics["triangles"] > 0
    assert metrics["thinAreas"] >= 0
    assert isinstance(metrics["sliced"], bool)
    assert isinstance(metrics["supportsNeeded"], bool)


def _generate(client, params=KEYCHAIN_DEFAULTS, template_id="keychain-text", version=1):
    return client.post(
        "/design/generate",
        json={"template_id": template_id, "template_version": version, "params": params},
    )


def test_generate_keychain_defaults_and_determinism(client):
    r1 = _generate(client)
    assert r1.status_code == 200, r1.text
    body = r1.json()
    assert body["badge"] in VALID_BADGES
    _assert_metrics(body["metrics"])
    stl, tri_count = _decode_stl(body["stl_b64"])
    assert tri_count > 10
    assert len(base64.b64decode(body["glb_b64"])) > 0

    # Determinism: identical params -> byte-identical STL.
    r2 = _generate(client)
    assert r2.status_code == 200, r2.text
    stl2, _ = _decode_stl(r2.json()["stl_b64"])
    sha1 = hashlib.sha256(stl).hexdigest()
    sha2 = hashlib.sha256(stl2).hexdigest()
    assert sha1 == sha2
    print("\nkeychain-text default STL sha256:", sha1)


def test_generate_bad_params_422(client):
    bad = dict(KEYCHAIN_DEFAULTS, text="ALEX☃<>")  # disallowed characters
    r = _generate(client, params=bad)
    assert r.status_code == 422
    assert "disallowed" in json.dumps(r.json())


def test_generate_wrong_version_409(client):
    r = _generate(client, version=999)
    assert r.status_code == 409


def test_generate_unknown_template_404(client):
    r = _generate(client, template_id="no-such-template")
    assert r.status_code == 404


def test_repair_ai_fixture(client, fixture_dir):
    fixture = os.path.join(fixture_dir, "ai_generated_fixture.glb")
    assert os.path.isfile(fixture)
    with open(fixture, "rb") as fh:
        r = client.post(
            "/design/repair",
            files={"file": ("ai_generated_fixture.glb", fh, "model/gltf-binary")},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["badge"] in VALID_BADGES
    _assert_metrics(body["metrics"])
    # Floating debris (<2 % volume) dropped: bbox is the blob, not the island.
    assert max(body["metrics"]["bboxMm"]) < 60
    _decode_stl(body["stl_b64"])
    if os.path.isfile(PRUSA_BIN):
        assert body["metrics"]["sliced"] is True


def test_repair_unloadable_422(client):
    r = client.post(
        "/design/repair",
        files={"file": ("garbage.stl", b"not a mesh at all", "model/stl")},
    )
    assert r.status_code == 422


def test_health_includes_design(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["design"]["ok"] is True
    assert body["design"]["templates"] == 6
