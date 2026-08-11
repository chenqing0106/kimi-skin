#!/usr/bin/env bash
# 单向同步：仓库 skills/ → daimon 运行时 skill 目录。
# 事实源永远是仓库副本；系统目录只同步、不直接编辑。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/skills/kimi-skin-theme/"
DST="$HOME/Library/Application Support/kimi-desktop/daimon-share/daimon/skills/kimi-skin-theme/"

if [ ! -d "$SRC" ]; then
  echo "源目录不存在: $SRC" >&2
  exit 1
fi

mkdir -p "$DST"
rsync -a --delete "$SRC" "$DST"
echo "已同步 $SRC -> $DST"
