#!/bin/sh
set -eu
umask 077
ulimit -c 0
OMNIROUTE_REGULAR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export OMNIROUTE_REGULAR_ROOT
IFS= read -r active < "$OMNIROUTE_REGULAR_ROOT/active-version.txt"
case "$active" in versions/*) ;; *) exit 2 ;; esac
case "${active#versions/}" in ''|*[!a-zA-Z0-9.-]*) exit 2 ;; esac
exec "$OMNIROUTE_REGULAR_ROOT/$active/node/node" "$OMNIROUTE_REGULAR_ROOT/$active/app/distribution/guided-setup.mjs" "$@"
