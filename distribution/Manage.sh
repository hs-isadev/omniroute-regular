#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "${1:-}" in rollback|uninstall) ;; *) printf '%s\n' 'Usage: Manage.sh rollback|uninstall. Detach workspaces first with Launch.sh --detach --workspace PATH --apply.' >&2; exit 2 ;; esac
IFS= read -r active < "$root/active-version.txt"
case "$active" in versions/*) ;; *) exit 2 ;; esac
case "${active#versions/}" in ''|*[!a-zA-Z0-9.-]*) exit 2 ;; esac
exec "$root/$active/node/node" "$root/$active/app/distribution/install.mjs" "$1" "$root"
