#!/usr/bin/env bash
# Installs Murmur into /Applications from the locally-built DMG in ./release
# (produced by `bun run package:unsigned`). Used by `bun run install:mac`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$SCRIPT_DIR/../release"
APP="/Applications/Murmur.app"

# Newest arm64 DMG in the release dir.
DMG=$(ls -t "$RELEASE_DIR"/Murmur-*-arm64.dmg 2>/dev/null | head -1 || true)
if [ -z "${DMG:-}" ]; then
  echo "error: no DMG found in $RELEASE_DIR. Run 'bun run package:unsigned' first." >&2
  exit 1
fi

MOUNT_DIR=$(mktemp -d -t murmur-mount)
cleanup() {
  hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
  rmdir "$MOUNT_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "Mounting $(basename "$DMG")..."
hdiutil attach "$DMG" -nobrowse -mountpoint "$MOUNT_DIR" -quiet

echo "Installing to $APP"
rm -rf "$APP"
cp -R "$MOUNT_DIR/Murmur.app" /Applications/

# Un-notarized build: strip the quarantine flag so it opens without the
# "damaged / unidentified developer" prompt.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "Installed to /Applications/Murmur.app"
