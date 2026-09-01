#!/bin/sh
set -eu
umask 077
ulimit -c 0
OMNIROUTE_REGULAR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export OMNIROUTE_REGULAR_ROOT
IFS= read -r active < "$OMNIROUTE_REGULAR_ROOT/active-version.txt"
case "$active" in versions/*) ;; *) exit 2;; esac
case "${active#versions/}" in ''|*[!a-zA-Z0-9.-]*) exit 2;; esac
action=${1:-opencode}
if [ "$#" -gt 0 ]; then shift; fi
exec "$OMNIROUTE_REGULAR_ROOT/$active/node/node" "$OMNIROUTE_REGULAR_ROOT/$active/app/distribution/dual-setup.mjs" "$action" "$@"
