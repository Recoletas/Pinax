# pinax-adapter（已退役 · runtime 迁入 storyflow-kit）

> **2026-10-06 起（agent 口径统一 P2）本包不再是运行时。** pi-agent 任务面（agent 循环、工具环、
> BeatPlan、任务存储、SSE 服务面、provider 绑定）整体迁入 kit 仓库：
> `storyflow-kit/storyharness/src/pinax/`（canonical）。
>
> - 启动：`cd storyflow-kit/storyharness && npm run serve:pinax`
>   （配置面不变：`PINAX_ADAPTER_CONFIG` 或 `<storyharness>/.external/pinax-adapter.json`，默认 `127.0.0.1:8451`）
> - Pinax 服务端 `/api/storyagent` 代理目标不变（`PINAX_ADAPTER_ENDPOINT`，默认 loopback 8451）；
>   `server/services/storyAgentRuntime.js` 会在 kit 仓在场时自动拉起 kit 任务面，不可达时回落原生链。
> - 本目录保留 `.external/pinax-adapter.json`（gitignored，dots 等凭据仍住这里，经 env 传给 kit 进程）
>   与 `.gitignore`。测试随运行时迁至 `storyflow-kit/storyharness/test/pinax-*.test.ts`。
