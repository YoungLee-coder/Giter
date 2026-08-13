#!/usr/bin/env bash
# Build GitHub Release notes: CHANGELOG section + per-platform installer links.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHANGELOG="${CHANGELOG:-$ROOT/CHANGELOG.md}"
TAURI_CONF="${TAURI_CONF:-$ROOT/src-tauri/tauri.conf.json}"

if [ ! -f "$CHANGELOG" ]; then
  echo "CHANGELOG.md is missing. Add release notes before publishing." >&2
  exit 1
fi

NOTES=$(awk -v ver="$VERSION" '
  $0 ~ "^## \\[" ver "\\]" {found=1; next}
  found && /^## \[/ {exit}
  found {print}
' "$CHANGELOG" | sed -e '/./,$!d' -e :a -e '/^\n*$/{$d;N;ba' -e '}')

if [ -z "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ]; then
  echo "No CHANGELOG.md section found for [$VERSION]. Add ## [$VERSION] notes before releasing." >&2
  exit 1
fi

PRODUCT=$(jq -r '.productName' "$TAURI_CONF")
if [ -z "$PRODUCT" ] || [ "$PRODUCT" = "null" ]; then
  echo "Could not read productName from src-tauri/tauri.conf.json" >&2
  exit 1
fi

SERVER="${GITHUB_SERVER_URL:-https://github.com}"
REPO="${GITHUB_REPOSITORY:-YoungLee-coder/giter}"
BASE="${SERVER}/${REPO}/releases/download/v${VERSION}"

asset() {
  printf '%s/%s_%s_%s' "$BASE" "$PRODUCT" "$VERSION" "$1"
}

echo "## What's Changed"
echo
printf '%s\n' "$NOTES"
echo
echo "### Downloads"
echo
echo "#### macOS 10.15+"
echo
echo "- DMG: [Apple Silicon]($(asset aarch64.dmg)) | [Intel]($(asset x64.dmg))"
echo
echo "#### Windows"
echo
echo "- Installer: [.exe]($(asset x64-setup.exe)) | [MSI]($(asset x64_en-US.msi))"
echo
echo "Unsigned builds: on macOS, right-click the app and choose Open the first time."
