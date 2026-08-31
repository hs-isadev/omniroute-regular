#!/bin/sh
# Fixture-only tests on a copied payload, never a live install or real keyring.
set -eu
umask 077
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
version=$(sed -n 's/^  "version": "\([0-9][0-9.]*\)",$/\1/p' "$repo/package.json")
case "$version" in ''|*[!0-9.]*) exit 1 ;; esac
bundle="$repo/release/OmniRoute-Regular-$version-linux-x64"
test -f "$bundle/manifest.json"
editor_test=$(mktemp -d /tmp/omni-editor-linux-XXXXXX)
cp -R "$bundle/payload/app" "$editor_test/app"
cp "$repo/distribution/key-editor.test.mjs" "$repo/distribution/regular-policy.test.mjs" "$repo/distribution/guided-setup.test.mjs" "$editor_test/app/distribution/"
cp "$bundle/payload/node/node" "$editor_test/node"
chmod 700 "$editor_test/node"
exec "$editor_test/node" --test "$editor_test/app/distribution/key-editor.test.mjs" "$editor_test/app/distribution/regular-policy.test.mjs" "$editor_test/app/distribution/guided-setup.test.mjs"
