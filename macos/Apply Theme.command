#!/bin/bash
# 双击：基线检查 + 从已有主题中选择并应用。
source "$(dirname "$0")/lib/bootstrap.sh"

echo "① 基线检查"
echo "────────────────────────────────"
if ! "$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" doctor; then
  fail "基线检查未通过（见上方原因）。按项目安全约定，此时不会注入主题。"
fi

echo
echo "② 选择并应用主题"
echo "────────────────────────────────"
"$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" apply

echo
echo "✅ 完成。Kimi 将以主题模式运行；改主题文件会热重载，无需重启。"
echo "   想恢复原样，双击「Restore Kimi.command」。"
echo "按回车关闭窗口。"
read -r
