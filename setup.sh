#!/bin/bash
# Hermes X Publisher — One-time setup script
# Run once on a new machine:
#   bash setup.sh
#
# Does:
#   1. Checks Chrome; reports optional Node.js for legacy diagnostics
#   2. No npm deps needed for the standalone extension
#   3. Opens Chrome extension install page

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════"
echo "  🚀 Hermes X Publisher — Setup"
echo "═══════════════════════════════════════════"
echo ""

# 1. Node.js is optional for legacy diagnostics
if command -v node &>/dev/null; then
  echo -e "${GREEN}✅ Node.js${NC} $(node -v)"
else
  echo "ℹ️ Node.js 未安装；独立扩展不需要它，旧命令行排错才需要。"
fi

# 2. Check Chrome
CHROME="/Applications/Google Chrome.app"
if [ -d "$CHROME" ]; then
  echo -e "${GREEN}✅ Chrome${NC} found"
else
  echo -e "${RED}❌ Chrome not found at $CHROME${NC}"
  echo "   Install from https://google.com/chrome"
  exit 1
fi

# 3. Standalone extension needs no npm install
echo -e "${GREEN}✅${NC} Standalone extension needs no npm install"

# 4. Chrome Extension
EXT_DIR="$(cd "$(dirname "$0")" && pwd)/extension"
echo ""
echo "───────────────────────────────────────────"
echo "  🔌 Chrome Extension Setup"
echo "───────────────────────────────────────────"
echo ""
echo "  1. Open: ${BLUE}chrome://extensions${NC}"
echo "  2. Turn on ${BLUE}Developer mode${NC} (top right)"
echo "  3. Click ${BLUE}Load unpacked${NC}"
echo "  4. Select: ${BLUE}$EXT_DIR${NC}"
echo ""
echo "  💡 After any code update, click 🔄 on the extension card."

# 5. Open extensions page
echo ""
read -p "  Open chrome://extensions now? [Y/n] " yn
if [ "$yn" != "n" ] && [ "$yn" != "N" ]; then
  open -a "Google Chrome" "chrome://extensions"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  📋 Usage:"
echo "     点 Chrome 插件图标 → 选择 Markdown → 导入 X 草稿"
echo "     检查后手动发布；旧命令行排错见 README.md"
echo ""
echo "  📄 Full docs: README.md"
echo "═══════════════════════════════════════════"
