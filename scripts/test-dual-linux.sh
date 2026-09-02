#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bundle="$repo/release/OmniRoute-Dual-0.5.0/Linux"
stage=$(mktemp -d /tmp/omniroute-dual-linux-XXXXXX)
sh "$bundle/Setup.sh" --install-root "$stage/install" --install-only
sh "$bundle/Setup.sh" --install-root "$stage/install" --install-only
IFS= read -r active < "$stage/install/active-version.txt"
node="$stage/install/$active/node/node"
"$node" --version
"$stage/install/$active/opencode/opencode" --version
cp -r "$stage/install/$active/app" "$stage/testapp"
cp "$repo/distribution/dual-chat.test.mjs" "$repo/distribution/dual-setup.test.mjs" "$repo/distribution/gui-keys.test.mjs" "$stage/testapp/distribution/"
"$node" --test "$stage/testapp/distribution/dual-chat.test.mjs" "$stage/testapp/distribution/dual-setup.test.mjs" "$stage/testapp/distribution/gui-keys.test.mjs"
cp "$repo/distribution/settings-gui.test.py" "$stage/testapp/distribution/"
/usr/bin/python3 "$stage/testapp/distribution/settings-gui.test.py"
xvfb-run -a /usr/bin/python3 -I "$stage/testapp/distribution/settings-gui.py" --node "$node" --app "$stage/testapp" --runtime "$stage/install/data" --smoke-test
mkdir "$stage/testapp/scripts"
cp "$repo/scripts/test-dual-opencode.mjs" "$stage/testapp/scripts/"
"$node" "$stage/testapp/scripts/test-dual-opencode.mjs" "$stage/install/$active/opencode/opencode"
printf 'LINUX_TEST_ROOT=%s\n' "$stage"
