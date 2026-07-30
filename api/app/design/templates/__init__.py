"""Template registry.

Builder contract:
    build(params, spec, repo_root, assets=None) -> trimesh.Trimesh

`assets` maps asset id -> inline logo polygons for templates with an `asset`
parameter; templates without one ignore it.
"""

from . import bangle, coaster_set, keychain_text, logo_keyring, qr_stand

REGISTRY = {
    "keychain-text": keychain_text.build,
    "bangle": bangle.build,
    "logo-keyring": logo_keyring.build,
    "qr-stand": qr_stand.build,
    "coaster-set": coaster_set.build,
}
