#!/bin/sh
# Isolated test files only. No apt installs, real keyring, credentials or host login.
set -eu
umask 077
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_root=$(mktemp -d /tmp/omniroute-package-XXXXXX)
mkdir "$test_root/scripts" "$test_root/release" "$test_root/bootstrap"
cp "$repo/package.json" "$test_root/package.json"
cp "$repo/scripts/test-regular-package.mjs" "$repo/scripts/package-protocol-fixture.mjs" "$test_root/scripts/"
archive=OmniRoute-Regular-0.2.0-linux-x64.tar.gz
cp "$repo/release/$archive" "$repo/release/$archive.sha256" "$test_root/release/"
tar -xzf "$test_root/release/$archive" -C "$test_root/bootstrap" OmniRoute-Regular-0.2.0-linux-x64/payload/node/node
chmod 700 "$test_root/bootstrap/OmniRoute-Regular-0.2.0-linux-x64/payload/node/node"
exec "$test_root/bootstrap/OmniRoute-Regular-0.2.0-linux-x64/payload/node/node" "$test_root/scripts/test-regular-package.mjs"
