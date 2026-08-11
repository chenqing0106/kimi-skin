#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUTPUT_DIR="$ROOT/release"
ARCHIVE="$OUTPUT_DIR/kimi-skin-$VERSION-macos.zip"
STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kimi-skin-release.XXXXXX")"
STAGING_DIR="$STAGING_ROOT/kimi-skin-$VERSION"

cleanup() {
  rm -rf "$STAGING_ROOT"
}
trap cleanup EXIT

mkdir -p "$OUTPUT_DIR" "$STAGING_DIR"
cp "$ROOT/README.md" "$ROOT/SECURITY.md" "$ROOT/LICENSE" "$ROOT/package.json" "$STAGING_DIR/"
cp -R "$ROOT/dist" "$ROOT/macos" "$ROOT/themes" "$ROOT/skills" "$STAGING_DIR/"

rm -f "$ARCHIVE"
/usr/bin/ditto -c -k --norsrc --keepParent "$STAGING_DIR" "$ARCHIVE"

echo "$ARCHIVE"
