"""Copy the app's built pages (dist/) into the TV app (assets/site) for BundledSite.kt.

The app's code, styles and fonts all go in, so the TV runs exactly the version it was built
from. Big media (animations, AI models, game files, large images) stays on the website and
loads from there when used: those files are named by their content, so an unchanged file keeps
its address. Usage: python3 bundle_site.py <dist> <assets/site>
"""

import os
import shutil
import sys

CODE = (".html", ".js", ".mjs", ".css", ".woff", ".woff2", ".json", ".webmanifest", ".txt")
MAX_MEDIA_BYTES = 1_000_000
ONLINE_ONLY = {"mp-wasm", "ort", "models"}


def keep(rel: str, size: int) -> bool:
    if rel.split("/", 1)[0] in ONLINE_ONLY:
        return False
    return rel.endswith(CODE) or size < MAX_MEDIA_BYTES


def main(src: str, dest: str) -> None:
    if not os.path.isfile(os.path.join(src, "index.html")):
        sys.exit(f"{src} has no index.html")
    shutil.rmtree(dest, ignore_errors=True)
    kept = skipped = 0
    for root, _, files in os.walk(src):
        for name in files:
            path = os.path.join(root, name)
            rel = os.path.relpath(path, src).replace(os.sep, "/")
            size = os.path.getsize(path)
            if not keep(rel, size):
                skipped += size
                continue
            out = os.path.join(dest, rel)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            shutil.copy2(path, out)
            kept += size
    print(f"TV pages: {kept / 1e6:.1f} MB in the APK, {skipped / 1e6:.1f} MB left on the website")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
