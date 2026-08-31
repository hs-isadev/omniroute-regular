#!/bin/sh
set -eu
umask 077
ulimit -c 0
bundle=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ] || [ "$(id -u)" = 0 ]; then
  printf '%s\n' 'Requires Linux x86_64 glibc, normal desktop user; do not use sudo.' >&2
  exit 1
fi
# Cross-built archives may not preserve Unix execute bits. No root privileges.
chmod u+x "$bundle/payload/node/node"
install_root="${XDG_DATA_HOME:-$HOME/.local/share}/OmniRouteRegular"
wizard=yes
while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-root) [ "$#" -ge 2 ] || exit 2; install_root=$2; shift 2 ;;
    --no-wizard|--no-shortcuts) [ "$1" != --no-wizard ] || wizard=no; shift ;;
    *) printf '%s\n' 'Usage: Setup.sh [--install-root ABSOLUTE_PATH] [--no-wizard]' >&2; exit 2 ;;
  esac
done
printf '%s\n' 'Step 1/4: Verify and install OmniRoute Regular (existing keys are retained).'
"$bundle/payload/node/node" "$bundle/payload/app/distribution/install.mjs" install "$bundle" "$install_root"
printf '%s\n' 'Install/sign in to official Antigravity: https://antigravity.google/download' 'Choose a free account-available host model; OmniRoute never imports its login.'
printf '%s\n' 'Linux key storage requires an unlocked Secret Service desktop keyring and secret-tool (libsecret-tools). Headless sessions are unsupported.'
if [ "$wizard" = yes ]; then exec "$install_root/Connect.sh"; fi
