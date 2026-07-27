"""3D-design generation package (vendored Fabricate worker geometry code).

Asset layout (relative to repo_root()):
    design/templates/*.json    template specs
    public/fonts/*.ttf         fonts
    public/design-icons/*.svg  polygon-only icon SVGs
"""

import os
from pathlib import Path


def repo_root():
    """Repo root for shared design assets.

    Override with DESIGN_REPO_ROOT; defaults to the repository root
    (three levels above this package: api/app/design -> repo).
    """
    env = os.environ.get("DESIGN_REPO_ROOT")
    if env:
        return str(Path(env))
    return str(Path(__file__).resolve().parents[3])
