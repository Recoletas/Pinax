# 架构主体收口回执（2026-09-15）

## 结论

本轮不是继续从巨型页面零散减行，而是关闭五类长期 owner 缺口：世界书写入事务、Experience 完整回合、Authoring 书稿激活与检查器切换、Notes 插画交互、ProseEssay 画布持久化。正式数据格式与页面视觉保持不变；兼容 API 保留，但不再拥有第二条写路径。

## 已完成边界

1. **世界书 durable mutation**：create/update/delete、条目增改删和 SillyTavern 导入均返回共享 `{ ok, reason, retryable }`。本体写入成功而索引失败时恢复旧本体、索引和 active 快照；历史 payload/throw API 只解包 durable 结果。
2. **Experience turn coordinator**：准备上下文、provider 流式、工具结果、turn commit、取消、失败回滚和最终保存由 `services/experience/experienceTurnCoordinator.js` 统一编排。`gameStore.generateAIResponse` 只委托，取消控制器不再是 store 的隐含模块状态。
3. **Authoring 激活与 inspector**：`useAuthoringBookActivation` 统一 query 首载、旧章保存与 boundary、换书作用域、世界书同步和首章选择；`openInspectorTool` 统一非 toggle 工具打开、双栏离开、现场草稿清理、详情与 base view。复查时修复了跨工具遗留旧详情和首次现场详情漏记滚动快照。
4. **Notes 插画交互**：pointer capture、拖放/缩放、选中、上下文菜单与布局选择由 `useNotesIllustrationInteraction` 持有，页面保留数据和 DOM 渲染适配。
5. **ProseEssay repository**：cards、edges、outline、timeline、piles、commits、branches 七类键一次保存，部分写入失败恢复原值；页面不再直接排列 storage key。
6. **服务归域与生命周期**：低 fan-in 文件进入 `canvas/`、`experience/`、`worldbook/`；playable intent 进入 `migration/`，未接正式产品的 prompt builder / memory receipt 进入 `experimental/`，`markdownWrap` 因零消费者删除。详细退出条件见 `src/services/README.md`。

## 结构量尺

| 热点 | 本轮前 | 本轮后 | 说明 |
| --- | ---: | ---: | --- |
| `gameStore.js` | 3,656 | 2,990 | 完整 turn 编排迁出 |
| `Authoring.vue` | 12,299 | 12,192 | 激活事务迁出；仍是组合根 |
| `Notes.vue` | 4,405 | 4,263 | 插画交互会话迁出 |
| `ProseEssay.vue` | 4,571 | 4,395 | repository 与死逻辑清理 |
| `src/services/` 根层 JS | 67 | 42 | 只迁低 fan-in，未强搬跨域热点 |

静态 import 审计覆盖 505 个 JS/Vue 文件、1,318 条相对依赖，循环依赖为 0；旧移动路径引用为 0；`experimental/` 仅由两项合同测试引用，没有生产消费者。

## 验证

- 聚焦合同：worldbook、Authoring、inspector、Prose repository、gameStore 共 37/37；迁移旧源码断言后 Authoring scene rail 7/7、UI control 6/6。
- Experience session fault matrix：20/20，包含关闭 AI no-op、重新生成失败回滚与 fresh reload。
- `npm run verify:full`：exit 0；20/20 文件、200/200 用例、lint delta、Vite/VitePress build 与 diff check 全部通过。
- 非阻断存量：lint 仍报告 140 条 warning；Vite 仍提示 Authoring 等大 chunk。本轮没有把 warning 清理或拆包伪装成 owner 重构的一部分。

## 剩余边界

这不是“代码无需再改”，而是架构已从阻塞产品迭代的无主状态进入可持续演进：

- `Authoring.vue` 仍大，但余量以模板、编辑器 DOM adapter 和跨能力接线为主；下一次只随真实功能纵切继续下沉，不再以行数为目标。
- `Experience.vue` 与兼容 runtime 仍重。是否插件化或退役由产品方向决定，不在未完成迁移的名义下盲删真实存档合同。
- 高 fan-in 根服务暂留。只有消费者边界自然收敛且无反向依赖时再移动。
- 未做视觉重排；本轮 UI 相关变动只是现有 inspector 交互 owner 化，需由既有产品旅程继续兜底。
