"""Tests for the /design endpoints and /health extension."""

import base64
import hashlib
import json
import os
import struct
import threading
import time

from app.design import routes

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


def _component_count(stl):
    """Connected bodies in a binary STL, joined through shared vertices."""
    (tri_count,) = struct.unpack("<I", stl[80:84])
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(tri_count):
        # 50-byte record: 12B normal, 3 x 12B vertex, 2B attribute count.
        base = 84 + 50 * i + 12
        verts = [struct.unpack_from("<3f", stl, base + 12 * v) for v in range(3)]
        for v in verts:
            parent.setdefault(v, v)
        union(verts[0], verts[1])
        union(verts[0], verts[2])
    return len({find(v) for v in parent})


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
    # The fixture is three bodies — 91.5 %, 8.5 % and 0.01 % of total volume.
    # Only the last is under the 2 % island threshold, so exactly it is
    # dropped and two bodies survive. (The bbox can no longer show this: AI
    # meshes are scaled to a fixed longest edge, which normalises it away.)
    stl, _ = _decode_stl(body["stl_b64"])
    assert _component_count(stl) == 2
    if os.path.isfile(PRUSA_BIN):
        assert body["metrics"]["sliced"] is True


def test_repair_unloadable_422(client):
    r = client.post(
        "/design/repair",
        files={"file": ("garbage.stl", b"not a mesh at all", "model/stl")},
    )
    assert r.status_code == 422


def test_health_includes_design(client, fixture_dir):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["design"]["ok"] is True

    # Every spec JSON on disk must have a registered builder. Counted from the
    # specs rather than hardcoded, so adding a template doesn't break this —
    # but shipping a spec whose builder was never wired up still does.
    templates_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "design", "templates",
    )
    on_disk = len([f for f in os.listdir(templates_dir) if f.endswith(".json")])
    assert body["design"]["templates"] == on_disk


def test_pipeline_runs_are_serialised(client, monkeypatch):
    """Concurrent requests must not run the geometry stack side by side.

    A dense AI mesh peaks around 2 GB across trimesh, the PrusaSlicer child
    and the G-code it writes to /tmp (a tmpfs on Cloud Run, so it counts
    against the same limit). Two at once exceeded the 4 GiB container and got
    the service OOM-killed, which surfaced as a 503 from /design/repair.
    """
    spans = []
    lock = threading.Lock()
    real_process = routes.pipeline.process

    def traced(*args, **kwargs):
        start = time.time()
        try:
            return real_process(*args, **kwargs)
        finally:
            # widen the window so an unguarded overlap is actually observable
            time.sleep(0.2)
            with lock:
                spans.append((start, time.time()))

    monkeypatch.setattr(routes.pipeline, "process", traced)

    codes = {}

    def fire(n):
        codes[n] = _generate(client).status_code

    threads = [threading.Thread(target=fire, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert codes == {0: 200, 1: 200, 2: 200, 3: 200}
    assert len(spans) == 4
    spans.sort()
    for (_, prev_end), (next_start, _) in zip(spans, spans[1:]):
        assert next_start >= prev_end - 1e-6, "pipeline runs overlapped"
