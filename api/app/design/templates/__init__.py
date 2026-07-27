"""Template registry: {template_id: build(params, spec, repo_root) -> trimesh.Trimesh}."""

from . import badge_round, bangle, cake_topper, figure_modular, keychain_text, nameplate_desk

REGISTRY = {
    "keychain-text": keychain_text.build,
    "nameplate-desk": nameplate_desk.build,
    "badge-round": badge_round.build,
    "cake-topper": cake_topper.build,
    "figure-modular": figure_modular.build,
    "bangle": bangle.build,
}
