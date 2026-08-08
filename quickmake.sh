#!/usr/bin/env bash

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
HOST_PLATFORM="$(uname -s)"

cd "$ROOT_DIR"

# Map a platform key (linux/win/mac) to its npm build script.
build_script_for() {
  case "$1" in
    linux) echo "build:linux" ;;
    win) echo "build:win" ;;
    mac) echo "build:mac" ;;
    *) return 1 ;;
  esac
}

# Detect the host platform key from uname so the default build always
# targets the machine we're actually running on.
case "$HOST_PLATFORM" in
  Linux) HOST_KEY="linux" ;;
  Darwin) HOST_KEY="mac" ;;
  MINGW*|MSYS*|CYGWIN*) HOST_KEY="win" ;;
  *)
    echo "Unrecognized host platform '${HOST_PLATFORM}'; defaulting to a linux build." >&2
    HOST_KEY="linux"
    ;;
esac

# Any extra platform names passed as args (e.g. "./quickmake.sh win mac")
# are attempted best-effort, in addition to the host build.
EXTRA_TARGETS=()
for arg in "$@"; do
  if [[ "$arg" == "$HOST_KEY" ]]; then
    continue
  fi
  EXTRA_TARGETS+=("$arg")
done

echo "Host platform detected: ${HOST_PLATFORM} (${HOST_KEY})"

HOST_SCRIPT="$(build_script_for "$HOST_KEY")"
echo "Building host target '${HOST_KEY}' with npm run ${HOST_SCRIPT}..."

if ! npm run "$HOST_SCRIPT"; then
  echo "Build failed for host platform '${HOST_KEY}'. Aborting (nothing to launch)." >&2
  exit 1
fi

for target in "${EXTRA_TARGETS[@]}"; do
  script_name="$(build_script_for "$target" 2>/dev/null || true)"
  if [[ -z "$script_name" ]]; then
    echo "Skipping unknown platform target '${target}'." >&2
    continue
  fi

  echo "Building additional target '${target}' with npm run ${script_name} (best-effort)..."
  if ! npm run "$script_name"; then
    echo "Build failed for best-effort target '${target}'; continuing." >&2
  fi
done

if [[ "$HOST_KEY" != "linux" ]]; then
  echo "Host build for '${HOST_KEY}' completed. Launch step only runs on Linux; skipping."
  exit 0
fi

UNPACKED_APP_PATH="$DIST_DIR/linux-unpacked/wasrtk"

if [[ ! -x "$UNPACKED_APP_PATH" ]]; then
  echo "No unpacked Linux binary found at $UNPACKED_APP_PATH" >&2
  exit 1
fi

echo "Launching unpacked Linux build with the sandbox enabled."
"$UNPACKED_APP_PATH"
