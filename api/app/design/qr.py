"""QR generation, sizing and — critically — decode validation.

A QR object that doesn't scan is worse than no object: it looks finished, it
prints, it gets handed to a customer, and it fails in front of them. So the
pipeline treats "does this actually decode?" as a hard validation step, not a
nice-to-have.

The check decodes a raster of the SAME module matrix that drives the
geometry. Decoding the string we started from would be circular; decoding the
matrix proves the data we are about to turn into raised boxes is readable.
"""

import re

import numpy as np
import qrcode
import zxingcpp
from qrcode.constants import ERROR_CORRECT_M

from . import common

# Below this, FDM can't hold a module's edges and the code smears.
MIN_MODULE_MM = 1.6
# Standard quiet zone. Anything less and readers struggle to find the finder
# patterns against a busy background.
QUIET_ZONE_MODULES = 4
MAX_URL_LENGTH = 300


class QrTooDense(common.InvalidParams):
    """The URL needs more modules than will fit at a printable module size."""


def normalise_url(raw):
    """Validate and normalise a URL. https only.

    Returns the normalised URL. Raises InvalidParams with a message aimed at
    the person typing it.
    """
    if not isinstance(raw, str):
        raise common.InvalidParams("invalid_params: url must be text")
    url = raw.strip()
    if not url:
        raise common.InvalidParams("invalid_params: url_empty: add the web address you want the code to open.")
    if len(url) > MAX_URL_LENGTH:
        raise common.InvalidParams(
            "invalid_params: url_too_long: that address is %d characters. "
            "Use a short link (under %d) so the code stays chunky enough to print."
            % (len(url), MAX_URL_LENGTH)
        )
    # Accept a bare domain and upgrade it; reject any other scheme outright.
    if url.startswith("http://"):
        raise common.InvalidParams(
            "invalid_params: url_not_https: use an https:// address — "
            "phones increasingly refuse plain http links."
        )
    if not url.startswith("https://"):
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
            raise common.InvalidParams(
                "invalid_params: url_not_https: only https:// web addresses are supported."
            )
        url = "https://" + url
    # Host must look like a hostname; this is a printed object, so a typo here
    # is expensive to discover.
    host = url[len("https://"):].split("/")[0].split("?")[0]
    if not host or "." not in host or " " in host:
        raise common.InvalidParams(
            "invalid_params: url_invalid: that doesn't look like a web address."
        )
    if not re.fullmatch(r"[A-Za-z0-9.\-:\[\]]+", host):
        raise common.InvalidParams(
            "invalid_params: url_invalid: that doesn't look like a web address."
        )
    return url


def build_matrix(url):
    """QR module matrix (bool, True = dark) at error correction level M.

    Level M is the brief's choice and the right one for a printed object: it
    tolerates ~15% damage, which covers a scuffed or partially shadowed face
    without inflating the module count the way Q or H would.
    """
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=1, border=QUIET_ZONE_MODULES)
    qr.add_data(url)
    qr.make(fit=True)
    return np.array(qr.get_matrix(), dtype=bool), qr.version


def module_size_mm(matrix, face_mm):
    """Module pitch when the matrix (including quiet zone) spans face_mm."""
    return face_mm / float(matrix.shape[0])


def plan(url, face_mm):
    """Work out whether this URL fits on this face at a printable module size.

    Returns (matrix, module_mm, version). Raises QrTooDense with the smallest
    face that WOULD work, so the caller can offer it rather than just refusing.
    """
    matrix, version = build_matrix(url)
    module_mm = module_size_mm(matrix, face_mm)
    if module_mm < MIN_MODULE_MM:
        needed = matrix.shape[0] * MIN_MODULE_MM
        raise QrTooDense(
            "invalid_params: qr_too_dense: this address needs %d modules, which "
            "works out at %.2f mm each on a %.0f mm face — under the %.1f mm a "
            "printer can hold. Use a face of at least %.0f mm, or shorten the "
            "URL with a link shortener."
            % (matrix.shape[0], module_mm, face_mm, MIN_MODULE_MM, needed)
        )
    return matrix, module_mm, version


def rasterise(matrix, scale=8):
    """Greyscale image of the matrix: dark modules black, quiet zone white.

    `scale` pixels per module. This mirrors how the printed face reads — the
    raised modules cast shadow and scan dark — which is what makes decoding
    this image a meaningful proxy for scanning the object.
    """
    return (np.kron(~matrix, np.ones((scale, scale), dtype=bool)).astype(np.uint8)) * 255


def assert_decodes(matrix, expected_url):
    """Hard gate: the geometry's own module matrix must decode to the URL.

    Raises InvalidParams when it doesn't. A QR object only has one job.
    """
    image = rasterise(matrix)
    try:
        result = zxingcpp.read_barcode(image)
    except Exception as exc:                                  # pragma: no cover
        raise common.InvalidParams(
            "invalid_params: qr_undecodable: we couldn't verify this code scans (%s)."
            % exc
        )
    decoded = result.text if result else None
    if decoded != expected_url:
        raise common.InvalidParams(
            "invalid_params: qr_undecodable: the generated code didn't scan back "
            "as your address (got %r). We won't ship a code that doesn't work."
            % (decoded,)
        )
    return decoded
