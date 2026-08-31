#!/bin/sh
set -eu
umask 077
ulimit -c 0
OMNIROUTE_REGULAR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OMNIROUTE_HOME="$OMNIROUTE_REGULAR_ROOT/data"
export OMNIROUTE_REGULAR_ROOT OMNIROUTE_HOME
IFS= read -r active < "$OMNIROUTE_REGULAR_ROOT/active-version.txt"
case "$active" in versions/*) ;; *) exit 2 ;; esac
case "${active#versions/}" in ''|*[!a-zA-Z0-9.-]*) exit 2 ;; esac
if ! command -v secret-tool >/dev/null 2>&1 || [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
  printf '%s\n' 'An unlocked Secret Service desktop keyring, session D-Bus and secret-tool are required. On Ubuntu install libsecret-tools and gnome-keyring, then log in to your desktop. No plaintext fallback.' >&2
  exit 1
fi
exec "$OMNIROUTE_REGULAR_ROOT/$active/node/node" "$OMNIROUTE_REGULAR_ROOT/$active/app/distribution/settings-linux.mjs"
