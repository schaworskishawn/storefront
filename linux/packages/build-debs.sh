#!/usr/bin/env bash
# Builds the Worldwide AI OS .deb packages.
#
#   linux/packages/build-debs.sh <output directory> <version>
#
# Each directory here with a `control` file is one package: `control` is its metadata and `root/` is what it installs.
# The tree is copied to a temporary directory first and given fixed permissions there (directories 0755, files 0644,
# anything under usr/bin or usr/lib/worldwide-ai/bin 0755), so a checkout made on Windows builds the same package.
# Files are owned by root in the package. Runs as an ordinary user.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
out="${1:?Give the output directory.}"
version="${2:?Give the version, like 0.1.0.}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "The version must be like 0.1.0, not \"$version\"." >&2; exit 2; }
command -v dpkg-deb >/dev/null || { echo "dpkg-deb is needed and isn't installed." >&2; exit 2; }
# SOURCE_REVISION wins: git inside WSL can't always read a checkout made on Windows.
revision="${SOURCE_REVISION:-$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo unknown)}"
mkdir -p "$out"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for dir in "$here"/*/; do
	[ -f "$dir/control" ] || continue
	package="$(basename "$dir")"
	tree="$work/$package"
	mkdir -p "$tree/DEBIAN"
	cp -r "$dir/root/." "$tree/"
	sed -e "s/@VERSION@/$version/g" "$dir/control" | tr -d '\r' >"$tree/DEBIAN/control"
	# The same placeholders inside the installed files.
	find "$tree" -path "$tree/DEBIAN" -prune -o -type f -print0 |
		xargs -0 -r sed -i -e "s/@VERSION@/$version/g" -e "s/@REVISION@/$revision/g"
	find "$tree" -type d -exec chmod 0755 {} +
	find "$tree" -type f -exec chmod 0644 {} +
	for bin in "$tree/usr/bin" "$tree/usr/lib/worldwide-ai/bin"; do
		[ -d "$bin" ] && find "$bin" -type f -exec chmod 0755 {} +
	done
	# Scripts dpkg runs when the package is installed or removed.
	for script in preinst postinst prerm postrm; do
		if [ -f "$dir/$script" ]; then
			tr -d '\r' <"$dir/$script" >"$tree/DEBIAN/$script"
			chmod 0755 "$tree/DEBIAN/$script"
		fi
	done
	# What a package needs that isn't source, such as a runtime it ships, added after the permissions above so that
	# prepare.sh sets its own.
	if [ -f "$dir/prepare.sh" ]; then
		bash "$dir/prepare.sh" "$tree" "$version"
	fi
	arch="$(sed -n 's/^Architecture: //p' "$tree/DEBIAN/control")"
	dpkg-deb --root-owner-group --build "$tree" "$out/${package}_${version}_${arch}.deb" >/dev/null
	echo "Built $out/${package}_${version}_${arch}.deb"
done
