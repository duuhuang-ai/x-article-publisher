#!/bin/bash
# publish-to-x.sh — Hermes one-click X Article publisher
# Usage: publish-to-x.sh <markdown_file.md>
#
# 1. Prepares a local article copy in work/
# 2. Starts server in foreground (Ctrl+C to stop)
# 3. Opens X Articles in Chrome
#
# User then: clicks [📥 载入文章], checks the draft, publishes manually

set -e

MD_FILE="${1:-}"
PORT="${2:-8765}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$MD_FILE" ]; then
  echo "Usage: publish-to-x.sh <markdown_file.md> [port]"
  exit 1
fi

if [ ! -f "$MD_FILE" ]; then
  echo "❌ File not found: $MD_FILE"
  exit 1
fi

if [ "$PORT" != "8765" ]; then
  echo "❌ Chrome 扩展使用固定端口 8765"
  exit 1
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ 8765 已被占用；请先在原服务终端按 Ctrl+C。本脚本不会终止其他服务。"
  exit 1
fi

# 在切换目录前解析原文路径；准备失败时不会打开 X 或启动服务。
MD_FILE="$(node "$SCRIPT_DIR/prepare-article.js" "$MD_FILE")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 文章加载完成！"
echo ""
echo "   📄 文件: $(basename "$MD_FILE")"
echo "   🔌 端口: $PORT"
echo ""
echo "   👉 Chrome 已打开 X Articles 页面"
echo "   👉 在右上角找 [📥 载入文章] 按钮"
echo "   👉 点击直接载入草稿 → 人工检查 → 手动发布"
echo "   👉 此终端按 Ctrl+C 停止服务"
echo ""
echo "   💡 手动备选: http://localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Open X Articles in Chrome
open -a "Google Chrome" "https://x.com/compose/articles/new"
exec node "$SCRIPT_DIR/xarticle-server.js" "$MD_FILE" "$PORT"
