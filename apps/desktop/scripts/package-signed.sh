#!/usr/bin/env bash
# Packages the app signed with a local Apple Development identity (not Developer
# ID / not notarized). A stable cert-based signature keeps the app's code
# identity constant across rebuilds, so macOS TCC grants (Accessibility for the
# global Option-key hook, microphone) persist instead of resetting every build.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer an explicitly provided identity, else the first Apple Development cert.
IDENTITY="${MURMUR_SIGN_IDENTITY:-}"
if [ -z "$IDENTITY" ]; then
  IDENTITY=$(
    security find-identity -v -p codesigning |
      grep "Apple Development" | head -1 | awk '{print $2}'
  )
fi

if [ -z "$IDENTITY" ]; then
  echo "error: no Apple Development identity found in the keychain." >&2
  echo "       Open Xcode > Settings > Accounts to create one, or run 'bun run package:unsigned' for an ad-hoc build." >&2
  exit 1
fi

echo "Signing with identity $IDENTITY"
export MURMUR_SIGN_IDENTITY="$IDENTITY"

cd "$SCRIPT_DIR/.."
exec bun run package:unsigned
