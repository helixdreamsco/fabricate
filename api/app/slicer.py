"""PrusaSlicer CLI integration.

Attempts to invoke `prusa-slicer` (or the macOS app bundle) to produce G-code
for a given mesh. If the binary isn't available, the caller should degrade to
a Trimesh-volume-based estimate.

Design note (from the project spec): server-side G-code generation is
*mandatory* so that the client never has the chance to send unsafe G-code to
the printer. All slicing happens here.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


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
    """Return SliceResult from PrusaSlicer CLI, or None if unavailable / failed."""
    bin_path = find_slicer()
    if not bin_path:
        return None

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
                timeout=45,
            )
        except subprocess.TimeoutExpired:
            return None

        if proc.returncode != 0 or not out_path.exists():
            return None

        gcode = out_path.read_text(errors="replace")
        parsed = parse_gcode_tail(gcode)

        if "weight_g" not in parsed or "time_minutes" not in parsed:
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
