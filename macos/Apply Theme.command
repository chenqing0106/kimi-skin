#!/bin/bash
# 双击：检查环境，从已有主题中选择并应用；活动会话会直接热切换。
source "$(dirname "$0")/lib/bootstrap.sh"

echo "选择并应用主题"
echo "────────────────────────────────"
echo "对应命令   kimi-skin apply"
echo
if "$KNODE" "$KIMI_SKIN_ROOT/dist/cli.js" apply; then
  echo
  echo "✅ 完成。Kimi 将以主题模式运行；改主题文件会热重载，无需重启。"
  echo "   想恢复原样，双击「Restore Kimi.command」。"
else
  status=$?
  echo
  echo "❌ 主题未应用。上方错误信息说明了停止原因。"
fi
echo "按回车关闭窗口。"
read -r
exit "${status:-0}"
