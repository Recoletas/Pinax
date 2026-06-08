# 已知问题与当前限制

> 这一页让人和 agent 能区分"新回归"与"已接受的缺口"。
> 每一条都应该能让诊断或验证路径发生变化；纯 backlog 项放 GitHub issues。

## 状态约定

- 🟢 **稳定** —— 已知行为，不会在当前规划内改变
- 🟡 **已知缺口** —— 不修但要看见；可能被未来的工作覆盖
- 🔴 **活跃问题** —— 当前正在被解决或在轮转中

## 当前活跃

### 地图引擎

- 🔴 **Round 2 后地形仍有视觉残留 bug**：
  - 已落地：`a72015d`（Round 1）、`8bee5a0`（Round 1.5）、`16e4aff`（Round 2）。
  - 当前已改善：`landRatio=0.45` 的视觉快照回到约 `0.43-0.44`；模板选择和主世界 RNG 已隔离。
  - 仍需修：`generateHeightmap` 中模板后处理存在重复 FBM / `softenMapEdges` 风险；`reshapeCoasts` 对海岸大轮廓重塑力度不足；“14 模板硬合同”测试仍包含 soft-fail 记录而非全硬断言；反轴向偏移使用正向偏移 + wrap，可能制造跨边界不自然陆块。
  - 下一步：先做 Round 2.1 小修，不继续扩大 UI / 国家 / 城市逻辑范围。

- 🟡 **`moveCostForEdge` biome 缺省值兜底**：已被兜底（`c6b73bc` / `aa7831f`），但 caller 仍应避免传未声明 biome。

### 性能

- 🟡 **states 阶段性能残留问题** —— 见 [`../plan/states-perf-residual-issue.md`](https://github.com/Recoletas/Pinax/blob/main/docs/plan/states-perf-residual-issue.md)。
- 🟡 **map generation perf profiling** —— 当前决策见 [`decisions/ADR-0001-map-gen-perf-profiling.md`](./decisions/ADR-0001-map-gen-perf-profiling.md)，历史上下文见 [`rfcs/perf-profiling/`](./rfcs/perf-profiling/)。

### UI / 兼容

- 🟡 **多页面 height: 100vh + overflow: hidden + 多 fixed 浮层叠加**：移动端和低分辨率下遮挡 / 滚动锁死 / 层级冲突风险高（见 [`../PLAN.md` §3.2](https://github.com/Recoletas/Pinax/blob/main/docs/PLAN.md)）。
- 🟡 **右侧 / 右下固定入口热区重叠**：体验页与写作页均存在。
- 🟡 **页面级断点策略不一致**。

## 当前已接受的限制

- 🟢 **VitePress dev 首页 404 已定位并修复**：根因是 `docs/src` 根目录缺少 VitePress 根路由需要的 `index.md`。现入口为 [`index.md`](./index.md)。
- 地图管线没有 100% 复现 Azgaar 行为；当前目标是保留 Azgaar 模板语义并提升本项目视觉真实感。
- 离线程地图生成通过 comlink 桥接，但 worker 边界处需要 strip Vue reactive proxy（`99c4190`）。
- 公开 API 详细说明不维护（见 [`index.md` §不应该维护](./index.md)）。

## 历史归档

(按需从 `../plan/` 迁入或保留链接)
