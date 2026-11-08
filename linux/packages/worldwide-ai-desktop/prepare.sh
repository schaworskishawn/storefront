#!/usr/bin/env bash
# Adds the start-up screen's images, which are drawn or copied at build time rather than kept as binary files here: the
# spinner frames, and the brand mark from the website's own icon as the watermark.
#
#   prepare.sh <package tree> <version>
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
tree="${1:?Give the package tree.}"

theme="$tree/usr/share/plymouth/themes/worldwide-ai"
mkdir -p "$theme"
python3 "$here/make-splash.py" "$theme"
install -m 0644 "$repo/public/worldwide-ai/icon-192.png" "$theme/watermark.png"
find "$theme" -type f -exec chmod 0644 {} +
chmod 0755 "$theme"
