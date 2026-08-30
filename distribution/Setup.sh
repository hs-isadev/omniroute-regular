#!/bin/sh
set -eu
umask 077
ulimit -c 0
bundle=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
  printf '%s\n' 'This package requires Linux x86_64 (glibc), not ARM or Alpine.' >&2
  exit 1
fi
if [ "$(id -u)" = 0 ]; then
  printf '%s\n' 'Run setup as your normal desktop user, not with sudo.' >&2
  exit 1
fi
exec "$bundle/payload/node/node" "$bundle/payload/app/distribution/install-linux.mjs" "$bundle" "$@"
