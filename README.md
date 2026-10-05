# X Article Publisher

Chrome 扩展把 Markdown 的标题、封面、正文和图片导入 X Articles 草稿。支持图床链接，日常使用无需终端、Node、本地服务或官方 X API Key。最后发布由你手动操作。

正文使用 X 页面内的 Draft.js 编辑器，图片走原生粘贴和封面上传；标题沿用 X 内部 GraphQL。核心解析器和编辑器技术来自 [xPoster](https://github.com/nevertoday/xposter)（MIT）。

## 安装或更新

1. 下载本仓库，保留完整 `extension/` 目录。
2. Chrome 打开 `chrome://extensions`，开启开发者模式，选择「加载已解压的扩展程序」，选 `extension/`。
3. 把 **Hermes X Publisher** 固定到工具栏。更新文件后，在管理页点这个扩展的「重新加载」。

扩展目录已包含所需代码，无需 `npm install` 或构建。需要已登录 X，且账号具有 Articles 编辑资格。

## 使用

1. 点 Chrome 工具栏的扩展图标。
2. 在导入页面选择一篇 `.md` 文件。
3. 点「导入 X 草稿」。首次使用图床时，允许 Chrome 访问该图床域名。
4. 等待「导入完成」，检查新草稿的标题、封面、正文和图片，再在 X 手动发布。

导入期间保持导入页面和 X 页面打开，等待完成后再编辑。扩展只写入它新建的草稿，不覆盖原有文章。X 编辑器右下角「📥 选择 Markdown」也是同一入口。

### 图床和本地图片

- 图床图片直接使用 `![说明](https://图床/图片.png)`；链接需要无需登录、能够直接下载。浏览器只向文章实际使用的图床申请权限，不发送图床 cookies；不支持重定向链接，拒绝 localhost 和直接写出的私有 IP 地址；不做 DNS 地址隔离。
- 支持 PNG/JPEG/GIF/WebP，检查实际格式；单张非空、不超过 16 MiB，请求 30 秒超时。任何图片失败都会停止，提示图片序号，避免漏图。
- 重复链接只下载一次，正文中重复出现的位置仍保留。
- 较大的 PNG/JPEG 在浏览器内压缩到最长边不超过 1280，JPEG 质量 0.82；体积没有减少时用原图。GIF/WebP 不转成静态图。原文件不修改。
- 含本地图片时，额外点「选择附件文件夹」，授权只读。按 Markdown 的相对路径能找到图片即可：通常选择 Markdown 所在文件夹，或用于 `attachments/图片.png` 的 Obsidian 根目录。不能越出所选文件夹，绝对路径需要改为文件夹内相对路径。
- 原始 Markdown、Obsidian 原文和图床保持不变。文章及图片在浏览器内准备，只上传到你登录的 X 草稿。

### 标题、封面和排版

- 优先取 frontmatter `title:`，其次第一个 H1；两者都没有时使用 Markdown 文件名。
- 可用 frontmatter `cover:` 指定独立封面；默认第一张图片作为封面，并从正文移除。正文稳定后再上传封面，自动应用 X 的默认 5:2 裁剪，之后可手动调整。
- 正文图片逐张等待上传和 X 自动保存，再继续下一张。失败保留未完成草稿供检查，不自动重试部分导入。
- Markdown 表格沿用上游转换为文本；X 保存后 H3/H4 以及表格代码块可能变成普通段落。暂不提供原生表格转换。

```markdown
---
title: 文章标题
cover: https://图床/封面.png
---

## 小标题

**粗体**、*斜体*和[链接](https://example.com)

![正文图片](https://图床/正文.png)
```

## 排错

| 现象 | 处理 |
| --- | --- |
| 点图标仍打开 localhost | 在 Chrome 扩展管理页重新加载，确认版本 2.1.0 |
| 图床授权被拒绝 | 再点导入，允许该图床域名；不需要授权全部网站 |
| 图片下载失败 | 按图片序号检查网络、防盗链、登录要求、重定向或链接失效；提供直接图片链接 |
| 本地图片读取失败 | 重新选择正确文件夹并允许读取，检查相对路径；不能使用越界或绝对路径 |
| 找不到新的编辑器 | 检查 X 登录状态、Articles 资格和网络；没有创建入口时不会继续写入 |
| 图片导入过程中失败 | 先打开已保留草稿检查；再次导入会新建另一份草稿 |
| 多图导入较慢 | 等待完成提示，导入期间保持两个页面打开并避免编辑 X 草稿 |

## 开发和旧命令行工具

根目录 `shared.js`、`xpage.js` 是解析器和引擎源码。修改后运行 `node package-extension.js`，生成扩展中的副本；不要直接修改副本。扩展入口是 `extension/import.html`，图片准备在 `article.js`，Chrome 授权和导入在 `import.js`。

旧 `prepare-article.js`、`payload.js`、`xarticle-server.js` 和 `publish-to-x.sh` 保留供本地排错；扩展 2.1.0 已不连接 localhost，旧服务中的扩展自动触发按钮不适用。

```bash
node prepare-article.js "/absolute/path/文章.md"
# 输出 work/<日期>-<文章名>-<随机标识>/article.md
node xarticle-server.js "/absolute/path/to/副本目录/article.md"
# 可查看 http://localhost:8765/payload；Ctrl+C 停止服务
```

Chrome 扩展版本为 **2.1.0**；`package.json` 的 **4.1.0** 是保留的旧命令行工具版本，两者分别记录在 [CHANGELOG](CHANGELOG.md)。`setup.sh` 仅辅助显示安装步骤，Node 检查不影响扩展安装。

命令行工具需要 Node.js ≥ 18，图床副本只写 `work/`。可选 `auto-publish.js` 仍依赖 `playwright-core`，未纳入独立扩展验收范围。旧 Dashboard 的手动脚本入口与默认扩展流程分开保留。

## 验证

```bash
node package-extension.js --check
node check-extension.js
node check-editor.js
node check-images.js
bash -n publish-to-x.sh setup.sh
```

JavaScript 改动还需运行对应文件的 `node --check`。最小检查覆盖图片顺序、封面、去重、大小/格式/地址校验、下载失败阻断和导入保护。2026-10-05 已通过真实账号验证：纯文字、图床文章（1 封面、13 正文图，刷新后完整）、本地附件及独立封面；只创建草稿，未公开发布。真实账号记录保留在被 Git 忽略的 `work/verification-2026-10-05.md`；本地检查不能替代 X 实测。

## License

MIT。上游：[xPoster](https://github.com/nevertoday/xposter)、[punk2898/x-article-publisher](https://github.com/punk2898/x-article-publisher)。
