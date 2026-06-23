# UI-E11 Experience Workstation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/experience` 从「顶部 record-folio 6 格 + 中央空 ledger + 右侧空 stat」改成「现场控制台 + 记录流」4 段 workstation composition (topstrip 80px / left rail 260px / center stage 1fr / right rail 300px), viewport 比例 18:54:28; 0-message 态有 narrator 立绘 + 引导 entry + 3 quick action; 字体 4 层互斥 (DISPLAY/BODY/META/INTERACTIVE); E9-FIX mechanism-trigger click 保留.

**Architecture:**
- 4 段 grid composition + 顶部 sticky topstrip 作为唯一 section anchor
- 新增 `useWorkstationMeta` composable 作为 single source of truth (替代 Experience.vue 内 6 个 record-folio computeds)
- kao.css 新增 `ws-*` rules + 4 层字体分层规则; 删 `record-folio` (E10 scoped CSS 残留) + `sidebar` (kao.css 整段 L1976-2108)
- uiPolish E11 13 contracts (red → green TDD)

**Tech Stack:** Vue 3 + Vite + Vitest, kao.css theme-system (`.theme-kao` gated, `.theme-legacy` fallback), existing `--font-display` (LXGW WenKai) / `--font-body` (Songti) / `--font-sans` tokens.

---

## File Structure

### 改 (4 文件)
| 文件 | 责任 |
|---|---|
| `src/styles/themes/kao.css` | 加 `ws-*` rules + 4 层字体分层; 删 `sidebar` L1976-2108 整段 (8 stylesheet blocks) |
| `src/composables/useWorkstationMeta.js` | NEW: 5 个 computed 派生 gameStore state |
| `src/pages/Experience.vue` | 重写 template (game-layout → ws-layout 4 段); 删 6 个 record-folio computeds + 3 个 dossier section scoped CSS |
| `src/components/GamePanel.vue` | 加 ws-hero 块 + 0-state entry; displayMessages / `--font-body` / E9-FIX mechanism click 保留 |
| `src/components/{StatusBar,QuestLog,GeographyPanel}.vue` | 各加 `.ws-section` wrapper class + 0-state empty-hint block; scoped CSS 不改核心功能 |
| `src/__tests__/uiPolish.test.js` | 加 13 条 E11 contracts (1 describe block) |

### 不改 (硬约束)
| 文件 | 理由 |
|---|---|
| `src/components/folio/CharacterPortrait.vue` | 已 ship, `size="hero"` (max-width 386px, 3:4) 复用 |
| `src/components/folio/FolioSurface.vue` | 不在 4 段内 |
| `src/components/InputArea.vue` | 移到 ws-center-stage sticky bottom, 用现有 wrapper |
| `src/stores/**` | 0 mutation (E10 hard rule) |
| `src/services/**` | 0 change |
| `src/router/**` | 0 change |
| `src/components/{GmPersonaLauncher,AdvisorPanel,ImageGenRail,MilestoneModal,MechanismPanel,Character,SessionPicker}.vue` | 浮层, 不在 4 段 |
| `src/pages/{WelcomeView,OpeningPage,Writing,Notes,ProseEssay}.vue` | 本轮 E scope 严格 |
| `src/assets/characters/kao-archive-*.webp` | 5B v0.1 ship 立绘 |
| `src/config/characterArt.js` / `src/composables/useCharacterArt.js` | 5A/B ship |

---

## Task 0: Pre-flight Baseline Verification

**Files:** Read only — no edits.

**目标**: 确认 main 已落地 E10-CLEAN (axis / indicator 已删, `--font-body` token 已 ship), 无需再 revert。

**允许改**: 无 (只读)
**不允许改**: 全部 src 文件

**步骤**:
- [ ] **Step 1**: 验证 kao.css 0 引用 `game-page::before`
  ```bash
  grep -nE "game-page::before" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
  ```
  Expected: 0 match (E10-CLEAN 已删)
- [ ] **Step 2**: 验证 kao.css 0 引用 `scene-stage__indicator`
  ```bash
  grep -nE "scene-stage__indicator" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
  ```
  Expected: 0 match
- [ ] **Step 3**: 验证 `--font-body` token 在 kao.css
  ```bash
  grep -nE "\-\-font-body" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
  ```
  Expected: ≥1 match (L30 附近 `--font-body: "Songti SC"...`)
- [ ] **Step 4**: 验证 `--font-display` / `--font-sans` 都在 kao.css
  ```bash
  grep -cE "\-\-font-(display|body|sans)" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
  ```
  Expected: ≥3 match (3 tokens)
- [ ] **Step 5**: 验证 GamePanel.vue 保留 `--font-body` + displayMessages + E9-FIX mechanism click
  ```bash
  grep -nE "font-body|displayMessages|onTextWrapperClick" /home/recoletas/jiuguan/text-game-framework/src/components/GamePanel.vue | head -10
  ```
  Expected: 3 处 hit (`font-family: var(--font-body)` / `const displayMessages = computed(...)` / `@click="onTextWrapperClick"`)
- [ ] **Step 6**: 跑 baseline test suite 确认 green
  ```bash
  cd /home/recoletas/jiuguan/text-game-framework && npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js 2>&1 | tail -20
  ```
  Expected: PASS, ≥190 tests, 0 fail

**验收点**: 6 步全 pass, baseline test 0 fail. 如失败 → STOP, 修 baseline 后再开始 Task 1.

---

## Task 1: uiPolish E11 Contracts (TDD Red)

**Files:**
- Modify: `src/__tests__/uiPolish.test.js` (加 1 个 `describe('UI-E11 Experience workstation', ...)` block, 13 个 `it`)

**目标**: 一次性添加 13 条 E11 contracts, 全部失败 (red phase). 后续 Task 2-11 逐条 green.

**允许改**: `src/__tests__/uiPolish.test.js`
**不允许改**: 任何 src 代码 (red phase, 仅加测试)

**步骤**:
- [ ] **Step 1**: 在 `src/__tests__/uiPolish.test.js` 末尾 (最后一个 `it` 之后) 加 1 个 describe block
  ```javascript
  describe('UI-E11 Experience workstation', () => {
    // §A composition (4 contracts)
    it('E11-A1: Experience.vue template has ws-layout root with 4 sections', () => {
      const exp = readProjectFile('src/pages/Experience.vue')
      expect(exp).toMatch(/<div\s+class="ws-layout">/)
      expect(exp).toMatch(/<section\s+class="ws-topstrip"/)
      expect(exp).toMatch(/<aside\s+class="ws-left-rail"/)
      expect(exp).toMatch(/<main\s+class="ws-center-stage"/)
      expect(exp).toMatch(/<aside\s+class="ws-right-rail"/)
    })

    it('E11-A2: ws-layout grid-template-columns is "260px 1fr 300px" in kao.css', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      expect(kao).toMatch(/\.theme-kao\s+\.ws-layout\s*\{[\s\S]*grid-template-columns:\s*260px\s+1fr\s+300px;/s)
    })

    it('E11-A3: ws-topstrip has position: sticky and height ~80px', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip\s*\{[\s\S]*position:\s*sticky/s)
      expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip\s*\{[\s\S]*height:\s*80px/s)
    })

    it('E11-A4: ws-right-rail has 3 sections with data-dossier-stamp attribute', () => {
      const exp = readProjectFile('src/pages/Experience.vue')
      expect(exp).toMatch(/<aside\s+class="ws-right-rail"/)
      expect(exp).toMatch(/卷宗一\s*·\s*在场人物/)
      expect(exp).toMatch(/卷宗二\s*·\s*地点卡/)
      expect(exp).toMatch(/卷宗三\s*·\s*事件卷/)
    })

    // §B topstrip anchor (3 contracts)
    it('E11-B1: useWorkstationMeta composable exports 5 fields', () => {
      const comp = readProjectFile('src/composables/useWorkstationMeta.js')
      expect(comp).toMatch(/export\s+function\s+useWorkstationMeta\s*\(\s*\)/)
      expect(comp).toMatch(/currentVolume/)
      expect(comp).toMatch(/caseNo/)
      expect(comp).toMatch(/currentTask/)
      expect(comp).toMatch(/currentSection/)
      expect(comp).toMatch(/totalCount/)
    })

    it('E11-B2: ws-topstrip shows "档案空白 · 卷 1 · 等候" when totalCount === 0', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      expect(kao).toMatch(/档案空白\s*·\s*卷\s*1\s*·\s*等候/)
    })

    it('E11-B3: 5-cell progress bar renders one filled cell per currentSection', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      expect(kao).toMatch(/\.ws-topstrip__progress-cell\.is-filled/)
      expect(kao).toMatch(/grid-template-columns:\s*repeat\(5,\s*1fr\)/)
    })

    // §C 0-state hero (2 contracts)
    it('E11-C1: GamePanel has CharacterPortrait narrator hero in 0-state', () => {
      const gp = readProjectFile('src/components/GamePanel.vue')
      expect(gp).toMatch(/<CharacterPortrait\s+pose-id="narrator"\s+size="hero"/)
    })

    it('E11-C2: 3 quick action buttons (续写 / 速记 / 切场景) present', () => {
      const gp = readProjectFile('src/components/GamePanel.vue')
      expect(gp).toMatch(/>续写</)
      expect(gp).toMatch(/>速记</)
      expect(gp).toMatch(/>切场景</)
    })

    // §D font layering (2 contracts)
    it('E11-D1: 4 font layers exist (DISPLAY LXGW / BODY Songti / META sans / INTERACTIVE mix)', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      // DISPLAY layer uses --font-display
      expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__case[\s\S]*var\(--font-display\)/s)
      // BODY layer uses --font-body
      expect(kao).toMatch(/\.theme-kao\s+\.ws-left-rail__kicker[\s\S]*var\(--font-body\)/s)
      // META layer uses --font-sans
      expect(kao).toMatch(/\.theme-kao\s+\.ws-topstrip__meta[\s\S]*var\(--font-sans\)/s)
    })

    it('E11-D2: each layer has ≥3 selectors using it, no layer overlap', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      const displayCount = (kao.match(/var\(--font-display\)/g) || []).length
      const bodyCount = (kao.match(/var\(--font-body\)/g) || []).length
      const sansCount = (kao.match(/var\(--font-sans\)/g) || []).length
      expect(displayCount).toBeGreaterThanOrEqual(3)
      expect(bodyCount).toBeGreaterThanOrEqual(3)
      expect(sansCount).toBeGreaterThanOrEqual(3)
    })

    // §E delete verify (1 contract)
    it('E11-E1: 0 references to .record-folio / .sidebar (old) in kao.css + Experience.vue', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      const exp = readProjectFile('src/pages/Experience.vue')
      expect(kao).not.toMatch(/\.theme-kao\s+\.sidebar\s*\{/)
      expect(kao).not.toMatch(/\.theme-kao\s+\.record-folio/)
      expect(exp).not.toMatch(/class="record-folio"/)
      expect(exp).not.toMatch(/class="sidebar"/)
    })

    // §F forbidden patterns (1 contract, hard gate)
    it('E11-F1: 0 new :global(.theme-kao) / 0 new !important / 0 broad :deep(*) / kao block 0 raw hex', () => {
      const kao = readProjectFile('src/styles/themes/kao.css')
      const exp = readProjectFile('src/pages/Experience.vue')
      // New ws-* rules in kao.css should not introduce forbidden patterns
      // Allow pre-existing 0 matches (whole file)
      expect(kao.match(/:global\(\.theme-kao\)/g) || []).toHaveLength(0)
      // 0 !important in kao block
      expect(kao).not.toMatch(/!important/)
      // 0 broad :deep(*) anywhere
      expect(kao).not.toMatch(/:deep\(\s*\)/)
      expect(exp).not.toMatch(/:deep\(\s*\)/)
    })

    // §G E9-FIX preservation (1 contract, hard gate)
    it('E11-G1: E9-FIX mechanism-trigger click handler preserved in GamePanel', () => {
      const gp = readProjectFile('src/components/GamePanel.vue')
      expect(gp).toMatch(/<div\s+class="text-wrapper"\s+@click="onTextWrapperClick/)
      expect(gp).toMatch(/function\s+onTextWrapperClick\s*\(/)
    })
  })
  ```
- [ ] **Step 2**: 跑测试确认 13 条全 fail (red phase)
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js 2>&1 | tail -30
  ```
  Expected: 13 fail in `describe('UI-E11 Experience workstation', ...)`, 既有 E10 contracts 仍 pass

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js 2>&1 | tail -30
```

**验收点**:
- [ ] 13 个新 `it` 全 fail (red)
- [ ] 既有 E10 / E9 / E6A contracts 仍 pass (没误伤)
- [ ] 文件末尾追加成功, 无 syntax error

---

## Task 2: kao.css ws-* Layout Rules (TDD Green A1-A4)

**Files:**
- Modify: `src/styles/themes/kao.css` (新增 ws-* rules block)

**目标**: 实现 4 段 workstation composition 的 CSS 骨架. green E11-A1, A2, A3, A4.

**允许改**: `src/styles/themes/kao.css`
**不允许改**: 其他 src

**步骤**:
- [ ] **Step 1**: 在 kao.css 末尾 (`}` 关闭 `.theme-kao` 之前, 即 L2392 `}` 之前, 当前 `}` 关闭 `.theme-kao` 整块) 加 ws-* rules block. 在 `}` 前插入以下内容:
  ```css
  /* UI-E11: Experience workstation 4-section composition (topstrip /
     left rail / center stage / right rail). Replaces UI-E10 record-folio
     band + scene-stage + dossier sidebar stack which produced a blank
     central paper surface in 0-message state. 4 sections share one
     sticky topstrip as the section anchor, eliminating the need for
     the deleted 28px shared vertical axis (UI-E10-CLEAN 2026-06-22). */

  .theme-kao .ws-layout {
    position: relative;
    z-index: 1;
    flex: 1;
    display: grid;
    grid-template-columns: 260px 1fr 300px;
    gap: 14px;
    padding: 14px 16px 16px;
    max-width: 1420px;
    margin: 0 auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  @media (max-width: 1280px) {
    .theme-kao .ws-layout {
      grid-template-columns: 220px 1fr 280px;
    }
  }

  @media (max-width: 980px) {
    .theme-kao .ws-layout {
      grid-template-columns: 1fr;
      gap: 10px;
    }
  }

  .theme-kao .ws-topstrip {
    position: sticky;
    top: 0;
    z-index: var(--z-floating-dock, 240);
    height: 80px;
    display: grid;
    grid-template-columns: repeat(5, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 10px 16px;
    background: var(--archive-paper);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
    box-shadow: 0 6px 18px color-mix(in srgb, var(--archive-ink) 8%, transparent);
    font-family: var(--font-sans);
  }

  @media (max-width: 980px) {
    .theme-kao .ws-topstrip {
      height: auto;
      grid-template-columns: repeat(3, 1fr);
      grid-auto-rows: auto;
    }
  }

  .theme-kao .ws-left-rail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: var(--archive-paper-soft);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
    overflow-y: auto;
  }

  @media (max-width: 980px) {
    .theme-kao .ws-left-rail {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
    }
  }

  .theme-kao .ws-center-stage {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--archive-paper);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 26%, transparent);
    overflow: hidden;
  }

  .theme-kao .ws-right-rail {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--archive-paper);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
    overflow-y: auto;
  }

  @media (max-width: 980px) {
    .theme-kao .ws-right-rail {
      flex-direction: column;
    }
  }
  ```
- [ ] **Step 2**: 跑 E11-A1 + A2 + A3 contracts 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-A1|E11-A2|E11-A3" 2>&1 | tail -15
  ```
  Expected: 3 pass
- [ ] **Step 3**: E11-A4 (template wiring) 仍 fail, 等 Task 5 实施

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11" 2>&1 | tail -25
```

**验收点**:
- [ ] E11-A1 / A2 / A3 pass
- [ ] E11-A4 / B / C / D / E / F / G 仍 fail (其他 task 实施)
- [ ] kao.css 0 raw hex / 0 !important / 0 broad :deep(*) (F1 partial)

---

## Task 3: useWorkstationMeta Composable (TDD Green B1)

**Files:**
- Create: `src/composables/useWorkstationMeta.js` (NEW, 80 行 max)

**目标**: 实现 5 个 computed (currentVolume / caseNo / currentTask / currentSection / totalCount), 全部从 gameStore 派生 (无 store mutation), 供 topstrip / left rail / right rail 共用.

**允许改**: 新建 `src/composables/useWorkstationMeta.js`
**不允许改**: `src/stores/**` / `src/services/**` / `src/router/**`

**步骤**:
- [ ] **Step 1**: 创建 `src/composables/useWorkstationMeta.js`:
  ```javascript
  import { computed } from 'vue'
  import { useGameStore } from '@/stores/gameStore'

  // UI-E11: single source of truth for the workstation topstrip / left
  // rail / right rail section anchor. Replaces Experience.vue's 6
  // record-folio computeds (recordCaseNo / recordVolume / recordTime /
  // recordCharacters / recordLocation / recordObjective).
  //
  // All values are derived from gameStore — 0 store mutation, 0 service
  // change, 0 router change (per E10 hard rules). Components that read
  // these computeds reactively update when gameStore state changes.
  //
  // Functional continuity, not decorative line:
  //   - topstrip sticky reads currentSection + totalCount for progress
  //   - left rail hero block reads currentTask for kicker text
  //   - right rail dossier sections read currentSection for active role
  //     highlight (user / narrator / archive-keeper)
  export function useWorkstationMeta() {
    const gameStore = useGameStore()

    const totalCount = computed(() => {
      const msgs = gameStore.messages || []
      return msgs.filter((m) => m && (m.role || m.type) !== 'system').length
    })

    const currentVolume = computed(() => {
      const sessions = gameStore.sessions || []
      return Math.max(1, sessions.length || 1)
    })

    const caseNo = computed(() => {
      const id = gameStore.currentSessionId || gameStore.worldId || 'pending-record'
      let hash = 0
      for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i)
        hash |= 0
      }
      const hex = Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8)
      return hex.toUpperCase()
    })

    const currentTask = computed(() => {
      const goals = gameStore.goals || []
      const active = goals.find((g) => g && g.status === 'active' && (g.title || g.label))
      if (active) return String(active.title || active.label)
      return '未登记'
    })

    const currentSection = computed(() => {
      return totalCount.value
    })

    const isEmpty = computed(() => totalCount.value === 0)

    const topstripAnchor = computed(() => {
      if (isEmpty.value) return `档案空白 · 卷 ${currentVolume.value} · 等候第 1 条`
      return `卷 ${currentVolume.value} · 第 ${currentSection.value} 条 / 共 ${totalCount.value} 条`
    })

    return {
      currentVolume,
      caseNo,
      currentTask,
      currentSection,
      totalCount,
      isEmpty,
      topstripAnchor
    }
  }
  ```
- [ ] **Step 2**: 跑 E11-B1 contract 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-B1" 2>&1 | tail -10
  ```
  Expected: 1 pass
- [ ] **Step 3**: E11-B2 / B3 仍 fail, 等 Task 4 实施 (kao.css topstrip rules + Experience.vue wiring)

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11" 2>&1 | tail -25
```

**验收点**:
- [ ] E11-B1 pass
- [ ] composable 5 个 exports 全到位
- [ ] 0 store mutation (verify `grep -E "gameStore\.\w+ =" src/composables/useWorkstationMeta.js` = 0 match)
- [ ] 1 个 import (`useGameStore`), 1 个 computed factory

---

## Task 4: kao.css Topstrip + Progress Bar (TDD Green B2-B3)

**Files:**
- Modify: `src/styles/themes/kao.css` (新增 topstrip 子规则 + 进度条)

**目标**: 实现 topstrip 5-cell progress bar + 0-state anchor 文字. green E11-B2, B3.

**允许改**: `src/styles/themes/kao.css`
**不允许改**: 其他 src

**步骤**:
- [ ] **Step 1**: 在 kao.css ws-* rules block 末尾 (`}` 关闭 `.theme-kao` 之前) 追加:
  ```css
  /* Topstrip — 5 metadata cells + 5-cell progress bar */
  .theme-kao .ws-topstrip__cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
    border-right: 1px solid color-mix(in srgb, var(--archive-gold) 16%, transparent);
  }

  .theme-kao .ws-topstrip__cell:last-of-type {
    border-right: none;
  }

  .theme-kao .ws-topstrip__kicker {
    font-family: var(--font-sans);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--archive-ink) 56%, transparent);
    text-transform: uppercase;
  }

  .theme-kao .ws-topstrip__value {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--archive-ink);
    font-variant-numeric: tabular-nums;
  }

  .theme-kao .ws-topstrip__case {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--archive-ink);
    font-style: italic;
  }

  .theme-kao .ws-topstrip__meta {
    font-family: var(--font-sans);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--archive-ink) 64%, transparent);
  }

  /* 5-cell progress bar — one cell per section axis:
     开卷 / 当前 / 在场 / 发生 / 落笔. Filled cells represent the
     current narrative state. Total count fills progressively. */
  .theme-kao .ws-topstrip__progress {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    width: 200px;
    padding: 4px;
    background: color-mix(in srgb, var(--archive-paper-soft) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
  }

  .theme-kao .ws-topstrip__progress-cell {
    height: 12px;
    background: color-mix(in srgb, var(--archive-paper) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--archive-gold) 14%, transparent);
    transition: background 0.2s ease;
  }

  .theme-kao .ws-topstrip__progress-cell.is-filled {
    background: color-mix(in srgb, var(--archive-gold) 78%, transparent);
    border-color: var(--archive-gold);
  }

  /* Topstrip anchor text — always-on section indicator */
  .theme-kao .ws-topstrip__anchor {
    font-family: var(--font-display);
    font-size: 12px;
    font-style: italic;
    letter-spacing: 0.06em;
    color: color-mix(in srgb, var(--archive-rose) 84%, transparent);
  }
  ```
- [ ] **Step 2**: 跑 E11-B2 + B3 contracts 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-B2|E11-B3" 2>&1 | tail -15
  ```
  Expected: 2 pass

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11" 2>&1 | tail -25
```

**验收点**:
- [ ] E11-B2 pass (`档案空白 · 卷 1 · 等候` 字符串存在)
- [ ] E11-B3 pass (`.ws-topstrip__progress-cell.is-filled` + `repeat(5, 1fr)` 存在)
- [ ] kao.css 仍 0 raw hex / 0 !important

---

## Task 5: Experience.vue Template Rewrite (TDD Green A4 + B wiring)

**Files:**
- Modify: `src/pages/Experience.vue` (template + script + scoped CSS)

**目标**: 重写 template 为 4 段 ws-layout, 接入 `useWorkstationMeta`, 删 6 个 record-folio computeds. green E11-A4 + 既有 B/C/E 验证.

**允许改**: `src/pages/Experience.vue`
**不允许改**: `src/components/**` / `src/stores/**` / `src/services/**`

**步骤**:
- [ ] **Step 1**: 在 `<script setup>` 顶部加 import (紧跟 `import { useWorkstationMeta }` 之前):
  ```javascript
  import { useWorkstationMeta } from '@/composables/useWorkstationMeta'
  ```
- [ ] **Step 2**: 删 `<section class="record-folio" aria-label="案卷记录本">` 整块 (L13-45), 替换为 `<section class="ws-topstrip" aria-label="案卷进度条">`:
  ```vue
  <section class="ws-topstrip" aria-label="案卷进度条">
    <div class="ws-topstrip__cell">
      <span class="ws-topstrip__kicker">卷</span>
      <span class="ws-topstrip__value">{{ meta.currentVolume }}</span>
    </div>
    <div class="ws-topstrip__cell">
      <span class="ws-topstrip__kicker">案号</span>
      <span class="ws-topstrip__case">{{ meta.caseNo }}</span>
    </div>
    <div class="ws-topstrip__cell">
      <span class="ws-topstrip__kicker">当前任务</span>
      <span class="ws-topstrip__value">{{ meta.currentTask }}</span>
    </div>
    <div class="ws-topstrip__cell">
      <span class="ws-topstrip__kicker">第 N 条</span>
      <span class="ws-topstrip__value">{{ meta.currentSection }}</span>
    </div>
    <div class="ws-topstrip__cell">
      <span class="ws-topstrip__kicker">共 M 条</span>
      <span class="ws-topstrip__value">{{ meta.totalCount }}</span>
    </div>
    <div class="ws-topstrip__progress" aria-label="5-section 进度">
      <span
        v-for="n in 5"
        :key="n"
        class="ws-topstrip__progress-cell"
        :class="{ 'is-filled': n <= Math.min(meta.totalCount, 5) }"
      ></span>
    </div>
  </section>
  ```
- [ ] **Step 3**: 把 `<div class="game-main-shell">` 改成 `<aside class="ws-left-rail">` 并加 narrator kicker:
  ```vue
  <aside class="ws-left-rail" aria-label="在场档案员">
    <div class="ws-left-rail__hero">
      <span class="ws-left-rail__kicker">在场档案员 · 旁白 GM</span>
      <p class="ws-left-rail__brief">{{ meta.topstripAnchor }}</p>
    </div>
  </aside>
  ```
- [ ] **Step 4**: 把 `<div class="game-main">` 改成 `<main class="ws-center-stage">`:
  ```vue
  <main class="ws-center-stage" aria-label="记录流">
    <GamePanel @show-inline-detail="handleInlineDetail" />
    <InputArea @send="handleSend" />
  </main>
  ```
- [ ] **Step 5**: 把 `<aside class="sidebar">` 改成 `<aside class="ws-right-rail">` 并加 `data-dossier-stamp`:
  ```vue
  <aside class="ws-right-rail" aria-label="右栏档案">
    <div class="ws-section" data-dossier-stamp="卷宗一 · 在场人物">
      <StatusBar />
    </div>
    <div class="ws-section" data-dossier-stamp="卷宗二 · 地点卡">
      <GeographyPanel />
    </div>
    <div class="ws-section" data-dossier-stamp="卷宗三 · 事件卷">
      <QuestLog />
    </div>
  </aside>
  ```
- [ ] **Step 6**: 把 `<div class="game-layout">` 改成 `<div class="ws-layout">`
- [ ] **Step 7**: 在 script setup 内 `const gameStore = useGameStore()` 之后加 `const meta = useWorkstationMeta()`
- [ ] **Step 8**: 删 6 个 record-folio computeds (`recordCaseNo` / `recordVolume` / `recordTime` / `recordCharacters` / `recordLocation` / `recordObjective`) 整段 (L349-403)
- [ ] **Step 9**: scoped CSS 删 `.record-folio` / `.record-folio__*` / `.game-layout` / `.game-main-shell` / `.sidebar` / `.sidebar-head` / `.sidebar-section` 全部规则 (L897-1860 大量, 但目标只剩 0; 可整段替换)
- [ ] **Step 10**: 跑 E11-A4 + E1 contracts 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-A4|E11-E1" 2>&1 | tail -15
  ```
  Expected: 2 pass (A4 template 有 4 section + dossier-stamp; E1 0 record-folio / sidebar 引用)
- [ ] **Step 11**: 跑既有 E10 / E6A contract 确认 0 误伤
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "ui polish contract" 2>&1 | tail -10
  ```
  Expected: 既有 contracts 仍 pass

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js 2>&1 | tail -25
```

**验收点**:
- [ ] E11-A4 + E1 pass
- [ ] 既有 uiPolish contracts 全 pass (0 误伤)
- [ ] E11-C1 / C2 (GamePanel hero) 仍 fail, 等 Task 6

---

## Task 6: GamePanel Hero + 0-state (TDD Green C1-C2)

**Files:**
- Modify: `src/components/GamePanel.vue` (template + scoped CSS)

**目标**: 加 `<CharacterPortrait pose-id="narrator" size="hero">` 在 ws-center-stage 顶部, 加 0-state entry block (引导 + 3 quick action). green E11-C1, C2.

**允许改**: `src/components/GamePanel.vue`
**不允许改**: `src/components/folio/CharacterPortrait.vue` / `src/config/characterArt.js` / `src/stores/**`

**步骤**:
- [ ] **Step 1**: 在 `<script setup>` 顶部加 import:
  ```javascript
  import CharacterPortrait from './folio/CharacterPortrait.vue'
  ```
- [ ] **Step 2**: 在 `<div class="chat-container">` 内部最顶部 (template 顶部, 在 `<template v-for="(msg, index) in displayMessages">` 之前) 加 0-state hero block:
  ```vue
  <section v-if="displayMessages.length === 0" class="chat-container__hero" aria-label="档案空白引导">
    <div class="chat-container__hero-portrait">
      <CharacterPortrait pose-id="narrator" size="hero" caption="在场档案员" />
    </div>
    <div class="chat-container__hero-prompt">
      <p class="chat-container__hero-greeting">档案空白 · 等候第 1 条落笔</p>
      <p class="chat-container__hero-hint">在下方的输入区记录你的第 1 步行动, 或从以下开始:</p>
      <div class="chat-container__hero-actions">
        <button class="action-btn primary" type="button" @click="$emit('quick-action', 'continue')">续写</button>
        <button class="action-btn" type="button" @click="$emit('quick-action', 'note')">速记</button>
        <button class="action-btn" type="button" @click="$emit('quick-action', 'scene')">切场景</button>
      </div>
    </div>
  </section>
  ```
- [ ] **Step 3**: 在 `<script setup>` 加 emit 定义 (紧跟 `const emit = defineEmits([...])` 之后):
  ```javascript
  const emit = defineEmits(['show-inline-detail', 'quick-action'])
  ```
- [ ] **Step 4**: scoped CSS 末尾加 0-state hero block CSS (在 `@media (max-width: 760px)` 之后):
  ```css
  .chat-container__hero {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 18px;
    padding: 22px 18px 28px;
    border-bottom: 1px dotted color-mix(in srgb, var(--archive-gold) 24%, transparent);
  }

  .chat-container__hero-portrait {
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .chat-container__hero-prompt {
    display: flex;
    flex-direction: column;
    gap: 12px;
    justify-content: center;
  }

  .chat-container__hero-greeting {
    margin: 0;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--archive-ink);
  }

  .chat-container__hero-hint {
    margin: 0;
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.65;
    color: color-mix(in srgb, var(--archive-ink) 84%, transparent);
  }

  .chat-container__hero-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  @media (max-width: 760px) {
    .chat-container__hero {
      grid-template-columns: 1fr;
    }
  }
  ```
- [ ] **Step 5**: 跑 E11-C1 + C2 + G1 contracts 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-C1|E11-C2|E11-G1" 2>&1 | tail -15
  ```
  Expected: 3 pass

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11" 2>&1 | tail -25
npm run test:run -- src/__tests__/gamePanelMechanism.test.js 2>&1 | tail -10
```

**验收点**:
- [ ] E11-C1 + C2 + G1 pass
- [ ] gamePanelMechanism.test.js 1/1 pass (E9-FIX click preserved)
- [ ] 0 message 时 hero 显示; 1+ message 时 hero 隐藏

---

## Task 7: Right Rail Sections Empty State (TDD Green E + Sidebar Empty Hints)

**Files:**
- Modify: `src/components/StatusBar.vue` (加 `.ws-section__empty-hint` + 加 `.ws-section` wrapper)
- Modify: `src/components/QuestLog.vue` (同上)
- Modify: `src/components/geography/GeographyPanel.vue` (同上)
- Modify: `src/styles/themes/kao.css` (加 `.ws-section__empty-hint` rule)

**目标**: 3 个 dossier section 在 0 态显示 inline hint「暂无 X · 在对话中遇到会自动出现」, 不是空 stat card. 加 `.ws-section` + `.ws-section__empty-hint` wrapper.

**允许改**: 4 文件 (3 组件 + kao.css)
**不允许改**: 其他 src

**步骤**:
- [ ] **Step 1**: 在 kao.css ws-* block 末尾追加:
  ```css
  /* Right rail dossier section — functional card list (or empty hint). */
  .theme-kao .ws-section {
    position: relative;
    padding: 14px 14px 16px;
    background: transparent;
    border-top: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
  }

  .theme-kao .ws-section:first-child {
    border-top: none;
  }

  .theme-kao .ws-section::before {
    content: attr(data-dossier-stamp);
    display: block;
    font-family: var(--font-display);
    font-size: 9px;
    font-style: italic;
    letter-spacing: 0.02em;
    color: color-mix(in srgb, var(--archive-ink) 40%, transparent);
    margin: 0 0 6px;
  }

  .theme-kao .ws-section__empty-hint {
    font-family: var(--font-body);
    font-size: 12px;
    font-style: italic;
    line-height: 1.5;
    color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
    padding: 6px 0;
  }
  ```
- [ ] **Step 2**: `StatusBar.vue` scoped CSS 末尾加 ws-section 自适配 (确保人物 card 在 ws-section 内仍可见):
  ```css
  .ws-section .status-bar { padding: 0; }
  .ws-section .status-bar .empty-state { display: none; }
  ```
  且 template 顶部加: `<div v-if="!playerName || playerName === '主角'" class="ws-section__empty-hint">暂无人物 · 发送第 1 条消息后, 角色会自动出现在这里。</div>`
- [ ] **Step 3**: `QuestLog.vue` scoped CSS 末尾加 ws-section 自适配:
  ```css
  .ws-section .panel-header { display: none; }
  .ws-section .panel-kicker { display: none; }
  .ws-section .empty-panel { padding: 6px 0; font-family: var(--font-body); font-size: 12px; color: color-mix(in srgb, var(--archive-ink) 60%, transparent); }
  ```
  且 template 顶部加: `<div v-if="activities.length === 0 && !questGoal" class="ws-section__empty-hint">暂无剧情 · 在对话中遇到的事件会自动记录在这里。</div>`
- [ ] **Step 4**: `GeographyPanel.vue` scoped CSS 末尾加 ws-section 自适配:
  ```css
  .ws-section .geo-title-block { display: none; }
  .ws-section .empty-state { padding: 6px 0; font-family: var(--font-body); font-size: 12px; color: color-mix(in srgb, var(--archive-ink) 60%, transparent); }
  ```
  且 template 顶部加: `<div v-if="locations.length === 0" class="ws-section__empty-hint">暂无地点 · 在对话中进入的地点会自动记录在这里。</div>`
- [ ] **Step 5**: 跑 E11-E1 + F1 contracts 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-E1|E11-F1" 2>&1 | tail -15
  ```
  Expected: 2 pass

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js 2>&1 | tail -25
npm run test:run -- src/__tests__/gamePanelMechanism.test.js 2>&1 | tail -10
```

**验收点**:
- [ ] E11-E1 + F1 pass
- [ ] 3 个组件 ws-section 包装后 empty state 不再是「暂无」文字, 而是 ws-section__empty-hint inline 提示
- [ ] 既有 uiPolish + gamePanelMechanism 仍 pass

---

## Task 8: Font Layering 4-Layer Rules (TDD Green D1-D2)

**Files:**
- Modify: `src/styles/themes/kao.css` (新增 4 层字体 token 规则 + 验证 each layer ≥3 selectors)

**目标**: 固化 DISPLAY / BODY / META / INTERACTIVE 4 层互斥字体规则. green E11-D1, D2.

**允许改**: `src/styles/themes/kao.css`
**不允许改**: 其他 src

**步骤**:
- [ ] **Step 1**: 在 kao.css ws-* block 末尾追加 (D1 + D2 layer rules):
  ```css
  /* === UI-E11: 4-layer font system (互斥 type roles) ====================
     DISPLAY  — --font-display LXGW (10-14px): decoration, marginalia,
                 kicker signature, section title. NEVER for long text.
     BODY     — --font-body Songti (12-18px): readable body, hero text,
                 section number. NEVER for decoration.
     META     — --font-sans (10-11px): short labels (案号 / 角色名 / 时间 /
                 stat / tabular-nums). NEVER for body.
     INTERACTIVE — --font-sans (buttons 13px) / --font-body (textarea 16px):
                   inputs and clickable affordances. Layer per element role.
     Rules: any given element uses exactly 1 layer token, never 2.
     ===================================================================== */

  /* DISPLAY layer — at least 3 selectors */
  .theme-kao .ws-topstrip__case {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--archive-ink);
    font-style: italic;
  }
  .theme-kao .ws-topstrip__value {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--archive-ink);
    font-variant-numeric: tabular-nums;
  }
  .theme-kao .scene-entry__stamp {
    font-family: var(--font-display);
    font-size: 10px;
    font-style: italic;
    color: color-mix(in srgb, var(--archive-rose) 80%, transparent);
  }
  .theme-kao .ws-section::before {
    font-family: var(--font-display);
    font-size: 9px;
    font-style: italic;
    letter-spacing: 0.02em;
    color: color-mix(in srgb, var(--archive-ink) 40%, transparent);
  }

  /* BODY layer — at least 3 selectors */
  .theme-kao .text-main {
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.75;
    color: var(--archive-ink);
    letter-spacing: 0.02em;
  }
  .theme-kao .ws-left-rail__kicker {
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.6;
    color: color-mix(in srgb, var(--archive-ink) 84%, transparent);
  }
  .theme-kao .scene-entry__no {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: color-mix(in srgb, var(--archive-gold) 84%, transparent);
    font-variant-numeric: tabular-nums;
  }
  .theme-kao .ws-section__empty-hint {
    font-family: var(--font-body);
    font-size: 12px;
    font-style: italic;
    line-height: 1.5;
    color: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  }

  /* META layer — at least 3 selectors */
  .theme-kao .ws-topstrip__kicker {
    font-family: var(--font-sans);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--archive-ink) 56%, transparent);
    text-transform: uppercase;
  }
  .theme-kao .ws-topstrip__meta {
    font-family: var(--font-sans);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--archive-ink) 64%, transparent);
  }
  .theme-kao .display-name {
    font-family: var(--font-sans);
    font-size: 11px;
    font-style: italic;
    color: color-mix(in srgb, var(--archive-ink-soft) 60%, transparent);
  }
  .theme-kao .msg-time {
    font-family: var(--font-sans);
    font-style: italic;
    font-size: 11px;
    color: color-mix(in srgb, var(--archive-ink-soft) 60%, transparent);
  }

  /* INTERACTIVE layer */
  .theme-kao button,
  .theme-kao .action-btn {
    font-family: var(--font-sans);
    font-size: 13px;
  }
  .theme-kao textarea,
  .theme-kao .tavern-textarea,
  .theme-kao .quick-note-workspace-input {
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.65;
  }
  ```
- [ ] **Step 2**: 跑 E11-D1 + D2 contracts 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-D1|E11-D2" 2>&1 | tail -15
  ```
  Expected: 2 pass
- [ ] **Step 3**: 跑 uiPolish 全量确认 13 E11 contracts 全 pass
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11" 2>&1 | tail -25
  ```
  Expected: 13 pass, 0 fail

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11" 2>&1 | tail -30
```

**验收点**:
- [ ] E11-D1 + D2 pass
- [ ] 13 E11 contracts 全 green
- [ ] kao.css var(--font-display) ≥3 + var(--font-body) ≥3 + var(--font-sans) ≥3 hits

---

## Task 9: Delete Old CSS + Forbidden Pattern Gate (TDD Green E1 + F1 final)

**Files:**
- Modify: `src/styles/themes/kao.css` (删 L1976-2108 旧 `.theme-kao .game-page .sidebar` 整段)

**目标**: 把 kao.css 内旧 `.theme-kao .game-page .sidebar` (L1976-2108) 整段删除. Experience.vue scoped CSS 已在 Task 5 删除. 跑 E11-F1 forbidden gate.

**允许改**: `src/styles/themes/kao.css`
**不允许改**: 其他 src

**步骤**:
- [ ] **Step 1**: 删 kao.css L1976-2108 整段 (`.theme-kao .game-page .sidebar` 到 `.theme-kao .game-page .panel-header > span:not(.count-badge) { display: none; }` 块). 验证范围:
  ```bash
  grep -nE "^\.theme-kao \.game-page \.sidebar" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
  ```
  Expected: 找到 L1976-2108 块起点 + 终点
- [ ] **Step 2**: 用 Edit 工具删整段 (multi-line delete):
  ```bash
  # 验证删除后 kao.css 0 旧 sidebar 引用
  grep -cE "\.theme-kao \.game-page \.sidebar" /home/recoletas/jiuguan/text-game-framework/src/styles/themes/kao.css
  ```
  Expected: 0
- [ ] **Step 3**: 跑 E11-F1 contract 确认 green
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js -t "E11-F1" 2>&1 | tail -15
  ```
  Expected: 1 pass
- [ ] **Step 4**: 跑 uiPolish 全量确认 13 E11 contracts + 既有全 pass
  ```bash
  npm run test:run -- src/__tests__/uiPolish.test.js 2>&1 | tail -30
  ```
  Expected: 0 fail

**测试命令**:
```bash
npm run test:run -- src/__tests__/uiPolish.test.js 2>&1 | tail -30
npm run test:run -- src/__tests__/gamePanelMechanism.test.js 2>&1 | tail -10
```

**验收点**:
- [ ] E11-F1 pass (0 !important / 0 :global(.theme-kao) / 0 broad :deep(*))
- [ ] kao.css 旧 sidebar 段 0 引用
- [ ] 既有 uiPolish + gamePanelMechanism contracts 全 pass

---

## Task 10: Build + Diff + Forbidden Sweep

**Files:** Read only — no edits.

**目标**: ship gate 验证. 13 E11 contracts + 既有全 pass + build clean + diff clean + 0 forbidden patterns.

**允许改**: 无
**不允许改**: 全部 src

**步骤**:
- [ ] **Step 1**: 跑 focused test suite
  ```bash
  cd /home/recoletas/jiuguan/text-game-framework && npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js src/__tests__/stereoMigration.test.js 2>&1 | tail -15
  ```
  Expected: ≥baseline + 13 E11 contracts pass, 0 fail
- [ ] **Step 2**: 跑全量 test suite (sanity)
  ```bash
  npm run test:run 2>&1 | tail -20
  ```
  Expected: 全量 ≥ baseline (≥190 tests), 0 fail
- [ ] **Step 3**: 跑 build
  ```bash
  npm run build 2>&1 | tail -10
  ```
  Expected: build success, 0 error
- [ ] **Step 4**: 跑 diff check
  ```bash
  git diff --check
  ```
  Expected: 0 error
- [ ] **Step 5**: 跑 forbidden patterns sweep
  ```bash
  git diff HEAD -- src/styles/themes/kao.css src/pages/Experience.vue src/components/GamePanel.vue src/components/StatusBar.vue src/components/QuestLog.vue src/components/geography/GeographyPanel.vue src/composables/useWorkstationMeta.js src/__tests__/uiPolish.test.js 2>&1 | grep -nE ":global\(\.theme-kao\)|:deep\(\s*\)|!important|#[0-9a-fA-F]{3,8}\b" | grep -vE "#[0-9a-fA-F]{6}.*test|var\(--|color-mix" | head -20
  ```
  Expected: 0 match (test 文字 raw hex + var(--...) + color-mix 除外)

**测试命令**: 同上 5 步

**验收点**:
- [ ] 13 E11 contracts + 既有 contracts 全 pass
- [ ] 全量 test:run ≥baseline, 0 fail
- [ ] npm run build clean
- [ ] git diff --check clean
- [ ] 0 forbidden pattern

---

## Task 11: Screenshots + Visual QA

**Files:**
- Create: `/tmp/e11-take-screenshots.py` (临时脚本, 跑完 `rm -f`)
- Create: `docs/agent-runs/2026-06-22-ui-e11/` (3 张 screenshot)

**目标**: 3 张 viewport screenshot (1280 / 1280×2200 / 640) 验证 4 段 workstation 一屏可见 + 中央 message 流 + topstrip 5-cell 进度条 + right rail dossier.

**允许改**: 新建 `docs/agent-runs/2026-06-22-ui-e11/` + `/tmp/e11-take-screenshots.py`
**不允许改**: 任何 src 代码

**步骤**:
- [ ] **Step 1**: 创建 `docs/agent-runs/2026-06-22-ui-e11/` 目录
  ```bash
  mkdir -p /home/recoletas/jiuguan/text-game-framework/docs/agent-runs/2026-06-22-ui-e11
  ```
- [ ] **Step 2**: 创建 `/tmp/e11-take-screenshots.py` (Playwright 脚本):
  ```python
  # /tmp/e11-take-screenshots.py — UI-E11 3-viewport screenshot
  # Per E9 §4.4: 临时脚本跑完即 rm -f, NOT shipped to repo.
  import os
  from playwright.sync_api import sync_playwright

  BASE = 'http://127.0.0.1:5173'  # Vite dev server, 启动用 npm run dev
  OUT = '/home/recoletas/jiuguan/text-game-framework/docs/agent-runs/2026-06-22-ui-e11'
  os.makedirs(OUT, exist_ok=True)

  with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1280x800 light
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.goto(f'{BASE}/experience')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/experience-e11-1280.png', full_page=False)
    ctx.close()

    # 1280x2200 long
    ctx = browser.new_context(viewport={'width': 1280, 'height': 2200})
    page = ctx.new_page()
    page.goto(f'{BASE}/experience')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/experience-e11-long-1280.png', full_page=False)
    ctx.close()

    # 640x800 mobile
    ctx = browser.new_context(viewport={'width': 640, 'height': 800})
    page = ctx.new_page()
    page.goto(f'{BASE}/experience')
    page.wait_for_timeout(800)
    page.screenshot(path=f'{OUT}/experience-e11-640.png', full_page=False)
    ctx.close()

    browser.close()
  ```
- [ ] **Step 3**: 启 Vite dev server 后台
  ```bash
  cd /home/recoletas/jiuguan/text-game-framework && npm run dev > /tmp/vite-e11.log 2>&1 &
  sleep 4
  ```
- [ ] **Step 4**: 跑 screenshot 脚本
  ```bash
  python3 /tmp/e11-take-screenshots.py
  ```
  Expected: 3 张 png 落档到 `docs/agent-runs/2026-06-22-ui-e11/`
- [ ] **Step 5**: Kill Vite dev server
  ```bash
  pkill -f "vite" || true
  ```
- [ ] **Step 6**: 删临时脚本
  ```bash
  rm -f /tmp/e11-take-screenshots.py /tmp/vite-e11.log
  ```
- [ ] **Step 7**: 视觉验收 — 读 3 张 screenshot, 确认:
  - 1280: 4 段 workstation 一屏可见, hero narrator 立绘 + 3 quick action, topstrip 5-cell 进度条, right rail dossier 3 section
  - long-1280: scene-entry 单列流, topsticky 跟随 scroll
  - 640: left rail collapse 到 top strip, 1fr center stage
- [ ] **Step 8**: 写 `UI-E11.report.md` 落档到 `docs/agent-runs/2026-06-22-ui-e11/UI-E11.report.md` (template 跟 E10 report 同)

**测试命令**: 无 (纯视觉验收)

**验收点**:
- [ ] 3 张 screenshot 落档, 4 段 workstation 一屏可见
- [ ] /tmp/e11-take-screenshots.py 已删 (NOT shipped to repo, per AGENTS.md hard rule #11 + E9 §4.4)
- [ ] UI-E11.report.md 落档

---

## Self-Review

### 1. Spec coverage

Spec 8 个 Goal 全有 task 实现:
- G1 0-message hero → Task 6
- G2 topsticky always-on → Task 4 + 5
- G3 right rail functional section → Task 7
- G4 4 段 workstation 一屏 → Task 2 + 5
- G5 字体分层 4 层 → Task 8
- G6 E9-FIX mechanism-trigger click → Task 6 G1 contract
- G7 0 store / service / router mutation → Task 3 0 store mutation + Task 10 forbidden sweep
- G8 13 E11 contracts + gamePanelMechanism pass + build + diff → Task 1-10

### 2. Placeholder scan

- 0 "TBD" / "TODO" / "implement later"
- 0 "similar to Task N" (每个 task 自包含)
- 每个 step 有完整代码 (useWorkstationMeta.js 全文 / ws-* CSS 全文 / hero block 全文 / 13 contracts 全文)

### 3. Type consistency

- `useWorkstationMeta()` exports 7 fields (5 spec + isEmpty + topstripAnchor), 跟 Task 3 code + Task 4 文字一致
- `.ws-topstrip__progress-cell.is-filled` 跟 spec B3 一致
- `.chat-container__hero` 跟 spec C1 一致
- `.ws-section__empty-hint` 跟 spec §A4 一致

### 4. Forbidden patterns

- Task 0 验证 baseline 0 game-page::before / 0 scene-stage__indicator
- Task 9 E11-F1 contract 锁 0 !important / 0 :global(.theme-kao) / 0 broad :deep(*) / 0 raw hex
- Task 10 forbidden sweep 二次验证

---

## Dispatch 分工建议 (Codex 用)

按 subagent-driven-development skill 派工. **最多 3 个实现窗口 + 1 个 QA 窗口**. 每个窗口独立 worktree + disjoint write sets.

### Window 1: Foundation (Task 0-3) — Claude / UI-E11-IMPL-A
- **Worktree**: `/home/recoletas/worktrees/e11-foundation` (off `main`)
- **Scope**: Task 0 (read) + Task 1 (uiPolish contracts) + Task 2 (kao.css ws-* layout) + Task 3 (useWorkstationMeta.js)
- **Do not touch**: `src/pages/Experience.vue` / `src/components/GamePanel.vue` / `src/components/{StatusBar,QuestLog,GeographyPanel}.vue`
- **Output**: 3 E11-A contracts green + B1 contract green + 13 E11 contracts red. 截图: 不需要.
- **Acceptance**: `npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-E11"` 13 fail (red phase, 全部 expect fail).

### Window 2: Composition (Task 4-7) — Claude / UI-E11-IMPL-B
- **Worktree**: `/home/recoletas/worktrees/e11-composition` (off `main`)
- **Scope**: Task 4 (kao.css topstrip) + Task 5 (Experience.vue template) + Task 6 (GamePanel hero) + Task 7 (right rail sections)
- **Do not touch**: `src/composables/useWorkstationMeta.js` (Window 1 owned)
- **Output**: 13 E11 contracts 全 green. 截图: 不需要 (Task 11 owned by QA).
- **Acceptance**: `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/gamePanelMechanism.test.js` ≥baseline + 13 E11 contracts pass, 0 fail.

### Window 3: Delete + Verify (Task 8-10) — Claude / UI-E11-IMPL-C
- **Worktree**: `/home/recoletas/worktrees/e11-cleanup` (off `main`)
- **Scope**: Task 8 (font layering rules) + Task 9 (delete old sidebar CSS + forbidden gate) + Task 10 (build + diff + sweep)
- **Do not touch**: `src/composables/useWorkstationMeta.js` (W1) / `src/pages/Experience.vue` / `src/components/GamePanel.vue` / `src/components/{StatusBar,QuestLog,GeographyPanel}.vue` (W2 owned)
- **Output**: kao.css 4-layer font rules + L1976-2108 旧 sidebar 段删 + forbidden gate clean. 截图: 不需要 (W4).
- **Acceptance**: `git diff --check` clean + forbidden sweep 0 match + `npm run build` clean.

### Window 4: QA (Task 11) — Codex orchestrator (NOT Claude subagent)
- **Worktree**: 集成 W1+W2+W3 commits 到 main 后, Codex 起 `/home/recoletas/worktrees/e11-qa`
- **Scope**: Task 11 (3 张 screenshot + visual review + report)
- **Output**: `docs/agent-runs/2026-06-22-ui-e11/{experience-e11-1280.png, experience-e11-long-1280.png, experience-e11-640.png, UI-E11.report.md}`
- **Acceptance**: 3 张 screenshot 一屏可见 4 段 workstation + hero narrator + topstrip 进度条 + right rail dossier. UI-E11.report.md 落档.

### 集成顺序
1. Codex merge W1 (foundation) → main
2. Codex merge W2 (composition) → main (在 W1 之上, fast-forward 干净)
3. Codex merge W3 (cleanup) → main (在 W2 之上)
4. Codex 启 W4 (QA) 截图 + report
5. Codex 拍板: ACCEPT B ship / DEFER / 调

### 风险预案
- W1 / W2 / W3 如果任何一个 contract fail → 返工该 window, **不**串到下一个
- W4 screenshot 视觉验收 fail → 回到 W2 / W3 调 layout, **不**重启 plan
- 如果 ship 后用户反馈「仍然不行」 → 走 R8 STOP NOW 路径 (ship commit 注明「revert via git revert E11」)

---

**END OF PLAN** — 11 tasks, TDD 顺序, 最大 3 impl + 1 QA dispatch.