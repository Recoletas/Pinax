# 已知问题与当前限制

> 用来区分新回归、已知缺口和已接受限制。纯 backlog 不放这里。

## 状态约定

- 🔴 **活跃问题**：当前正在处理或会影响近期验收。
- 🟡 **已知缺口**：暂不阻断，但后续工作必须看见。
- 🟢 **稳定限制**：已接受的边界，不按 bug 处理。

## 活跃问题

### 地理-历史生产闭环

- ✅ 2026-07-15：地图页已能消费一次完整地图结果，经过 `extractMapSemantics()` 和 `generateGeoHistory()` 生成可审阅草案，并在用户确认后写入当前世界书的 `geoHistory`。
- 🟡 当前仍是“整份草案确认”，地图语义点逐项审阅和地点实体从事件日志 / 设定页反向进入地图尚未完成；运行时侧已用统一 `placeId` 索引地图引用、历史节点和世界书条目。
- ✅ 2026-07-15：历史开局写入 `historyNode / placeId`；剧情日志形成后会以稳定 ID 写回 `geoHistory.playerNodes`，并保存有限世界状态快照与审计事件；GM 上下文通过 `PlaceEntity` 按当前地点筛选历史节点和玩家经历。
- 🟡 仍未完成受控世界状态变化、因果追踪和真实浏览器 smoke；当前写回是“日志形成即自动追加”，尚无用户确认式 state delta。
- 计划入口：[Pinax 产品整合与演进主计划 Gate 3](../plan/pinax-integrated-product-roadmap.md#gate-3历史融入与可解释涌现)。

### 地图生成可靠性压力验证

- 🟡 常规连续生成已有 pending config、临时 Canvas 和“成功后替换旧图”保护，不再把普通重复点击描述为必然卡死。
- ✅ 2026-07-15：`worker-bridge.ts` 超时后会终止当前 Worker，并确保下一次请求创建新 Worker；9 个 Worker bridge 契约测试覆盖超时销毁和超时后恢复。
- 🟡 尚未完成真实浏览器中的 20 次连续 regenerate、RAF/timer 计数和 heap 回落验证；这属于后续压力验收，不是当前已确认的普遍卡死根因。
- 计划入口：[Pinax 产品整合与演进主计划 Gate 0](../plan/pinax-integrated-product-roadmap.md#gate-0冻结基线与可靠性止血)。

### 地图引擎视觉残留

- 🔴 Round 2 后仍有地形真实感残留问题。
- 已改善：`landRatio=0.45` 视觉快照回到约 `0.43-0.44`，模板选择和主世界 RNG 已隔离。
- 仍需关注：模板后处理重复 FBM / `softenMapEdges` 风险、`reshapeCoasts` 大轮廓重塑不足、部分模板合同仍是 soft-fail 诊断。
- 处理边界：先做 Round 2.1 小修，不扩大到 UI / 国家 / 城市逻辑。

### 产品整合收口

- 🔴 现有工作区仍有功能并列、来源引用不统一和页面级组件过大的问题；当前事实入口统一为 [PLAN.md](../PLAN.md) 与 [Pinax 产品整合与演进主计划](../plan/pinax-integrated-product-roadmap.md)。

### 漫画生产工作台仍未形成闭环

- 🔴 当前漫画页已经直接具备格框、景别/机位/透视、制作阶段和视觉圣经字段，但用户能操作的仍主要是固定 4/6 格编辑器，尚无多页改编、自由格框画布、真实 rough/line/color 阶段、可编辑气泡和连续性质检工作台。
- 下一步直接在当前漫画页执行 M2 的改编分页与视觉圣经，再进入 M3 中央分镜画布，不增加单独迁移层。
- 计划入口：[Pinax 产品整合与演进主计划 G4.4](../plan/pinax-integrated-product-roadmap.md#g44-素材插画与漫画工作流)。

## 已知缺口

- 🟡 `moveCostForEdge` 已有 biome 缺省值兜底，但 caller 仍应避免传未声明 biome。
- 🟡 states 阶段性能仍有残留问题，见 [states-perf-residual-issue.md](../plan/states-perf-residual-issue.md)。
- 🟡 多页面仍有 `height: 100vh + overflow: hidden + fixed 浮层` 的组合风险，移动端和低分辨率下需要继续看遮挡、滚动锁死和热区重叠。
- 🟡 页面级断点策略仍不完全一致。
- 🟡 存储安全网已完成导出侧动态键发现、`schemaVersion` 和无副作用恢复预览；实际恢复写入、损坏备份不覆盖、配额失败提示仍未落地。

## 稳定限制

- 🟢 地图管线不追求 100% 复现 Azgaar；目标是保留模板语义并提升本项目视觉真实感。
- 🟢 离线程地图生成通过 comlink 桥接，worker 边界需要 strip Vue reactive proxy。
- 🟢 VitePress 文档站入口为 `docs/src/index.md`；不要提交 `.vitepress/cache/` 或 `.vitepress/dist/`。
- 🟢 公开 API 详细说明不维护；当前文档层只记录仓库事实、风险和决策。

## 验证提示

地图、备份、存储和地理历史定向测试当前通过；全量测试已恢复通过。地图模板软合同和 jsdom/canvas 输出仍是非阻断诊断；以 [test-status.md](./test-status.md) 的当前验证结果为准。
