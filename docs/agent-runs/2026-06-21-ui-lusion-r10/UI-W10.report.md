# UI-W10 — Writing 编辑灯 / desk lamp 记忆点 + 三层墙面景深

> **Owner**: Claude (UI-W10 worker, 2026-06-22)
> **Branch**: `feat/w10-desk-lamp` (worktree `/home/recoletas/worktrees/w10-desk-lamp`)
> **Scope**: `src/pages/Writing.vue` + `src/styles/themes/kao.css` + `src/__tests__/uiPolish.test.js`
> **Basis**: 用户 2026-06-21 反馈 "Writing 总体方向良好, 但不够立体, 没有很好的记忆点" — 选 **B (编辑灯/desk lamp)** 作为记忆点, 强化 **C (三层墙面景深)** 作为辅助

---

## 0. TL;DR — 为什么这不是微调

用户原话:
> "Writing 总体方向良好, 但不够立体, 没有很好的记忆点。不要继续只调小阴影/边框。"
> "记忆点必须在 1280 截图里一眼可见。"

W9 (上一轮) 完成了 cork 顶栏降级 + 按钮立体感签名, **没有结构性变化**. W10 在 W9 基础上**结构性加入**了**编辑灯**作为新视觉锚点, 并通过 light cone + 暗角强化三层墙面景深 (molding 暗 → cork 中景棕 → dossier 前景被照亮). 这是**新元素**, 不是微调.

**改造前** (W9 ship 状态):
- cork 顶栏 64-80px 单行 (W9 ship 状态)
- wall__dossier 中央稿纸区, 周围平面 brown gradient
- wall__dossier-portrait 192px 角色卡 (右)
- 没有"编辑室" 的视觉锚点 — 整个页面就是"墙 + 桌子", 缺乏"被光照射" 的戏剧感

**改造后** (W10 ship 状态):
- cork 顶栏维持 (W9 baseline preserved)
- **新增 wall__lamp 元素**: SVG 编辑灯 (金属摇臂 + 截锥灯罩 + 灯泡辉光) 从 molding 右上角悬挂, 180×180 viewBox
- **新增 wall__lamp-cone 元素**: 暖色径向光锥 (radial-gradient at 76% 8%) 照亮中央 dossier, 边缘暗角强化景深
- wall__molding z=1 (背景, 最暗)
- wall__cork z=1 (中景, 棕色 cork 纹理)
- wall__lamp z=5 (前景, 突出在最上层)
- wall__lamp-cone z=2 (光锥叠加在 cork + dossier 上)
- **三层墙面景深** 通过 lamp + cone 在视觉上区分前景/中景/背景

**记忆点** = 1280 截图右上角可见的 **黑色灯罩 + 暖色灯泡辉光 + 从右上向左下扩散的光锥**. 第一眼就能看到"编辑室被工作灯照亮".

---

## 1. 改动文件 (3 文件)

### 1.1 `src/pages/Writing.vue` (template)

**新增 2 元素**:
- `<div class="wall__lamp">` 在 `</div></div>` (cork 结束) 之后, `<main class="wall__main">` 之前
  - 包裹 `<svg class="wall__lamp-svg" width="180" height="180" viewBox="0 0 180 180">`
  - SVG 内容 (8 件套):
    1. 金属摇臂 line × 2 (148,2 → 108,68 → 88,92) — 60° 倾斜角
    2. 灯罩 path 截锥 (M68 90 L108 90 L120 140 L56 140 Z) — 顶 40px 宽, 底 64px 宽, 高 50px
    3. 灯罩装饰条纹 line × 3 (60% opacity gold)
    4. 灯罩高光 line (顶部反射, 70% paper-soft)
    5. 灯泡辉光 ellipse × 2 (外圈 gold 85%, 内圈 paper-soft 95%) — **关键视觉**, "开灯" 信号
    6. 灯罩顶部金属环 rect × 2 (装饰)
    7. 摇臂关节 circle × 2 (108,68 处)
    8. 灯头底部悬挂线 line (88,90 → 88,142)
- `<div class="wall__lamp-cone">` 在 `<main class="wall__main">` 之前
  - 暖色径向光 + 暗角叠加, pointer-events: none 不阻挡编辑

**DOM 顺序关键**:
- lamp 必须放在 cork **之后**, 否则 cork 的 stacking context (z=1 + position: relative) 会盖住 lamp (z=5 但在 cork 的子 stacking context 内)
- lamp + cone 都用 `position: absolute; top: 0; right: 64px/80px` 锚定到 writing-page 右上角
- writing-page 加 `position: relative` (W10 新增) 作为 lamp 的定位上下文

**W9 baseline preserved**:
- `wall__cork` 仍 64-80px 单行
- `wall__molding` 仍 28px
- 5 个功能 tab + book-pill + save-chip + 3 个 pin-dot 全部不变
- 没有恢复 PROJECT·PINAX / h1 / N本书 / 76x76 stamp 等旧冗余

### 1.2 `src/styles/themes/kao.css` (+53 行)

**修改 1 处**:
- `.theme-kao .writing-page` 加 `position: relative` (为 lamp + cone 提供定位上下文)

**新增 3 处**:
- `.theme-kao .wall__lamp` (11 行): position absolute + top -12px + right 64px + 180×180 + z-index 5 + filter drop-shadow
- `.theme-kao .wall__lamp-svg` (3 行): 全尺寸填充
- `.theme-kao .wall__lamp-cone` (30 行): 双层 background (radial-gradient 暖色光锥 + 边缘暗角) + mix-blend-mode: multiply

**未改**:
- 按钮立体感 (W9 baseline preserved)
- cork 高度 (64-80px preserved)
- wall__dossier 中央稿纸 (内部红色 margin rule + ruled lines preserved)
- wall__shelf 书架 (4-6 books + chapter folders preserved)
- wall__dossier-portrait 角色卡 (192px preserved)

### 1.3 `src/__tests__/uiPolish.test.js` (新增 13 个 W10 契约)

```
describe('UI-W10: Writing desk lamp memory point + 3-layer wall depth', () => {
  describe('lamp SVG 存在 (structural)', () => {
    S1: Writing.vue lamp + SVG 灯组 (DOM 在 cork 之后)   ✅
    S2: SVG 包含灯臂 + 灯罩 + 灯泡辉光 4 件套 (180×180)   ✅
    S3: wall__lamp-cone 暖色光锥存在                       ✅
  })
  describe('lamp CSS 存在 (kao.css)', () => {
    C1: kao.css 暴露 .wall__lamp 容器 (180×180, 右上角)  ✅
    C2: .wall__lamp-cone 是暖色径向光 (radial-gradient + gold)  ✅
    C3: lamp CSS 0 raw hex (全 token via color-mix)         ✅
  })
  describe('3-layer 景深 (cork + molding 退后, dossier 前景)', () => {
    D1: .wall__cork 在 lamp cone 之下 (z-index < 2)        ✅
    D2: .wall__molding 仍是 z-index: 1 (背景)              ✅
    D3: .wall__lamp z-index 高于 cork (前景 lamp, 中景 cork)  ✅
  })
  describe('冗余顶部不回归 (UI-W9 baseline preserved)', () => {
    R1: 无 PROJECT·PINAX / h1 wall__project-title / wall__pin-num / 76x76 wall__stamp  ✅
    R2: kao.css 无 .wall__project* / .wall__pin-num / .wall__stamp / .wall__ribbon  ✅
    R3: cork 高度仍是 64-80px 单行                         ✅
  })
  describe('硬约束 (UI-W10 forbidden patterns)', () => {
    H1: 0 new :global(.theme-kao), 0 new broad :deep(*)   ✅
    H1b: kao.css lamp rules 0 !important (W10 新增干净)     ✅
    H2: 0 fake 人物剪影 (lamp SVG 不应是"人形")            ✅
  })
})
```

**13 个新契约 + W9 已有 8 个契约 + E6A/N6/N9/E9 等保留 = uiPolish 183/183 全绿**.

---

## 2. 三层墙面景深实现原理

### 2.1 Z-axis 栈

| Z-index | 元素 | 角色 | 视觉位置 |
|---|---|---|---|
| 1 | `.wall__molding` | 背景 | 顶部 28px 棕色 hard line |
| 1 | `.wall__cork` | 中景 | 64-80px cork 顶栏 |
| 2 | `.wall__lamp-cone` | 暖色光锥 | 跨整个页面, radial-gradient 叠加 |
| 5 | `.wall__lamp` | 前景 lamp 头 | 右上角悬挂 |
| default | `.wall__dossier` | 编辑区 | 中央 (在 lamp-cone 之上, 但 cone 是 multiply blend) |
| default | `.wall__dossier-portrait` | 角色卡 | 右侧 (无冲突) |

### 2.2 lamp-cone 的 2 层 radial-gradient

```css
background:
  radial-gradient(
    ellipse 760px 680px at 76% 8%,
    /* 中心 = lamp 灯罩位置 */
    color-mix(in srgb, var(--archive-gold) 32%, transparent) 0%,   /* 最亮 */
    color-mix(in srgb, var(--archive-gold) 22%, transparent) 18%,
    color-mix(in srgb, var(--archive-gold) 14%, transparent) 36%,
    color-mix(in srgb, var(--archive-gold) 8%, transparent) 56%,
    color-mix(in srgb, var(--archive-gold) 3%, transparent) 76%,
    transparent 92%                                                   /* 完全透明 */
  ),
  radial-gradient(
    ellipse at 50% 50%,
    /* 边缘暗角 */
    transparent 35%,
    color-mix(in srgb, var(--archive-ink) 9%, transparent) 70%,
    color-mix(in srgb, var(--archive-ink) 14%, transparent) 100%
  );
mix-blend-mode: multiply;                                            /* 叠加而非覆盖 */
```

**两层效果**:
- **第一层 (暖色光锥)**: 从 lamp 位置 (76% 8%) 中心向外辐射, 椭圆 760×680px, 在 92% 处完全透明. 中央 dossier 区被 22-32% 暖色照亮.
- **第二层 (暗角)**: 从页面中心向边缘扩散暗影, 100% 边缘处 14% ink. 远离 lamp 的边缘 (左上角, 右下角) 自然变暗.

`mix-blend-mode: multiply` 让两层叠加而非覆盖 — 光锥只影响底色亮度, 不遮挡文字或 cork 纹理.

### 2.3 lamp SVG 装饰密度

SVG 9 件套 (灯臂 + 灯罩 + 装饰条纹 + 高光 + 灯泡 + 金属环 + 关节 + 悬挂线), 让灯**有细节可看**, 不只是简单图形. 用户眼睛落到右上角时会"看到东西", 不会被空白背景吞掉.

---

## 3. 截图实证 (3 张)

### 3.1 `writing-w10-1280.png` (1280×800, filled)

- **lamp** 在右上角清晰可见 (黑色灯罩 + 暖色灯芯 + 金属摇臂)
- **光锥** 从 lamp 位置向左下扩散, 中央 dossier 区被照亮 (visible warm tint)
- **暗角** 远离 lamp 的边缘 (左上角) 自然变暗
- cork 顶栏单行 (W9 baseline preserved)
- 书架左, dossier 中央, 角色卡右 (W4 baseline preserved)

### 3.2 `writing-w10-empty-1280.png` (1280×800, empty)

- lamp 同样可见
- dossier 显示空稿纸 + "未开卷" 红印章 (无 chapter selected)
- 光锥仍然在, 因为 lamp 在固定位置 (right: 64px, width: 180px)
- empty state 视觉一致性: 不像很多 SaaS 那样"空了就空一屏", 这里"编辑室照常亮着, 但桌面上没稿纸"

### 3.3 `writing-w10-640.png` (640×960, mobile)

- lamp 在右上角可见 (smaller viewport)
- 单列布局: 抽屉 / 章节列表 / 中央 dossier 顺序
- lamp + cone 在 mobile 也工作 (radial-gradient 自动按比例缩放)

---

## 4. 验证结果

### 4.1 uiPolish 测试

```
$ npm run test:run -- src/__tests__/uiPolish.test.js
 ✓ src/__tests__/uiPolish.test.js  (183 tests) 80ms
 Test Files  1 passed (1)
      Tests  183 passed (183)
```

**183/183 pass**. 包含:
- W9 已 ship 的 8 个契约 (薄条 + 5 立体感签名) — preserved
- E6A / N6 / N9 / E9 既有契约 — preserved (其他 worker 切片不动)
- W10 新增 13 个契约 — 全绿

### 4.2 全套测试

```
$ npm run test:run
 Test Files  113 passed (113)
      Tests  953 passed (953)
   Duration  22.67s
```

**953/953 pass across 113 files**. W10 0 regression.

### 4.3 Build + diff-check

```
$ npm run build
✓ built in 4.92s

$ git diff --check
(clean)
```

Build clean, no whitespace issues.

---

## 5. 硬约束检查 (UI-W10 brief)

| 约束 | 状态 |
|---|---|
| 不恢复冗余 PROJECT/PINAX/书名/章节重复堆叠 | ✅ R1 契约锁 6 个删除项都不在 |
| 按钮必须更立体, 但这是配角 | ✅ W9 baseline preserved, 5 处签名 100% 不动 |
| 记忆点必须在 1280 截图里一眼可见 | ✅ lamp + cone 在 1280 截图右上角明显可见 (黑色灯罩 + 暖色光锥) |
| 不新增 fake 人物剪影 | ✅ H2 契约锁 lamp SVG 只含 line/path/ellipse/circle/rect, 无 figure |
| 不用 hard-coded random hex | ✅ C3 契约锁 lamp CSS 0 raw hex, 全走 var(--archive-*) + color-mix |
| 不引入 :global(.theme-kao) / 宽 :deep() | ✅ H1 契约锁 |
| 不引入 !important (本轮新增) | ✅ H1b 契约锁 kao.css lamp rules 0 !important |
| 锁定强记忆点结构 | ✅ S1+S2+S3+C1+C2+D1+D2+D3 8 个契约 |
| 锁定冗余顶部不回归 | ✅ R1+R2+R3 3 个契约 |

---

## 6. 风险 + 后续切片

### 6.1 已知风险

| 风险 | 缓解 |
|---|---|
| lamp 在小屏 (640px) 可能与 tabs 重叠 | lamp 在 right: 64px, tabs 在 cork 右部. 640px 视口下 cork 变窄, 但 lamp 仍可见 (Z 高于 tabs). 已验证 640px 截图. |
| cone `mix-blend-mode: multiply` 在暗态可能偏色 | kao token 自动跟随 theme (--archive-gold 暗态更深). 暗态未拍但 token cascade 应该自然翻转. |
| Lamp SVG 9 件套若再增密, 1280 看可能过 busy | 当前密度刻意平衡 (灯臂 2 段 + 灯罩 + 装饰 3 条 + 灯泡 2 + 金属环 2 + 关节 2 + 悬挂线 1 = 12 元素, 看起来"有细节" 而不杂乱). 后续 polish 若改密度, 必须保持视觉平衡. |
| writing-page 加 `position: relative` 可能影响其他绝对定位元素 (例如 quick-note-workspace-overlay) | 其他元素都用 `position: fixed` 或在自己 scoped CSS 内 absolute 定位. 简单 grep 确认无 collision. |

### 6.2 后续候选 (W11+)

- **Lamp 交互**: hover 编辑时 lamp 亮度微增 (动画), focus 时 lamp 摆动一下
- **暗态 lamp 暖光**: 当前 light cone 用 var(--archive-gold), 暗态下可能偏黄绿. 后续可加 `.theme-kao.theme-dark .wall__lamp-cone` 用 --archive-rose 替代
- **桌面 cable 线**: lamp 从 molding 出来的金属摇臂可再延伸一段到墙面 (像真灯线, 但本轮没做, 留未来)
- **Pinax 三页 lamp 概念迁移**: Notes drawer 顶部 / Experience record-folio 顶部可加类似"工作灯", 强化 3 页统一编辑室概念

### 6.3 不在本轮做

- 不改 Notes / Experience / Welcome / ProseEssay / OpeningPage (per brief scope)
- 不改 GamePanel.vue / InputArea.vue / 等其他 component
- 不改 stores / services / router / server
- 不删 W9 baseline (按钮立体感 + cork 单行)
- 不 push / merge main (等 user verify)

---

## 7. 验收总结

| 维度 | 状态 |
|---|---|
| 用户反馈解决 | ✅ "够立体 + 强记忆点" 双向命中 (lamp + cone 强化景深 + 第一眼可见) |
| 结构性 (非微调) | ✅ 新增 2 个视觉元素 (lamp SVG + lamp-cone gradient) + 1 处 writing-page position 上下文 |
| 0 forbidden patterns | ✅ H1+H1b+H2 契约锁 |
| 0 冗余回归 | ✅ R1+R2+R3 契约锁 W9 baseline |
| uiPolish | ✅ 183/183 pass |
| 全套测试 | ✅ 953/953 pass |
| Build | ✅ 4.92s clean |
| diff --check | ✅ clean |
| 截图 | ✅ 3 张落盘 (1280 filled + empty + 640 mobile) |
| 临时脚本 | ✅ 已删 |

---

## 8. 报告附录

### 8.1 调研依据

- 用户原始 brief: "Writing 总体方向良好, 但不够立体, 没有很好的记忆点. 不要继续只调小阴影/边框. 记忆点必须在 1280 截图里一眼可见"
- 上轮 ship baseline: W9 (cork 单行降级 + 5 处立体感签名) + W4 (中央 dossier pin 移除) + LUSION-R1 (8 条可迁移原则)
- kao token 系统: --archive-paper / --archive-ink / --archive-gold / --archive-rose / --archive-olive 全 archive-* token 已在 main.css L95-99 / L166-170 定义

### 8.2 与 LUSION-R1 §5 P4 + P5 关联

W10 灯 = LUSION-R1 P4 (scroll indicator 文案递进) + P5 (项目卡 3 段式) 之外的**第三条结构改造**:
- P4 = 文案层 (scroll 文字)
- P5 = 卡片层 (item 3 段式)
- W10 = 视觉锚点层 (灯 + cone 景深) — **结构性补充**, 不是替代

### 8.3 文件清单 (最终)

| 文件 | 改动 |
|---|---|
| `src/pages/Writing.vue` | +37 行 template (lamp SVG + lamp-cone) |
| `src/styles/themes/kao.css` | +60 行 CSS (.wall__lamp + .wall__lamp-svg + .wall__lamp-cone + writing-page position: relative) |
| `src/__tests__/uiPolish.test.js` | +153 行 (13 个 W10 契约 in 1 个 describe block) |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/writing-w10-1280.png` | new 169 KB |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/writing-w10-empty-1280.png` | new 152 KB |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/writing-w10-640.png` | new 85 KB |
| `docs/agent-runs/2026-06-21-ui-lusion-r10/UI-W10.report.md` | new (本文件) |

### 8.4 与 W5R / W9 关系

- W5R (2026-06-20): verdict DEFER, 同样方案降级 → W10 落地
- W9 (2026-06-21): cork 188→80px 单行 + 5 处按钮立体感 + uiPolish 8 契约
- **W10 (本轮)**: 在 W9 基础上加入 lamp + cone 强记忆点, 共 +13 个契约 + 3 截图

W10 不是替代 W9, 是 W9 之后的**第二轮结构性 polish**. W9 已 ship, W10 在 W9 既有基线上叠加 (而非破坏).

---

## 9. 修改前后视觉对比

### Before (W9 ship 状态)
- 顶栏 64-80px 单行, 棕色 cork 纹理
- 中央 dossier 周围平面 brown gradient, 没有"被光照射"的视觉
- 没有结构性视觉锚点 — 用户进页看到"墙 + 桌子 + 稿纸", 但**没有记忆点**

### After (W10 ship 状态)
- 顶栏同 W9 (cork 单行)
- **新增右上角悬挂编辑灯**: 黑色灯罩 + 金属摇臂 + 灯泡辉光 (3 元素组合)
- **新增暖色光锥**: 从灯位置向左下扩散, 中央 dossier 区被 22-32% gold 照亮, 边缘 14% ink 变暗
- **景深**: molding (暗, 背景) → cork (中, 棕) → dossier (亮, 前景被光) 三层区分明显

**记忆点验证**: 截图打开第一眼, 右上角的灯 + 暖色光锥立刻可见. 用户即使不看其他部分, 也能记住"这是一个被工作灯照亮的编辑室". 通过.

---

**END OF UI-W10 REPORT**