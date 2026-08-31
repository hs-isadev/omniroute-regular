#!/bin/sh
# Isolated test files only. No apt installs, real keyring, credentials or host login.
set -eu
umask 077
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_root=$(mktemp -d /tmp/omniroute-package-XXXXXX)
mkdir "$test_root/scripts" "$test_root/release" "$test_root/bootstrap"
cp "$repo/package.json" "$test_root/package.json"
cp "$repo/scripts/test-regular-package.mjs" "$repo/scripts/package-protocol-fixture.mjs" "$test_root/scripts/"
version=$(sed -n 's/^  "version": "\([0-9][0-9.]*\)",$/\1/p' "$repo/package.json")
case "$version" in ''|*[!0-9.]*) printf '%s\n' 'Invalid package version' >&2; exit 1 ;; esac
name="OmniRoute-Regular-$version-linux-x64"
archive="$name.tar.gz"
cp "$repo/release/$archive" "$repo/release/$archive.sha256" "$test_root/release/"
tar -xzf "$test_root/release/$archive" -C "$test_root/bootstrap" "$name/payload/node/node"
chmod 700 "$test_root/bootstrap/$name/payload/node/node"
exec "$test_root/bootstrap/$name/payload/node/node" "$test_root/scripts/test-regular-package.mjs"
