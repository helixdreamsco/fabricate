"""PrusaSlicer CLI wrapper with an analytic fallback estimate.

If the slicer binary is missing -> sliced:false + analytic estimate (job may
still be ready; the quote is marked as estimated). If the slicer RUNS and
fails -> SliceError (job fails, never quotable).
"""

import os
import re
import subprocess
import tempfile
import warnings

warnings.filterwarnings("ignore")

# Binary discovery is shared with the host service (app/slicer.py) so both
# features resolve PrusaSlicer through one path.
from ..slicer import find_slicer

PROFILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profiles", "pla_0.2.ini")

PLA_DENSITY_G_CM3 = 1.24
INFILL_FACTOR = 1.15
SECONDS_PER_GRAM = 90.0
TIME_OVERHEAD_S = 120.0

_TIME_RE = re.compile(r";\s*estimated printing time.*=\s*(.+)")
_FILAMENT_G_RE = re.compile(r";\s*filament used \[g\]\s*=\s*([0-9.]+)")


class SliceError(Exception):
    """The slicer ran and failed: job must fail (slice_failed)."""


def parse_time_to_seconds(text):
    """Parse '1d 2h 3m 4s' style durations into seconds."""
    total = 0
    for value, unit in re.findall(r"(\d+)\s*([dhms])", text):
        total += int(value) * {"d": 86400, "h": 3600, "m": 60, "s": 1}[unit]
    return total


def analytic_estimate(volume_mm3):
    """Volume-based estimate used when the slicer binary is absent."""
    grams = (volume_mm3 / 1000.0) * PLA_DENSITY_G_CM3 * INFILL_FACTOR
    seconds = int(round(SECONDS_PER_GRAM * grams + TIME_OVERHEAD_S))
    return {"sliced": False, "printTimeS": seconds, "filamentG": round(grams, 2)}


def parse_gcode(gcode_path):
    print_time_s = None
    filament_g = None
    with open(gcode_path, "r", errors="replace") as fh:
        for line in fh:
            if not line.startswith(";"):
                continue
            m = _TIME_RE.match(line)
            if m and print_time_s is None:
                print_time_s = parse_time_to_seconds(m.group(1))
            m = _FILAMENT_G_RE.match(line)
            if m and filament_g is None:
                filament_g = float(m.group(1))
    return print_time_s, filament_g


def slice_stl(stl_path, volume_mm3, profile=PROFILE, timeout_s=300):
    """Slice an STL. Returns {'sliced', 'printTimeS', 'filamentG'}.

    Raises SliceError if the slicer runs and fails.
    """
    binary = find_slicer()
    if binary is None:
        return analytic_estimate(volume_mm3)

    with tempfile.TemporaryDirectory(prefix="fab-slice-") as tmp:
        gcode = os.path.join(tmp, "out.gcode")
        cmd = [binary, "--export-gcode", "--load", profile, "--output", gcode, stl_path]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout_s
            )
        except subprocess.TimeoutExpired:
            raise SliceError("slice_failed")
        if result.returncode != 0 or not os.path.isfile(gcode):
            raise SliceError("slice_failed")
        print_time_s, filament_g = parse_gcode(gcode)
        if print_time_s is None or filament_g is None:
            raise SliceError("slice_failed")
        return {
            "sliced": True,
            "printTimeS": int(print_time_s),
            "filamentG": round(float(filament_g), 2),
        }
