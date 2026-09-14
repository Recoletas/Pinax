# 贡献指南

感谢关注 Pinax——一个本地优先的中文小说创作工作台（统一写作、设定世界书、推演与素材管理）。

当前许可证为 **PolyForm Noncommercial**（见 [LICENSE](./LICENSE)）：非商业用途下可自由使用、修改与再分发。
许可证对照与未来选项见 [docs/engineering/public-alpha-license-notes.md](./docs/engineering/public-alpha-license-notes.md)。

## 开始之前

- 环境：Node 22（≥22.13，仓库带 `.nvmrc`）与 npm；运行 `npm run doctor` 可自检。
- 安装：`npm ci`；本地开发：`npm run dev`（前端）+ `npm run server`（后端，可选）。
  前端 dev 代理默认指向 `127.0.0.1:3001`，可用 `PINAX_DEV_BACKEND_ORIGIN` 指向其他后端。
- 不配置任何模型密钥也可以开发与验证大部分功能（写作、导入、备份均为本地能力）。

## 提交修改前想清楚五件事

一份好的修改说明回答这五个问题（也适用于 issue 描述）：

1. **解决的作者任务**：写作者在哪个环节遇到什么问题？（而不是"我改了某个文件"）
2. **入口**：从哪个页面/命令进入该行为？给出可复现的点击路径或命令。
3. **读取资料**：功能读哪些数据（书稿、世界书、素材库、模型配置）？
4. **临时/正式写入**：改了哪些持久化数据？哪些是会话内临时状态，哪些落盘？
5. **验证范围**：跑了哪些检查（见下节），覆盖了什么、没覆盖什么。

## 验证范围

按改动类型选择，PR 中说明实际跑了哪些：

| 改动 | 最低验证 |
|---|---|
| 任何代码 | `npm run test:run`（Vitest）+ `npm run lint:delta` |
| 构建/依赖/配置 | `npm run build` + 干净 clone 的 `npm ci` |
| 文档 | `npm run docs:build`（注意：仓库允许 dead links，请自行点开新改的链接） |
| UI 交互 | 附**前后对比截图**（1440 宽 + 至少一个窄屏/深色状态） |
| 模型相关功能 | **分开报告** mock 验证与真实模型样本；标注用的 provider 与提示词结构 |

提交前完整门禁：`npm run verify:full`（预算内全量测试、lint 差分、Vite 构建、diff 检查、VitePress 构建）。

## 数据边界（提交 issue/PR 时同样适用）

**不要**上传或粘贴：

- 私人书稿正文、书名、章节名（截图请用合成稿件，如"示例章节"）；
- API Key、`server/.env` 内容（报错时把密钥值替换为 `***`）；
- 全量浏览器 localStorage dump 或诊断文件原文（诊断导出本身已做低敏设计，但仍请审查后仅粘贴相关字段）。

Issue 里的复现步骤用最小合成数据描述即可。

## 代码定位

- [代码库地图](./docs/src/code-map.md)：各用户链路的入口文件与负责人路径。
- [开发规范](./docs/engineering/development-standards.md) 与 [第三方来源登记](./THIRD_PARTY_NOTICES.md)：
  引入新依赖或参考外部代码时必须登记来源与许可证。

## 提交约定

- Commit message：`<type>(<scope>): <subject>`（type: feat/fix/refactor/docs/test/chore/style/perf）。
- 一个功能一个 commit（完成后 squash 中间检查点）。
- PR 描述请包含：作者任务、验证范围、截图（UI 改动）、数据写入说明。
