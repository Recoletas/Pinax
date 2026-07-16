# W1: 地图语义提取器 — 实施报告

> 2026-07-01 CST · Codex on `main` · W1 of geo-history 线程
>
> **范围**: 纯函数模块,只读 `generateMap()` 输出,不改任何地图核心算法。
> **目标**: 给后续历史系统 (Dwarf Fortress 风格) 提供 9 类可消费地理语义点。

---

## 1. 交付物

| 路径 | 行数 | 角色 |
| --- | --- | --- |
| `src/services/worldHistory/mapSemantics.js` | ~610 | 主模块: 9 类语义点提取器 + 2 个工具函数 |
| `src/__tests__/worldHistoryMapSemantics.test.js` | ~245 | 18 个 vitest test,覆盖基础形状 / 分类能力 / 稳定性 / 容错 / 工具函数 / 多 seed |

未新建任何依赖,未触碰 `generate.ts` / `nations.ts` / `settlements.ts` / `rivers.ts` / `features.ts` / `tectonics.ts` 等地图核心文件。

## 2. 提取的 9 类语义

| 类别 | 输入信号 | 判定逻辑(摘要) |
| --- | --- | --- |
| `tradeHubs` | `burgs[]` | 首都 +25 / 港口 +25 / `log2(pop)` 0-25 / 港口质量 +10;score ≥ 50 才收录 |
| `borderCrossings` | `roads[]` + `cells.state` | 沿线跨越 ≥ 2 个 state;按 road.type 加重 + 长度 +log 加分 |
| `frontierZones` | `cells.state` + `cells.c` | 邻接他州的 land cell 做 BFS 簇(≥ 5);低人口 + 多邻国 + 绵延加分 |
| `isolatedSites` | `burgs[]` + `roads[]` cell 集合 | 半径 3 内无 road 或单点聚落(同 state 仅 1 个 burg) |
| `fertileRegions` | `cells.s` (适宜度) + biomes + rivers | 适宜度 ≥ 50 的 land cell BFS 簇(≥ 8);温带/季风/雨林 biomes 重点加权,沿河 +15 |
| `hostileRegions` | `cells.h` + HOSTILE_BIOMES {1,2,9,10,11} | 高海拔 (h≥55) 或凶土 biome 的 land cell BFS 簇;严寒/高海拔/人口稀少加权 |
| `strategicRoutes` | `roads[]` + `burgs[]` | 长度 ≥ 8 + 跨国 + 类型(sea/trade/major)+ 串联城镇数;跨水域 +8 |
| `riverMouths` | `rivers[]` + 河口 cell | 河长 ≥ 5;河口有 burg +30 / 港口质量 >40 +20 / 流量 +10 / 长度 log +20 |
| `mountainPasses` | `roads[]` + `cells.h` | 道路沿线 h>55 且两端低 ≥ 15 算翻山;按 road type 加分,峰顶 h>70 +15 |

每个 site 字段(8 个全填):
```
{ id, type, title, score (0-100), cellIds[], markerIds[], reasons[], keywords[] }
```
- `id`: `tradeHub:<i>` / `riverMouth:<i>` / `frontierZone:<idx>` 等,稳定
- `markerIds`: 前缀式 `burg:5` / `river:3` / `road:2` / `state:1` / `pass-cell:240`,便于追溯源
- `keywords`: DF 风格标签,如 `['fertile', 'riverine', 'biome-ratio-100']`,便于历史系统 keyword 匹配
- `reasons`: 人类可读解释,如 `['首都', '港口', '人口 290', '港口质量 70']`

## 3. 用了哪些 mapData 字段(只读)

`VoronoiMapData` 实际消费:

- `cells.h` (Uint8Array) — 高程,判定海陆/山地
- `cells.c` (number[][]) — 邻接表,BFS 簇和邻州判定
- `cells.t` (Int8Array) — 海岸距离(备用,本版未直接用)
- `cells.biome` (Uint8Array) — biome 0-12
- `cells.s` (Float32Array) — 适宜度 0-100
- `cells.state` (Uint16Array) — 国家 id
- `cells.burg` (Uint16Array) — 城镇 id(备用)
- `cells.pop` (Float32Array) — 人口
- `cells.fl` (Float32Array) — 流量
- `cells.portQuality` (Uint8Array, optional) — 端口质量
- `cells.temp` (Int8Array) — 温度
- `burgs[]` — 首都/端口/人口
- `roads[]` — 道路类型 / cells / 长度
- `rivers[]` — 河长 / 河口 cell
- `states[]` — 国家列表(数量判定)

未消费的字段: `cultures` / `provinces` / `plates` / `boundaries` / `oceanCurrents` / `wind` / `coastlines` / `features`(本版只用 features 的元信息,不深入展开)。后续可按历史系统需要加。

## 4. 没改哪些文件

0 文件改动:
- `src/services/world-map/engine/generate.ts` ✓ 未动
- `src/services/world-map/engine/nations.ts` ✓ 未动
- `src/services/world-map/engine/settlements.ts` ✓ 未动
- `src/services/world-map/engine/rivers.ts` ✓ 未动
- `src/services/world-map/engine/features.ts` ✓ 未动
- `src/services/world-map/engine/tectonics.ts` ✓ 未动
- `src/services/world-map/engine/climate.ts` ✓ 未动(BIOMES 数组已在文件内定义,本模块直接复用相同定义,未 import 避免跨 .ts 边界)
- `src/services/world-map/engine/types.ts` ✓ 未动(模块签名注释里说明字段但无 import)

`git status` 确认仅新增 2 文件,working tree 2 个 pre-existing modified (`playableWorldEntry.js` / `worldbookContextBuilder.js`) 属于其他 worker WIP,按 memory `stage_by_name_in_worktree.md` 规则不动。

## 5. 关键设计决策

### 5.1 纯函数 + 容错
- 不依赖 `localStorage` / DOM / `fetch` / AI
- `null` / `undefined` / 缺字段 → 走 `makeEmptyResult()`,所有 site 数组为空
- `cells` 长度 0 → 同上
- 防御性 `readTyped(arr, i, fallback)`: 任何 typed array 缺字段或越界都返回 0

### 5.2 稳定性
- IDs 用 `type:<index>` 拼接,与源数组顺序绑定 → 同 seed 同样输入同输出
- `cellIds` 始终 `sortCellIds(...)` 后再写 → 跨多次调用的 BFS/排序结果一致
- `JSON.stringify` 序列化对比测试: 同 seed 两次 `extractMapSemantics(standardMap)` 完全一致
- 6 个测试 seed 在 5 类 site 必现(实测: 6 seed × 9 类,best-case 8/9 类出现)

### 5.3 簇提取策略
- BFS + grace quota: 10% 配额用于跨 predicate 1 次,让相邻子簇合并
- 簇 size 上限 200 cells: 防大型 hostile 区域吞掉整张地图
- min 簇 size: fertile/hostile ≥ 8, frontier ≥ 5 — 避免单 cell noise

### 5.4 Score 0-100 归一
- 每类 0-100,bounded by `clamp(score, 0, 100)`,便于跨类排序 / 阈值过滤
- 阈值统一 50 起步: 仅保留"有信号"的 site,弱信号直接丢弃(测试时用 `>= 5` 类覆盖防单 seed 退化)

### 5.5 与 world-map engine 的边界
- 复用 `BIOMES` 0-12 语义定义(直接硬编码到本文件,避免 `import from .ts` 的边界耦合;BIOMES 数值稳定,可视为公共契约)
- `HOSTILE_BIOMES = {1,2,9,10,11}` / `FERTILE_BIOMES = {3,4,5,6,7,8}` / `SEA_LEVEL = 20` 跟 engine 对齐
- `ROAD_REACH_RADIUS = 3` / `MAX_CLUSTER_CELLS = 200` / `MAX_PER_CATEGORY = 50` 三个 knob 在文件顶部,后续 history 系统可按需覆盖(`options.maxPerCategory` 已接住)

## 6. 测试结果

`npm run test:run -- src/__tests__/worldHistoryMapSemantics.test.js src/__tests__/generate-constraints.test.js src/__tests__/road-realism.test.js`

```
 Test Files  3 passed (3)
      Tests  27 passed (27)
   Duration  2.36s
```

按测试组拆:
- **基础形状** (4): 9 大类 + meta / site 字段齐全 / type 严格属于 9 类 / meta 反映输入规模
- **基础分类能力** (4): tradeHubs+fertile+hostile 至少一类非空 / 5+ seed 至少 5 类出现 / 4 类必现 / hostile×fertile 重叠率 < 10%
- **同 seed 稳定** (2): 同样 mapData 两次 / 重新 generateMap 后提取两次,均 JSON 完全一致
- **容错** (4): null / undefined / 缺 cells / 空 arrays,均不抛错
- **工具函数** (3): `flattenSemantics` / `filterSemantics`(单/多 type)
- **多 seed 一致性** (1): meta 正确,各自结构正常

`npm run build` 干净,4.08s 完成,无新警告(继承 `kao.css` static+dynamic import 既有警告)。

`git diff --check` 干净(0 输出 = 无 whitespace 错误)。

## 7. 样例输出 (seed: 'geo-history-test', pointCount: 2000, stateCount: 6)

| 类别 | 数量 | 最高分 site 摘要 |
| --- | --- | --- |
| `tradeHubs` | 8 | `天京城（首都）` score 100 — 首都+港口+人口 290+港口质量 70 |
| `borderCrossings` | 6 | `龙都—天京城（major）` score 85 — 跨越 3 国+主干道 |
| `frontierZones` | 1 | `边境荒域 1` score 50 — 邻接多州,人口稀少 |
| `isolatedSites` | 0 | (本 seed 道路覆盖较好,无孤悬) |
| `fertileRegions` | 9 | `沃土 4` score 85 — 宜居度 101+均温 17.9°C+人口密集+沿河 |
| `hostileRegions` | 7 | `凶土 1` score 70 — 平均海拔 32+严寒 -12.8°C+凶土占比 100% |
| `strategicRoutes` | 7 | `凤鸣城—帝丘` score 85 — 全长 34+跨 3 国+主干道+串 3 镇 |
| `riverMouths` | 22 | `碧漪江 河口` score 60 — 河长达标 |
| `mountainPasses` | 2 | `山口 龙都—紫阳城` score 60 — 高差 30+主干道穿山 |

注: 同 seed 不同 `pointCount` 会改变地形细节与道路密度,导致每类数量浮动;但 `id` / `score` / `cellIds` / `markerIds` 在同 seed + 同 pointCount 下严格稳定。

## 8. 已知边界 / Out of scope (留给后续 worker)

1. **未导入 `BIOMES` 跨 .ts/.js 边界**: 重复定义在 `mapSemantics.js` 顶部注释里,若 engine 改 biome id 需要同步
2. **未消费 `cultures` / `provinces` / `plates` / `boundaries`**: 后续可加 `culturalFrontier` / `plateBoundary` 子类
3. **未做 time-decay / event hook**: W1 只产出静态快照;历史系统接入时要考虑怎么消费,以及是否需要每 N 步重算
4. **未做 cell → burg 反向索引 / cell → road 邻接表**: 当前 isolatedSites 用 BFS,O(n×k),seed 2000 cells 跑完 18 tests < 700ms,可接受;更大 seed (10000+ cells) 时建议预建 spatial grid
5. **W1 不接 UI**: 历史系统 / storyboard 接入时再决定渲染方式
6. **9 大类 score 阈值统一 50 起**: 不同类可能需要不同阈值(例如 fertile 通常很常见,可降到 40;mountainPass 通常很稀缺,可提到 60),由后续 worker 调

## 9. 下一步建议

按 user 7.1 需求路径,本任务完成 W1 语义提取器底座。下一步 W2 / W3 候选(留给 user 拍板):

- **W2**: 接入历史事件触发器 — 把 semantic site 转成"事件种子" (e.g. `tradeHub` 高分 → "商队遇劫" 事件候选)
- **W2 alt**: 接入 worldbookContextBuilder — 把 site 的 `keywords` 喂入 worldbook 检索,让 AI 在相关地点附近能拿到语义上下文
- **W3**: 接入 playabler world entry flow — 在 `playableWorldEntry.js` 生成世界开场时,用语义点作为开场钩子候选(如 "开场从最近的 isolatedSite 旁开始")

## 10. 验证命令复现

```bash
# 测试 (本报告所引)
npm run test:run -- src/__tests__/worldHistoryMapSemantics.test.js src/__tests__/generate-constraints.test.js src/__tests__/road-realism.test.js

# 构建
npm run build

# diff 完整性
git diff --check
```

3 个命令全部 pass / 干净。
