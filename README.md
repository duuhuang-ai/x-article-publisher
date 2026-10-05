# X Article Publisher

> Markdown → X Articles，一键导入。
> Chrome 扩展 + 本地 HTTP 服务，无需申请 X API。
> 核心技术来自 [xPoster](https://github.com/nevertoday/xposter) (MIT)。

当前验证状态（2026-10-05）：Chrome 扩展已安装；纯文字及真实 14 图文章草稿导入通过。
实测新草稿含 1 张封面、13 张正文图；刷新后逐张身份、顺序及段落位置一致，没有重传或残留占位符。
本例文字、行内格式和链接保留；X 保存后将 10 个 H3/H4 小标题及 1 个表格文本块转为普通段落。
本仓库包含图床副本和图片重传修复；测试草稿未发布。详细本地验证证据保存在 `work/verification-2026-10-05.md`，不随仓库上传。

## 安装

```bash
git clone https://github.com/duuhuang-ai/x-article-publisher.git
cd x-article-publisher

# 装 Chrome 扩展
# chrome://extensions → 开发者模式 → 加载已解压 → 选 extension/ 目录
```

扩展模式和图床副本工具不需要 `npm install`，使用 Node.js 内置模块。
可选的 `auto-publish.js` 模式依赖 `playwright-core`，本次验证未使用。
正文写入浏览器内的 Draft.js 编辑器，图片走原生粘贴和封面上传入口；标题仍调用 X 页面内部 GraphQL，复用 Chrome 登录状态，无需配置官方 API Key。

## 使用

```bash
bash publish-to-x.sh /path/to/article.md
```

然后：
1. Chrome 自动打开 `x.com/compose/articles/new`
2. 点新建文章图标进入空白编辑器，避免覆盖已有草稿
3. 点右上角 **📥 载入文章**，直接导入，没有预览确认窗
4. 等待完成，检查标题、封面、正文和图片顺序
5. 发布由用户手动操作；脚本只导入草稿

终端按 `Ctrl+C` 停止本地服务。端口固定为 8765，已被占用时会报错，不会终止其他服务。

### Obsidian 图床文章

`publish-to-x.sh` 会先准备发布副本，再启动服务。也可以分开执行：

```bash
node prepare-article.js "/absolute/path/文章.md"
# 输出 work/<日期>-<文章名>-<随机标识>/article.md 的绝对路径
node xarticle-server.js "/absolute/path/to/work/副本目录/article.md"
```

- 原文和图床保持不变；只在本项目 `work/` 下载图片和生成副本，不覆盖旧副本。
- 支持标准 `![说明](https://图床链接)`、本地图片和上游支持的 Obsidian 嵌入格式；沿用上游解析范围。
- 远程图片支持 PNG/JPEG/GIF/WebP；跟随重定向，检查实际格式、30 秒超时、16 MiB 上限。
- 重复链接只下载一次，正文中的重复出现及顺序保留。
- 没有 frontmatter 标题或 H1 时，用原文章文件名补标题，仅修改副本。
- 正文图片逐张等待上传、X 自动保存及媒体映射后再继续；任一失败立即停止，保留未完成占位符供排查。
- 封面在正文完成后通过原生文件入口上传，自动应用 X 的默认 5:2 裁剪；导入后可以手动调整。
- 封面可以独立写在 frontmatter `cover:`；未指定时沿用上游规则：第一张图作为封面，并从正文移除。
- 本地图片的相对路径在副本改为绝对路径，仍指向原文旁的素材。
- 下载或本地图片读取失败会明确报错并停止；残留素材保留供排查，不会生成可用 `article.md`。
- Markdown 表格仍沿用上游转换为文本代码块；本例在 X 保存后变成普通文字。H3/H4 小标题也会降级为普通段落；没有新增原生表格或标题格式转换。
- 大 PNG/JPEG 沿用上游 macOS `sips` 压缩，仅处理导入数据，不修改原图或已下载素材。

## 原理

```
Markdown .md
    │
    ▼  shared.js (xPoster 解析器)
    │
    ▼  xarticle-server.js (HTTP :8765)
    │    ├── /status   — 文章预览信息
    │    ├── /payload  — 完整文章 JSON
    │    └── /inject-script — 注入引擎 + 数据
    │
    ▼  Chrome 扩展 (content.js)
    │    注入 [📥 载入文章] 按钮 → 点它 → 导入
    │
    ▼  xpage.js (注入到 X 页面 MAIN world)
       React Fiber 攀爬 → Draft.js 写入 → 图片上传 → GraphQL 元数据
    │
    ▼
✅ 文章出现在编辑器 — 你点 Publish
```

## 文件结构

```
x-article-publisher/
├── xarticle-server.js    # HTTP 服务器
├── xpage.js              # X 页面注入引擎 (Draft.js + React Fiber)
├── shared.js             # xPoster 的 Markdown 解析器 (MIT)
├── publish-to-x.sh       # 准备副本并启动服务，只导入草稿
├── prepare-article.js    # 下载图床图片，生成发布副本
├── payload.js            # 共用 payload，图片失败时报错，支持独立封面
├── check-images.js       # 图床与发布副本检查
├── check-editor.js       # 图片保存门槛回归检查
├── AGENTS.md             # 项目规范
├── work/                 # 临时文章、图片与验证记录，不进入 Git
├── setup.sh              # 环境检测
├── package.json          # 可选自动模式声明 playwright-core
└── extension/            # Chrome 扩展
    ├── manifest.json     # Manifest V3
    ├── content.js        # 载入按钮 + 完成等待 + 导入逻辑
    └── background.js     # 点扩展图标 → 打开 dashboard
```

## 要求

- macOS（Windows/Linux 改 `publish-to-x.sh` 里的 `open` 命令即可）
- Node.js ≥ 18
- Google Chrome
- 账号具有 X Articles 编辑权限（打开页面确认）

## API 端点

| 端点 | 用途 |
|------|------|
| `GET /` | 上游 Dashboard（手动复制粘贴备选；其旧自动触发按钮不适用于当前扩展） |
| `GET /status` | 文章预览：标题、摘要、块数、图片数 |
| `GET /payload` | 完整文章 JSON payload |
| `GET /engine` | xpage.js 注入引擎 |
| `GET /inject-script` | 引擎 + payload 合一（CSP 安全） |

## Hermes 集成

配合 `x-article-publisher` skill 使用。Skill 文件在：
```
~/.hermes/skills/social-media/x-article-publisher/SKILL.md
```

Hermes 里说 "发布到 X" 即可自动调用 `publish-to-x.sh`。

## Markdown 格式

```markdown
---
title: 文章标题          # 可选：为空/占位符时自动取 h1
cover: cover.png        # 可选：封面图片
---

# 标题

**粗体** *斜体* [链接](https://example.com)

![图片](image.png)

- 列表项
- 列表项

> 引用

`行内代码`
```

## 排错

| 现象 | 解决 |
|------|------|
| 📥 按钮不出现 | 确认在 articles/edit 或 compose/articles 页面；刷新扩展 🔄 |
| 点按钮提示「无法连接」 | 确认已运行 `bash publish-to-x.sh` |
| 注入后内容为空 | 等 5 秒再看；检查 DevTools Console |
| 端口被占用 | `lsof -nP -iTCP:8765 -sTCP:LISTEN` 查看，再在对应服务终端按 Ctrl+C |
| 图片准备失败 | 按报错图片序号核对链接、本地文件、网络或防盗链；修复后重新准备副本 |
| 多图载入耗时 | 等待完成提示；导入期间重复点击会被阻止，结束后仍需人工核对 |

## 本地验证

```bash
node check-images.js
bash -n publish-to-x.sh
node --check prepare-article.js
node --check payload.js
node --check shared.js
node --check xarticle-server.js
node --check extension/content.js
node --check xpage.js
```

检查覆盖原文保留、副本不覆盖、标题、独立/默认封面、图片顺序、下载去重、代码示例排除、重定向和错误阻断。
账号实测记录保留在 `work/verification-2026-10-05.md`；本地检查不等于 X 编辑器实测。

## License

MIT — 基于 xPoster 技术。xPoster 源码: https://github.com/nevertoday/xposter (MIT)
