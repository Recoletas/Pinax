# 地图真实性 — 当前状态、问题与建议

> **写于 2026-06-03**，对应 commit `140c930 fix(heightmap): produce multiple distinct continents` 之后。
> 目标：记录目前"地图真实感"路线图的真实进展、暴露出的问题、根本原因，
> 以及推荐的解决顺序，让后续接手的人不用再读 git log 复盘。

---

## TL;DR

多大陆（continentCount）已能正确分离开（cc=2/4/6/8/10 都能看到正确数量的色块）。
但**整体仍不像真实地图**——山脉像贴上去的圆斑、海岸像尺规画的弧、biome 颜色像 PPT 配色。
主要原因是 heightmap 生成器仍然基于无噪声的 BFS 衰减，没有任何"打破对称"的随机扰动。

---

## 1. 用户能直接看到的问题

| 现象 | 视觉证据 |
|---|---|
| 4 个大陆像 4 个**完美同心圆** | ASCII 地图中可见 ring-like 阶梯（h=20→30→40→50→60 每圈都基本等距） |
| 海岸线像尺规画出来的弧 | 海岸上每个 cell 高度几乎一致，没有"凹凸" |
| 山脉像"贴上去的圆斑" | BFS 等距扩散 + 无噪声扰动 |
| biome 色块**非常突兀**，相邻地块颜色对比太强 | 渲染时每个 cell 一个纯色，没有过渡 |
| 河流太短（最长 8 cell） | 因为大陆被切小了，每个大陆的汇水面积小 |
| 模式切换（realism level）视觉差异微弱 | 三个模式（classic/azgaar/geologic）只有 1 个共用的 tectonic + coast 扰动，UI 反馈不明显 |

---

## 2. 根本原因（按优先级）

### 2.1 `addHill` 的 BFS 无噪声 → 山丘是同心圆

**位置**：`src/services/world-map/engine/heightmap.ts:301-324`

```ts
while (head < queue.length) {
  const cell = queue[head++]
  cells.h[cell] = Math.min(100, cells.h[cell] + Math.round(change[cell]))
  for (const neighbor of cells.c[cell]) {
    if (visited.has(neighbor)) continue
    const newChange = change[cell] ** power * (0.9 + rng() * 0.2)  // ← 只 10% 抖动
    if (newChange < 1) continue
    change[neighbor] = newChange
    visited.add(neighbor)
    queue.push(neighbor)
  }
}
```

`0.9 + rng() * 0.2` 只给 ±10% 的随机扰动，所有方向都按相同 decay 走 → 圆。

**诊断数据**（最大的大陆，cc=4）：
```
std/mean = 0.440   // 完美圆 ~0.3, 自然海岸 ~0.5–0.7
max/min  = 33.05   // 同心圆带，内外径差距太大
```

### 2.2 `templateContinents` 没有任何"形状变化"

```ts
addHill(cells, findNearestCell(cells, cx * w, cy * h), size, bp, rng, maxRadius)
```

每个大陆 = 1 个圆 hill + 1 条短 range，没有 **不规则凸起**、**凹海湾**、**多峰山系**。

### 2.3 渲染层每个 cell 1 个纯色 → 色块感

**位置**：`src/services/world-map/engine/renderer.ts:205-216`

```ts
ctx.fillStyle = biomeColors[cells.biome[i]] || '#888'
// ... fill polygon ...
```

每个 cell 整块填色 + 顶点刚好接上相邻 cell 的顶点 → 视觉上是大块"PPT 拼图"。

### 2.4 smoothing 阈值 = 2，但 BFS rim cell 高度 = 2~5

`smooth(cells, 2, 2)` 把 h<2 归零，但 rim cell 高度恰好在 2~5 之间，smoothing pass 之后被抬到 3~4，于是形成一圈"水边"h=2~4 的 ring。
**这就是 ASCII 图里 `+++` 环——本意是缓冲带，视觉上像人为画的圈。**

### 2.5 `adjustSeaLevel` 是 percentile-based，bimodal 分布下产生长尾

gap-aware 改进后确实只对非零 cell 计算分位，但 cells.h 仍然有 ~5200 cells 集中在 h=10（land band），
调整后只有 ~800 cells 真正高耸，剩下 5000 cells 都在 h=20~30 这一个很窄的区间。
**结果：所有"陆地"看起来差不多高，山地/平原/丘陵区分不出来。**

### 2.6 模式切换视觉差异小

`WorldMapVoronoi.vue` 切 level 时只改了 `realism: { level }`，但：
- `coast.perturbCoast` 只在 `level !== 'classic' && coast` 时跑——UI 没设 `coast`，所以从不跑
- `rivers.style` 没设，所以一直 'straight'
- `tectonics` 接收整个 realism 对象，但内部只读了 `level` 做粗分支

→ 三个 level 走的还是同一条 tectonic 路径，渲染结果几乎一样。

---

## 3. 建议的解决顺序

> **重要**：不要一次性全做。建议每一步单独提一个 commit，跑一遍可视化 + 完整测试集，**视觉确认**再继续。

### 第 1 步：在 `addHill` 里加方向性的角度扰动（最低成本，效果明显）

**目标**：打破"圆"，让 hill 沿某方向拉长。

**做法**：
- 给 BFS 一个初始 `angle = rng() * Math.PI * 2`
- 每层新增的 neighbor，倾向沿 `angle` 方向（cos/sin 加权采样）
- `0.9 + rng() * 0.2` 改成 `0.7 + rng() * 0.6`（±30% 抖动）

**预期**：hill 呈椭圆/不规则带状海岸，std/mean 升到 0.5+。

**风险**：低。只改 hill 形状，不动 BFS 半径/阈值。

### 第 2 步：在 `addHill` 后用 simplex/perlin noise 叠加"地形纹理"

**做法**：
- hill 落地后，对所有 h>5 的 cell 叠加一层 2D noise：
  ```ts
  const noise = simplex2(cells.p[i*2] * 0.02, cells.p[i*2+1] * 0.02) * 5
  cells.h[i] = Math.max(0, Math.min(100, cells.h[i] + noise))
  ```
- noiseScale 0.02~0.05（让纹理尺度 ~20~50 px ≈ 1.5~4 cells）

**预期**：打破平滑等高线，产生"小丘"、"凹谷"等微观地形。

**依赖**：需要引入 simplex-noise 包或自己写 2D noise（4 行代码）。

### 第 3 步：渲染层加 cell 内部纹理

**目标**：消除"PPT 色块"感。

**做法**（renderer.ts:205）：
- 不再用 cell 顶点 polygon 整块填色
- 改为按 cell 中心的实际 height/biome 采样颜色，**但边缘做 1~2 px 抗锯齿过渡**
- 或者用更细的三角网渲染（每条 Voronoi 边拆成 2 个三角形）

**预期**：相邻 biome 之间不再是硬切，颜色过渡更自然。

### 第 4 步：让 `templateContinents` 生成不规则形状

**做法**：
- 每个大陆不再只放 1 个 hill，而是 3~5 个 hill 沿一条轴线（模拟大陆"长轴"）
- 在大陆边缘挖 1~2 个 `addPit`，形成海湾/内海

### 第 5 步：模式切换要可视化

**做法**：
- `classic`：保持当前行为
- `azgaar`：默认开启 coast 扰动（即使 UI 没设 `coast`），打开河流 meander
- `geologic`：azgaar 之上 + 更高山带峰值（tectonic 边界附近 +h）

UI 反馈：3 个模式应该肉眼能看出差异。

### 第 6 步（可选，长期）：替换 BFS 为 GPU-style noise + threshold

完全抛弃 BFS 衰减，用 2D noise + 海平面阈值：
- 优势：极快、形状任意、不会有"圆"问题
- 劣势：要重写一整套；要小心 voronoi cell 的"颗粒感"（noise 在 cell 边界可能不连续）
- 适合最后做，作为彻底重构

---

## 4. 不要做的事

- **不要继续调 `blobPower` / `maxRadius`**——这两个是 cap，不是 quality。已经够用。
- **不要加更多 smoothing**——smoothing 是当前"圆"问题的帮凶之一。
- **不要把 `addHill` 改成大圆 + noise 叠加**——叠加层足够（步骤 2），不要把核心模型换掉。
- **不要现在改 `adjustSeaLevel` 的算法**——它已经 gap-aware，进一步改 percentile 不解决 bimodal 问题；根因在 heightmap 分布。

---

## 5. 现状指标（baseline）

记录 baseline，方便后面评估"是否真的变好了"。

| 指标 | 当前值 | 目标 |
|---|---|---|
| 1 大陆径向 std/mean | 0.44 | > 0.55 |
| 1 大陆径向 max/min | 33.0 | < 8 |
| cc=4 时大陆数（connected mass ≥ 30） | 4-5 | 4 |
| cc=4 时总陆地 cell 数 | ~1100 | 1500-2500（更接近 45% land） |
| 单大陆直径（px） | 30-40 | 80-150 |
| 河流最长（pointCount=3000） | 8 cell | ≥ 15 cell |
| 三种 realism level 视觉差异 | 几乎相同 | 肉眼可辨 |

**建议保留 `/tmp/diag-shape.mjs` 和 `/tmp/diag-multi.mjs`** 作为 regression 脚本，每次改 heightmap 后跑一次。
