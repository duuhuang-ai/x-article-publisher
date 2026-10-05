# 独立浏览器扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects that method. Execute task-by-task; keep checkbox status current.

**Goal:** 点击 Chrome 扩展、选择 Markdown 后直接导入新的 X 草稿，无需终端或本地服务。

**Architecture:** 扩展页面读取文件和图片，复用既有 Markdown 解析器及 X 导入引擎。源码保留在根目录，通过打包脚本复制解析器和引擎到扩展；扩展页面调用 Chrome scripting API 写入新草稿。

**Tech Stack:** Chrome MV3、原生 JavaScript、File/Canvas/Fetch、Node 内置 assert/fs/vm。无新依赖。

**Spec:** [STANDALONE-DESIGN.md](STANDALONE-DESIGN.md)

## Global Constraints

- 单张图片必须非空、不超过 16 MiB；远程请求 30 秒超时。
- PNG、JPEG、GIF、WebP；超过 150 KiB 的 PNG/JPEG 尝试 Canvas 压缩，长边不超过 1280、JPEG 质量 0.82，只采用体积更小的结果。
- 动图不转静态图；本地文件夹只读，不能越出所选目录。
- 只申请文章使用的图床域名；拒绝私有网络地址、非图片响应及未经授权的跳转目标。
- 原文只读，现有草稿不覆盖，最终发布始终由用户手动操作。
- 测试材料留在 `work/`；不删除文件，不改凭证、系统配置或数据库结构，不自动 push。

## Review Focus

- 含签名参数的图片地址：保留请求参数，报错时不暴露完整 URL。
- 重复图片、首图作封面、独立封面：保持正文顺序和封面角色。
- 图片 URL 返回 HTML、超过上限或请求挂起：在新建草稿前阻断并报告图片序号。
- 本地附件越界或目录权限失效：停止并提示重新选择文件夹。
- X 未登录、没有创建入口、已有正文或导入期间关闭页面：不覆盖旧草稿，不报告成功。

## Task 1: 浏览器内准备文章和图片

**Files:** 修改 `AGENTS.md`；新增 `extension/article.js`、`package-extension.js`、`check-extension.js`；打包生成 `extension/shared.js` 和 `extension/xpage.js`。根目录源码为唯一修改入口。

**Interfaces:** `window.xArticleFiles.parseArticle(markdown, fileName) -> parsed`；`imageOrigins(parsed) -> string[]`；`buildPayload(parsed, onProgress) -> Promise<payload>`。payload 与根目录 `payload.js` 返回字段一致，交给 `window.__xArticleWrite(payload)`。使用既有 `window.xPosterShared` API。

- [ ] 先更新 AGENTS：扩展独立运行规则、打包副本约定及检查命令；记录用户已确认方案。
- [ ] 写 `check-extension.js`，用 Node vm 加载 shared/article，模拟 Fetch 和本地附件读取；固定断言：文件名标题、代码中伪图片不下载、图片序列 `['A','B','重复 A','本地','cover']`、默认封面角色 `[true,false,false]`。请求参数不丢失，同一源只下载一次。
- [ ] 加入失败断言：HTTP 404、HTML 冒充图片、17 MiB、超时、私有网络地址、未授权跳转、越界路径及失效目录授权均拒绝；data URI 成功。错误文本不能包含模拟签名参数。
- [ ] 运行 `node check-extension.js`，确认新增模块缺失导致失败；实现上述接口后再运行，全部断言通过。
- [ ] 用字节签名验证格式，逐个准备图片，使用既有 `buildPastePlan` 生成 payload。远程 Fetch 不发送 cookies，明确拒绝重定向，错误提示要求提供可直接访问的图片链接；读取过程中限制 16 MiB。压缩失败可用原图，下载失败不能跳过。
- [ ] 打包脚本支持 `node package-extension.js` 和 `node package-extension.js --check`；后者逐字节比对根目录两份源码，失配退出非零。生成副本，运行检查及相关 `node --check`。
- [ ] 仅提交本任务源码、打包文件与检查；不提交用户文章和测试素材。

## Task 2: 扩展入口、授权和新草稿导入

**Files:** 新增 `extension/import.html`、`extension/import.js`；修改 `extension/manifest.json`、`extension/background.js`、`extension/content.js`。HTML 内使用原生表单、可访问标签和状态区域，不使用内联 JS。

**Interfaces:** 后台 `openImporter() -> Promise<tab>`，支持图标点击和 content script 的 `{type:'open-importer'}` 消息。导入页面使用 Task 1 三个 API；`openBlankDraft() -> Promise<tabId>` 创建新标签，等待新空编辑器。随后 `chrome.scripting.executeScript({files:['xpage.js'], world:'MAIN', target:{tabId}})`，再执行 `window.__xArticleWrite(payload)` 并读取真实结果。

- [ ] 扩展图标和 X 浮动按钮都打开独立导入页面。manifest 添加 action，移除必需 localhost 权限，声明可选 HTTP/HTTPS 图床权限，保留 X 权限。
- [ ] 文件选择完成后显示标题和图片数；仅当解析出本地图片时显示附件文件夹选择。目录授权复用 shared 的现有句柄存储，不改存储结构。
- [ ] 点击「导入 X 草稿」时先同步调用 `chrome.permissions.request` 申请 `imageOrigins(parsed)`，再准备图片；拒绝授权停止。按钮在整个任务期间禁用，显示图片准备进度和导入状态。
- [ ] `openBlankDraft` 只操作新建标签中的 X 新文章入口；复用已验证的 create 按钮选择器。最多等待 60 秒；确认 edit URL、新编辑器正文为空后才写入。页失效、没有入口或正文非空必须失败。
- [ ] 真实结果 `ok:true` 才显示完成和草稿链接；失败显示原因和已创建草稿链接，不删除草稿、不自动重试部分写入、不点击发布。
- [ ] 在 `check-extension.js` 用 Chrome API 模拟覆盖：权限拒绝不创建草稿、双击只有一个任务、编辑器非空拒绝、注入失败不能显示成功；为导入模块提供最小 DOM 模拟。运行新增与既有检查。
- [ ] Chrome 重载扩展，先用纯文字文件验证入口和新草稿创建；保留失败证据，再提交本任务文件。

## Task 3: 真实图床文章验证与交付

**Files:** 修改 `README.md`；记录 `work/verification-2026-10-05.md`；同步打包文件；更新本计划状态。

- [ ] 运行 `node package-extension.js --check`、`node check-extension.js`、`node check-editor.js`、`node check-images.js`、改动 JS 的语法检查及 `bash -n publish-to-x.sh`；全部退出 0。
- [ ] 确认 8765 无本地服务；核对原文 SHA-256 `0e22eb09b8568bdf5d78ff72da0a90e71801f6cae21bd89f2653bc88470e0669`。
- [ ] 从安装的扩展图标选择用户指定的「小红书卖教辅教务，6 类产品、4 个案例，把方向讲清楚.md」。由用户完成 Chrome 新图床域名授权，然后导入独立新草稿，不公开发布。
- [ ] 核对 1 封面、13 正文图片、标题、正文顺序及保存状态；刷新后重新读取草稿，复用已有真实编辑器核对方式。原文哈希必须不变。记录 Canvas 压缩和本地附件路径实际验证结果。
- [ ] README 默认操作压缩为：点扩展、选文件、导入、检查后手动发布；注明首次图床授权、本地附件文件夹、失败处理及 X 资格前提。原命令行流程作为排错说明保留。
- [ ] 完成本地提交，汇报实测范围和仍存在的限制；如果要同步本轮修改到 GitHub，按 AGENTS 单独取得 push 授权后再执行。

## 执行选择

建议在本会话直接实现，完成后一次独立审查；三个任务依赖同一份 payload 和引擎，拆成多个实现代理不会减少关键联调工作。备选为逐任务分代理实现和审查。实施前等待用户审阅计划并选择。
