# ADR-0002: `states` 与 `roads` 阶段性能修复

- **状态**: accepted
- **日期**: 2026-06-02
- **领域**: world-map
- **影响范围**:
  - `src/services/world-map/engine/nations.ts`（`expandStates` 行 173-261、`findPath` 行 512-574 重写）
  - `src/__tests__/nations.test.js`（新增 5 个表征测试）
- **详细 spec (canonical)**: [`../rfcs/nations-perf-fix/`](../rfcs/nations-perf-fix/)
- **实施记录**: [`../rfcs/nations-perf-fix/implementation.md`](../rfcs/nations-perf-fix/implementation.md)

## 背景

来自 `?debug=perf` 实测：

| Run | 总耗时 | 最慢阶段 | 占比 |
|---|---|---|---|
| normal seed | 361 ms | `roads` 226 ms | 62.7% |
| pathological seed | 37 021 ms | `states` 36 810 ms | 99.4% |

两阶段都源于同一类 bug：错误实现"优先级队列"（sort 替代 heap、splice 替代 decrease-key），且都缺关闭集/已处理标志。

## 决策

- `expandStates` 改用标准的 binary-heap Dijkstra（替换 splice-priority-queue）。
- `findPath` 改用 binary-heap A*（替换 sort）。
- 输出形状不变：renderer 契约不破，`VoronoiMapData` / `State` / `Road` 形状不动。

## 备选方案

- `Uint16Array` 替代对象数组：spec 提及但实测优先修 heap bug。
- 改用 WebAssembly 移植：超出 scope。
- 按 seed 缓存结果：会改变随机性，违反"输出形状不变"。

## 后果

- 正面：bad seed 从 36.8 s 降到 ms 级；normal seed 从 226 ms 降到两位数 ms。
- 负面：算法重写引入回归风险；必须用 `nations.test.js` 5 个表征测试锁住。
- 后续约束：
  - 禁止在未读 `meta.states` / `meta.roads` 的情况下重写这两段；新算法必须配表征测试。
  - 不再写新的自造优先级队列；直接用 `graphology-shortest-path`（见 ADR-0004）。
