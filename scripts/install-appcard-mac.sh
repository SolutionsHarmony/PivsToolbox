#!/bin/sh
# install-appcard-mac.sh — v1.1.2
# Install the appcard Claude Code skill on macOS/Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/SolutionsHarmony/PivsToolbox/appcard-v1.1.2/scripts/install-appcard-mac.sh | sh
#
# Overrides (env):
#   APPCARD_VERSION    release tag to install (default: appcard-v1.1.2)
#   CLAUDE_SKILLS_DIR  skills root            (default: $HOME/.claude/skills)
set -eu

REPO="SolutionsHarmony/PivsToolbox"
TAG="${APPCARD_VERSION:-appcard-v1.1.2}"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
DEST="$SKILLS_DIR/appcard"

for tool in curl tar; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: '$tool' is required but not found" >&2; exit 1; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="https://codeload.github.com/$REPO/tar.gz/refs/tags/$TAG"
echo "Downloading appcard skill ($TAG)..."
curl -fsSL "$URL" -o "$TMP/src.tar.gz" || { echo "error: failed to download $URL" >&2; exit 1; }
tar -xzf "$TMP/src.tar.gz" -C "$TMP"

SRC="$(find "$TMP" -type d -path '*/skills/appcard' | head -n 1)"
if [ -z "$SRC" ]; then
  echo "error: skills/appcard not found in downloaded archive" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"

echo "Installed appcard skill to: $DEST"
find "$DEST" -type f | sed "s|^$DEST/|  |"
echo 'Restart Claude Code (or start a new session), then run "/appcard create" in any repo.'
