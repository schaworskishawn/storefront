#!/bin/sh
# Proves, before an image is written, that its packages install offline on the system Ubuntu's installer lays down.
#
#   linux/iso/check-installable.sh <Ubuntu image> <directory of .deb packages>
#
# It reads the package database out of the image's minimal layer (the one the installer installs), then asks apt to
# simulate installing the packages with no package source at all: only what that system already has, plus the files
# given. A dependency that system lacks fails here instead of halfway through someone's installation. Installs nothing,
# needs no root, and changes nothing in the image.
set -eu
iso="${1:?Give the Ubuntu image.}"
debs="${2:?Give the directory of .deb packages.}"
for tool in xorriso unsquashfs apt-get; do
	command -v "$tool" >/dev/null || { echo "$tool is needed and isn't installed." >&2; exit 2; }
done
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
lba="$(xorriso -indev "$iso" -find /casper/minimal.squashfs -exec report_lba -- 2>/dev/null | awk '/File data lba/ {print $6; exit}')"
[ -n "$lba" ] || { echo "Couldn't find the minimal layer in $iso." >&2; exit 1; }
unsquashfs -o $((lba * 2048)) -q -d "$work/root" "$iso" var/lib/dpkg/status >/dev/null
mkdir -p "$work/lists/partial" "$work/cache/archives/partial" "$work/parts"
if apt-get -s -q \
	-o Dir::State::status="$work/root/var/lib/dpkg/status" \
	-o Dir::State::Lists="$work/lists" \
	-o Dir::Cache="$work/cache" \
	-o Dir::Etc::SourceList=/dev/null \
	-o Dir::Etc::SourceParts="$work/parts" \
	-o Debug::NoLocking=1 \
	install "$debs"/*.deb >"$work/apt.log" 2>&1; then
	echo "Installable offline on the installed system: $(grep -c '^Inst ' "$work/apt.log") packages, nothing else needed."
	if grep '^Inst ' "$work/apt.log" | grep -v -E '^Inst worldwide-ai-' >/dev/null; then
		echo "But apt would also install packages that aren't ours:" >&2
		grep '^Inst ' "$work/apt.log" | grep -v -E '^Inst worldwide-ai-' >&2
		exit 1
	fi
else
	echo "These packages won't install offline on the installed system:" >&2
	sed -n '/unmet dependencies/,$p' "$work/apt.log" >&2
	exit 1
fi
