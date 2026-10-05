# x-article-publisher 项目约定

## 目标与边界
- 在上游 Chrome 扩展基础上，将 Markdown 导入 X Articles 草稿；最终发布由用户手动操作。
- 默认独立扩展在浏览器内读取 Markdown、下载图床图片并导入新草稿；原文只读。命令行方式继续采用发布副本。
- 优先复用已有代码与 Node 内置能力，不引入全局依赖。

## 目录与命名
- 根目录：源码、使用说明、项目规范及最小可运行检查。
- `extension/`：Chrome 扩展源码。`shared.js` 与 `xpage.js` 为根目录源码的打包副本，禁止直接修改；用 `node package-extension.js` 同步。
- `.superpowers/sdd/`：按计划名称隔离的执行记录与审查材料，Git 忽略；保留到用户确认清理。
- `work/`：临时文章、下载图片、本地 payload、服务日志和验证记录；全部忽略，不进入 Git。
- 每次准备文章使用 `work/<日期>-<文章名>/`，不覆盖已有副本；验证记录用 `verification-<日期>.md`。
- 新建其他目录前先在本文件说明用途。临时文件保留到用户确认清理，不自动删除。

## 操作纪律
- 改动前读相关源码和调用方，最小范围修复，图片下载失败必须报错。
- 不直接改用户知识库，不记录账号凭证，不替用户发布文章。
- 启动服务前检查 8765 端口；不使用全局 `pkill` 终止未知服务。
- 删除、修改密钥或 .env / CI/CD、数据库迁移、push / rebase / reset --hard、全局安装、系统配置和公开发布都须先询问用户。
- 本次 Fork 已获授权；2026-10-05 用户已明确授权将本地修复提交并同步到 `origin/main`。后续其他 Git push 仍需单独授权。
- 2026-10-05 图片注入修复方案已获确认：允许用新测试草稿定位及修复共用上传流程，优先原生插入，逐张验证，正文稳定后处理封面；不重写整个引擎。
- 2026-10-05 用户已确认 STANDALONE-DESIGN.md 和 STANDALONE-PLAN.md，允许独立扩展改造和新草稿实测；不公开发布，本轮 push 仍单独确认。

## 验证
- 原版纯文字导入与改造后真实图文导入分开记录；本地测试不能替代 X 账号实测。
- Shell 改动运行 `bash -n publish-to-x.sh`。
- JavaScript 改动运行对应文件的 `node --check`。
- 图片保存门槛保留 Node vm 最小回归检查：`node check-editor.js`。
- 图床逻辑保留一个使用本地 HTTP 测试服务的可运行检查：`node check-images.js`。测试素材保留在 `work/`，不自动清理。
- 独立扩展改动运行 `node package-extension.js --check` 与 `node check-extension.js`。
- README 默认说明扩展选择文件、图床授权、导入草稿和失败处理；命令行流程作为排错方式保留。
