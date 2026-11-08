#!/usr/bin/env bash
# Fetches the pinned Ubuntu base image and proves it is the one pinned in base.env, or stops.
#
#   linux/iso/fetch-base.sh <directory> <keyring>
#
# <directory> is where the image is kept, outside the repository. It is created if it doesn't exist. A file already there is
# checked, not fetched again; a partial download is resumed.
# <keyring> is a keyring holding Ubuntu's CD image signing key. On Ubuntu it is /usr/share/keyrings/ubuntu-archive-keyring.gpg
# (package ubuntu-keyring). Nothing is fetched from a key server.
#
# This downloads about 6.5 GB. Three things have to hold or it exits with an error and says which:
#   1. SHA256SUMS carries a good signature from the key named in base.env;
#   2. the line for the image in SHA256SUMS is the checksum pinned in base.env;
#   3. the image's own SHA-256 and size match.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=base.env
. "$here/base.env"

dir="${1:?Give the directory to keep the image in.}"
keyring="${2:?Give the keyring that holds the Ubuntu CD image signing key.}"
[ -r "$keyring" ] || { echo "Can't read the keyring: $keyring" >&2; exit 2; }
for tool in curl sha256sum gpgv; do
	command -v "$tool" >/dev/null || { echo "$tool is needed and isn't installed." >&2; exit 2; }
done
mkdir -p "$dir"
cd "$dir"

curl -fsSL --max-time 60 -o SHA256SUMS "$BASE_SUMS_URL"
curl -fsSL --max-time 60 -o SHA256SUMS.gpg "$BASE_SIG_URL"

# 1. The checksum list is Ubuntu's.
status="$(gpgv --status-fd 1 --keyring "$keyring" SHA256SUMS.gpg SHA256SUMS 2>/dev/null || true)"
if ! grep -q "^\[GNUPG:\] VALIDSIG $BASE_SIGNING_KEY " <<<"$status"; then
	echo "SHA256SUMS is not signed by $BASE_SIGNING_KEY. Nothing was trusted." >&2
	exit 1
fi
echo "Signature: good, from $BASE_SIGNING_KEY."

# 2. Ubuntu's list says what base.env says.
listed="$(grep -E "^[0-9a-f]{64} \*?$BASE_FILE\$" SHA256SUMS | cut -d' ' -f1 || true)"
if [ "$listed" != "$BASE_SHA256" ]; then
	echo "Ubuntu's list gives ${listed:-no checksum} for $BASE_FILE, not the pinned $BASE_SHA256." >&2
	exit 1
fi

# 3. The bytes are those bytes.
size="$(wc -c <"$BASE_FILE" 2>/dev/null | tr -d ' ' || echo 0)"
# A complete file is checked as it is: asking the server to resume past its end is an error.
if [ "$size" != "$BASE_BYTES" ]; then
	curl -fL --retry 5 --retry-delay 10 -C - -sS -o "$BASE_FILE" "$BASE_URL"
	size="$(wc -c <"$BASE_FILE" | tr -d ' ')"
fi
if [ "$size" != "$BASE_BYTES" ]; then
	echo "$BASE_FILE is $size bytes, not $BASE_BYTES. Delete it and run this again." >&2
	exit 1
fi
actual="$(sha256sum "$BASE_FILE" | cut -d' ' -f1)"
if [ "$actual" != "$BASE_SHA256" ]; then
	echo "$BASE_FILE has SHA-256 $actual, not $BASE_SHA256. Delete it and run this again." >&2
	exit 1
fi
echo "Verified: $BASE_FILE, $size bytes, SHA-256 $actual, as signed by Ubuntu."
