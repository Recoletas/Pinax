# PINAX-LUSION-SPEC — Lusion 调研综合 + Pinax 下一轮 UI 方向

- **Author**: Claude Code (PINAX-LUSION-SPEC 综合窗口, 2026-06-21)
- **Inputs**: LUSION-R1 / R2 / R3 三份只读调研报告 + W9/N9/E9 ship 报告 + 截图
- **Output**:
  - Spec: `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md`
  - 本报告: `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md`
- **Status**: 待 Codex 拍板 6 个 open questions

---

## 0. TL;DR (先看这里)

**Pinax 下一轮方向 (如果决定继续 UI polish)**: "档案册仪式感" — **不学 Lusion 的 3D / Wow factor, 学 Lusion 的结构思维** (per-item 身份 / section 边界 / 仪式动效 / 一致签名), 用 Pinax 的工具 (CSS token + box-shadow + clip-path) 复刻.

> ⚠️ **关于 UI-R8 verdict "STOP NOW" 的 fork 说明** (per QA-LUSION F1):
>
> 本 spec 是 **UI-R8 verdict "STOP NOW" 之外的备选路径** — 即"如果 Codex / user 决定再走 1 轮 UI polish, 应该 ship 哪个 slice"。
>
> - **UI-R7** (E6A + N6 ship 之前) 推荐 "ONE MORE ROUND, only Writing" — 见 `docs/agent-runs/2026-06-21-ui-fix/UI-R7-visual-direction-review.md`
> - **UI-R8** (E6A + N6 ship 之后) 推荐 "STOP NOW" — E6A + N6 已 ship 是本轮结束点, W5R 永久 DEFER, E6B 取消 — 见 `docs/agent-runs/2026-06-21-ui-fix/UI-R8-stop-continue.md`
> - **本 spec (E10)** 是 R8 verdict 之外的 "如果决定再走 1 轮" 提案, 限于 Experience ledger-spread 翻页仪式, **不是 R7 的 Writing 候选 C**
>
> **Codex 合法拍板结果** (per QA-LUSION F3):
> 1. **ACCEPT** — ship E10 后停止 UI polish
> 2. **DEFER** — 推迟到下一轮 spec (本 spec 落档, 等新触发条件)
> 3. **REJECT** — 永久不做, UI polish 止于 E6A + N6 (per R8)
>
> 三种拍板结果都合法。本 spec 不隐含"必须 ship"压力。
>
> **未拍板前不实施 E10** (per QA-LUSION F4).

**1 个主 slice**: **UI-E10 — Experience ledger-spread 翻页仪式** (`src/components/GamePanel.vue` + tests), 包含 3 条 Lusion 经验:
1. **R3 §4.3 #1 rotateY enter** — spread mount 时 `rotateY(-8deg) → 0deg + opacity 0 → 1`, 600ms cubic-bezier(0.22, 1, 0.36, 1) 入场
2. **R2 §4 cross scroll prompt** — spread 末尾加 `+ cross mark` (archive-folio 风格, 不是 Lusion 箭头), 提示"翻下页"
3. **R3 §4.3 #2 simplified** — 长旁白 spread 顶部 "续 · 接上页" mark 加 5×5px rose dot (跟 W9 `wall__pin-dot` 同款)

**3 张截图**: experience-e10-{enter-1280, cross-mark-1280, 640}.png, 临时脚本 `/tmp/e10-take-screenshots.py` 跑完即 `rm -f` (per E9 §4.4).

**8+ uiPolish 契约 + 1 atomic commit (Co-Authored-By 0)** — 跟 E9 ship gate 一致.

**绝不做的** (Lusion R2/R3 禁区 + R7 边际收益递减):
- WebGL / canvas / 3D scene / cursor trail / preloader 数字滚动
- 整页 transform / 全局色板切换
- per-item data-color-* 全套迁移 (留给 N10+)
- z-tier + easing token 跨页基础设施 (留给单独 spec)
- Welcome launch session CTA / worldbook 卡片 (Welcome scope, 本轮 E scope)
- 任何 micro polish (字号 / 阴影 / hover scale 1.02 / chapter-rule 颜色微调)

---

## 1. 三份 Lusion 调研综合

### 1.1 R1 (结构) 核心 8 条可迁移

| R1 §5 P# | 原则 | 迁移成本 |
|---|---|---|
| P1 | Section ID 命名 + container 双层剥离 | M (改名不动 CSS) |
| P2 | Per-item `data-color-*` 三件套 | S (CSS attribute selector) |
| P3 | CTA 一致签名 (dot + text + SVG arrow) | M (建立 utility) |
| P4 | Scroll indicator 文案递进 (邀请 → 命令) | S (新增文案) |
| P5 | 项目卡 3 段式 (image + meta + name+icon) | M |
| P6 | End-section 装饰 3 件套 + 整段可点 | M |
| P7 | Mega menu 内嵌 4 类模块 | M (AppShell scope) |
| P8 | Header 持久 CTA (右上) | S |

**本 spec 吸收 1 条 (P4)** — spread 末尾 "· 接下页 ·" 文案 + cross mark, R1 §5 P4 的简化版.

### 1.2 R2 (交互) 核心 12 条观察

| R2 §# | 模式 | Pinax 落地 |
|---|---|---|
| §1 | hover dot scale-in + 双 text clone + 双 dot hamburger + CTA hover translate | 部分借鉴 (R3 §4.1-4.3 落地) |
| §2 | menu open 4 section 阶梯延迟 + 全局 chrome 换色 | R3 §3.2 提到 z-tier |
| §3 | **`data-color-bg / data-color-text / data-color-shadow` 三件套** (Lusion 整站最值钱机制) | **本 spec 不做** (N10+ scope) |
| §4 | 10 个 mapping 表格 — Pinax 落地候选 | spread enter (本 spec) + others (后续) |
| §5 | **10 条不能复制** — WebGL / 圆角卡 / scroll-jacking / preloader / 整页 transform / 双 text clone 默认 / text translate hover / will-change 累积 / SVG arrow 永久 / data-color-shadow | **本 spec 严格遵守** |

**本 spec 吸收 1 条 (§4 cross scroll prompt)** + 遵守 §5 全部 10 条禁区.

### 1.3 R3 (视觉) 核心 5 维度对比

| 维度 | Lusion | Pinax 当前 | R3 推荐 |
|---|---|---|---|
| 纸张厚度 | canvas + opacity 模拟前后景 | FolioSurface (decorated ::after notch) + dossier-tape | `thickness` prop on FolioSurface (本 spec 不做) |
| 空间层级 | 5 层 z-index (canvas/main/header/footer/body), 透明 over canvas | cork z=1 / dossier-tape z=4 / floor 默认 | z-tier token (`--z-stage-wall/paper/cta`, 本 spec 不做) |
| 场景边界 | instant switch (无 cross-fade) | 硬边界 (border / shadow / notch) | 加 1px horizontal hairline (本 spec 不做) |
| 对象动线 | cursor trail (12px circle + 4 帧 trail) | W9 tab hover translateY(-1px) | dossier focus motion path (本 spec 简化做 spread enter) |
| Typography | Neue Haas Grotesk Display 50-100 weight + Tracking -0.02em | LXGW WenKai 书法 + Iowan Old Style + system-ui 三套 | display / body / meta opacity 阶梯 (本 spec 不做) |

**本 spec 吸收 1 条 (对象动线 — spread enter)** — 是 R3 §3.4 唯一明确推荐的"主 scene" 动效.

### 1.4 三报告交集 = 1 个动作

| 报告 | 推荐 | E10 是否吸收 |
|---|---|---|
| R1 §5 P4 | scroll indicator 文案递进 | ✓ (spread 末尾 cross mark) |
| R2 §4 | cross scroll prompt | ✓ (同款) |
| R3 §4.3 #1 | rotateY enter | ✓ (spread mount) |
| R3 §4.3 #2 | chapter-rule → 折痕 (高风险) | ✓ 简化 (续翻 mark 加 dot) |
| R2 §3.1 | per-item data-color (Lusion 最值钱) | ✗ (N10+ scope) |
| R3 §7 | z-tier + easing token (基础设施) | ✗ (跨 3 页, 单独 spec) |
| R1 §5 P6 | End-section CTA + 3 装饰 | ✗ (Welcome scope) |

**唯一交集**: "翻页仪式" = R1 P4 + R2 §4 + R3 §4.3 #1. 这就是 E10.

---

## 2. 为什么是 E10 (而不是 W10 / N10 / Welcome)

### 2.1 候选对比表

| 候选 | 单 slice 边界 | 结构 vs polish | Lusion 经验吸收 | 风险 | 推荐 |
|---|---|---|---|---|---|
| **E10 spread enter + cross + dot** | 单页 GamePanel.vue | **结构层** (新 animation layer + 新 helper + 新 element) | 3 条 (P4 + §4 + #1) | 0 (additive, E9 contract 不破) | **✓ 选** |
| W10 save-chip ink-bleed | 单按钮 | 微 polish | 1 条 (R3 §4.1 #1) | S | ✗ |
| N10 per-item mood board | 单 kind-card | 结构 (per-item 身份) | 1 条 (R2 §3.1 Lusion 最值钱) | M (跨 N9 已有) | ✗ 本轮 scope 重 |
| UI-X1 z-tier + easing token | 5 文件 cross-cutting | 基础设施 | 1 条 (R3 §7) | L (跨 3 页回归) | ✗ 单独 spec |
| Welcome launch CTA + persistent | Welcome scope | 结构 | 2 条 (R1 P6+P8) | M | ✗ Welcome scope |
| N10 + W10 + E10 (3 slices) | 跨 3 页 | — | — | L | ✗ 违反 "只选 1 个主 slice" 硬约束 |

### 2.2 为什么 E10 最 "结构" 而非 "polish"

| 维度 | E10 | W10 | N10 |
|---|---|---|---|
| 新 template element | ✓ `__continued-cross` | ✗ (只在 save-chip 加 1 个 class) | ✓ per-item `<div class="mood">` 但需要 N9 重构 |
| 新 CSS animation + keyframes | ✓ `@keyframes ledgerSpreadEnter` | ✗ | ✗ |
| 新 helper function | ✓ `isLastSpread(spread, sIdx)` | ✗ | ✗ |
| 新 visual signal | ✓ cross mark + dot mark | ✗ (只改 box-shadow lerp) | ✓ (改色) |
| 对应 Lusion 经验 | **3 条** | 1 条 | 1 条 |
| 边际收益 | **高** (E9 已 ship 结构, E10 加仪式) | 中 (单按钮) | 中 (per-item 重做) |

**E10 是 R7/R8 "再做 1 轮" 的最优解**: 不是 polish (R7 verdict "边际收益小"), 是 "已有结构加仪式" (R8 verdict 接受).

### 2.3 为什么不是 N10 (per-item mood board)

per-item mood board 是 R2 §3 明确推荐的"Lusion 最值钱机制", 但:
1. **scope 太重**: 要改 N9 已 ship 的 canvas-pinboard + N5C material-entry-card + active-card 全套, 跨 1+ 文件 + 既有 contract
2. **第一眼不直观**: per-item 色变化需要 3+ 张 slip 对比才能看出, 不是 first-glance
3. **依赖 kind 体系稳定**: 当前 7 类 token 还在迭代, 改色风险高

**per-item 留给 N10+ (下一轮 spec)**, 本轮 E10 走仪式感路线更可控.

---

## 3. 文件范围 / 禁止范围 (E10 ship)

### 3.1 必改 (2 个)

| 文件 | 改动 |
|---|---|
| `src/components/GamePanel.vue` | scoped CSS 加 `@keyframes ledgerSpreadEnter` + `.ledger-spread { animation }` + `.ledger-spread__continued-cross` + `.ledger-spread__continued-mark::before` + `isLastSpread` helper. template 加 1 个 `<span class="ledger-spread__continued-cross">` (v-if gated). |
| `src/__tests__/uiPolish.test.js` | 新 `describe('ui polish — UI-E10 Experience ledger spread 翻页仪式', ...)` block, ≥ 8 contracts. |

### 3.2 0 改 (硬约束)

| 文件 | 理由 |
|---|---|
| `src/pages/Experience.vue` | E9 spec scope 外 |
| `src/pages/Notes.vue` | N9 已 ship |
| `src/pages/Writing.vue` | W9 已 ship |
| `src/styles/themes/kao.css` | E9 scoped CSS 在 GamePanel.vue 内 |
| `src/styles/main.css` | 无 token 改动 |
| `src/stores/**` | E9 §4.2 0 store mutation |
| `src/services/**` | E9 §4.2 0 service 改 |
| `src/server/**` | E9 §4.2 0 server 改 |
| `src/router/**` | E9 §4.2 0 router 改 |
| `src/components/InputArea.vue` | 不在本 slice |
| `src/components/folio/**` | E9 不动 FolioSurface |
| `src/pages/OpeningPage.vue` | 不在本 slice |
| `src/views/WelcomeView.vue` | 不在本 slice |

### 3.3 Forbidden patterns

| 模式 | 理由 |
|---|---|
| `:global(.theme-kao)` | Pinax 用 vue scoped, 不需要 :global |
| `!important` | 违反 E9 + R3 §5 不该做 |
| broad `:deep(*)` | 违反 E9 + 不需要 |
| random raw hex in kao block | 全部走 var(--archive-*) + color-mix |
| store mutation | 0 store 改 |
| service / router / server change | 0 改 |
| **WebGL / canvas / Three.js** | Lusion R2 §5 + R3 §5 #2 禁区 |
| **cursor trail / custom cursor** | Lusion R3 §5 #4 禁区, 干扰 typing |
| **preloader 数字滚动** (在 Experience 工作台) | Lusion R2 §5 禁区 |
| **整页 transform / 全局色板切换** | Lusion R3 §5 #1+#3 禁区 |

---

## 4. 验收截图 (3 张必跑)

| 文件 | 用途 |
|---|---|
| `docs/agent-runs/2026-06-21-ui-fix/experience-e10-enter-1280.png` | ledger-spread mount 时, 看到 rotateY 入场中间帧 (opacity ≈ 0.5, rotateY ≈ -4deg) |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e10-cross-mark-1280.png` | 滚到第 2 个 spread, 看到末尾 `+ cross mark` 可见 (在 chapter-rule 之后, ink-stamp 之前) |
| `docs/agent-runs/2026-06-21-ui-fix/experience-e10-640.png` | 移动端 spread (≤720px 折叠为单列), cross mark 仍可见 |

**截图脚本** `/tmp/e10-take-screenshots.py` 跑完即 `rm -f` (per E9 §4.4 强制).

---

## 5. 测试要求

### 5.1 必跑

```bash
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js
npm run test:run    # 全量 sanity
npm run build
git diff --check
```

### 5.2 新 uiPolish contract (≥ 8 条)

1. `__continued-cross` 元素存在 + `v-if="!isLastSpread(spread, sIdx)"` gate
2. `__continued-cross` 渲染 cross shape (::before 横 + ::after 竖, 都 background: currentColor)
3. `__continued-mark::before` rose 5×5px dot (跟 W9 wall__pin-dot 同款)
4. `.ledger-spread { animation: ledgerSpreadEnter 600ms cubic-bezier(...) }`
5. `@keyframes ledgerSpreadEnter` from rotateY(-8deg) translateX(-12px) opacity 0 → to rotateY(0deg) translateX(0) opacity 1
6. `prefers-reduced-motion: reduce` 块包含 `.theme-kao .ledger-spread { animation: none; transform: none; opacity: 1 }`
7. `isLastSpread` helper 存在 (script setup 内)
8. hard constraint — 0 new forbidden patterns + E9 既有 8 contract 不破

### 5.3 full test suite pass criterion

- uiPolish: ≥ 168 + 8 = 176 tests pass
- gamePanelMechanism: 1 test pass
- 全量: ≥ 887 + 8 = 895 tests pass
- build clean
- diff --check clean
- 0 forbidden patterns

---

## 6. 明确哪些 Lusion 元素不做

### 6.1 性能重型 3D (Lusion R2 §5 + R3 §5 #2 禁区)

| 元素 | 为什么不做 |
|---|---|
| WebGL / Three.js / TSL shader | 写作工具, 无 3D 资产; 5A/5B/5C 立绘已经够用 |
| Canvas 3D scene 当 background | 拖慢 typing, 破坏 archive-folio 隐喻 |
| 滚动 parallax | W9 cork 是"纸摊在桌上", 滚走就是滚走, 不是 fixed |
| Cursor trail | 干扰 typing 主任务 |
| Preloader 数字滚动 | 写作工具进 app < 200ms 可见 |
| 整页 transform / scroll-jacking | 破坏 user mental model |
| Border-radius 15px 圆角卡 | Pinax kao mode 硬切角 0 radius, 圆角破坏 archive-folio |
| Hover text translate 1.5em 右滑 | 干扰"打字/选段" 主任务 |
| `will-change: transform` 多处 | 烧 GPU memory, R2 §5 禁区 |
| `data-color-shadow` 数字 opacity | Lusion shadow 几乎看不出差, Pinax 已有 archive-ink shadow |

### 6.2 本 spec 范围内"延后" (留后续 spec)

| 元素 | 来源 | 后续 spec |
|---|---|---|
| Per-item `data-archive-*` 三件套 (N10) | R2 §3.1 + R3 §4.2 #2 | N10 spec |
| Save-chip ink-bleed (W10) | R3 §4.1 #1 | W10 spec |
| Z-tier + easing token 跨页基础设施 | R3 §7 | UI-X1 spec |
| Welcome launch session CTA + persistent CTA | R1 §5 P6 + P8 | Welcome spec |
| Worldbook 卡片 `data-archive-bg` | R3 §4.0 #2 | Welcome spec |
| Drawing hover mask slide-up | R3 §4.1 #2 | W10+ spec |
| `thickness` prop on FolioSurface | R3 §3.1 | FolioSurface spec |
| `--z-stage-wall/paper/cta` token | R3 §3.2 | UI-X1 spec |

每个延后项目单独立 spec, 不进本 spec.

---

## 7. anti-micro-tweak 检验

### 7.1 接受的"结构性"动作 (≥ 3 个, per AGENTS.md)

| # | 动作 | 类型 |
|---|---|---|
| 1 | 新增 `__continued-cross` 元素 + v-if gate | 新 template element |
| 2 | 新增 `@keyframes ledgerSpreadEnter` + `.ledger-spread { animation }` | 新 CSS animation |
| 3 | 新增 `isLastSpread(spread, sIdx)` helper | 新派生函数 |
| 4 | `__continued-mark::before` 加 rose dot | 既有元素视觉强化 |

### 7.2 拒绝的"micro polish"反例

| 反例 | 为什么拒 |
|---|---|
| 只改 ledger-spread padding / box-shadow 数值 | 不动结构 |
| 只改 __continued-mark 字体大小 | 不动结构 |
| 只加 hover scale 1.02 | 不动结构, 跟 R7 边际收益递减一致 |
| 只把 chapter-rule ribbon 颜色从 gold 32% 改成 gold 36% | 改 token 数值不算 polish |
| 只把 page-header 时间字号 11px → 12px | 字号微调不算 |

---

## 8. 风险和缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| spread enter animation 在长对话 (>50 条) 触发频繁 | M | mount-time only, 不是每条 message trigger; `messageSpreads` reactive 重算时**不**重 mount (Vue diff) |
| rotateY + perspective 在 Firefox/Safari 渲染异常 | S | perspective 1200px 标准值, 主流 modern browser 都支持 |
| 续翻 cross mark 在最后 1 个 spread 不该显示 | 0 | `isLastSpread` helper 跟 `isStandaloneMessage` 同位置, v-if gate |
| E9 既有 8 contract 被破坏 | L | E10 contract #8 显式锁 E9 字面量不破 |
| 跨页影响 (W9/N9 不动) | 0 | E10 仅 GamePanel.vue, 不跨页 import |
| 临时脚本泄露到 repo | L | `/tmp/e10-take-screenshots.py` 跑完 `rm -f`, find 命令验证 |
| 入场动画抢戏, user 切 chapter 太频繁 | M | `prefers-reduced-motion: reduce` 立即禁用; 600ms 不算久 |

---

## 9. ship commit 模板 (Codex 用)

```
style(experience): UI-E10 ledger-spread 翻页仪式 (Lusion-inspired)

- R3 §4.3 #1: spread mount 时 rotateY(-8deg) → 0 + opacity 0 → 1,
  600ms cubic-bezier(0.22, 1, 0.36, 1) 入场
- R2 §4 + R1 §5 P4: spread 末尾 + cross mark "· 接下页 ·" 提示
- R3 §4.3 #2 simplified: 长旁白续页 mark 加 rose 5x5px dot
- 0 store / 0 service / 0 router 改
- 0 new :global(.theme-kao) / 0 !important / 0 broad :deep(*) / 0 raw hex
- prefers-reduced-motion: reduce 禁用入场
- 8 uiPolish contracts + 3 screenshots
- 跟 E9 ledger-spread 结构 (8 contract) 不重叠, additive
```

---

## 10. 给 Codex 主控的 6 个 Open Questions

1. **Spec body 接受吗?** (推荐 yes — E10 是 R8 verdict "再做 1 轮" 的具体化)
2. **单 slice 是 E10 不是 W10/N10 接受吗?** (推荐 yes — §2.1 表格对比)
3. **3 条 Lusion 经验** (rotateY enter + cross mark + dot mark) 够吗? (推荐够 — R7 "边际收益递减" 提示不要 5 条)
4. **§3.2 不改 13 个文件 + §3.3 9 条 forbidden** 接受吗? 特别 §6.1 10 条 Lusion 禁区 (WebGL / canvas / cursor trail / preloader / etc.)
5. **测试 ≥ 8 contract + 3 张截图 + 0 store mutation + 0 service change** 接受吗? (推荐 yes, 跟 E9 ship gate 一致)
6. **截图脚本** `/tmp/e10-take-screenshots.py` 跑完即 `rm -f`, **不 ship 到 repo** 接受吗? (推荐 yes, per E9 §4.4)

---

## 11. 关键文件路径

- **本报告**: `docs/agent-runs/2026-06-21-lusion-research/PINAX-LUSION-SPEC.report.md`
- **Spec**: `docs/superpowers/specs/2026-06-21-lusion-inspired-pinax-design.md`
- **Lusion 三报告**: `docs/agent-runs/2026-06-21-lusion-research/{LUSION-R1.structure,LUSION-R2.interaction,LUSION-R3.visual-system}.md`
- **当前 W9 ship**: `docs/agent-runs/2026-06-21-ui-fix/{UI-W5R,UI-W9,UI-QA9}.report.md` + screenshots
- **当前 N9 ship**: `docs/agent-runs/2026-06-21-ui-fix/UI-N9.report.md` + notes-n9-*.png
- **当前 E9 ship**: `docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md` + experience-e9-*.png
- **R7/R8 verdict**: `docs/agent-runs/2026-06-21-ui-fix/{UI-R7-visual-direction-review,UI-R8-stop-continue}.md`
- **AGENTS.md**: hard rules + workflow
- **Project status**: `docs/STATUS.md` (Codex 在 ship 后更新)

---

**END OF PINAX-LUSION-SPEC REPORT** — 等 Codex 拍板 6 个 open questions, 然后 dispatch UI-E10 implementation.