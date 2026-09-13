#!/bin/sh
set -eu
action="${1:-}"
case "$action" in rollback|uninstall) ;; *) echo 'Use Manage.sh rollback or uninstall.' >&2; exit 1;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
active=$(tr -d '\r\n' < "$root/active-version.txt")
case "$active" in versions/[A-Za-z0-9.-]*) ;; *) echo 'Invalid active version' >&2; exit 1;; esac
node="$root/$active/node/node"
repair="$root/$active/app/distribution/dual-setup.mjs"
test -f "$node" || { echo 'OmniRoute registration unhealthy: active Node executable is missing.' >&2; exit 1; }
"$node" "$root/$active/app/distribution/install.mjs" "$action" "$root"
if [ "$action" = rollback ]; then
  next=$(tr -d '\r\n' < "$root/active-version.txt")
  case "$next" in versions/[A-Za-z0-9.-]*) ;; *) echo 'Invalid rollback version' >&2; exit 1;; esac
  next_node="$root/$next/node/node"
  test -f "$next_node" && test -f "$repair" || { echo 'Rollback runtime is incomplete; host registrations were not changed.' >&2; exit 1; }
  "$node" "$repair" repair-hosts
fi
