# Lusion-Inspired Pinax Design — E10 Ledger-Spread 翻页仪式

> Status: Draft v1 (awaiting Codex 拍板 — **未拍板前不实施 E10**)
> Date: 2026-06-21
> Owner: Codex orchestrator (after this spec lands, dispatch UI-E10 implementation)
> Research inputs:
> - `docs/agent-runs/2026-06-21-lusion-research/LUSION-R1.structure.md`
> - `docs/agent-runs/2026-06-21-lusion-research/LUSION-R2.interaction.md`
> - `docs/agent-runs/2026-06-21-lusion-research/LUSION-R3.visual-system.md`
> - Current state: `docs/agent-runs/2026-06-21-ui-fix/UI-W9.{report,screenshots}` + `UI-N9.*` + `UI-E9.*`

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

## 0. 一句话方向

**Pinax 走"档案册仪式感"路线 — 不学 Lusion 的 3D/Wow factor, 而是把已有结构 (ledger-spread / canvas-pinboard / Wall dossier) 加翻页 / 钉入 / 出场微动作, 让用户感觉在操作档案册, 不是 SaaS 工具。**

## 1. Problem

### 1.1 Lusion 调研的核心结论 (三报告交集)

| 维度 | Lusion 怎么做 | Pinax 学什么 | Pinax 不学 |
|---|---|---|---|
| 叙事节奏 (R1) | 6 个 section 是 6 个 scene, section 间用 scroll indicator 桥接 | scroll indicator 文案递进 (邀请 → 命令) | 3D scene + WebGL canvas + 项目级颜色瞬切 |
| 交互语言 (R2) | hover dot scale-in + cubic-bezier(.4,0,.1,1) 400ms + 双 text clone | hover dot scale-in + cubic-bezier ease-out 400ms | 整页 transform / cursor trail / preloader 数字滚动 |
| 视觉系统 (R3) | monochrome shell + per-item color + 5 层 z-tier | per-item data-color 三件套 (R2 §3 "Lusion 最值钱机制") + z-tier token | WebGL / canvas 渲染 / 全局色板切换 / cursor trail |

### 1.2 当前 Pinax 现场 (W9/N9/E9 ship 之后)

| Surface | 已 ship 的结构 | 缺什么 |
|---|---|---|
| W9 Writing | 64-80px cork + 3-col shelf/dossier/portrait + dossier-tape + save-chip + tabs | 仪式感 (出场是 instant, 无翻页感) |
| N9 Notes | 7 类 drawer + reading-deck + canvas-pinboard (1-3 张 slip) + active-card | per-item 视觉身份 (3 张 slip 看起来一样, 只有 kind-color tab 区分) |
| E9 Experience | ledger-spread (左页 + spine + 右页) + page-header + ink-stamp + chapter-rule | 仪式感 + 续翻标记 (出场 instant, 长旁白续页 mark 已经在, 但视觉太轻) |

### 1.3 为什么"3 页都 polish"是错的

UI-R7 已经确认: 4 轮 polish 视觉收益曲线 `+++ → + → + → +` 已经趋平, "最近几轮视觉变化不大" 是 honest signal. 5C v3.x + 5B v0.1 + E6A + N9 + W5R 已经在 archive-folio 隐喻里走得很深, 继续 polish 同质化加深, 不是新语言.

**正确做法**: 选 1 个 slice, 真做"结构层" 的事 (per-item 身份 / 翻页仪式 / 空间层级), 不做 micro polish.

---

## 2. 主 slice: UI-E10 — ledger-spread 翻页仪式 (single slice)

### 2.1 为什么是 E10, 不是 W10 / N10

| 候选 | 优势 | 风险 | Lusion 经验吸收度 |
|---|---|---|---|
| **E10 spread enter + 续翻 mark** (选) | 跟 E9 已 ship 的 ledger-spread 结构直接接续, additive | 0 (CSS animation + visual mark) | **高** — R1 §5 P4 + R2 §4 cross scroll + R3 §4.3 #1+#2 三报告交集 |
| W10 save-chip ink-bleed | 单按钮级 Polish | 易做但跟 R7 "边际收益递减" 一致, 不是新结构 | 中 (R3 §4.1 #1 单点借鉴) |
| N10 per-item mood board | per-item 身份 (R2 §3 Lusion 最值钱机制) | 1 文件但跨 N9 已 ship 的 canvas-pinboard, 改色风险 | 中-高 (per-item 完整迁移要 1 轮, 本轮 scope 太重) |

**E10 是 1 个明确动作 (翻页) + 1 个明确视觉信号 (续翻 mark) 的组合, 既不破坏 E9 已 ship 的结构, 又真做"仪式感", 第一眼可见**.

### 2.2 Slice 范围

| 维度 | 范围 |
|---|---|
| **单 slice** | 仅 `src/components/GamePanel.vue` |
| **3 条 Lusion 经验** | R1 §5 P4 (scroll indicator) + R2 §4 (cross scroll prompt) + R3 §4.3 #1 (rotateY enter) |
| **加 1 条** | R3 §4.3 #2 简化: 续翻 mark 视觉强化 (不删 chapter-rule, 而是给"续 · 接上页"加 dot mark 让用户知道"翻页") |
| **不做的** | WebGL / canvas / cursor trail / 整页 transform / 3D scene / per-item data-color (留 N10+) |

### 2.3 具体改动

#### 改动 1: ledger-spread 入场动画 (R3 §4.3 #1)

```css
/* scoped CSS in GamePanel.vue */
.theme-kao .ledger-spread {
  /* E9 已 ship 的 3-row grid + paper 渐变 + border 不动 */
  /* E10 新增: 入场动画 */
  animation: ledgerSpreadEnter 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
  transform-origin: 50% 50%;
}

@keyframes ledgerSpreadEnter {
  from {
    transform: perspective(1200px) rotateY(-8deg) translateX(-12px);
    opacity: 0;
  }
  to {
    transform: perspective(1200px) rotateY(0deg) translateX(0);
    opacity: 1;
  }
}
```

**触发**: spread mount 时 (初次访问 `/experience` / 切 chapter / `loadNotes` 重载). **不是** 每条新 message 都触发 (避免噪音).

**reduced-motion guard** (per AGENTS.md hard rule #11):
```css
@media (prefers-reduced-motion: reduce) {
  .theme-kao .ledger-spread {
    animation: none;
    transform: none;
    opacity: 1;
  }
}
```

#### 改动 2: spread 末尾 cross mark "· 接下页 ·" (R2 §4 + R1 §5 P4 simplified)

不是 Lusion 的箭头, 是 archive-folio 风格的 **+ cross mark** (跟 E6A spine stitch 同款):
```css
/* 在 ledger-spread 内部, __ink-stamp 之前插入 */
.theme-kao .ledger-spread__continued-cross {
  display: block;
  text-align: center;
  margin: 18px auto 8px;
  width: 16px;
  height: 16px;
  position: relative;
  color: var(--archive-ink-soft);
  opacity: 0.55;
}
.theme-kao .ledger-spread__continued-cross::before,
.theme-kao .ledger-spread__continued-cross::after {
  content: '';
  position: absolute;
  background: currentColor;
}
.theme-kao .ledger-spread__continued-cross::before {
  top: 50%;
  left: 0;
  width: 100%;
  height: 1px;
  transform: translateY(-50%);
}
.theme-kao .ledger-spread__continued-cross::after {
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}
```

模板新增 (仅 spread 不在最后一页时显示):
```vue
<span
  v-if="!isLastSpread(spread, sIdx)"
  class="ledger-spread__continued-cross"
  aria-hidden="true"
></span>
```

#### 改动 3: 续翻 mark 视觉强化 (R3 §4.3 #2 simplified)

E9 已 ship 的 `__continued-mark` ("续 · 接上页") 在长旁白 spread 顶部. E10 加 1 个 **dot mark** 让用户感知"上一页接过来的":
```css
.theme-kao .ledger-spread__continued-mark::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--archive-rose);
  margin-right: 6px;
  vertical-align: middle;
  opacity: 0.7;
}
```

**不删** E9 既有 `__continued-mark` 文字, 只在前面加 dot mark (跟 W9 `wall__pin-dot` 同款).

#### 改动 4: 不做

| 不做 | 理由 |
|---|---|
| **chapter-rule → 书脊折痕** (R3 §4.3 #2 full) | 改 E9 已 ship 的 chapter-rule ribbon → V 缺口, 风险高 (破 E9 contract). 用改动 3 替代. |
| **WebGL / canvas / 3D** | Lusion R3 §5 #2 禁区, 性能灾难 + archive-folio 隐喻破坏 |
| **整页 transform** | Lusion R2 §5 禁区, 工作台 user mental model 破坏 |
| **cursor trail** | Lusion R3 §5 #4 禁区, 干扰 typing |
| **preloader 数字滚动** | Lusion R2 §5 禁区, 写作工具进 app < 200ms 可见 |
| **per-item data-color-* 全套迁移** (R2 §3.1 "Lusion 最值钱机制") | 是 N10+ scope, 本 slice 范围外 |
| **统一 transition curve + z-tier token** (R3 §7 推荐 UI-X1) | 是基础设施层, 跨 3 页, 本 slice 范围外 |
| **Welcome launch session CTA + persistent CTA** (R1 §5 P6+P8) | Welcome page scope, 本 slice 是 Experience 单页 |
| **Notes per-item mood board** (R3 §4.2 #2) | N10 scope |
| **Writing save-chip ink-bleed** (R3 §4.1 #1) | W10 scope |

---

## 3. Page Role (本 slice 仅改 E)

### Experience: Site Record Book → **翻页的案卷本**

E9 ship 了 ledger-spread (对开页), E10 加翻页仪式:
- spread mount 时像翻开两页 (rotateY -8 → 0, 600ms)
- spread 之间有 cross mark 提示"接下页"
- 长旁白续页 mark 顶部加 dot mark, 像"上一页的句号"

第一眼从 "对开本结构" 升级为 "翻开的案卷本" — 用户感觉在翻档案, 不是刷 chat.

---

## 4. Hard Constraints (继承 E9 + 本 slice 新增)

### 4.1 继承 E9 hard rules

1. 仅 `src/components/GamePanel.vue` + `src/__tests__/uiPolish.test.js` (per E9 §4.1)
2. 0 store / 0 service / 0 router 改 (per E9 §4.2)
3. 0 `:global(.theme-kao)` / 0 `!important` / 0 broad `:deep(*)` / kao block 内 0 raw hex (per E9 §4.3)
4. `prefers-reduced-motion: reduce` 必须禁用所有新 animation (per AGENTS.md hard rule #11)

### 4.2 本 slice 新增

5. 0 store mutation: `gameStore.<method> =` regex 仍 0 (E9 contract 继续生效)
6. 0 改 E9 既有 8 个 contract 的字面量: `<article class="ledger-spread">` / `__page-header` / `__sheets` / `__spine` / `__red-rule` / `__ink-stamp` / `__continued-mark` / `LONG_ASSISTANT_CHARS = 280` / `messageSpreads` computed — **全部不动**
7. 0 改 `messageSpreads` computed 的派生逻辑: `recordVolume` / `spreadHeaderDate` / `spreadHeaderStamp` / `isStandaloneMessage` / `continued` — 全部不动
8. 新增 scoped CSS 只允许: `.ledger-spread { animation }` + `@keyframes ledgerSpreadEnter` + `.ledger-spread__continued-cross` + `.ledger-spread__continued-mark::before`
9. 新增 template 只允许: `<span class="ledger-spread__continued-cross">` (1 个 element, 用 v-if gate)
10. 新增 `isLastSpread` helper function: 跟 E9 既有 `isStandaloneMessage` 同位置定义, 仅 1 个 `return` + 1 个 boolean
11. 截图脚本必须不 ship 到 repo (`/tmp/e10-take-screenshots.py` 跑完即 `rm -f`, per E9 §4.4)
12. 新 uiPolish contract ≥ 8 条 (锁 E10 4 个改动 + 不破 E9)

---

## 5. Anti-Micro-Tweak Gate (继承 AGENTS.md + 本 slice)

本 slice 必须包含 ≥ 3 个"结构性"动作:

1. **新 template 元素**: `__continued-cross` 是 E9 没有的新 element, **不**是改字面量
2. **新 CSS 动画 + 关键帧**: `ledgerSpreadEnter` 600ms cubic-bezier 入场是 E9 没有的新 layer
3. **新 helper function**: `isLastSpread(spread, sIdx)` 是 E9 没有的派生 function
4. **续翻 mark 加 dot mark**: `__continued-mark::before` 是 E9 既有元素的视觉强化 (跟 W9 `wall__pin-dot` 同款), 不是替换

**通过的 anti-micro-tweak 检查**: 改空间层级 (animation layer) + 改 element 集合 (新 __continued-cross) + 改派生逻辑 (isLastSpread helper).

**拒绝的反例** (如果 worker 提交这些, 视为 micro polish):
- 只改 ledger-spread padding / box-shadow 数值
- 只改 __continued-mark 字体大小
- 只加 hover scale 1.02
- 只把 chapter-rule ribbon 颜色从 gold 32% 改成 gold 36%

---

## 6. File Scope

### 6.1 必改 (2 个)

| 文件 | 改动 |
|---|---|
| `src/components/GamePanel.vue` | scoped CSS 加 `@keyframes ledgerSpreadEnter` + `.ledger-spread { animation }` + `.ledger-spread__continued-cross` + `.ledger-spread__continued-mark::before` + `.is-last-spread` helper. template 加 `<span class="ledger-spread__continued-cross" v-if="!isLastSpread(spread, sIdx)">`. |
| `src/__tests__/uiPolish.test.js` | 新 `describe('ui polish — UI-E10 Experience ledger spread 翻页仪式', ...)` block, ≥ 8 contracts. |

### 6.2 0 改 (硬约束)

| 文件 | 理由 |
|---|---|
| `src/pages/Experience.vue` | E9 spec scope 外 |
| `src/pages/Notes.vue` | N9 已 ship, 不动 |
| `src/pages/Writing.vue` | W9 已 ship, 不动 |
| `src/styles/themes/kao.css` | E9 scoped CSS 在 GamePanel.vue 内, 不污染 kao.css |
| `src/styles/main.css` | 无 transition / token 改动 |
| `src/stores/**` | E9 §4.2 0 store mutation |
| `src/services/**` | E9 §4.2 0 service 改 |
| `src/server/**` | E9 §4.2 0 server 改 |
| `src/router/**` | E9 §4.2 0 router 改 |
| `src/components/InputArea.vue` | 不在本 slice scope |
| `src/components/folio/**` | E9 不动 FolioSurface |
| `src/pages/OpeningPage.vue` | 不在本 slice scope |
| `src/views/WelcomeView.vue` | 不在本 slice scope |
| `docs/STATUS.md` | 由 Codex 在 ship 后更新 (per AGENTS.md docs-status-handoff) |

### 6.3 Forbidden patterns (继承 E9 §4.3)

- 0 `:global(.theme-kao)` (Lusion R2 §1 风格的全局联动在 Pinax 用 vue scoped CSS 实现, 不需要 :global)
- 0 `!important` (R3 §3 不该做, Pinax 也不该做)
- 0 broad `:deep(*)` (R3 §5 #5 不该加 will-change 累积, broad :deep 也不需要)
- 0 random raw hex in kao block (Lusion 颜色有 data-color, Pinax 用 var(--archive-*))
- 0 store mutation
- 0 service / router change
- 0 WebGL / canvas / Three.js
- 0 cursor trail / custom cursor
- 0 preloader 数字滚动 (在 Experience 工作台不能加)

---

## 7. Acceptance / Verification

### 7.1 测试 (per AGENTS.md testing-verification skill)

```bash
# 必跑 (per brief)
npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js

# 全量 (sanity)
npm run test:run

# Build
npm run build

# Diff
git diff --check

# Forbidden patterns
git diff HEAD -- src/components/GamePanel.vue src/__tests__/uiPolish.test.js \
  | grep -nE ":global\(\.theme-kao\)|:deep\(\s*\)|!important|#[0-9a-fA-F]{3,8}\b"
# 期望: 0 match (测试 regex literal 内的除外)
```

**Pass criterion**: 测试 0 fail (含 E9 既有 8 contract + 本 slice 新 ≥ 8 contract) + build clean + diff --check clean + forbidden 0 命中.

### 7.2 截图 (per brief)

`docs/agent-runs/2026-06-21-ui-fix/`:
- `experience-e10-enter-1280.png` — ledger-spread mount 时, 看到 rotateY 入场中间帧
- `experience-e10-cross-mark-1280.png` — spread 末尾 cross mark 可见
- `experience-e10-640.png` — 移动端 spread (≤720px 折叠为单列), cross mark 仍可见

**截图要求**:
- 1280×800 light + dark (kao mode 必备, R7 §1.1 E9 follow-up 已加 dark)
- 640×800 移动端降级
- 临时脚本 `/tmp/e10-take-screenshots.py` 跑完即删, **不 ship 到 repo**

### 7.3 uiPolish 契约 (≥ 8 条)

E10 contract 锁:
1. `__continued-cross` 元素存在 + `v-if="!isLastSpread(spread, sIdx)"`
2. `__continued-cross` 渲染 cross shape (::before 横向 + ::after 纵向, 都 background: currentColor)
3. `__continued-mark::before` 加 rose 5x5px dot (跟 W9 wall__pin-dot 同款)
4. `.ledger-spread { animation: ledgerSpreadEnter 600ms cubic-bezier(...) }`
5. `@keyframes ledgerSpreadEnter` from rotateY(-8deg) translateX(-12px) opacity 0 → to rotateY(0deg) translateX(0) opacity 1
6. `prefers-reduced-motion: reduce` 块包含 `.theme-kao .ledger-spread { animation: none; transform: none; opacity: 1 }`
7. `isLastSpread` helper 存在 + 跟 E9 既有 `isStandaloneMessage` 同位置 (script setup 内)
8. hard constraint — 0 new `:global(.theme-kao)` / 0 new `!important` / 0 new broad `:deep(*)` / kao block 0 raw hex / 0 store mutation / 0 service/router change / E9 既有 8 contract 不破 (`<article class="ledger-spread">` / `__page-header` / `__sheets` / `__spine` / `__red-rule` / `__ink-stamp` / `__continued-mark` / `LONG_ASSISTANT_CHARS` 仍存在)

### 7.4 manual smoke (Codex 验收时跑)

1. 进 `/experience`, 看到第 1 个 spread mount 时有 rotateY 入场 (600ms 后静止)
2. 滚到第 2 个 spread, 看到末尾 cross mark "· 接下页 ·" (实际是 + cross, 不是文字)
3. 长旁白 (>280 字符) spread 顶部 "续 · 接上页" 文字前有 rose dot mark
4. 系统设置 → 启用 prefers-reduced-motion → 刷新 → 入场动画消失, spread 立即可见
5. 切 legacy variant → spread 仍正常显示 (animation 是 .theme-kao gated, legacy 不动)
6. 切 dark mode → spread + cross mark + dot mark 仍可见 (kao.css theme-dark 覆盖)

---

## 8. Out of Scope (后续轮次)

| 候选 | 来源 | 优先级 |
|---|---|---|
| N10 per-item mood board | R2 §3 + R3 §4.2 #2 | 高 (per-item 身份是 Lusion 最值钱机制, 但本 slice 范围外) |
| W10 save-chip ink-bleed | R3 §4.1 #1 | 中 (单按钮 Polish, 不够"主 slice") |
| UI-X1 z-tier + easing token 跨页基础设施 | R3 §7 | 中 (跨 3 页, 需要单独 spec) |
| Welcome launch session CTA + persistent CTA | R1 §5 P6+P8 | 中 (Welcome scope, 本轮 E scope) |
| Worldbook 卡片 data-archive-bg | R3 §4.0 #2 | 中 (Welcome scope) |
| Drawing hover mask slide-up | R3 §4.1 #2 | 低 (Chapter title hover 增强) |

每个后续 slice 单独立 spec, 不进本 spec.

---

## 9. References

- **Lusion 调研**: `docs/agent-runs/2026-06-21-lusion-research/{R1,R2,R3}.md`
- **当前 E9 ship gate**: `docs/agent-runs/2026-06-21-ui-fix/UI-E9.report.md` (8 contract 169/169 pass)
- **E9 brief / spec 链**: `docs/agent-runs/2026-06-21-ui-fix/UI-E6-implementation-plan.md` + `UI-E6A.report.md`
- **R7/R8 visual direction**: `UI-R7-visual-direction-review.md` + `UI-R8-stop-continue.md` (R7 推荐 ONE WRITING ROUND; R8 推荐 STOP NOW — 本 spec 是 R8 verdict 的"再做 1 轮", 限于 Experience ledger-spread 翻页仪式, 不是 R7 的 Writing 候选 C)
- **Project rules**: `AGENTS.md` (ui-style-check / testing-verification / commit-conventions / docs-status-handoff)
- **5A/5B/5C**: character art + 立绘体系 (per 项目 立体感, 本 spec 不动)
- **theme-system**: `.theme-kao` / `.theme-legacy` 双变体, 本 spec 不动

---

## 10. Open Questions for Codex

> 本 spec 与 `PINAX-LUSION-SPEC.report.md` §10 保持一致的 6 个问题. **拍板前不实施 E10** (per QA-LUSION F4).

1. **Spec body 接受吗?** (推荐 yes — E10 是 R8 verdict "再做 1 轮" 的具体化)
2. **单 slice 是 E10 不是 W10/N10 接受吗?** (推荐 yes — §2.1 表格对比)
3. **3 条 Lusion 经验** (rotateY enter + cross mark + dot mark) 够吗? (推荐够 — R7 "边际收益递减" 提示不要 5 条)
4. **§6.2 0 改 13 个文件 + §6.3 9 条 forbidden + §2.4 10 条 Lusion 禁区** 接受吗? 特别 §2.4 10 条 Lusion 禁区 (WebGL / canvas / cursor trail / preloader / etc.)
5. **测试 ≥ 8 contract + 3 张截图 + 0 store mutation + 0 service change** 接受吗? (推荐 yes, 跟 E9 ship gate 一致)
6. **截图脚本** `/tmp/e10-take-screenshots.py` 跑完即 `rm -f`, **不 ship 到 repo** 接受吗? (推荐 yes, per E9 §4.4)

---

**END OF SPEC** — 等待 Codex 拍板, 然后 dispatch UI-E10 implementation.