# 开发日志

> 只记录近期用户可感知变化、验证结果和仍会影响后续判断的风险。过程性 UI 微调不再逐条保留。

## 当前摘要

- 产品主线正在从“文字游戏 + 写作工具集合”收口为“可玩的世界书”：进入世界、冒险、沉淀剧情，再写成作品或整理为分镜。
- 根路由真实首屏现已收口到 `src/views/WelcomeView.vue`；历史残留 `Home.vue` 已清理，不再保留并行假入口。
- 当前主要稳定链路：体验页 -> 世界书/设定 -> 素材 -> 卡片画布/分镜 -> 写作出口。
- 当前验证基线：`npm run test:run` 通过（87 files, 584 tests），`npm run build` 通过；视觉/性能单跑最近基线仍为 12 tests 通过。

## 2026-06-19 - Worktree cleanup and main absorption

状态：完成当前 main 清理、吸收和本地分支收口。

结果摘要：
- 从旧 `feat/n5c-material-archive-folio` 吸收最终有用状态：`Notes.vue` 素材页 archive-folio 重构、N5C `uiPolish` 契约和最终验收截图 `docs/demo/n5c-material-page-merged-20260618_001.png`；未吸收中间重复截图。
- 从旧 `feat/5c-experience-push` 只吸收低风险功能修复：`Experience.vue` 优先恢复当前 active worldbook 对应的最新会话，`SessionPicker` 支持 busy 禁用态，Experience 会话选择/新建/删除加 `isStarting` + `try/finally` 防重复点击。
- 未吸收 `61d569a` radical opening encounter 实验：该 commit 含未完成 template hooks、未接入 Welcome/router 的 slash wipe 和 broad opening/experience rewrite；按新视觉 workflow 判定不适合无最新 direct/截图约束直接进 main。
- 清理 stale 本地结构：删除 worktree `/home/recoletas/jiuguan/worktrees/5c-experience`，删除本地分支 `feat/5c-experience-push`、`feat/n5c-material-archive-folio`、`main-tmp`；保留 `server-version`。

验证：
- `npm run test:run -- src/__tests__/uiPolish.test.js` 通过（67 tests）。
- `npm run verify:full` 通过（Vitest + Vite build + `git diff --check` + VitePress docs build + visual-verification）。

## 2026-06-19 - Codex / Claude 协作与视觉对齐流程固化

状态：文档规则已落盘，供后续多 agent 与前端视觉任务复用。

结果摘要：
- 新增 [engineering/agent-orchestration-workflow.md](./engineering/agent-orchestration-workflow.md)：明确 Codex 是主控台 / 架构师 / 集成者 / 验收者，Claude worker 是异步工人；规定 worker brief、看板、summary 限长、worktree 隔离和上下文保护。
- 新增 [engineering/visual-alignment-workflow.md](./engineering/visual-alignment-workflow.md)：规定 direct 红线语义、视觉硬约束、小切片 prototype、截图验收、1-5 分反馈格式，以及何时该由 Codex 亲自精修。
- 更新 `AGENTS.md`：把关键项提升为 agent 硬约束，包括不得让 Claude 反向调用 Codex、不得把完整 Claude 日志塞进 Codex 上下文、多 worker 必须维护看板、视觉任务必须先转硬约束并截图验收。
- 更新文档导航与开发规范入口。

验证：
- `npm run verify:full` 通过（Vitest + Vite build + `git diff --check` + VitePress docs build + visual-verification）。
- agent-maintenance symlink / SKILL frontmatter 检查通过。

## 2026-06-18 - Nova-inspired runtime foundation

状态：完成 3 feature commits on `main`（`e4bd36f` / `cc8ffd6` / `3bae14b`），前置文档 commit `2717848`。

结果摘要：
- 新增 bounded context ledger：`contextLedger.js` 只存 source/title/purpose/chars/tokens/preview/included/truncated 等元数据，不存完整 prompt；`worldbookContextBuilder` 所有返回路径带 `contextLedger`，记录 no-worldbook/no-match/included/truncated worldbook sections；`gameStore.lastContextLedger` 聚合 worldbook/runtime/memory/recent-chat 账本，保持 `messagesToSend` 顺序和内容不变。
- 新增 runtime event envelope：`runtimeEvents.js` 定义 v1 envelope、state-op/path allowlist、display_event 默认 non-contextual、200 条 cap；`gameStore` 持久化 `runtimeEvents` sidecar，保存/加载/重置会话均兼容旧 `messages/runtimeState`。
- 新增 ranked local memory recall：`memoryCandidates.js` 增加 `rankScopedActiveMemoryCandidates` / `buildScopedMemoryRecallContext`，只召回 active confirmed memories，按 query match/confidence/recency 排序并返回 bounded preview metadata；`gameStore.lastMemoryRecall` 暴露召回审计，Mem0 fallback 仅在本地 recall 为空时触发。
- 外部 Claude CLI worker 流程沉淀：`AGENTS.md` 记录 `/home/recoletas/.nvm/versions/node/v20.20.2/bin/claude`、`--bare -p --output-format json`、Codex 架构/集成/验收 + Claude 并行实施模式；Codex 个人记忆写入 `/home/recoletas/.codex/memories/claude_parallel_workflow.md`。

验证：
- focused runtime/context/memory suite 通过（5 files / 66 tests）。
- `npm run test:run` 通过（111 files / 802 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

备注：
- `OpeningPage.vue`、`Experience.vue`、`MemoryIndicator.vue` 未改。
- 仍有用户先前留下的未跟踪截图 `docs/demo/n5c-material-page-20260617_002.png`，本轮未触碰。

## 2026-06-17 - Writing 页 kao archive-folio 表面重构（Phase 1C 首签 + v2 审查修复）

状态：完成 1 commit ship gate（`a3b650b`，v2 amend 含 5 项审查修复，未推送）

结果摘要：
- Writing 页从旧 "workbench hero + flat sidebar + dark/light tool-btn" 视觉栈迁到 kao archive-folio 语言：`<FolioSurface>` 包装 4 区（hero header chrome+plain / books-sidebar paper+decorated / editor-main chrome+plain / asset-inbox modal paper+decorated），chapter 列表行变 `<BookmarkButton variant="tertiary" size="compact" :index :label>` 把侧栏变成 kao 目录页，AI 面板 primary 应用 / secondary 取消切 `<BookmarkButton variant="primary|secondary">` 并改 `display: grid; grid-template-columns: 1fr 1fr` 避免 72+72 垂直堆叠到 144px，mode switch (wysiwyg/markdown/preview) 保持 `.action-btn` 锁。
- 侧栏 footer 挂 pose-D 半身侧视 `<CharacterPortrait pose-id="writing-sidekick" size="thumb" caption="批注中" style="max-width: 180px">` + `v-show="!isRightCollapsed"` 守卫（避免收起时 256px 立绘漏出 44px 侧栏），配 `characterArt.js` 第 7 条 entry（status="stub" → 5B v0.2 ship 改 src 切真图）。
- kao.css 追加 8 条 `.theme-kao` gated 规则：`.writing-page` / `.books-sidebar { display: flex; flex-direction: column }`（救 scoped CSS 不穿透 FolioSurface 根 `<aside>` 的关键修复） / `.writing-sidebar` / `.sidebar-header { background: transparent; padding-top: 32px }`（防 18-32px 撕角 clip 标题） / `.writing-editor` / `.ai-panel`（重命名自死的 `.writing-ai-panel`） / `.asset-inbox-modal { background: transparent }` + `.asset-inbox-modal-header { padding-top: 32px }` / `.bookmark-button.active { box-shadow: inset 0 0 0 2px var(--archive-gold) }`（救章节选中无视觉反馈）。main.css 零改动。Writing JS 68.24 kB / gz 26.05 kB（v2 vs v1 +50 B raw，gz 持平，净增 ≈0.05 KB）。
- 8 个新 uiPolish 契约（5 原始 + 3 review-fix：sidebar footer v-show 守卫 / BookmarkButton .active 规则 / .books-sidebar flex 救活）+ 2 个新 stereoMigration 契约（CharacterPortrait 侧栏 + characterArt 6→7 + useCharacterArt 命中 writing-sidekick）。
- `stereo-migration-design.md:428-432` 锁不破：BookmarkButton / ArchiveStrip / CharacterArchiveStrip 不进 Writing 工具条（mode switch + tool-btn + quick-note-mini-btn 全部保持原类）。
- Do-not-touch 全部保留：`gameStore.js` / `worldbookContextBuilder.js` / `generation*` / `StatusBar.vue` / `useCharacterArt.js` / `components/folio/*` 0 改动。
- 1 commit（per `feedback_commit_conventions` 1 commit per feature, max 2），无 `Co-Authored-By` footer；按 `feedback_stage_by_name_in_worktree` 逐文件 `git add <name>`，无 `git add -A` 扫；v2 amend 保留原 hash，docs 同步更新。
- Plan: `docs/superpowers/plans/2026-06-17-writing-kao-grammar.md`（8 任务 + 自审 + 风险 R1-R5）。
- v2 审查路径参考：3 个并行子 agent（code + visual + docs/test）发现 5 真 bug（CRITICAL×2：scoped CSS 穿透 FolioSurface 边界、`.chapter-list-item` 缺 flex 包装；HIGH×3：hero 双框、BookmarkButton 无 `.active`、AI 144px 垂直堆叠、footer v-show 漏）+ 4 dead CSS + 3 doc 错，已全部在 amend 内修。

Deferred（按重要性排序，不在本 commit）：
- W3：editor 表面立体感 3 平面 + drop-cap + wallpaperMist + titleGlow（要 1-2 轮 user 手调，5C v3.12 涌现经验）。
- Tiptap v3 替换 + Codex 右侧栏（`comprehensive-research-synthesis-20260615.md:484` Tier 2 #15，Phase 1C 前置条件；本 commit 严格只动表面，不动编辑器内核）。
- 5B v0.2 真图（`writing-sidekick` 切 `kao-archive-writing-sidekick.webp` + status 改 "real"）。
- `Notes.vue` + `ProseEssay.vue` Phase 1C 复用同 kao 语法（`kao-ui-direction.md:228` execution order 第 5 步）。
- CharacterPortrait 缺 `compact` size（≤180px max-width 内置）：当前用 `style="max-width: 180px"` inline 约束，下一组件迭代补。

验证：
- `npm run test:run` 通过（v2 后 109 files / 762 tests，+0 regression）。
- 4-contract gate（`uiPolish.test.js` + `welcomeView.test.js` + `workbenchNav.test.js` + `themeVariantView.test.js`）通过（57/57）。
- `npm run build` 通过。
- `git diff --check` 通过。
- 无 `Co-Authored-By` footer。

## 2026-06-17 - Writing 页 W3 visual emergence commit 1 (drop-cap)

状态：W3 3 commit ship gate 第 1/3 完成（`70bb601`，未推送）

结果摘要：
- 修了 v2 ship 后 user 反馈的"和原来差别不大感觉"。v2 是 surface swap(组件 + token 层),没动视觉层。W3 是视觉涌现层(立体感 + drop-cap + 慢呼吸 + 侧栏活),按 5C v3.12 涌现经验拆 3 atomic commit。
- 本 commit:drop-cap 手稿页招牌。kao.css 加 1 条 `.theme-kao .editor-preview > p:first-of-type::first-letter` 规则(3 行 LXGW WenKai 金色 180 度 gold→rose gradient initial)+ 1 个 reduced-motion a11y 守卫 block(commits 2/3 共享)。
- Writing.vue 0 template change(纯 :first-of-type 选择器),0 新组件,0 新依赖,所有 CSS gated by .theme-kao 不泄漏给 legacy。
- 3 个新 uiPolish 契约(selector pattern / --font-display token / --archive-gold token),全绿。
- R1(CJK-only)按 spec 关闭:drop-cap 对任意首字(CJK 或 Latin)起作用,两者都读为金色 initial。

验证：
- `npm run test:run` 通过(109 files / 765 tests,+0 regression)。
- 4-contract gate(60/60)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- `prefers-reduced-motion: reduce` 守卫建立(本 commit 用不到但 commit 2/3 复用)。
- 无 `Co-Authored-By` footer。
- 手动截图复盘通过(drop-cap 视觉合 user 期望)。

## 2026-06-17 - Writing 页 W3 visual emergence commit 2 (3-plane + wallpaperMist + titleGlow)

状态：W3 3 commit ship gate 第 2/3 完成（`0de4b68`，未推送）。原计划用 `feat(writing)` 类型独立成 commit 2；code review 时发现 `@keyframes wallpaperMist` / `titleGlow` / `kickerPulse` 实际不在 `main.css`,而在 `CharacterBackdrop.vue` + `OpeningPage.vue`(都不挂 `/writing`),所以把"keyframe 复制到 kao.css"的修复与"3-plane + wallpaperMist + titleGlow consumer"一起作为前置-合 commit 提交,`fix(writing)` 类型保留原状以便 review 看到根因。**注**:plan Task 13 的 `feat(writing)` body 因此未直接使用,本 commit message 保持 fix 形态;docs 模板同步。

结果摘要：
- **前置修复(为何合 1 commit)**:plan 默认 `@keyframes wallpaperMist` 在 `main.css:427-431` 是错的,实测在 `CharacterBackdrop.vue:427` / `OpeningPage.vue:772` / `CharacterBackdrop.vue:442`,且这 3 个组件都不挂 `/writing` route。kao.css 是 `/writing` 唯一 theme 文件,所以加 3 个 `@keyframes` identical copy(原位置不动保 regression safety,CSS last-parsed 胜出,kao.css 在组件后加载所以自己的 copy 胜)。spec / plan docs 也改到正确引用。
- 3 平面 z 轴:back 底 = `.folio-surface--paper` (z-decor 2),window = `.editor-container` (z-hero 5),front = `.copilot-indicator` + `.chapter-title-input` (z-cta 6)。
- `wallpaperMist` 14s 慢呼吸 olive gradient 在 `.editor-container::before`。keyframes 来自本 commit 同步加进 kao.css 的 copy(原 `CharacterBackdrop.vue:427`,identical)。
- `titleGlow` 4.8s 在 `.chapter-title-input`(28px, letter-spacing 0.04em, `font-family: var(--font-display)` / LXGW WenKai)。keyframes 来自 kao.css 的 copy(原 `OpeningPage.vue:772`,identical)。
- 5 条新 `.theme-kao` 规则 + 3 个 `@keyframes` 定义,全在 kao.css,Writing.vue 0 template change。
- 7 个新 uiPolish 契约:3 平面 z × 3 (`editor-container` z-hero / `copilot-indicator` + `chapter-title-input` z-cta / `folio-surface--paper` z-decor)+ `wallpaperMist` consumer(`.editor-container::before` 含 animation)+ 3 keyframe self-containment 锁(kao.css 暴露 `@keyframes wallpaperMist` / `titleGlow` / `kickerPulse`)。全绿。
- 复用 commit 1 立的 reduced-motion a11y 守卫(本 commit 加的 `.editor-container::before` / `.chapter-title-input` 已在该 block 覆盖,commit 3 加 `:hover` / `:focus` 即可)。

验证：
- `npm run test:run` 通过(109 files / 772 tests,+0 regression)。
- 4-contract gate(67/67)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- 手动截图复盘通过(立体感呼吸 / 标题 glow 合 user 期望)。
- 无 `Co-Authored-By` footer。

## 2026-06-17 - Writing 页 W3 visual emergence commit 3 (chapter list motion)

状态：W3 3 commit ship gate 第 3/3 完成（`7b30b81`，未推送）。W3 全部 ship。

结果摘要：
- 侧栏章节列表 hover/focus 微弱运动。.theme-kao .chapter-list-item .bookmark-button:hover/:focus/:focus-visible 加 1.5s kickerPulse + 1px gold hairline。
- 复用 5B ship CharacterBackdrop.vue:442-445 的 @keyframes kickerPulse,不在 kao.css 重写。
- 选择器限定 .chapter-list-item 作用域,不影响 WelcomeView / OpeningPage 其它 BookmarkButton 消费点(grep 验证无跨页面污染)。
- 复用 commit 1 立的 reduced-motion a11y 守卫(本 commit 加的 3 个 selector 已在该 block 覆盖)。
- 2 个新 uiPolish 契约(hover + focus 都引用 kickerPulse),全绿。

**W3 3 commit ship 总结**:
- commit 1: drop-cap(文本层,手稿页招牌)
- commit 2: 3-plane z + wallpaperMist 14s + titleGlow 4.8s(立体感呼吸,3 项配对)
- commit 3: chapter list motion(侧栏活,hover-only)
- 累计 9 个新 uiPolish 契约(3+4+2),4-contract gate 66/66,test:run 109 files / 771 tests,build clean,diff:check clean,prefers-reduced-motion 守卫全程覆盖,0 新组件,0 新依赖,Writing.vue 0 template change,do-not-touch 全保留。

验证：
- `npm run test:run` 通过(109 files / 771 tests,+0 regression)。
- 4-contract gate(66/66)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- `prefers-reduced-motion: reduce` a11y 守卫全程生效(commit 1 foundation,commit 2/3 复用)。
- 无 `Co-Authored-By` footer。
- 3 次手动截图复盘通过(drop-cap / 立体感呼吸 / 侧栏活),合 user 期望。

## 2026-06-17 - Writing 页 W3 round 2 polish (3 LOW review fixes)

状态：完成 W3 3 commit ship 后 3 LOW 审查修复（3 commits: f87d4a9 / 4200da8 / 0bf2f48，未推送）

结果摘要：
- 修了 round 2 review 找的 3 个 LOW 问题。
- **Fix 1** (f87d4a9): 缩小 `.folio-surface--paper` 选择器作用域。从 `.theme-kao .folio-surface--paper` 改成 `.theme-kao .writing-page .folio-surface--paper` 防止 z-index 漏到 `Experience.vue:60` quick-note-header-wrap(原本会被加 z-decor 2,虽然不破坏视觉但不是 spec 意图)。Writing.vue:2 有 `.writing-page` 根 class,Experience.vue 没有,选择器天然 scope 准确。1 个 uiPolish 契约 regex 更新,新 selector。
- **Fix 2** (4200da8): 章节列表 focus ring 强化 1px → 2px。1px 是 WCAG 2.4.7 "highly visible" 最低标准,改 2px solid gold + 4px gold-tint 30% outer glow 双线 ring。章节选择 / Tab 键导航视觉反馈更强。3 个 rule 都改,1 个新 comment。test 不需要改(只 check animation: kickerPulse,不动 box-shadow)。
- **Fix 3** (0bf2f48): kickerPulse 关键帧改成可见。原文是 `text-decoration-color` 动画,但 `BookmarkButton.vue:106` 有 `text-decoration: none` → 动画技术跑但视觉无变化。改成 `box-shadow` 动画(4px/30% → 6px/50% outer gold-glow breath),对齐 Fix 2 的静态 2px+4px baseline,动画无缝。内圈 2px 不变(键盘 focus 稳定),外圈 glow 呼吸。1 个新 uiPolish 测试锁"keyframe animates box-shadow, not text-decoration-color"。

累计：3 修复 7 lines CSS + 1 new test,0 scope creep,do-not-touch 全保留。

验证：
- `npm run test:run` 通过(109 files / 775 tests,+0 regression)。
- 4-contract gate(70/70)通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- 无 `Co-Authored-By` footer。

## 2026-06-11 - Welcome / Experience Pass 2 视觉与版式收口

状态：完成本轮收口

结果摘要：
- Pass 2 落地: WelcomeView 主图软过渡 (PosterStage `feGaussianBlur stdDeviation="3"` 串在现有 `feDisplacementMap` 后 + `.welcome-stage-haze::after` 色温 multiply + `.welcome-poster-stage::before` cream multiply)、7-tile A3 中密度 (3 → 7 tile per A3 mock 精确数值 + 4 件 prop: tape × 2 / fold × 1 / stain × 1)、`isolation: isolate` 救 01 按钮 980px (在 `.welcome-stage-poster` 上把 mix-blend-mode stacking context 隔离)、760px 隐藏全部 tile + prop (R7 mitigation)。
- Experience 综合修: `.stage-command` 980px 降级为 `skewX(-8deg)` (base + hover 同步) + `min-height: 50px`、Hero 标题 640px 改 `clamp(32px, 9vw, 46px)` 防溢出、`.playable-world-stage-poster` 980px 加 `max-height: 280px`、浮动层 (mechanism-notice / quick-notes-rail / game-image-gen-rail) 980px 统一 `bottom: calc(150px + env(safe-area-inset-bottom, 0px))`、`.mechanism-notice` z-index 改 `var(--z-mechanism-notice)` 替代硬编码 248。
- main.css 新加 4 个 z-index token (`--z-stage-decor: 2` / `--z-stage-hero: 5` / `--z-stage-cta: 6` / `--z-mechanism-notice: 248`) + `.is-archive-prop` utility 及 3 modifier (`--tape` / `--fold` / `--stain`)。
- Test: `welcomeView.test.js` 加 7-tile + 4-prop 存在性断言、`uiPolish.test.js` 加 isolation + 4 token + Experience mechanism-notice token 断言。
- Spec: `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (v3, commit `7f98157`, 8-subagent review)。验证截图见 `docs/demo/pass2-screenshots/` (6 张, 1280/980/760 × welcome/experience)。

## 2026-06-10 - Thread B runtime context continuity

状态：完成本轮收口

结果摘要：
- `src/services/api.js` 的普通模式 context 注入不再只依赖 legacy 的 `character / time / location / scene / activities`；当会话里只有 `goals`、`encounteredCharacters`、`factionRelations`、`keyChoices`、`plotJournal` 这类轻 runtime 状态时，也会生成系统上下文，并把这些字段完整写进背景信息。
- `src/services/worldbookContextBuilder.js` 的扫描文本开始消费阵营名和 `plotJournal` 的 `participants / locations / keyChoices / unresolvedHooks`，让 Stage 3a / 3b 写下来的剧情日志能更直接驱动世界书命中，而不是只吃 `summary`。
- 定向回归补到 `src/__tests__/contextMessage.test.js` 和 `src/__tests__/worldbookContextBuilder.test.js`，同时保留一条 `generationService` smoke，确保这轮 Thread B 只收口 runtime 主链，没有顺手碰 A 持有的 `WelcomeView / AppShell / gm-persona / QuestLog` UI 面。

验证：
- `npm run test:run -- src/__tests__/contextMessage.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/generationService.test.js` 通过（3 files, 12 tests）。
- `npm run test:run` 通过（87 files, 584 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-10 - Thread A Phase 1B 第三切片内层舞台重排

状态：进行中，已完成第三切片

结果摘要：
- `src/pages/Experience.vue` 从“页头统一了，但下方仍是旧聊天工具区”进一步改成两段式工作面：上半 `experience-stage-band` 负责世界摘要、开场卡和切口列表；下半 `game-layout` 负责聊天主区与右侧情报侧栏，主次关系比之前清楚一层。
- 这轮重心是减工具感而不是加装饰：右栏只保留“主线路径 / 当前切口 / 现场情报”三类信息，CTA 改成更整块的动作按钮，聊天区和输入区重新包进统一的 editorial shell。
- `src/views/WelcomeView.vue` 也同步收掉一批容易显得偶发的“今晚”表述，改成更通用的世界入口语气，避免入口文案被具体时态绑死。
- 契约测试同步更新：`uiPolish` 现在断言 `shell-mast / shell-drawer / activity-btn` 和 `experience-stage-band / game-main-shell / 当前切口`，不再盯旧的 `shell-flyout / compact` 结构。

验证：
- `npm run test:run -- src/__tests__/uiPolish.test.js src/__tests__/welcomeView.test.js src/__tests__/gmPersonaLauncher.test.js` 通过（3 files, 10 tests）。
- `npm run test:run` 通过（87 files, 582 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread A Phase 1B 第二切片 shared page hero

状态：进行中，已完成第二切片

结果摘要：
- 新增共享组件 `src/components/workbench/WorkbenchPageHero.vue`，把四个重工作面的页头收口成同一套 editorial shell：统一承载 back / inline selector / meta chips / actions，减少“每页一排工具按钮”的割裂感。
- `Experience`、`Writing`、`Notes`、`ProseEssay` 现已统一接入 shared hero；原先散在各页的 world select、book select、topic input、meta 状态和常用动作都被压进同一视觉语法。`Writing` 的 hero 切书同时补上真正的 `selectBook` 调用，不再只改选择框外观。
- 这轮顺手恢复了当前工作树里被删除但仍被引用的 `src/components/QuestLog.vue`，保留轻量活动记录，并把 latest `plotJournal` 的“本段冒险总结 + 写成我的版本 / 整理成分镜”出口重新接回侧栏，以维持现有 Stage 4 contract 与回归测试一致。
- 仍未触碰 `gameStore`、`worldbookContextBuilder` 或 generation 实现层；Thread A 下一步继续聚焦内层布局节奏、字级和左右分区辨识度，而不是再回到旧工具条堆按钮。

验证：
- `npm run test:run -- src/__tests__/questLog.test.js` 通过（1 file, 3 tests）。
- `npm run test:run` 通过（87 files, 582 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread B Stage 4 MVP trigger 首轮

状态：完成首轮

结果摘要：
- 新增 `src/services/generationAdventureTriggers.js`，集中维护“写成我的版本 / 整理成分镜”两类 generation task：统一拼接世界书上下文、轻 runtime 状态、最新 `plotJournal` 总结，并负责解析正文草稿和结构化分镜草稿。
- `src/stores/gameStore.js` 补齐 Stage 4 runtime 行为：`adventureTriggers` draft state、单用户节流与 3 秒 cooldown、accept/dismiss、session persistence，以及“已保存则不再对同一段剧情重复开放按钮”的判定。
- `src/components/QuestLog.vue` 从“轻量冒险摘要”扩成 Stage 4 侧栏入口：显示最新 `plotJournal` 总结、地点/角色/关键选择标签、两个 trigger 按钮、生成中/失败/已保存态，以及正文/分镜预览采纳动作。
- 新增 `src/__tests__/generationAdventureTriggers.test.js`，并扩 `gameStoreSession` / `questLog` 回归，锁住 prompt 构造、解析、accept persistence 和 UI wiring。

验证：
- `npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/questLog.test.js src/__tests__/generationAdventureTriggers.test.js` 通过（3 files, 14 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run test:run` 通过（87 files, 582 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread B Stage 3a + 最小 Stage 3b runtime skeleton

状态：完成首轮

结果摘要：
- `src/stores/gameStore.js` 补齐轻状态骨架：`goals`、`encounteredCharacters`、`factionRelations`、`keyChoices`、`plotJournal` 进入 runtime state、session persistence 和恢复链路。
- runtime 现在会从生成文本里做最小启发式提取，并在累计约 8 个 assistant turn 后自动写入一条压缩剧情日志，保留 `chapterId`、摘要、参与者、地点、关键选择、未决钩子和来源 message index。
- `src/services/worldbookContextBuilder.js` 开始消费这些轻状态辅助匹配世界书条目；`src/components/QuestLog.vue` 追加轻量冒险摘要，先露出“当前目标 / 最近选择 / 已遇角色”，不顺手扩成新壳层。
- 对应回归测试补到 `gameStoreSession`、`worldbookContextBuilder`、`contextMessage`、`questLog`，确保轻状态既能持久化，也能参与上下文构建和 UI 摘要。

验证：
- `npm run test:run -- src/__tests__/gameStoreSession.test.js src/__tests__/worldbookContextBuilder.test.js src/__tests__/contextMessage.test.js src/__tests__/questLog.test.js` 通过（4 files, 15 tests）。
- `npm run test:run -- src/__tests__/generationService.test.js` 通过（1 file, 2 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run test:run` 通过（86 files, 574 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread A Phase 1B 首轮入口封面与 hidden-first chrome

状态：进行中，已完成第一切片

结果摘要：
- `AppShell` 改为 hidden-first chrome：桌面端左侧一级/二级导航不再常驻撑满布局，而是变成默认收起、悬停可展开、点击可固定的 flyout；移动端仍保留底部一级导航。
- `ActivityBar` 与 `SidePanel` 同步收成更克制的外壳，保留现有路由和模块结构，但减少“工具站式常驻边栏”的存在感。
- `WelcomeView` 补进角色化入口提示与“工作区退到第二层”的说明，继续沿用 `边境王国 · 雾潮暮湾` 作为默认世界入口，但不再只靠旧任务板式说明撑首屏。
- 这轮仍然没有碰 `gameStore`、`worldbookContextBuilder` 或 generation task layer；Phase 1B 还剩下一段：把 `Experience / Writing / Notes / ProseEssay` 的页面 chrome 再统一一轮。

验证：
- `npm run test:run` 通过（86 files, 574 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - Thread A Phase 1A 共享角色入口壳层

状态：完成首轮

结果摘要：
- 新增共享组件 [src/components/gm-persona/GmPersonaLauncher.vue](../src/components/gm-persona/GmPersonaLauncher.vue)，把“先展开 persona bubble，再进入顾问面板”的入口语义收口成单一壳层。
- `Experience`、`Writing`、`Notes`、`ProseEssay` 四个重工作面都改为接同一套角色入口；顾问逻辑仍复用现有 `AdvisorPanel` / `useAdvisor`，没有顺手碰 runtime 状态或世界书上下文。
- 同步清掉四页已失效的 `.advisor-fab` 样式残留，并补 UI 契约测试，避免回退到旧浮动按钮实现。

验证：
- `npm run test:run` 通过（86 files, 573 tests；含既有地图合同诊断与 jsdom/canvas warnings，但 exit code 为 0）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 方向文档与执行骨架重构

状态：完成首轮

结果摘要：
- 把 `character-driven-arc.md` 从“并行未决提案”升级为**已采纳方向文档**，明确产品外壳开始向角色化 AI GM 迁移。
- 把 `playable-worldbook-roadmap.md` 降级为**迁移期执行骨架**，专注保留 runtime / content / trigger 主链，不再独占最终产品定位。
- `PLAN.md`、`docs/README.md`、`docs/plan/README.md`、根 `README.md`、并行执行计划同步改口，统一成“方向已定，底层与 UI 双轨推进，旧壳层冻结”的模型。
- 并行计划改成三线程：UI shell、runtime skeleton、content/demo，并明确高冲突文件边界。

验证：
- `npm run test:run` 通过（85 files, 570 tests；含既有地图合同诊断、jsdom/canvas warnings，但 exit code 为 0）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 入口链最后一屏承接感补齐

状态：完成首轮

结果摘要：
- `Experience.vue` 的首屏从旧“小说体验”语义继续收口为“世界冒险”，与 `WelcomeView -> WorldBookQuickImport` 的任务板叙事保持同一条线。
- 顶部世界摘要新增开场 route、任务/压力摘要；“今晚开场”卡新增现场三联卡、代价条和更完整的行动说明，让用户进入世界后立刻知道第一现场、第一阻力和第一出口。
- 这轮没有引入新数据模型，仍只复用稳定字段 `worldDescription`、`entries` 和 `buildPlayableWorldActionHooks()` 的结果，避免把 UI 打磨变成新一轮产品重构。

验证：
- `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js src/__tests__/worldBookQuickImport.test.js` 通过（3 files, 9 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run test:run` 通过（84 files, 568 tests；含地图/axe/canvas 既有 stderr warnings，但 exit code 为 0）。
- `npm run build` 通过。

## 2026-06-09 - 清理废弃 Home 首屏文件

状态：完成首轮

结果摘要：
- 删除未被路由和运行时代码引用的 `src/pages/Home.vue`，避免后续继续围绕错误首屏文件做 UI 改动。
- 把仍把 `Home.vue` 当作首屏实现或复用点的计划/规格文档改为 `WelcomeView` 当前事实，保留必要历史说明但去掉误导性指向。
- 当前在线首屏边界进一步收紧为 `WelcomeView -> WorldBookQuickImport -> Experience`。

验证：
- `npm run test:run` 通过。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - WelcomeView 首屏边界收口

状态：完成首轮

结果摘要：
- 根路由 `/` 的唯一首屏明确为 `src/views/WelcomeView.vue`，并通过 `AppShell` 的 `immersiveShell / hideActivityBar / hideSidePanel` 元信息保持沉浸式门面。
- 世界选择页 `src/pages/WorldBookQuickImport.vue` 和体验页 `src/pages/Experience.vue` 继续沿用“选择世界 -> 开始冒险 -> 写成作品”的主路径，不再把 `Home.vue` 视为在线入口的一部分。
- 对应 UI 契约测试同步改为断言 `WelcomeView`、真实路由和快速导入页，避免后续再围绕未挂路由的 `Home.vue` 做错误回归。

验证：
- `npm run test:run -- src/__tests__/welcomeView.test.js src/__tests__/uiPolish.test.js src/__tests__/worldBookQuickImport.test.js` 通过。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过。
- `npm run test:run` 通过。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 单旗舰世界入口与开场行动

状态：完成首轮，待进入 Stage 3a

结果摘要：
- 快速导入首屏继续收窄为单旗舰世界 `边境王国 · 雾潮暮湾`，并新增 3 个可点击开局行动：钟楼现场、码头夜账、证人雾军。
- 新增 `playableWorldEntry` 入口意图 helper，保存开局行动到本地 intent；预设导入、小说文本导入、说明驱动 AI 生成三条世界书入口保持不变。
- 体验页新增“今晚开场”行动卡；从旗舰入口进入时会优先创建新世界会话、自动走现有 GM 开场流程，并在第一轮输入前提供行动建议。
- Thread B 首批内容文档落地：
  - [content-review/border-kingdom-review.md](./content-review/border-kingdom-review.md)
  - [demo/border-kingdom-adventure.md](./demo/border-kingdom-adventure.md)
  - [content-review/border-kingdom-ui-reference.md](./content-review/border-kingdom-ui-reference.md)
  后续手测不需要抢改高冲突工程文件。

验证：
- `npm run test:run -- src/__tests__/playableWorldEntry.test.js src/__tests__/worldBookQuickImport.test.js src/__tests__/uiPolish.test.js` 通过（3 files, 11 tests）。
- `npm run test:run` 通过（84 files, 568 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- `npm run build` 通过。
- `npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-09 - 结构化设定工作台与并行计划

状态：完成首轮

结果摘要：
- 结构化设定页升级为工作台：新增字段级控件、dirty/saving/saved 状态、撤销/重做、键盘提示、底部保存状态栏和字段完成度。
- AI 设定生成支持字段级与分区级草稿，草稿可查看差异、采纳到字段、转为世界书条目，并补上生成状态、brief 输入和持久化预览。
- 新增字段控件与 a11y/交互测试，测试 setup 统一安装 Pinia，并补齐 `vitest-axe` / `axe-core` 依赖，避免 clean CI 缺包。
- Mem0 配置边界收紧：未配置 API key 时不视为可用，服务端代理不再把上游错误详情回显给浏览器。
- 地理面板和时间轴/机制入口完成一轮 UI 打磨。
- 新增 [plan/playable-worldbook-parallel-plan.md](./plan/playable-worldbook-parallel-plan.md)，下一轮不再继续堆种子世界数量，改为单旗舰世界入口 + 并行内容 review。

验证：
- clean archive + staged patch：`npm ci` 通过。
- clean archive + staged patch：`npm run test:run` 通过（83 files, 565 tests）。
- clean archive + staged patch：`npm run test:run -- src/__tests__/visual-verification.test.js` 通过（1 file, 12 tests）。
- clean archive + staged patch：`npm run build` 通过。
- clean archive + staged patch：`npm run docs:build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - README 与部署说明纠偏

状态：完成首轮

结果摘要：
- 根 `README.md` 改成当前 Pinax 主线叙事，不再用旧的 `WriterHelper / Text Game Framework` 标题和功能并列描述。
- `docs/user-manual/05-deployment.md` 明确指出 `deploy/` 下脚本和 nginx / PM2 配置只是模板，不能原样上线；同步修正路径、目录名和“模板已可直接照搬”的误导表述。
- `docs/user-manual/04-configuration.md` 和 `06-faq.md` 补上 localStorage 备份会包含 API key 的风险说明，并修正旧 issue 链接。

验证：
- 仅做轻量检查：`git diff --check`。
- 未跑全量测试；未做实现层改动。

## 2026-06-08 - 用户手册术语对齐

状态：完成首轮

结果摘要：
- `docs/user-manual/02-concepts.md` 把体验页相关描述改成“冒险或写作”共用语境，不再默认按旧写作流叙述。
- `docs/user-manual/06-faq.md` 把“世界书 → 高级设置”统一成当前导航里的“设定 → 高级设置”。
- `docs/user-manual/04-configuration.md` 把旧的“散文画布 / 诗歌工作坊”说法降成历史遗留键说明，避免误判为当前主功能。

验证：
- 本轮只做文档事实对齐，未跑全量测试；未做实现层改动。

## 2026-06-08 - 用户手册与 RFC 入口收口

状态：完成首轮

结果摘要：
- `docs/user-manual/README.md`、`01-quickstart.md`、`03-features.md` 改成当前产品语境，不再把旧的“五个预设世界 / 九大功能并列”当作首要叙事。
- 快速开始和功能说明现在对齐真实入口：先导入种子世界，再从体验页进入当前世界。
- `docs/src/rfcs/index.md` 明确标出“RFC 不是当前事实入口”，accepted RFC 只在需要设计背景时再看。
- 修正 `nations-perf-fix` 与 `perf-profiling` 两份 accepted RFC 的正文状态矛盾，不再写成“已批准，待实现”。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 文档分层补完

状态：完成首轮

结果摘要：
- 新增 `docs/superpowers/README.md`，把设计草案、执行计划和 agent 基础设施材料单独收口，不再把 `superpowers/` 当作无边界目录。
- `docs/plan/README.md` 继续区分“当前主线专题 / 活跃技术专题 / 参考计划 / 历史背景”，减少把 `playable-worldbook-roadmap.md` 误读成归档材料的概率。
- `docs/README.md` 的文档导航同步收窄，明确哪里看当前事实，哪里只在考古或基础设施维护时再看。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 文档入口收口

状态：完成首轮

结果摘要：
- 文档入口改成“先看主线、再看当前事实、按需看专题路线图”的结构，不再把整个 `docs/plan/` 一概视为历史材料。
- `README.md`、`PLAN.md`、`docs/src/index.md`、`docs/src/test-status.md`、`docs/src/known-issues.md` 收口为当前主线、当前风险和当前验证基线。
- 新增 `docs/plan/README.md`，明确 `playable-worldbook-roadmap.md` 是当前主线专题；`docs/src/code-map.md` 改成更偏查表的 owning surface。

验证：
- `npm run docs:build` 通过。
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 可玩的世界书 Phase 1

状态：完成首轮

结果摘要：
- 新增“可玩的世界书”路线图，明确当前主线是选择世界、开始冒险、沉淀剧情、写成作品；生视频降级为分镜完成后的后置出口。
- 首页和体验页入口文案收口为“进入世界”，体验页增加“选择世界 -> 开始冒险 -> 写成作品”的启动带。
- 无世界书时，体验页不再只提示选择世界书，而是引导进入快速导入并使用种子世界冷启动。
- 快速导入的一键预设升级为 3 个可直接玩的种子世界：边境王国、都市异闻、近未来殖民地，并展示开场困境和创作出口。

验证：
- `npm run test:run` 通过（81 files, 559 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-06-08 - 体验与设定导入修复

状态：完成首轮

结果摘要：
- Mem0 未配置时不再发起代理请求，服务端 Mem0 代理失败也不再把上游错误详情回显给浏览器；设置页 Mem0 key 保持密码输入。
- 体验页消息里的机制触发点现在可在关闭面板后再次点击，重新进入对话/回复机制。
- 小说段落导入改为 AI-first，多章节文本也会先走 AI 提炼，失败后才回退本地分段/提炼。
- 结构化设定页生成的草稿预览按世界书持久化，切换页面或重挂载后仍保留预览。

验证：
- `npm run test:run` 通过（81 files, 553 tests）。
- `npm run build` 通过。

## 2026-06-08 - 素材与工作区收口

状态：完成首轮

结果摘要：
- 素材页删除从归档改为永久删除；已导入画布的素材会同步清理节点、连线、时间轴和牌堆引用。
- 素材页左侧活动列表只显示待处理和已采纳素材；归档/拒绝素材仍保存在存储中，但不再停留在活动列表。
- 素材页勾选后统一显示批量导入、采纳、归档、删除；详情工具栏移除“待处理 / 采纳 / 归档”三联状态按钮。
- 快速导入预设升级为现代世界书结构，包含 `rule/style/forbidden` 常驻约束条目，并补齐世界描述、文风和禁写边界。
- 设定预设条目、页面切换动画、画布左侧详情/时间轴区分度完成一轮打磨。

验证：
- `npm run test:run` 通过（81 files, 558 tests）。
- `npm run test:run -- src/__tests__/visual-verification.test.js` 通过（12 tests）。
- `npm run build` 通过。
- `git diff --check` 通过。

## 2026-05-28 - 分镜版本状态前置

状态：完成首轮

结果摘要：
- 时间轴头部前置分镜版本状态和主动作，用户可以直接生成、更新或下载当前分镜版本。
- 分镜版本指纹纳入关系线类型和标签，调整连线后会提示版本需重建。
- 剪辑包构建下沉到导出服务，并直接下载 ZIP；包内包含 manifest 和可拆分文件清单。

验证：
- `npm run test:run -- src/__tests__/integration.test.js src/__tests__/relationCanvas.test.js` 通过。
- `npm run build` 通过。

## 2026-05-27 - 素材 / 画布 / 分镜链路收口

状态：完成首轮

结果摘要：
- 素材页定位为内容中转层和资产真源；卡片画布只引用素材并附加关系、位置和镜头参数，不复制长正文。
- 原散文卡片页收口为通用卡片关系画布；诗歌独立页面退场，保留必要兼容层。
- 分镜导出服务带出素材 ID、上一镜关系和参考图轻量引用，支持 Markdown、Premiere CSV、剪映草稿和 FCP XML。
- 画布关系线、时间轴、节点详情和右上图例完成多轮减重，主路径集中到“素材 -> 关系画布 -> 分镜输出”。

验证：
- 多轮 `npm run verify` / `npm run build` 通过。
- 多轮 `src/__tests__/relationCanvas.test.js`、`integration.test.js`、`storyboardStore.test.js` 回归通过。

## 历史展开

更早或更细的过程性记录不再保留在主日志。需要实现背景时优先看：

- [PLAN.md](./PLAN.md)
- [src/code-map.md](./src/code-map.md)
- [src/known-issues.md](./src/known-issues.md)
- [plan/](./plan/)
- [superpowers/specs/](./superpowers/specs/)
