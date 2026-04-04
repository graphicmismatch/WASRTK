#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${1:-$ROOT_DIR/dist}"
HOST_PLATFORM="$(uname -s)"
SANDBOX_PATH="$DIST_DIR/linux-unpacked/chrome-sandbox"

if [[ "$HOST_PLATFORM" != "Linux" ]]; then
  echo "Skipping chrome-sandbox permission fix on ${HOST_PLATFORM}."
  exit 0
fi

if [[ ! -f "$SANDBOX_PATH" ]]; then
  echo "Expected chrome-sandbox at $SANDBOX_PATH after the Linux build." >&2
  exit 1
fi

CURRENT_STATE="$(stat -c '%u:%g:%a' "$SANDBOX_PATH")"

if [[ "$CURRENT_STATE" == "0:0:4755" ]]; then
  echo "chrome-sandbox already has root ownership and mode 4755."
  exit 0
fi

echo "Repairing chrome-sandbox ownership and mode for the unpacked Linux build..."

if [[ "$(id -u)" -eq 0 ]]; then
  chown root:root "$SANDBOX_PATH"
  chmod 4755 "$SANDBOX_PATH"
elif command -v sudo >/dev/null 2>&1; then
  sudo chown root:root "$SANDBOX_PATH"
  sudo chmod 4755 "$SANDBOX_PATH"
else
  echo "Unable to fix $SANDBOX_PATH automatically because sudo is unavailable." >&2
  echo "Run: chown root:root \"$SANDBOX_PATH\" && chmod 4755 \"$SANDBOX_PATH\"" >&2
  exit 1
fi

UPDATED_STATE="$(stat -c '%u:%g:%a' "$SANDBOX_PATH")"

if [[ "$UPDATED_STATE" != "0:0:4755" ]]; then
  echo "chrome-sandbox permissions are still incorrect: $UPDATED_STATE" >&2
  exit 1
fi

echo "chrome-sandbox is ready at $SANDBOX_PATH."
