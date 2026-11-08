#!/usr/bin/env bash
# Builds a Worldwide AI OS installer image from the pinned Ubuntu image and the Worldwide AI packages.
#
#   linux/iso/build-iso.sh <ubuntu image> <directory of .deb packages> <output directory> <version>
#
# What it does, and no more:
#   1. checks the Ubuntu image is the one pinned in base.env, by size and SHA-256;
#   2. puts the packages on the image under /worldwide-ai, and the installer file at /autoinstall.yaml;
#   3. writes a new image with xorriso, replaying Ubuntu's own boot setup. Ubuntu's boot files, kernel and live layers are
#      copied as they are: nothing of Ubuntu's is changed or rebuilt;
#   4. writes SHA256SUMS and a manifest of exactly what went in.
#
# It needs xorriso, sha256sum, dpkg-deb, unsquashfs and apt-get, and runs as an ordinary user: nothing is mounted and nothing needs root.
# Nothing secret goes into the image, and the script refuses a package that carries anything under /etc/worldwide-ai
# other than the example settings.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
# shellcheck source=base.env
. "$here/base.env"

base="${1:?Give the Ubuntu image.}"
debs="${2:?Give the directory of .deb packages.}"
out="${3:?Give the output directory.}"
version="${4:?Give the version, like 0.1.0.}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "The version must be like 0.1.0, not \"$version\"." >&2; exit 2; }
for tool in xorriso sha256sum dpkg-deb; do
	command -v "$tool" >/dev/null || { echo "$tool is needed and isn't installed." >&2; exit 2; }
done

name="worldwide-ai-os-$version-$BASE_ARCH.iso"
mkdir -p "$out"
[ ! -e "$out/$name" ] || { echo "$out/$name already exists. Nothing was written." >&2; exit 1; }
log="$out/build-$version.log"
exec > >(tee "$log") 2>&1
echo "Building $name at $(date -u +%Y-%m-%dT%H:%M:%SZ)."

# 1. The base is the pinned one.
size="$(wc -c <"$base" | tr -d ' ')"
[ "$size" = "$BASE_BYTES" ] || { echo "The base image is $size bytes, not $BASE_BYTES." >&2; exit 1; }
echo "Checking the base image's SHA-256…"
sha="$(sha256sum "$base" | cut -d' ' -f1)"
[ "$sha" = "$BASE_SHA256" ] || { echo "The base image's SHA-256 is $sha, not the pinned $BASE_SHA256." >&2; exit 1; }
echo "Base: $BASE_FILE, $BASE_SHA256."

# 2. The packages, checked one by one.
shopt -s nullglob
packages=("$debs"/*.deb)
[ "${#packages[@]}" -gt 0 ] || { echo "There are no .deb packages in $debs." >&2; exit 1; }
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/worldwide-ai"
for deb in "${packages[@]}"; do
	arch="$(dpkg-deb --field "$deb" Architecture)"
	[ "$arch" = "$BASE_ARCH" ] || [ "$arch" = "all" ] || { echo "$(basename "$deb") is for $arch, not $BASE_ARCH." >&2; exit 1; }
	if dpkg-deb --contents "$deb" | awk '{print $6}' | grep -E '^\./etc/worldwide-ai/' | grep -v -E '/$|\.example$' >/dev/null; then
		echo "$(basename "$deb") puts settings under /etc/worldwide-ai. Only example settings may go in an image." >&2
		exit 1
	fi
	cp "$deb" "$stage/worldwide-ai/"
done
cp "$here/autoinstall.yaml" "$stage/autoinstall.yaml"
# Fail now, not halfway through someone's installation, if the packages wouldn't install offline.
sh "$here/check-installable.sh" "$base" "$stage/worldwide-ai"

# 3. The new image, with Ubuntu's boot setup replayed exactly.
# SOURCE_REVISION wins: git inside WSL can't always read a checkout made on Windows.
revision="${SOURCE_REVISION:-$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo unknown)}"
xorriso -indev "$base" -outdev "$out/$name" \
	-map "$stage/worldwide-ai" /worldwide-ai \
	-map "$stage/autoinstall.yaml" /autoinstall.yaml \
	-boot_image any replay

# 4. What came out, and what went in.
(cd "$out" && sha256sum "$name" >SHA256SUMS)
{
	echo "{"
	echo "  \"image\": \"$name\","
	echo "  \"sha256\": \"$(cut -d' ' -f1 "$out/SHA256SUMS")\","
	echo "  \"bytes\": $(wc -c <"$out/$name" | tr -d ' '),"
	echo "  \"version\": \"$version\","
	echo "  \"sourceRevision\": \"$revision\","
	echo "  \"base\": { \"release\": \"$BASE_RELEASE\", \"file\": \"$BASE_FILE\", \"sha256\": \"$BASE_SHA256\" },"
	echo "  \"xorriso\": \"$(xorriso -version 2>/dev/null | head -1)\","
	echo "  \"builtAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
	echo "  \"packages\": ["
	first=1
	for deb in "$stage"/worldwide-ai/*.deb; do
		[ "$first" = 1 ] || echo ","
		first=0
		printf '    { "file": "%s", "package": "%s", "version": "%s", "sha256": "%s" }' \
			"$(basename "$deb")" "$(dpkg-deb --field "$deb" Package)" "$(dpkg-deb --field "$deb" Version)" \
			"$(sha256sum "$deb" | cut -d' ' -f1)"
	done
	echo
	echo "  ]"
	echo "}"
} >"$out/manifest-$version.json"
echo "Built $out/$name."
cat "$out/SHA256SUMS"
echo "This image has not been booted or installed by this script. That is tested separately."
