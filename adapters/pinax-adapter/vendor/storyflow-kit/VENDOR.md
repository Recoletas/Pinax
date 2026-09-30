# vendor/storyflow-kit — 来源快照（仅供 PR 验证，不参与构建）

本目录是 [skkbsgzf/storyflow](https://github.com/skkbsgzf/storyflow)（StoryFlow / StoryHarness 运行时内核，MIT）在
提交 `88532b15`（main，2026-09-30）的**只读快照**，随本分支一同提交，供 Pinax 侧审核者
核对 `../src/` 适配层声明的镜像关系，不需要在本仓构建或运行。

## 快照范围

| 目录 | 内容 | 适配层引用点 |
|---|---|---|
| `core/` | flow@3 编排内核、预算（budget.ts）、协议守护、kits | `src/runner.ts` 预算守护注释「镜像 Pinax NARRATIVE_AGENT_RUNTIME_LIMITS」的双侧对照 |
| `storyharness/` | harness 服务层（config.ts / llm.ts / executor 等） | `src/config.ts`「口径与 storyharness/config.ts 一致」、`src/runner.ts`「与 storyharness/src/llm.ts 同口径」 |
| `contracts/` | 协议面定义 | 与 Pinax `shared/narrativeAgentContract.js` 的对照 |

已剔除：`node_modules/`、`dist/`、桌面壳（desktop/）、cali/、packs/、项目数据——它们与本 PR 无关。

## 为什么 vendor 而不是引用

适配器运行时只依赖 npm 包 `@earendil-works/pi-agent-core` + `pi-ai`（0.87.1，MIT），
**不依赖本目录**。vendor 是应审核要求提供的对照材料：核对本 PR 适配层声称的
预算口径、工具环语义、超时/取消行为在 kit 源码里的对应实现。上游后续演进以
storyflow 仓为准，本快照不跟随更新（升级 = 换 npm 包版本 + 重出快照，单独 PR）。

## 许可

MIT License，Copyright (c) 2026 skkbsgzf (StoryFlow)，见 [LICENSE](./LICENSE)。
