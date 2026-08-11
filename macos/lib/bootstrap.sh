#!/bin/bash
# kimi-skin 公共引导：定位并校验 Kimi 自带的签名 Node 运行时。
# 终端用户不需要安装 Node.js / pnpm——复用宿主 App 的运行时，
# 校验通过后才允许使用，这是和 harness 一致的安全约定。
# 用法：source 本文件后，KIMI_SKIN_ROOT 与 KNODE 可用。

set -euo pipefail

KIMI_SKIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KIMI_APP="/Applications/Kimi.app"
KNODE="$KIMI_APP/Contents/Resources/resources/runtime/node"

fail() {
  echo
  echo "❌ $1"
  echo "按回车关闭窗口。"
  read -r
  exit 1
}

echo "kimi-skin · 非官方社区实验项目"
echo "────────────────────────────────"

[ -d "$KIMI_APP" ] || fail "没有找到 $KIMI_APP，请先安装官方 Kimi 桌面端。"
[ -x "$KNODE" ] || fail "Kimi 自带运行时不存在（$KNODE）。Kimi 版本可能过旧或目录结构已变化。"

codesign -v "$KNODE" 2>/dev/null || fail "Kimi 自带运行时签名无效，拒绝使用。"
TEAM_ID="$(codesign -dv "$KNODE" 2>&1 | awk -F= '/^TeamIdentifier/ {print $2}')"
[ "$TEAM_ID" = "2J9472RW75" ] || fail "Kimi 自带运行时 Team ID 不符（$TEAM_ID），拒绝使用。"

NODE_VERSION="$("$KNODE" --version)"
NODE_MAJOR="$(echo "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Kimi 自带 Node 版本过旧（${NODE_VERSION}），需要 22 或更高。"

[ -f "$KIMI_SKIN_ROOT/dist/cli.js" ] || fail "缺少 dist/cli.js。开发者请先 pnpm build；终端用户请下载完整的 Release 包。"

echo "运行时     Kimi 自带 Node ${NODE_VERSION}（签名有效，Team ID 已核对）"
echo
