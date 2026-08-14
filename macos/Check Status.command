#!/bin/bash
# 双击：查看 harness 与主题当前状态（只读，不改动任何东西）。
source "$(dirname "$0")/lib/bootstrap.sh"

echo "查看当前状态"
echo "────────────────────────────────"
echo "对应命令   kimi-skin status"
echo
"$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" status || true

echo
echo "按回车关闭窗口。"
read -r
