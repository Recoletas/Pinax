# CI 本地化作者旅程修复 · 2026-09-22

远端 CI #131（`main@0b5c60f`）的 test/build/workspace-backup 完成，`authoring-smoke (authoring)` exit 1。公开注解只给出失败步骤；本地按 CI 环境复现得到两项原因：脚本等待已不存在的“内测遇到问题？”文案，且英文适配后全新 `en-US` 浏览器会显示英文界面，中文选择器无法命中。

修复保持产品行为不变：中文基准旅程显式使用 `zh-CN` 浏览器上下文；诊断区等待和点击复用现有 `data-test="beta-diagnostic-export"`，不再绑定营销/帮助文案。英文界面仍由独立英文旅程覆盖。

验证：

- `CI=1 node scripts/ci/authoring-smoke.mjs`：exit 0；诊断导出、GB18030 导入、章名编辑、刷新持久化、0 未放行外发。
- `BACKUP_CHECK_OUT_DIR=/tmp/pinax-prepush-workspace-backup npm run ci:workspace-backup-smoke`：exit 0；ZIP 下载、清空恢复、幂等和 IndexedDB 写失败保护通过。
- `npm run verify:full`：exit 0；20/20 文件、200/200 用例、lint 0 error、Web/VitePress build、Authoring 体积与结构、diff check 通过。

测试仅使用合成稿件和隔离浏览器，不读取用户数据、不调用模型。GitHub 的 Node 20/runner 迁移注解是警告，不是本次失败原因。
