#!/bin/sh
set -eu
umask 077
version='v0.2.6-regular.4'
archive='OmniRoute-Regular-0.2.6-linux-x64.tar.gz'
base="https://github.com/hs-isadev/omniroute-regular/releases/download/$version"
destination=${1:-"${HOME:?}/Downloads/OmniRoute-Regular-0.2.6"}
case "$destination" in /*) ;; *) printf '%s\n' 'Destination must be an absolute path.' >&2; exit 2 ;; esac
mkdir -p "$destination"
if command -v curl >/dev/null 2>&1; then
  download() { curl --fail --location --silent --show-error "$1" --output "$2"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget --https-only --quiet "$1" --output-document="$2"; }
else
  printf '%s\n' 'Install curl or wget, then rerun this downloader.' >&2
  exit 1
fi
archive_path="$destination/$archive"
checksum_path="$archive_path.sha256"
printf '%s\n' "Downloading OmniRoute Regular $version..."
download "$base/$archive" "$archive_path"
download "$base/$archive.sha256" "$checksum_path"
(cd "$destination" && sha256sum --check "$(basename "$checksum_path")")
tar -xzf "$archive_path" -C "$destination"
bundle="$destination/OmniRoute-Regular-0.2.6-linux-x64"
[ -x "$bundle/Setup.sh" ] || chmod u+x "$bundle/Setup.sh"
[ -f "$bundle/Setup.sh" ] || { printf '%s\n' 'The verified archive did not contain Setup.sh.' >&2; exit 1; }
printf '%s\n' 'Verified archive extracted. Starting the one-click setup...'
exec "$bundle/Setup.sh"
