# Material Page (`/materials` → Notes.vue) 重构 — Design Spec

**Date**: 2026-06-17
**Status**: Draft
**Stage**: 方案

## 重点

1. **Notes.vue 从"工具壳"切到 kao archive-folio 档案册**:保留 66 个 function + 27 ref + 5 computed 全部行为,仅替换视觉壳层 + 引入 3 个 kao 组件(FolioSurface / ArchiveStrip / CharacterPortrait)+ 1 个 CharacterPortrait 立绘
2. **uiPolish 硬契约 0 破坏**:保留 `material-selection-bar` 4 按钮 + `WorkbenchPageHero` + `GmPersonaLauncher` + `modal-fade` transition + ImageGenRail `@save-to-material` 钩子
3. **kao.css gated by `.theme-kao`,legacy variant fallback 走精简后的 scoped CSS**:theme-system 不破坏,新增视觉仅在 kao variant 下生效

## Context

`/materials` 路由当前指向 `src/pages/Notes.vue`(2748 行),功能定位是"写作过程中的金句 / 重要事件 / 关键描写素材池"(per `docs/user-manual/03-features.md:76-78`),为顾问和画布提供输入。视觉现状是 SaaS 工具壳风格:左侧 sidebar + 中间编辑器 + 顶部 toolbar,**0 处 `--archive-*` token,0 个 folio 组件,12 处 box-shadow,43 处 border-radius**。

主线 spec `docs/superpowers/specs/2026-06-10-ui-redesign-design.md` 是 3-file proof(WelcomeView/AppShell/Experience),§7.4 提到 Writing/Notes/ProseEssay 共用视觉但未展开 material 页。`docs/plan/kao-ui-direction.md` §7.4 明确 Notes = "资料册 / 相片夹 / 索引页",§10 Execution order 把 material 排在 WelcomeView/AppShell/Experience 之后。当前 5A + 5B v0.1 + 5C v3.14 已 ship(`0d9cedd`),WelcomeView 雏形已 ship,theme-system v1 已 ship(`d1b2316`),4 个 kao 组件(FolioSurface / PosterStage / BookmarkButton / ArchiveStrip)+ 5A 产物(CharacterPortrait / CharacterArchiveStrip / CharacterBackdrop)+ 6 立绘 webp 全部 ship。Thread A 在 `docs/STATUS.md:32` 把 Notes.vue 列为 in-flight scope,本 spec 是 Thread A 的具体化。

## Goals

1. **G1** Notes.vue 在 `.theme-kao` 下视觉升级为"档案册":editor-main 由 `FolioSurface variant="paper"` 装裱,sidebar 顶部加 `CharacterPortrait narrator`,toolbar 4 `selection-action-btn` 加 `.material-action-btn` kao 视觉 class(保留 raw `<button>` 元素以满足 uiPolish L77-80 字面量契约),新增 `ArchiveStrip` 3 entry collage tile
2. **G2** uiPolish test 0 破坏(4 个硬契约:`material-selection-bar` + 4 click handler + 文案 / `<Transition modal-fade>` / `<GmPersonaLauncher>`(无 `.advisor-fab`)/ `<WorkbenchPageHero>` + `'Material Library'`),新增 5 条 Notes.vue kao 契约(`<BookmarkButton` ≥ 4 / `<ArchiveStrip` ≥ 1 / `<FolioSurface variant="paper">` ≥ 1 / `<CharacterPortrait pose-id="narrator"` ≥ 1 / scoped CSS 行数 ≤ 700)
3. **G3** Notes.vue scoped CSS 从 1338 行精简到 ≤ 700 行(同步瘦身 -50%),功能逻辑 0 改动(66 function / 27 ref / 5 computed 全部保留,narrativeAssets / relationCanvas / professionalInfoGenerator 3 service 调用签名不变)
4. **G4** `.theme-legacy` variant 下 Notes.vue 走精简后的工具壳 fallback,**theme-system 0 破坏**,`<AppearanceControls>` 4-radio 切换 0 改动
5. **G5** 1 次手动截图 `/materials` route,记录到 `docs/STATUS.md` Recently done,验证 5 个 kao-ui-direction §11 acceptance bar 视觉成立(档案册非工作台 / 4 .is-* utility / serif-sans 分工 / BookmarkButton 独特 CTA / 第 3 处 kao 语法成立)

## Non-Goals

1. **NG1** Writing.vue / ProseEssay.vue 不动 — 三页视觉同构是后续 Thread A 跟进任务
2. **NG2** 5C wallpaper keyframes(material 不上 `CharacterBackdrop`,不上 wallpaperMist/Grain/Light 动画)
3. **NG3** archive-keeper 新立绘 — 等 5B v0.2 user 手画,绝不 uninvited image_generate
4. **NG4** 入场过渡动画 — 对齐 WelcomeView 无入场 transition(默认 router 硬切)
5. **NG5** 新增 `<TornEdgeFilter>` 共享组件 — 短期撕边 SVG filter inline 复制 WelcomeView `<defs>` 块(feTurbulence + feDisplacementMap seed=7),长期 extract 共享组件是 follow-up
6. **NG6** theme-system 进一步改造 — variant / colorScheme / localStorage / applyToHtml 0 改动
7. **NG7** `narrativeAssets` service schema 不动(7 kind × 4 status × 4 source schemaVersion=1)

## Approach

**核心策略**:保留全部功能逻辑 + 替换视觉壳层 + 引入 3 kao 组件(FolioSurface / ArchiveStrip / CharacterPortrait)+ 1 新 CSS class(`.material-action-btn`),实现 kao-ui-direction §7.4 "资料册/相片夹/索引页" 语义。Composition 走 WelcomeView 兄弟方案(2 个 AskUserQuestion 选项已确认):两栏 layout(sidebar + editor-main),archive strip 作为 entry 缩略嵌入 editor-main 内部,不做 split-pane 三栏。视觉基准对齐 WelcomeView 已 ship 的 18px hard-offset shadow,BookmarkButton component **不重用**(R3-A 决定) — 4 batch action 改用 raw `<button>` + `.material-action-btn` class 避免 uiPolish L77-80 字面量冲突。

## Architecture

### Layout(两栏,1280px+ viewport)

```
┌──────────────────────────────────────────────────────────────────────┐
│ <WorkbenchPageHero kicker="Material Library" title="素材">          │
│   #actions: 写作 / 新素材 / theme-toggle                              │
├──────────────┬───────────────────────────────────────────────────────┤
│  .books-     │  .editor-main (FolioSurface variant="paper"           │
│  sidebar     │  decorated="true")                                     │
│  ┌────────┐  │  ┌─────────────────────────────────────────────────┐  │
│  │narrator│  │  │ toolbar: 4 × raw <button>                       │  │
│  │Character│ │  │   class="selection-action-btn material-action-btn"│  │
│  │Portrait │  │  │   @click=importCheckedToCanvas /                 │  │
│  │size=thumb│ │  │   setCheckedAssetsState('accepted'/'archived')   │  │
│  │caption= │  │  │   / deleteCheckedAssets > 导入/采纳/归档/删除    │  │
│  │"档案员"│  │  │   (kao 视觉由 .material-action-btn 提供,           │  │
│  │256x192 │  │  │    BookmarkButton component 不重用,R3-A)         │  │
│  └────────┘  │  ├─────────────────────────────────────────────────┤  │
│  └────────┘  │  │ .title-row: title + 字数 chip + 3 mode switch    │  │
│              │  ├─────────────────────────────────────────────────┤  │
│  7 .material- │  │ <ArchiveStrip :items="archiveStripItems"          │  │
│  group 折叠  │  │   :image="firstImageDataUrl" /> (3 collage tile) │  │
│              │  ├─────────────────────────────────────────────────┤  │
│              │  │ textarea.editor-textarea (clip-path polygon      │  │
│              │  │ 微撕角,0 radius + 18px hard-offset shadow)       │  │
│              │  └─────────────────────────────────────────────────┘  │
├──────────────┴───────────────────────────────────────────────────────┤
│ <GmPersonaLauncher> + <ImageGenRail side="left"> (浮动 fab)         │
└──────────────────────────────────────────────────────────────────────┘
```

### Component 复用(0 新建)

| Component | 用途 | Props |
|---|---|---|
| `FolioSurface` | editor-main + modal 装裱 | `variant="paper"` `decorated` |
| `ArchiveStrip` | 3 entry collage tile | `:items="archiveStripItems"` `:image="firstImageDataUrl"` |
| `CharacterPortrait` | sidebar 顶部 narrator | `poseId="narrator"` `size="thumb"` `caption="档案员"` |
| raw `<button>` × 4 | `.material-selection-bar` 内 4 batch action(导入/采纳/归档/删除) | `class="selection-action-btn material-action-btn"` 保留 uiPolish L77-80 字面量(`@click` + 文案 + `</button>`),新增 `.material-action-btn` CSS class 提供 kao 视觉(paper-soft bg + gold border + 18px hard-offset + 0 radius);**BookmarkButton component 不重用**(其 label 包 `<span>` 跟 uiPolish L77-80 字面量冲突) |
| `WorkbenchPageHero` / `GmPersonaLauncher` / `ImageGenRail` / `AdvisorPanel` | 已有(不动) | — |
| `<Transition name="modal-fade">` | modal 入场 | uiPolish L61 锁 |

### CSS 新增(进 `src/styles/themes/kao.css`,gated by `.theme-kao`)

4 个新 utility / class:
- `.material-action-btn`:4 batch action 按钮的 kao 视觉(paper-soft bg + gold border + 18px hard-offset shadow + 0 radius + 12px hover filter);跟 `.selection-action-btn` 共存(uiPolish L77-80 锁 button 元素字面量,class 名不锁)
- `.material-bookmark-toolbar`:4 batch action 按钮容器(`grid-template-columns: repeat(4, 1fr)` + paper-soft bg + hairline border)
- `.material-entry-card`:撕边 entry 缩略(`aspect-ratio: 3/4` + clip-path polygon + 4px hard-offset shadow)
- `.material-tear-svg`:撕边 SVG `<defs>` 容器(width: 0; height: 0; feTurbulence + feDisplacementMap seed=7,跟 WelcomeView 一致)

`main.css` 0 改动(per `feedback_dont_overwrite_user_tuned_values.md`)。

### Notes.vue scoped CSS 改造目标(1338 → ≤ 700 行,容忍 ±10% 即 700-770 行 OK)

**保留**: `.books-sidebar` / `.editor-main` / `.editor-textarea` / `.asset-toolbar` / `.material-group` / `.book-item` / `.modal` / `.find-replace-bar` / `.name-gen-panel` / `.context-menu` / `.selection-action-btn`(保留 class 名作为基类,新 `.material-action-btn` 叠加)

**删除(scope-out → 跟 kao.css 合并)**: `.theme-toggle` / `.toolbar-text-btn` / `.add-btn.prominent/btn-new` / `.tool-btn` / `.mode-switch` / `.asset-canvas-primary/secondary` / 4 个 1-6px rgba box-shadow / `border-radius: 4/6/8px`(改 ≤ 2px 或 0)

**`.theme-legacy` fallback**:scoped CSS 全部保留(精简后 700 行),kao.css 不 gate 时 scoped 生效,跟现有 legacy 风格一致

**CSS 行数 target + tolerance**:Phase C 验收时 ≤ 700 行 hard fail,701-770 行软警告(允许 ±10%),≥ 800 行 trigger follow-up Phase D 调整

### Data flow(state / props / events)

**State 保留**:Notes.vue `<script setup>` 现有 27 ref + 5 computed + 66 function 全部不动

**新增 1 ref**: `currentKindForArchiveStrip` — 跟踪 ArchiveStrip 显示的 kind(默认第一个有 entry 的 kind);`archiveStripItems` 是 computed:`chapters.value.filter(a => a.kind === currentKindForArchiveStrip).slice(0, 3)`

**Service 调用保留**:`narrativeAssets` 6 fn / `relationCanvas` 4 fn / `professionalInfoGenerator` 1 fn 全保留,签名不变;`useStorage.STORAGE_KEYS.PROSE_IMAGE_LIBRARY` 保留;ImageGenRail `@save-to-material` 钩子保留

**Store 0 改动**:`gameStore` / `themeStore` / `useTheme` / `useAdvisor` 全保留

### Migration phases(3 phase,类比 WelcomeView spec)

| Phase | 目标 | 风险 |
|---|---|---|
| **Phase A** — CSS token + 3 kao 组件 import + scoped CSS 瘦身 + 新 CSS class | Notes.vue `<script setup>` import FolioSurface / ArchiveStrip / CharacterPortrait(BookmarkButton 不重用,见 R3-A);template 内 4 `<button class="selection-action-btn">` 改为 `<button class="selection-action-btn material-action-btn">`(保留 uiPolish L77-80 字面量);scoped CSS 大量删除(`toolbar-text-btn` / `add-btn.prominent/btn-new` / `tool-btn` / `mode-switch` / `asset-canvas-primary/secondary` / 4 个 1-6px rgba box-shadow / `border-radius: 4/6/8px`);kao.css 新增 4 个 utility / class;template 主体结构不动 | 模板主体结构不动,只在已有 button 上加新 class 名 + 新增 import;视觉切换主要靠 kao.css 新 utility + .selection-action-btn 视觉改写 |
| **Phase B** — Template 重排 | editor-main 包 FolioSurface;sidebar 顶部加 CharacterPortrait;ArchiveStrip 3 collage tile 嵌入 editor-main(在 title-row 下方);modal 包 FolioSurface variant=paper | layout 大改,test 重点验证 |
| **Phase C** — 1 次手动截图 + 验收 | 跑 uiPolish + notes + narrativeAssets 全测;记录截图到 STATUS.md | 无代码风险,纯验证 |

### Acceptance bar(per kao-ui-direction §11)

1. "首页首屏一眼看上去不是 dashboard" — Notes editor-main FolioSurface 装裱"翻开页"视觉成立 ✓
2. "册页/拼贴/书签语法切到" — FolioSurface + ArchiveStrip + BookmarkButton ✓
3. "serif/sans 分工" — editor Iowan Old Style serif + UI Inter sans ✓
4. "CTA 有独特形体" — 4 `.material-action-btn` 提供 18px hard-offset + gold border + paper-soft bg(BookmarkButton 不重用,但视觉仍满足 kao CTA 形体标准,见 R3-A) ✓
5. "相同语法在 2+ 处成立" — WelcomeView + AppShell 已 ship,Notes 是第 3 处 ✓

## Self-Application

- **设想(上游)**: `docs/plan/kao-ui-direction.md` (Notes = "资料册/相片夹/索引页" 语义) + `docs/plan/character-driven-arc.md` (Notes = "她的素材整理墙" + pose-D 静默态)
- **本 spec(方案)**: 本文件
- **计划(下游)**: `docs/superpowers/plans/2026-06-17-material-page.md` (待 writing-plans skill 输出)

## Out of scope / future

1. Writing.vue / ProseEssay.vue 视觉同构(后续 Thread A 跟进)
2. archive-keeper 立绘(等 5B v0.2 user 手画)
3. `<TornEdgeFilter>` 共享组件 extract(长期 follow-up)
4. 5C wallpaper keyframes(本 spec 不上 backdrop)
5. 入场过渡动画(对齐 WelcomeView 硬切)
6. theme-system 进一步改造(variant / colorScheme 0 改)

## Risks

| Risk | Mitigation | 残留风险 |
|---|---|---|
| **R1**: Notes.vue 2748 行改 layout 大手术,1-2 周 worktree | Phase A/B/C 三步走,每步独立验证 uiPolish | Thread A in-flight scope 内,可控 |
| **R2**: scoped CSS 大量删除可能误删有用 class | 删前 grep 全项目引用;每步跑 `npm run test:run -- uiPolish.test.js` | 需 follow-up 跑全量 test |
| **R3**: FolioSurface `overflow: hidden` 截断 textarea 滚动 | 已 verify:textarea `overflow-y: auto` 滚 textarea 内容(不是 FolioSurface 容器) | 若发现问题,改 FolioSurface `decorated="false"` |
| **R4**: 5B v0.1 6 立绘 webp 加载失败 | narrator.webp 已 ship 144 KB,5A stub fallback 走 `characterArt.js status='stub'` 链路 | stub 状态下视觉降级但功能 0 破坏 |
| **R5**: narrator label "在场叙述者" 长期贴切度弱 | 短期 ship,长期 user 手画 archive-keeper(5B v0.2) | label 不在 uiPolish 契约,可后续替换 |
| **R6**: uiPolish L532 锁 WelcomeView 82px default 不影响 material | uiPolish L532 只锁 WelcomeView,Notes.vue 无 size 限制 | 若 W 后续同构改造需 W 单独 spec |
| **R7**: 撕边 SVG filter inline 复制产生代码重复 | 短期接受,长期 follow-up extract `<TornEdgeFilter>` 共享 | 同步维护两份 `<defs>` |
| **R8**: uiPolish test 新增 5 条 Notes 契约 + 1 条 CSS 行数守护 | spec G2 已列 5 条测试名;Phase B 同步加 | uiPolish test 是 spec 契约的实现载体,需在 Phase B 同步加 5 条 contract test |
| **R11**: BookmarkButton component 跟 uiPolish L77-80 字面量冲突 | 不重用 BookmarkButton,4 batch action 改用 raw `<button>` + 新 `.material-action-btn` class(见 R3-A) | 视觉少 BookmarkButton 的 index span "01" "02" "03" "04" 装饰,但对 workbench 工具栏更简洁 |
| **R9**: "PPT 平面块"风险(per `feedback_visual_integration_not_illustration.md` 7 次反馈) — 严禁 translucent + soft shadow + 矩形老路 | 18px hard-offset shadow + FolioSurface 撕角 + textarea clip-path polygon 微撕角 + 0 radius + 4 .is-* utility 全部走 kao 视觉,不用 rgba(0,0,0,0.05-0.15) soft shadow | 视觉最终还是要 user 1 次手动截图确认(Phase C);若仍"平面块",follow-up Phase D 调整 |
| **R10**: 5C v3.14 ship 后 19 个 uiPolish test failures 教训(测试按 animation name 写导致过期) | G2 的 5 条新契约按 **behavior** 写(`element exists` / `class contains`),不按 animation name 写(不锁 `artBreathe` / `wallpaperMist` 等) | 仍需 Phase B 实跑验证 5 条新契约不会随 kao.css 演进而漂移 |

---

## 评审记录

- 2026-06-17 初稿 — 由 Claude 基于 3 个并行 subagent(Notes.vue 实现 / spec-plan 调研 / 视觉资产)+ 8 个核心文件亲自读 + 5+5 轮 self-review 撰写
- 2026-06-17 round 2 self-review(fix 5 issues):
  - **Issue A** [internal consistency]: §1 Layout ascii 还写 `primary/tertiary/secondary`,§2 表已改 `primary/secondary/secondary/tertiary` — ascii 框同步
  - **Issue B** [ambiguity]: G5 说"4 个" acceptance bar,实际 §11 列 5 条 — 改"5 个"
  - **Issue C** [ambiguity]: Phase A 描述"0 template 结构改"太绝对 — 澄清"template 主体结构不动,只在已有 button 上换 class 名 + 新增 import"
  - **Issue D** [ambiguity]: G2 "新增 5 条 Notes.vue kao 契约"没说具体哪 5 条 — 列出 5 条具体契约(`<BookmarkButton` ≥ 4 / `<ArchiveStrip` ≥ 1 / `<FolioSurface variant="paper">` ≥ 1 / `<CharacterPortrait pose-id="narrator"` ≥ 1 / scoped CSS ≤ 700 行)
  - **Issue E** [memory cross-check]: Risks 没引用 `feedback_visual_integration_not_illustration.md` 7 次 PPT 平面块反馈 + 5C v3.14 19 failures 教训 — 加 R9 + R10
- 2026-06-17 round 3 multi-dimensional self-review(fix 4 issues):
  - **Issue R3-A [CRITICAL architecture]**: BookmarkButton component 渲染 label 时包 `<span class="bookmark-button__label">`,跟 uiPolish L77-80 字面量 `@click="...">导入</button>` 冲突。**决策**: 4 batch action 不重用 BookmarkButton component,改用 raw `<button>` + 新 `.material-action-btn` class,保留 uiPolish 字面量。Component 复用表删除 BookmarkButton × 4 行,新增 raw button + .material-action-btn 行;CSS 新增从 3 → 4(.material-action-btn 替换原 size=micro/variant 想法);G1 措辞调整;Phase A 实施步骤细化;加 R11。
  - **Issue R3-B [ambiguity]**: CSS 行数 ≤ 700 软/硬阈值不明 — 加 "≤ 700 hard fail,701-770 软警告 ±10%,≥ 800 trigger follow-up"
  - **Issue R3-C [phrasing]**: R8 "uiPolish test 是 spec 的 sibling" 表述不准 — 改为 "uiPolish test 是 spec 契约的实现载体"
  - **Issue R3-D [consistency]**: BookmarkButton variant 映射(导入=primary 等)在 R3-A 后失效 — 删除;Component 表第 2 行原 BookmarkButton 整段移除
- 2026-06-17 round 4 verification + consistency sweep(fix 4 issues):
  - **Issue R4-A [CRITICAL consistency]**: §1 Layout ascii L53-58 还写 `BookmarkButton size="micro"`,跟 Component 表 L80 "BookmarkButton 不重用" 矛盾 — ascii 框改为 `4 × raw <button> class="selection-action-btn material-action-btn"`,加 "(kao 视觉由 .material-action-btn 提供,BookmarkButton component 不重用,R3-A)" 说明
  - **Issue R4-B [consistency]**: Approach L39 还说 "BookmarkButton size=micro"(R3-A 后失效)— 重写为"BookmarkButton component 不重用 (R3-A 决定) — 4 batch action 改用 raw <button> + .material-action-btn class 避免 uiPolish L77-80 字面量冲突"
  - **Issue R4-C [consistency]**: Acceptance bar L127 "4 BookmarkButton clip-path + skewX + 18px hard-offset" 跟 L80 矛盾 — 改为 "4 .material-action-btn 提供 18px hard-offset + gold border + paper-soft bg(BookmarkButton 不重用,但视觉仍满足 kao CTA 形体标准,见 R3-A)"
  - **Issue R4-D [consistency]**: 重点 L9 说"引入 4 个 kao 组件",跟 R3-A 后 3 个 kao 组件矛盾 — 改为"引入 3 个 kao 组件"
  - **Issue R4-E [scope refinement]**: Phase B 描述还提"toolbar 4 selection-action-btn → 4 BookmarkButton"(R3-A 后失效)— 改为"modal 包 FolioSurface variant=paper"
- 等 user review → Approved → writing-plans skill