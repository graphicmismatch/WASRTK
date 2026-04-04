#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
HOST_PLATFORM="$(uname -s)"

BUILD_TARGETS=(
  "linux:build:linux"
  "win:build:win"
  "mac:build:mac"
)

cd "$ROOT_DIR"

FAILED_TARGETS=()

for target in "${BUILD_TARGETS[@]}"; do
  platform="${target%%:*}"
  script_name="${target#*:}"

  echo "Building ${platform} artifacts with npm run ${script_name}..."

  if ! npm run "$script_name"; then
    FAILED_TARGETS+=("$platform")
    echo "Build failed for ${platform}." >&2
  fi
done

if ((${#FAILED_TARGETS[@]} > 0)); then
  printf 'Builds failed for: %s\n' "${FAILED_TARGETS[*]}" >&2
  exit 1
fi

if [[ "$HOST_PLATFORM" != "Linux" ]]; then
  echo "All desktop builds completed. Skipping AppImage launch on ${HOST_PLATFORM}."
  exit 0
fi

UNPACKED_APP_PATH="$DIST_DIR/linux-unpacked/wasrtk"

if [[ ! -x "$UNPACKED_APP_PATH" ]]; then
  echo "No unpacked Linux binary found at $UNPACKED_APP_PATH" >&2
  exit 1
fi

echo "Launching unpacked Linux build with the sandbox enabled."
"$UNPACKED_APP_PATH"
