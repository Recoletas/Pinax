# Window F Prompt - Claude Code - Integration And Acceptance

这是串行集成窗口。只有 A-E 都完成、自审且成果已合并到同一集成分支后才能开始。你的任务是做最小接线、解决边界问题、压缩测试并完成最终验收；不要推翻各窗口底层实现。

开始前：

1. 阅读 `AGENTS.md`、`docs/STATUS.md`、非空时的 `LOCAL.md`。
2. 阅读执行包 README 和 `result-a` 到 `result-e`；如任一结果文件缺失，先检查对应 diff，不凭猜测重写。
3. 阅读主路线图 G4.2/G4.3/G4.5、Gate 5。
4. 在集成分支工作，建议 `feature/online-agents-canvas-video-integration`。不启动用户的 dev server。

本窗口任务：

## 1. 服务端接线

- 在 A 改造后的 `server/index.js` 注册 E 的 `/api/media` router，不破坏 `/ws/rooms` upgrade。
- 确保 HTTP server、WS heartbeat、media job runner 在测试和进程退出时可清理。
- 不把 provider secret 暴露给浏览器。

## 2. 联机体验接线

- 在 `Experience.vue` 只增加一层 session adapter 接入，不重构单机体验逻辑。
- host 收到 `narrative.requested` 后才调用现有生成链一次；生成文本完成后提交 `narrative.completed`，其他成员只消费权威结果，不能各自调用 LLM。
- 运行时 patch 先作为候选，host 接受后广播 `runtime.patch.accepted`，再调用现有本地 runtime 更新入口。
- 对话选项由已有 LLM 结果进入 `action.proposed`/`action.selected`，不能退回固定预设。
- 联机通知必须在正文完成后出现，点击通知再展开细节，沿用现有体验交互规则。
- 单机 `/experience` 行为保持不变；在线页进程重启丢房间时能退回重连/重新加入状态。

## 3. 分镜视频接线

- 在 `useDirector.js` 增加从“已确认分镜版本/镜头”构造 GenerationJob input 的纯 helper，带 sourceRefs、prompt、比例、时长、参考图和版本指纹。
- 在 `ProseEssay.vue` 现有分镜区加入一个紧凑的视频任务入口和状态列表：选择模型/配置、提交、进度、重试、取消、失败原因、完成结果。
- 不增加新抽屉；沿用当前副工作台/分镜信息架构，按钮数量克制。
- 完成输出归档到现有 MediaAsset/生成历史，并保存 job/provider/storyboard version sourceRefs；旧版本变化后标记视频任务来源 stale，不自动删除结果。
- provider 未配置、能力不支持 reference image/duration 时给出明确且局部的提示。

## 4. Agent 页面接线检查

- 验证 Writing、Experience、ProseEssay 的现有 Advisor 入口仍能运行且使用 C 的兼容层。
- 只修复实际兼容问题，不在本窗口统一三个页面 UI，也不强行把 OpenClaw/copilot/director 合成一个组件。
- 补一条后续迁移记录：哪些页面 quick action 仍应迁入 registry。

## 5. 测试收口

- 当前硬上限是 200。统计 A-E 新增测试，把高价值契约测试合并进现有 media/integration 测试，删除等量低价值重复 UI/source-regex 断言，最终不得超过 200。
- 至少保留：RoomEvent seq/幂等、host 权限、重连；Agent context budget/stale；canvas geometry；GenerationJob 状态机/adapter normalization；一条联机+视频 mock 集成 smoke。
- 不通过删除失败测试来掩盖行为回归。

最终验证：

1. 运行与改动相关的定向测试。
2. 运行 `npm run verify:full`。
3. 运行 `git diff --check`。
4. 核对最终测试总数 `<= 200`。
5. 不启动 dev server；如无法做真实浏览器/真实 provider 验证，明确记录为用户 smoke 项，而不是声称已验证。

文档与交付：

- 更新 `docs/STATUS.md`、`docs/PLAN.md`、主路线图对应 Gate 和 `docs/LOG.md`，只记录真实完成项。
- 更新 `docs/agent-runs/current.md`，把 A-F 状态和结果链接写清楚。
- 写 `docs/agent-runs/2026-07-16-online-agents-canvas-video/result-f-integration.md`，列出最终行为、测试、未验证项、已知限制和用户 smoke 步骤。
- 按项目 skills 做 `ui-style-check`、`testing-verification`、`docs-status-handoff`；准备提交时再用 `commit-conventions`。
- 自审并修复后，如在独立 worktree，创建一个 scoped commit；不要调用 Codex 作为子代理。
