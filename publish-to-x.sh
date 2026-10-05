#!/bin/bash
# publish-to-x.sh — legacy local diagnostics for X Articles
# Usage: publish-to-x.sh <markdown_file.md>
#
# 1. Prepares a local article copy in work/
# 2. Starts server in foreground (Ctrl+C to stop)
# 3. Opens X Articles in Chrome
#
# Daily use: Chrome extension icon → choose Markdown → import draft; see README.md

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
  echo "❌ 旧命令行排错服务使用固定端口 8765；独立扩展不需要本地服务"
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
echo "✅ 发布副本准备完成（旧命令行排错）"
echo ""
echo "   📄 副本: $MD_FILE"
echo "   🔌 端口: $PORT"
echo ""
echo "   👉 将打开 X Articles 页面；扩展 2.1.0 不会连接此服务"
echo "   👉 日常导入：点工具栏插件 → 选择上方副本 Markdown"
echo "   👉 点「导入 X 草稿」→ 人工检查 → 手动发布"
echo "   👉 此终端按 Ctrl+C 停止服务"
echo ""
echo "   💡 旧 Dashboard 排错: http://localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Open X Articles in Chrome
open -a "Google Chrome" "https://x.com/compose/articles/new"
exec node "$SCRIPT_DIR/xarticle-server.js" "$MD_FILE" "$PORT"
