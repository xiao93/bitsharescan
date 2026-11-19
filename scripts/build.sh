#!/usr/bin/env bash
# Rebuild dist/ from the de-minified patched source.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 src/patches/apply.py

mkdir -p dist/assets dist/data
cp -a public/favicon.ico public/favicon.svg public/apple-touch-icon.png dist/
cp -a data/p2p-nodes.json data/p2p-nodes-testnet.json dist/data/

npx esbuild src/app.patched.js \
  --minify \
  --format=esm \
  --target=es2020 \
  --legal-comments=none \
  --log-level=warning \
  --outfile=dist/assets/_index.js

cat src/style.css src/patches/extra.css > dist/assets/_index.css

JS_HASH="$(sha256sum dist/assets/_index.js | cut -c1-8)"
CSS_HASH="$(sha256sum dist/assets/_index.css | cut -c1-8)"
JS_NAME="index-${JS_HASH}.js"
CSS_NAME="index-${CSS_HASH}.css"

rm -f dist/assets/index-*.js dist/assets/index-*.css
mv dist/assets/_index.js "dist/assets/${JS_NAME}"
mv dist/assets/_index.css "dist/assets/${CSS_NAME}"

python3 - "$ROOT" "$JS_NAME" "$CSS_NAME" <<'PY'
import sys
from pathlib import Path
root, js, css = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
html = (root / "src" / "index.html").read_text()
html = html.replace("__JS__", js).replace("__CSS__", css)
if "__JS__" in html or "__CSS__" in html:
    sys.exit("template placeholders were not replaced")
(root / "dist" / "index.html").write_text(html)
print(f"wrote dist/index.html -> {js}, {css}")
PY

ls -la dist dist/assets dist/data
