#!/bin/sh
set -eu
umask 077
ulimit -c 0
OMNIROUTE_REGULAR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export OMNIROUTE_REGULAR_ROOT
exec "$OMNIROUTE_REGULAR_ROOT/current/node/node" "$OMNIROUTE_REGULAR_ROOT/current/app/distribution/launch.mjs"
