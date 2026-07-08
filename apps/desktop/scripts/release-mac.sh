#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${APP_DIR}/../.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
    set -a
    source "${ENV_FILE}"
    set +a
fi

echo "==> Pre-flight checks"

export MURMUR_NOTARIZE="${MURMUR_NOTARIZE:-1}"

missing=()
# electron-builder uploads to GitHub Releases with this token (repo scope).
[[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]] && missing+=("GH_TOKEN")

if [[ "${MURMUR_NOTARIZE}" == "1" ]]; then
    [[ -z "${APPLE_ID:-}" ]] && missing+=("APPLE_ID")
    [[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
    [[ -z "${APPLE_TEAM_ID:-}" ]] && missing+=("APPLE_TEAM_ID")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Missing env vars: ${missing[*]}"
    echo "Set them in ${APP_DIR}/.env or export them before running."
    exit 1
fi

CURRENT_VERSION="$(node -p "require('${APP_DIR}/package.json').version")"
echo ""
echo "==> Current version: ${CURRENT_VERSION}"
read -rp "Bump version? [patch/minor/major/skip]: " choice

case "${choice}" in
    patch | minor | major) npm version "${choice}" --no-git-tag-version --prefix "${APP_DIR}" ;;
    skip) echo "    Keeping ${CURRENT_VERSION}" ;;
    *) echo "Invalid choice"; exit 1 ;;
esac

VERSION="$(node -p "require('${APP_DIR}/package.json').version")"

echo ""
echo "==> Building native speechd (release)..."
(cd "${ROOT_DIR}" && bun run speechd:build:release)

echo ""
echo "==> Building web + desktop bundles..."
(cd "${ROOT_DIR}" && bun run build)

echo ""
if [[ "${MURMUR_NOTARIZE}" == "1" ]]; then
    echo "==> Packaging, signing, notarizing, and publishing ${VERSION} to GitHub Releases..."
else
    echo "==> Packaging (unsigned) and publishing ${VERSION} to GitHub Releases..."
fi
cd "${APP_DIR}"
if [[ "${MURMUR_NOTARIZE}" == "1" ]]; then
    PYTHON=/usr/bin/python3 PYTHON_PATH=/usr/bin/python3 \
        bunx electron-builder --mac --config electron-builder.config.cjs --publish always
else
    PYTHON=/usr/bin/python3 PYTHON_PATH=/usr/bin/python3 CSC_IDENTITY_AUTO_DISCOVERY=false \
        bunx electron-builder --mac --config electron-builder.config.cjs --publish always
fi

echo ""
echo "==> Release complete!"
echo "    Version: ${VERSION}"
echo "    Draft release: https://github.com/thatbeautifuldream/murmur/releases"
echo "    Publish the draft on GitHub to make the update live for existing installs."
