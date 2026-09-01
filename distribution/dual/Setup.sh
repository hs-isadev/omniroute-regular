#!/bin/sh
set -eu
umask 077
ulimit -c 0
bundle=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ] || [ "$(id -u)" = 0 ]; then
  printf '%s\n' 'Requires a normal Linux x86_64 glibc desktop user. Do not run the whole installer with sudo.' >&2; exit 1
fi
root="${XDG_DATA_HOME:-$HOME/.local/share}/OmniRouteRegular"
install_only=no
while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-root) root=$2; shift 2;;
    --install-only) install_only=yes; shift;;
    *) printf '%s\n' 'Usage: sh Setup.sh [--install-root ABSOLUTE_PATH] [--install-only]' >&2; exit 2;;
  esac
done
chmod u+x "$bundle/payload/node/node"
"$bundle/payload/node/node" "$bundle/payload/app/distribution/install.mjs" install "$bundle" "$root"
IFS= read -r active < "$root/active-version.txt"
case "$active" in versions/*) ;; *) exit 2;; esac
case "${active#versions/}" in ''|*[!a-zA-Z0-9.-]*) exit 2;; esac
chmod u+x "$root/$active/opencode/opencode"
if [ "$install_only" = yes ]; then exit 0; fi
if ! command -v secret-tool >/dev/null || ! command -v git >/dev/null || ! command -v xdg-open >/dev/null || ! /usr/bin/python3 -I -c 'import tkinter' >/dev/null 2>&1; then
  printf '%s\n' 'Installing desktop keyring helpers and Git. Your OS may request administrator approval.'
  if command -v apt-get >/dev/null; then sudo apt-get update; sudo apt-get install -y libsecret-tools gnome-keyring xdg-utils git python3-tk;
  elif command -v dnf >/dev/null; then sudo dnf install -y libsecret gnome-keyring xdg-utils git python3-tkinter;
  else printf '%s\n' 'Install secret-tool, Git, xdg-utils and Python 3 Tk using your distribution package manager, then rerun Setup.' >&2; exit 1; fi
fi
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then printf '%s\n' 'Sign in to a Linux desktop session with an unlocked keyring. Headless setup cannot safely store keys.' >&2; exit 1; fi
export OMNIROUTE_REGULAR_ROOT="$root"
"$root/$active/node/node" "$root/$active/app/distribution/dual/bootstrap-linux.mjs" "$root"
"$root/$active/node/node" "$root/$active/app/distribution/dual-setup.mjs" setup
