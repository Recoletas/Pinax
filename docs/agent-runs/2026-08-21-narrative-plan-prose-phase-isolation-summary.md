# 体验叙事规划/正文阶段隔离执行总结

## 范围

- Worktree：`/tmp/pinax-narrative-phase-isolation`
- Branch：`feature/narrative-phase-isolation`
- Base：`e85a9de`
- 设计：`docs/superpowers/specs/2026-08-21-narrative-plan-prose-phase-isolation-design.md`
- 计划：`docs/superpowers/plans/2026-08-21-narrative-plan-prose-phase-isolation.md`

## 根因

旧实现让 BeatPlan 规划、资料查询与正文写作共享一份 transcript。正文请求因此持续携带规划工具名、tool-call/tool-result、修复消息和“计划已确认/自然停下”等控制语言，模型会把这些高频词仿写进可见故事。最终文本清洗无法可靠解决这类上下文污染。

## 完成内容

- open/respond/advance 先运行独立 planner transcript，只声明 `submit_narrative_beat_plan`。
- 按 OpenAI Chat、OpenAI Responses、Anthropic/MiniMax 协议发送 specific tool choice，并关闭并行工具调用。
- 修复 Anthropic adapter 在 `parallelToolCalls=false` 时覆盖 specific tool choice 的问题；现在保留工具名并附加 `disable_parallel_tool_use`。
- OpenAI Chat 与 Responses 在规划请求体中显式发送 `parallel_tool_calls: false`，不再把禁并行仅表示为字段缺省。
- BeatPlan 成功后创建全新 prose transcript；规划调用、结果、修复消息和工具定义不会进入正文请求或返回的 `baseMessages`。
- 正文阶段只声明只读资料工具，既有 world→politics 门禁、grounding、资料预算、重复调用防护和补全链保持。
- 场景约束保留回应义务、因果步骤、角色动作、功能细节、落地变化、避免重复和目标长度。
- `endCondition` 改为最后一个可观察场景状态；显式“故事结束/等待玩家或下一步/留待后续”返回 `NARRATIVE_BEAT_PLAN_END_META`。
- 补全提示和行文契约不再使用“叙事拍计划/写到结束条件/自然停下”等元叙事措辞。
- 正常路径仍是一次规划请求加一次正文请求；没有新增默认重写、critic 或最终文本正则清洗。

## 回归覆盖

- planner 首请求只含唯一 BeatPlan 工具，并使用协议匹配的 specific tool choice。
- 所有 prose 请求和 `baseMessages` 均不含规划工具名或规划历史。
- planner 内一次 typed repair 不污染 prose transcript。
- planner 与 prose 各有独立一次 repair 预算；正文越权返回 BeatPlan 会在执行前以 `NARRATIVE_TOOL_NOT_DECLARED` 拒绝，且不会写进 prose transcript。
- Anthropic capability 降级仍保留 specific tool choice。
- 元叙事结束条件拒绝、场景内状态通过。
- usage、totalCalls、toolRounds、phase trace、资料查询、预算耗尽、补全、memory evidence 和 seed-world init 口径保持。

## 验证

- TDD RED：旧首请求同时声明 `world_lookup`、`geo_lookup` 与 BeatPlan；Anthropic 禁并行分支把 forced tool 覆盖为 auto。
- `npm run test:run -- src/__tests__/agentContracts.test.js src/__tests__/gameStoreSession.test.js`：2 files / 24 tests，exit 0。
- `npm run smoke:narrative-recovery`：3 checks passed，exit 0。
- `npm run smoke:narrative-production -- --dry-run`：60 项矩阵构建成功，exit 0。
- `npm run verify:full`：25 files / 436 tests；Vite build、`git diff --check`、VitePress build 均通过，exit 0。
- 独立代码审查首轮提出正文越权工具、OpenAI wire-level 禁并行和双修复预算三项问题；修复并复核后 Critical/Important 均为 0，结论 Ready: Yes。
- 定向 ESLint 命中仓库既有的 6 errors / 2 warnings（大测试文件中的 `vi` 全局、旧正则转义及旧未使用参数）；本次新增的 server/shared 文件未新增 lint 报错。项目完成门禁不包含全量 lint。

## 未执行

- 未启动或重启开发服务，遵守共享状态中的工作规则。
- 未执行真实 provider 浏览器矩阵：现有 runner 需要运行中的前端和 provider JSON 配置，不直接消费 `server/.env`；本次没有把 60 轮真实矩阵扩大为完成门禁。
- 未增加人工评分，当前问题由请求边界与契约回归直接验证。
