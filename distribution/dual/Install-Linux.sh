#!/bin/sh
set -eu
bundle=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$bundle/Linux/Setup.sh" "$@"
