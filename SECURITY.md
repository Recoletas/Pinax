# 安全政策

## 支持版本

当前处于 Public Alpha 准备阶段，仅 `main` 分支接收安全修复。

## 报告内容

欢迎报告：

- 凭据或隐私数据泄露路径（如诊断导出、日志、备份中包含密钥或书稿正文）；
- 服务端（`server/`）与 WebSocket 接口的越权、注入、路径穿越；
- Electron/桌面端打包面的本地提权或任意代码执行；
- 依赖中的已知漏洞（附 CVE/ advisory 编号）。

## 如何报告

**截至本文件编写时（2026-09-14），本仓库的 GitHub 私密漏洞报告（Private vulnerability
reporting）尚未确认启用，维护者邮箱也未公开。** 因此当前尚无已存在的私密报告渠道——
这是公开前必须完成的一项设置，不应被本文件的存在所掩盖。

报告渠道按以下顺序生效（维护者操作清单，公开前逐项完成）：

1. 在 GitHub 仓库 Settings → Code security → 启用 **Private vulnerability reporting**；
2. 或在 SECURITY.md 与 README 公示一个维护邮箱后替换本节。

在渠道生效前，请不要在公开 issue 中描述可被利用的细节。

## 报告时请不要包含

- 真实 API Key 或 `server/.env` 内容（用 `***` 占位）；
- 私人书稿数据。

## 处理预期

- 确认收到：渠道建立后 7 天内；
- 修复或缓解计划：确认后 30 天内（Alpha 阶段尽力而为，无 SLA）；
- 修复发布后会在 release note 中致谢（除非你希望匿名）。
