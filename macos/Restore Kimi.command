#!/bin/bash
# 双击：移除主题、关闭调试会话、以普通方式重新启动 Kimi。
source "$(dirname "$0")/lib/bootstrap.sh"

"$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" restore

echo
echo "按回车关闭窗口。"
read -r
