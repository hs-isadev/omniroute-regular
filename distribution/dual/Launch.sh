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
node="$OMNIROUTE_REGULAR_ROOT/$active/node/node"
if [ ! -f "$node" ]; then
  printf '%s\n' 'The active OmniRoute Node runtime is missing. Rerun Install-Linux.sh to repair the package.' >&2
  exit 1
fi
if [ "$action" = harness ]; then
  entry="$OMNIROUTE_REGULAR_ROOT/$active/app/apps/cli/dist/bin.js"
  if [ ! -f "$entry" ]; then
    printf '%s\n' 'The bundled OmniRoute CLI is missing. Rerun Install-Linux.sh to repair the package.' >&2
    exit 1
  fi
  if [ "$#" -eq 0 ]; then set -- opencode --mode regular; fi
  exec "$node" "$entry" harness "$@"
fi
if [ "$action" = browser-consumers ]; then
  entry="$OMNIROUTE_REGULAR_ROOT/$active/app/packages/browser-consumer-adapter/runtime/shared-session.mjs"
  if [ ! -f "$entry" ]; then
    printf '%s\n' 'The active browser-consumer adapter is missing. Rerun Install-Linux.sh to repair the package.' >&2
    exit 1
  fi
  exec "$node" "$entry" --background --profile "$OMNIROUTE_REGULAR_ROOT/data/browser-consumer-profile" --port 47842 "$@"
fi
entry="$OMNIROUTE_REGULAR_ROOT/$active/app/distribution/dual-setup.mjs"
if [ ! -f "$entry" ]; then
  printf '%s\n' 'The active OmniRoute launcher is missing. Rerun Install-Linux.sh to repair the package.' >&2
  exit 1
fi
exec "$node" "$entry" "$action" "$@"
