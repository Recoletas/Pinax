# 2026-09-18 今日整合与 CI 修复

用户要求整合今天工作、提交推送，并修正之前失败的 CI。此次只整合当前 main 已验收改动，未合并任何其他工作分支；运行时夜间扩量计划仍待执行。

## 失败证据与修复

- GitHub run `35207175697`（`c445dd4`）与 `35112343341`：build/test 成功，authoring-smoke 在无密钥作者旅程失败。更早 `35111095329` 另有 whitespace gate 失败。
- 本地复现：`scripts/ci/authoring-smoke.mjs` 等待已不存在的“从一句话开始”标题，30 秒超时。改为已有的 `welcome-start-authoring` 入口合同；备份按钮同步当前名称，并限定在首页侧栏，避免两个同名按钮的 strict-mode 歧义。
- 完整 ZIP smoke 同步备份入口。没有删断言、关闭网络守卫、增加重试掩盖失败或放宽测试预算。
- CI 浏览器旅程拆成独立 matrix，`fail-fast: false`，一个失败不再跳过另一个；失败附件按旅程分别上传。
- CI 加入测试预算 reporter 与文档构建，test/build 增加超时，权限设为 contents:read；空树基准改成两点 diff（树不能用于三点 merge-base）。

## 本轮实跑

- `npm run verify:full` exit 0：20/20 文件、200/200 用例、lint 零警告、应用/文档双 build、架构与 diff 通过。
- `npm run ci:authoring-smoke` exit 0：无密钥首页、低敏诊断、GB18030 导入、改章名、刷新持久化及网络守卫通过。
- `npm run ci:workspace-backup-smoke` exit 0：合成数据 ZIP 导出/恢复、来源/媒体核对、幂等恢复、IndexedDB 写入故障保护通过。只操作独立浏览器合成数据。
- `node scripts/settings-sources-journey.mjs` exit 0：9/9，包括按书隔离、上传持久化、直达/刷新/返回、原文、删除和三尺寸。
- CI YAML 解析及 `git diff --check origin/main` exit 0。

UI 与资料页整合提交 `f79d2fe`；CI 修复独立提交；文档计划与历史回执单独提交。此次推送会包含 main 之前已验收但尚未推送的 21 个提交，不重写或 squash 既有合并历史。远端 CI 结果以推送后的 GitHub run 为准，本地通过不冒充远端成功；无部署、无真实模型调用。

## 推送后复验与追加修复

`4ce5652` 已推送，run `35360932829` 的 test/build/authoring 成功，单独启用的 workspace-backup 约 62 秒失败且无附件。匿名日志 API 返回 403，不能把推断写成已读到的远端报错。源码确认其探测 IPv4、Vite 未显式绑定 host，存在 localhost 地址族差异；追加固定 `--host 127.0.0.1`，并对齐 CI Chromium 启动参数、补齐启动与旅程失败日志。`CI=true npm run ci:workspace-backup-smoke` 本地完整旅程 exit 0。追加提交后继续监看远端，不重写已推送历史。
