#!/bin/bash
# 双击：查看 harness 与主题当前状态（只读，不改动任何东西）。
source "$(dirname "$0")/lib/bootstrap.sh"

"$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" doctor || true
echo
echo "────────────────────────────────"
"$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" status || true

echo
echo "按回车关闭窗口。"
read -r
