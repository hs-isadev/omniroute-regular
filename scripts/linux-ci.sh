#!/usr/bin/env bash
# CI only: private synthetic keyring inside an isolated D-Bus session. Never
# point this at a real desktop keyring or use a real account password here.
set -euo pipefail
umask 077
test_profile=$(mktemp -d)
export XDG_DATA_HOME="$test_profile/data"
export XDG_CONFIG_HOME="$test_profile/config"
export XDG_CACHE_HOME="$test_profile/cache"
export XDG_RUNTIME_DIR="$test_profile/run"
mkdir -p "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
printf '%s' 'synthetic-ci-keyring-password' | gnome-keyring-daemon --unlock --components=secrets
npm test
npm run test:regular
npm run eval
npm run package:regular
npm run test:package
