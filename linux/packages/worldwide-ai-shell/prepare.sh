#!/usr/bin/env bash
# Adds what the window's package needs that isn't source: the pinned Electron runtime, the window's own program, and the
# brand icon. Called by build-debs.sh after the package's own files are in place.
#
#   prepare.sh <package tree> <version>
#
# Needs WAI_DOWNLOADS: the directory holding electron-<version>/<file> as pinned in linux/shell/electron.env. The zip is
# refused unless its size and SHA-256 are the pinned ones.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
tree="${1:?Give the package tree.}"
version="${2:?Give the version.}"
# shellcheck source=../../shell/electron.env
. "$repo/linux/shell/electron.env"

zip="${WAI_DOWNLOADS:?Set WAI_DOWNLOADS to the directory of verified downloads.}/electron-$ELECTRON_VERSION/$ELECTRON_FILE"
[ -f "$zip" ] || { echo "Electron isn't at $zip." >&2; exit 1; }
size="$(wc -c <"$zip" | tr -d ' ')"
[ "$size" = "$ELECTRON_BYTES" ] || { echo "$zip is $size bytes, not $ELECTRON_BYTES." >&2; exit 1; }
sha="$(sha256sum "$zip" | cut -d' ' -f1)"
[ "$sha" = "$ELECTRON_SHA256" ] || { echo "$zip has SHA-256 $sha, not the pinned $ELECTRON_SHA256." >&2; exit 1; }

dest="$tree/opt/worldwide-ai/shell"
# Electron runs the program in its resources/app folder. A program named on the command line is loaded only by its
# demonstration app, which is removed below, so the window's program has to be in resources/app.
program="$dest/electron/resources/app"
mkdir -p "$dest/electron"
python3 - "$zip" "$dest/electron" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    for entry in archive.infolist():
        parts = entry.filename.split("/")
        if entry.filename.startswith("/") or ".." in parts:
            raise SystemExit(f"Refusing a path in the Electron zip: {entry.filename}")
    archive.extractall(sys.argv[2])
PY
# Electron's demonstration app is never wanted: the window always starts its own program.
rm -f "$dest/electron/resources/default_app.asar"
find "$dest/electron" -type d -exec chmod 0755 {} +
find "$dest/electron" -type f -exec chmod 0644 {} +
chmod 0755 "$dest/electron/electron" "$dest/electron/chrome_crashpad_handler" "$dest/electron/chrome-sandbox"

mkdir -p "$program"
for file in package.json main.js offline.html not-set-up.html; do
	tr -d '\r' <"$repo/linux/shell/app/$file" | sed -e "s/@VERSION@/$version/g" >"$program/$file"
	chmod 0644 "$program/$file"
done
chmod 0755 "$program"

# Electron looks for resources/app, then resources/app.asar, then the demonstration app, and exits with status 1 when
# none is there. Refuse a package whose window would do that.
main="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["main"])' "$program/package.json")"
[ -f "$program/$main" ] || { echo "The window's program has no $main in $program." >&2; exit 1; }
[ ! -e "$dest/electron/resources/app.asar" ] && [ ! -e "$dest/electron/resources/default_app.asar" ] || {
	echo "Electron would start another program than the window's." >&2
	exit 1
}

icon="$tree/usr/share/icons/hicolor/512x512/apps"
mkdir -p "$icon"
install -m 0644 "$repo/public/android-chrome-512x512.png" "$icon/worldwide-ai.png"
find "$tree/usr/share/icons" -type d -exec chmod 0755 {} +
echo "Added Electron $ELECTRON_VERSION, the window's program and the icon."
