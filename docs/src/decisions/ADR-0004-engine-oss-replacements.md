# ADR-0004: 引擎 5 处自造基础设施替换为成熟 OSS 库

- **状态**: accepted
- **日期**: 2026-06-05
- **领域**: world-map
- **当前实现注记（2026-06-08）**: 本 ADR 中关于 `heightmap-templates.ts` 已被删除的说明已过期；Round 1 / Round 2 当前实现重新保留该文件，并用于 14 个 Azgaar 模板语义。
- **影响范围**:
  - `src/services/world-map/engine/random.ts` —— `alea@^1.0.1` 替换手写 `seedRandom`
  - `src/services/world-map/engine/nations.ts` —— `graphology@^0.26.0` + `graphology-shortest-path@^2.0.0` 替换两份手写堆（已发生过堆腐败 bug：commit `3678bf1` / `e3828b2`）
  - `src/services/world-map/engine/heightmap-templates.ts::findGridCell` —— `d3-delaunay@^6.0.4` 替换（若后续重新启用该热点，应优先复用成熟空间索引，不回退到暴力扫描）
  - `src/services/world-map/engine/worker-bridge.ts` + `worker.ts` IPC —— `comlink@^4.4.2`
  - `src/services/world-map/engine/heightmap.ts` + `coast.ts` 两份 FBM —— `simplex-noise@^4.0.3`（**注**：本 ADR 落地后由 ADR-0003 重写 `heightmap.ts`）
- **详细 spec (canonical)**: [`../rfcs/engine-oss-replacements/`](../rfcs/engine-oss-replacements/)

## 背景

5 处自造基础设施造成 400+ 行重复代码，且 `nations.ts` 的手写堆已发生过 2 次堆腐败事故（`3678bf1` / `e3828b2`）。项目已经在用 `delaunator` / `d3-hierarchy` / `pinia`，风格不一致。

## 决策

按"低风险 → 中风险 → 高风险"顺序落地（最后一步 simplex-noise 噪声面替换，便于把测试 flake 归因到唯一变量）。7 个 commit。

不改变任何对外 API、**不**改变 `VoronoiMapData` 输出形状、**不**改变 `MapGenConfig` 配置项。

## 备选方案

- 重写自造版：再多 400 行自造代码，不解决问题。
- 用 `polygon-clipping`：引擎里**没有**多边形布尔代码，grep 0 命中。
- 用 `unique-names-generator`：`name-pool.ts` 是策划过的主题名池，不是过程化拼接。
- 改用 `d3-quadtree` / `rbush` 替 `SpatialGrid`：均匀格桶哈希对此访问模式更快。

## 后果

- 正面：净减约 400 行；消除手写堆的腐败风险；与项目已有 OSS 风格一致；8 个 `heightmap-azgaar.test.js` 契约测试锁住形状。
- 负面：引入 5 个新依赖；simplex-noise 替换时存在测试 flake 风险（已通过 commit 排序隔离）。
- 后续约束：
  - 不再写新的自造 PRNG / heap / FBM / Delaunay / Worker 桥 —— 直接用现有 OSS。
  - `random.ts` 是 `alea` 的薄封装；保持极薄，不要加新逻辑。
  - 5 个 `_debug-*.test.js` 已被清理；未来 debug 测试需要正式名字。
