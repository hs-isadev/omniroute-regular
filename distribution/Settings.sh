#!/bin/sh
set -eu
umask 077
ulimit -c 0
OMNIROUTE_REGULAR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OMNIROUTE_HOME="$OMNIROUTE_REGULAR_ROOT/data"
export OMNIROUTE_REGULAR_ROOT OMNIROUTE_HOME
exec "$OMNIROUTE_REGULAR_ROOT/current/node/node" "$OMNIROUTE_REGULAR_ROOT/current/app/distribution/settings-linux.mjs"
