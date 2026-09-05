#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
bundle="$repo/release/OmniRoute-Private-0.6.0-private.1/Linux"
stage=$(mktemp -d /tmp/omniroute-private-linux-XXXXXX)
sh "$bundle/Setup.sh" --install-root "$stage/install" --install-only
sh "$bundle/Setup.sh" --install-root "$stage/install" --install-only
IFS= read -r active < "$stage/install/active-version.txt"
"$stage/install/$active/node/node" --version
"$stage/install/$active/opencode/opencode" --version
printf 'LINUX_PRIVATE_SMOKE=%s\n' "$stage"
