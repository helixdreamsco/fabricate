"""PrusaSlicer CLI integration.

Attempts to invoke `prusa-slicer` (or the macOS app bundle) to produce G-code
for a given mesh. If the binary isn't available, the caller should degrade to
a Trimesh-volume-based estimate.

Design note (from the project spec): server-side G-code generation is
*mandatory* so that the client never has the chance to send unsafe G-code to
the printer. All slicing happens here.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("fabricate.slicer")

# A slice takes seconds and /configure re-quotes on every knob turn, so the
# same mesh gets sent over and over. Key on the mesh bytes plus the settings
# that actually change the G-code — quantity, delivery and colour don't, so
# changing those never costs a slice.
#
# Process-local and bounded. Cloud Run runs a handful of instances behind a
# load balancer, so this is a hit-rate optimisation rather than a guarantee;
# a cross-instance cache would mean putting slice results in the database,
# which isn't worth it while a miss just costs one slice.
_CACHE_MAX_ENTRIES = 256
_cache: OrderedDict[str, "SliceResult | None"] = OrderedDict()
_cache_lock = threading.Lock()

# PrusaSlicer on a big or awkward mesh can genuinely take a minute. The
# creator sees the tier-1 estimate the whole time, so a long ceiling costs
# them nothing and rescues slices that a short one would have thrown away.
SLICE_TIMEOUT_S = 120


def mesh_digest(mesh_bytes: bytes) -> str:
    """Content hash of the uploaded mesh — cache key and log correlator."""
    return hashlib.sha256(mesh_bytes).hexdigest()


def _cache_key(digest: str, *parts: object) -> str:
    return digest + "|" + "|".join(str(p) for p in parts)


def _cache_get(key: str) -> tuple[bool, "SliceResult | None"]:
    """(hit, value). Failures are cached too — a mesh PrusaSlicer chokes on
    will choke again, and retrying it on every keystroke is how you turn one
    bad upload into a pinned CPU."""
    with _cache_lock:
        if key not in _cache:
            return False, None
        _cache.move_to_end(key)
        return True, _cache[key]


def _cache_put(key: str, value: "SliceResult | None") -> None:
    with _cache_lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def cache_stats() -> dict:
    with _cache_lock:
        return {"entries": len(_cache), "max": _CACHE_MAX_ENTRIES}


CANDIDATE_BINS = [
    "prusa-slicer",
    "PrusaSlicer",
    "/Applications/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
    "/Applications/Original Prusa Drivers/PrusaSlicer.app/Contents/MacOS/PrusaSlicer",
    "/opt/homebrew/bin/prusa-slicer",
    "/usr/local/bin/prusa-slicer",
]


@dataclass
class SliceResult:
    weight_g: float
    time_minutes: float
    layer_count: int
    filament_used_mm: float
    engine: str
    engine_version: str | None
    gcode_path: str | None


def find_slicer() -> str | None:
    for cand in CANDIDATE_BINS:
        if os.path.sep in cand and Path(cand).is_file() and os.access(cand, os.X_OK):
            return cand
        resolved = shutil.which(cand)
        if resolved:
            return resolved
    return None


def slicer_version(bin_path: str) -> str | None:
    try:
        out = subprocess.run(
            [bin_path, "--help"],
            capture_output=True,
            text=True,
            timeout=6,
        )
        blob = (out.stdout or "") + (out.stderr or "")
        m = re.search(r"PrusaSlicer-(\S+)", blob) or re.search(
            r"version\s+(\S+)", blob, re.IGNORECASE
        )
        return m.group(1) if m else None
    except Exception:
        return None


_TIME_RE = re.compile(
    r"estimated printing time \(normal mode\)\s*=\s*"
    r"(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?",
    re.IGNORECASE,
)
_WEIGHT_RE = re.compile(r"filament used \[g\]\s*=\s*([\d.]+)", re.IGNORECASE)
_LENGTH_RE = re.compile(r"filament used \[mm\]\s*=\s*([\d.]+)", re.IGNORECASE)
_LAYERS_RE = re.compile(r"\n\s*;\s*layer\s+num/total_layer_count:\s*\d+/(\d+)", re.IGNORECASE)


def parse_gcode_tail(gcode: str) -> dict:
    """Extract weight, time, layer-count from PrusaSlicer G-code tail comments."""
    result: dict = {}

    if (m := _WEIGHT_RE.search(gcode)):
        result["weight_g"] = float(m.group(1))
    if (m := _LENGTH_RE.search(gcode)):
        result["length_mm"] = float(m.group(1))
    if (m := _TIME_RE.search(gcode)):
        d, h, mn, s = (int(g) if g else 0 for g in m.groups())
        result["time_minutes"] = d * 1440 + h * 60 + mn + s / 60
    if (m := _LAYERS_RE.search(gcode)):
        result["layer_count"] = int(m.group(1))

    return result


def slice_mesh(
    mesh_bytes: bytes,
    *,
    filament_density_g_per_cm3: float,
    infill_pct: int,
    layer_height_mm: float,
    nozzle_mm: float = 0.4,
    print_speed_mm_s: int = 120,
) -> SliceResult | None:
    """Return SliceResult from PrusaSlicer CLI, or None if unavailable / failed.

    Never raises: every failure path returns None so the caller can fall back
    to the geometric estimate. A bad mesh must not block a quote.
    """
    bin_path = find_slicer()
    if not bin_path:
        return None

    digest = mesh_digest(mesh_bytes)
    key = _cache_key(
        digest,
        filament_density_g_per_cm3,
        infill_pct,
        layer_height_mm,
        nozzle_mm,
        print_speed_mm_s,
    )
    hit, cached = _cache_get(key)
    if hit:
        log.info("slice: cache hit %s", digest[:12])
        return cached

    result = _run_slice(
        bin_path,
        mesh_bytes,
        digest=digest,
        filament_density_g_per_cm3=filament_density_g_per_cm3,
        infill_pct=infill_pct,
        layer_height_mm=layer_height_mm,
        nozzle_mm=nozzle_mm,
        print_speed_mm_s=print_speed_mm_s,
    )
    _cache_put(key, result)
    return result


def _run_slice(
    bin_path: str,
    mesh_bytes: bytes,
    *,
    digest: str,
    filament_density_g_per_cm3: float,
    infill_pct: int,
    layer_height_mm: float,
    nozzle_mm: float,
    print_speed_mm_s: int,
) -> SliceResult | None:
    with tempfile.TemporaryDirectory() as td:
        stl_path = Path(td) / "part.stl"
        stl_path.write_bytes(mesh_bytes)
        out_path = Path(td) / "out.gcode"

        cmd = [
            bin_path,
            "--export-gcode",
            "--output",
            str(out_path),
            "--layer-height",
            f"{layer_height_mm}",
            "--fill-density",
            f"{infill_pct}%",
            "--nozzle-diameter",
            f"{nozzle_mm}",
            "--filament-density",
            f"{filament_density_g_per_cm3}",
            "--perimeter-speed",
            str(int(print_speed_mm_s * 0.7)),
            "--infill-speed",
            str(print_speed_mm_s),
            str(stl_path),
        ]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=SLICE_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            log.warning("slice: timeout after %ds — mesh %s", SLICE_TIMEOUT_S, digest)
            return None
        except OSError as exc:
            log.warning("slice: could not run slicer — mesh %s: %s", digest, exc)
            return None

        if proc.returncode != 0 or not out_path.exists():
            # Non-manifold geometry, self-intersections, a part larger than
            # the bed. The creator keeps the tier-1 estimate; the hash is
            # here so a recurring bad mesh is findable in the logs.
            stderr = (proc.stderr or "").strip().splitlines()
            log.warning(
                "slice: failed rc=%s — mesh %s: %s",
                proc.returncode,
                digest,
                stderr[-1] if stderr else "no stderr",
            )
            return None

        gcode = out_path.read_text(errors="replace")
        parsed = parse_gcode_tail(gcode)

        if "weight_g" not in parsed or "time_minutes" not in parsed:
            log.warning("slice: G-code had no weight/time totals — mesh %s", digest)
            return None

        return SliceResult(
            weight_g=float(parsed["weight_g"]),
            time_minutes=float(parsed["time_minutes"]),
            layer_count=int(parsed.get("layer_count", 0)),
            filament_used_mm=float(parsed.get("length_mm", 0.0)),
            engine="PrusaSlicer",
            engine_version=slicer_version(bin_path),
            gcode_path=None,
        )
