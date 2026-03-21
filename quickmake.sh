#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"

cd "$ROOT_DIR"

npm run build:linux

APPIMAGE_PATH="$(find "$DIST_DIR" -maxdepth 1 -type f -name '*.AppImage' | sort | tail -n 1)"

if [[ -z "${APPIMAGE_PATH:-}" ]]; then
  echo "No AppImage found in $DIST_DIR" >&2
  exit 1
fi

chmod +x "$APPIMAGE_PATH"
echo "Launching AppImage with --no-sandbox for local testing."
"$APPIMAGE_PATH" --no-sandbox
