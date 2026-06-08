# 已知问题与当前限制

> 用来区分新回归、已知缺口和已接受限制。纯 backlog 不放这里。

## 状态约定

- 🔴 **活跃问题**：当前正在处理或会影响近期验收。
- 🟡 **已知缺口**：暂不阻断，但后续工作必须看见。
- 🟢 **稳定限制**：已接受的边界，不按 bug 处理。

## 活跃问题

### 地图引擎视觉残留

- 🔴 Round 2 后仍有地形真实感残留问题。
- 已改善：`landRatio=0.45` 视觉快照回到约 `0.43-0.44`，模板选择和主世界 RNG 已隔离。
- 仍需关注：模板后处理重复 FBM / `softenMapEdges` 风险、`reshapeCoasts` 大轮廓重塑不足、部分模板合同仍是 soft-fail 诊断。
- 处理边界：先做 Round 2.1 小修，不扩大到 UI / 国家 / 城市逻辑。

### 可玩的世界书收口

- 🔴 当前产品主线正在改为“可玩的世界书”，入口叙事、种子世界、AI GM 轻状态和玩到写触发点还未全部闭环。
- 近期事实入口：[PLAN.md](../PLAN.md) 和 [plan/playable-worldbook-roadmap.md](../plan/playable-worldbook-roadmap.md)。

## 已知缺口

- 🟡 `moveCostForEdge` 已有 biome 缺省值兜底，但 caller 仍应避免传未声明 biome。
- 🟡 states 阶段性能仍有残留问题，见 [states-perf-residual-issue.md](../plan/states-perf-residual-issue.md)。
- 🟡 多页面仍有 `height: 100vh + overflow: hidden + fixed 浮层` 的组合风险，移动端和低分辨率下需要继续看遮挡、滚动锁死和热区重叠。
- 🟡 页面级断点策略仍不完全一致。

## 稳定限制

- 🟢 地图管线不追求 100% 复现 Azgaar；目标是保留模板语义并提升本项目视觉真实感。
- 🟢 离线程地图生成通过 comlink 桥接，worker 边界需要 strip Vue reactive proxy。
- 🟢 VitePress 文档站入口为 `docs/src/index.md`；不要提交 `.vitepress/cache/` 或 `.vitepress/dist/`。
- 🟢 公开 API 详细说明不维护；当前文档层只记录仓库事实、风险和决策。

## 验证提示

当前全量测试通过，但会输出既有地图模板合同诊断和 jsdom/canvas 环境警告。不要把这些输出单独当作新失败；以 [test-status.md](./test-status.md) 的当前验证结果为准。
