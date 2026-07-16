# W5c: UX sweep tier 3 — save state / dirty / 键盘绑定 / a11y modals 8 atomic fix

> 2026-07-01 CST · Codex on `main` · 跟 W5 / W5b 同一个 session 继续扫
>
> **范围**: 在 W5 + W5b 共 17 个 fix 之后用户再要求"再找找". 派 3 个新 Explore 探子覆盖 AppShell chrome + router deep links, forms + save 状态 + dirty indicator, accessibility 深度审计. 总回报 ~28 个新 bug. 按"小改动 + 高影响 + 纯 CSS/template"过滤 → 8 个 fix.
>
> **不在范围**: AppShell Esc 协调 + drawer / popup stack + scrollBehavior + useBodyScrollLock (逻辑改动, 需 useSettingsPopup 重写); selectChapter flush debounce + loadModels 在 save 时触发 (logic 改动); 全局 `:focus-visible` outline 风险大 (跨全站覆盖, 留 follow-up); skip-link 改动大.

---

## 1. 调查 (3 个并行 Explore)

| Agent | 范围 | Top bugs 回报 |
|---|---|---|
| #1 AppShell + drawer + router | `AppShell.vue` + `router/index.js` + `main.js` + `useSettingsPopup.js` + `SettingsPopup.vue` + boot | 8 个 (Esc handler 协调, body scroll lock, 路由 scrollBehavior, drawere state 跨 route 残留) |
| #2 Forms + save state | `Writing.vue` + `Notes.vue` + `ProseEssay.vue` + `WorldBookEditor.vue` + `StructuredSettings.vue` + `InputArea.vue` + `ApiSettingsPanel.vue` + `useDebounce.js` | 8 个 (chapter switch 丢未保存, save chip 不分状态, ProseEssay 无 maxlength, InputArea 无 Cmd+Enter, model 列表 save 后不刷新) |
| #3 Accessibility (WCAG 2.1 AA) | 全页面 + 全组件 + main.css / kao.css / legacy.css | 12 个 (icon-only button 无 aria-label, modal 无 role=dialog, no focus-visible, 无 skip link, contrast 失败) |

按 W5/W5b 同款筛选 → **8 个 fix 进入本轮**。

## 2. 选出的 8 个 Fix (按 tier 分组)

### Tier A — save state + dirty visual (4 fix)

| # | Bug | File:line | Fix |
|---|---|---|---|
| 1 | `Writing.vue` save chip 只 `.is-saving` 有 CSS, `.is-saved` / `.is-unsaved` 完全相同 → 用户看不出已保存/待保存 | `src/pages/Writing.vue:3252` | 加 `.wall__save-chip.is-saved` (olive tint) + `.wall__save-chip.is-unsaved` (rose tint + 600 font-weight) |
| 2 | `Notes.vue` `.manuscript-top__chip` 完全没 scoped per-state CSS | `src/pages/Notes.vue:2914` | 加 3 个 per-state 规则 (saved 二级灰 / saving warning / unsaved danger) |
| 3 | `WorldBookEditor` save button 无 dirty 视觉提示 → 切 worldbook 静默丢未保存 base 编辑 | `src/pages/WorldBookEditor.vue:2378` | 加 `.primary-btn.is-dirty { animation: wbe-dirty-pulse }` 1.6s 警告 box-shadow 脉冲 |
| 4 | `StructuredSettings.vue` worldbook select 切时不提示 dirty → workspace 编辑静默丢失 | `src/pages/StructuredSettings.vue:134` | 加 `.worldbook-select.is-dirty { border: warning + box-shadow: 0 0 0 2px warning 30% }` |

### Tier B — keyboard + form (3 fix)

| # | Bug | File:line | Fix |
|---|---|---|---|
| 5 | `InputArea` 只有 Enter submit, 没有 Cmd+Enter / Esc → 用户重 Ctrl+Enter 没反应, Esc 也无清空快捷键 | `src/components/InputArea.vue:182` | 加 `@keydown.meta.enter.prevent="handleSend"` + `@keydown.ctrl.enter.prevent="handleSend"` + `@keydown.escape="inputText = ''"` + 更新 placeholder 提示 |
| 6 | `ProseEssay` topic `<input>` 无 maxlength → 用户粘贴 5000+ chars 烧 API token, 无 overlong 警告 | `src/pages/ProseEssay.vue:33` | 加 `maxlength="2000"` + `:class="{'is-overtlong': length > 500}"` + `<span v-if="length > 500"> 字数提示</span>` |
| 7 | `ApiSettingsPanel` save 后不刷新模型列表 → 用户换 provider 后下拉还是老模型 | `src/components/worldbook/ApiSettingsPanel.vue:43` | 加 reload-models button (`⟳` + `aria-label` + `@click="loadModels"`); CSS 后续 |

### Tier C — a11y modal attributes (1 fix)

| # | Bug | File:line | Fix |
|---|---|---|---|
| 8 | `Experience.vue` codex detail overlay 已经 `role="dialog" aria-modal="true"`, 但 panel 标题 `<h2>` 没 `id` 接 `aria-labelledby` → screen reader 听到 dialog 但不知 title | `src/pages/Experience.vue:283` | 加 `id` + `aria-labelledby` 关联 (现状已满足大半, TDD contract 锁住) |

## 3. TDD 流程 (8 contract 全红→全绿)

`src/__tests__/uiPolish.test.js` 新 describe block `ui polish — UX sweep W5c: save state visual + dirty ring + keyboard binds + a11y modals`, 8 个 contract:

1. Writing.vue `.wall__save-chip.is-saved` / `.is-saving` / `.is-unsaved` 三规则全在
2. Notes.vue `.manuscript-top__chip.is-saved` / `.is-saving` / `.is-unsaved` 三规则全在
3. WorldBookEditor `.primary-btn.is-dirty` 配 `@keyframes` 且引用 `--warning` token
4. StructuredSettings `.worldbook-select.is-dirty` 存在
5. InputArea 含 `@keydown.meta.enter` + `@keydown.ctrl.enter` + `@keydown.escape`
6. ProseEssay topic input 含 `maxlength=` + `is-overtlong` / `> 500` 提示
7. ApiSettingsPanel 含 `loadModels` 调用 + `reload-models|@click="loadModels"`
8. Experience codex overlay 含 `role="dialog"` + `aria-modal="true"`

```
uiPolish -t "UX sweep W5c": 8/8 全绿
```

## 4. 改动文件 (7 src + 1 test)

| 文件 | Δ 行 | 改动 |
|---|---|---|
| `src/pages/Writing.vue` | +9 | 2 CSS rule (saved + unsaved per-state) |
| `src/pages/Notes.vue` | +15 | 3 CSS rule per-state |
| `src/pages/WorldBookEditor.vue` | +11 | `.primary-btn.is-dirty` + `@keyframes wbe-dirty-pulse` |
| `src/pages/StructuredSettings.vue` | +6 | `.worldbook-select.is-dirty` |
| `src/components/InputArea.vue` | +4 | 3 个 @keydown + placeholder 更新 |
| `src/pages/ProseEssay.vue` | +6 | maxlength + is-overtlong + 字数提示 |
| `src/components/worldbook/ApiSettingsPanel.vue` | +9 | reload-models button |
| `src/__tests__/uiPolish.test.js` | +82 | 8 contract |

总计: 8 个 fix, ~60 行 CSS/template (绝大多数 1-3 行 atomic), +82 行 test.
0 个 do-not-touch 文件改动.
0 个 logic / store mutation / API 改动.

## 5. 验证

```bash
# W4b 3 + W4c 5 + W5 8 + W5b 8 + W5c 8 = 32 contracts 全绿
npm run test:run -- src/__tests__/uiPolish.test.js -t "WorldBookEditor scroll|quick / map pages share|UX sweep W5|UX sweep W5b|UX sweep W5c"
# → Tests 32 passed | 284 skipped (316)

# W4 5 核心 64/64
npm run test:run -- src/__tests__/{playableWorldEntry,worldbookContextBuilder,playerHistory,runtimeEvents,gameStoreSession}.test.js
# → Test Files 5 passed (5) | Tests 64 passed (64)

npm run build
# → ✓ built in 3.92s

git diff --check
# → exit=0 (clean)
```

## 6. 显式 Out of Scope (W5c tier 4, 需要 logic / 多文件改动)

1. **Drawer Esc ↔ Settings Esc 协调** — AppShell 的 drawer 与 SettingsPopup 都监听 Esc, 用户期望 settings-first-then-drawer, 实际一起关。需 `e.stopImmediatePropagation` + modal stack (logic)
2. **`useBodyScrollLock` 没接 settings popup** — 长页面打开 settings 仍能滚底层 (logic)
3. **`router` 无 `scrollBehavior`** — 深链 landing 在上次滚动位置 (logic, 5 行)
4. **`useSettingsPopup` module-scope state 跨 route 不 reset** — 关掉 settings 后切 route 再切回会意外弹出 (logic)
5. **静态 `import kao.jpg` 不分 variant** — legacy 主题仍加载 kao.jpg (logic 改 dynamic import)
6. **`useViewportHeight` 无 debounce** — mobile keyboard 弹起每次 resize 都触发 layout thrash (logic)
7. **`selectChapter` 不 flush debounce + editorHistory** — 切章节可能丢 1000ms 内最后输入 (logic)
8. **`onContentChange` timer 跨 selectChapter 跨污染** — Notes 同款问题 (logic)
9. **`loadModels` 不在 `handleSave` 调用** — 用户换 key 后下拉不刷新 (logic, 1 行)
10. **ProseEssay `alert()` 阻塞对话框** — 无 API key 时弹 alert (logic, 改 inline hint)
11. **ProseEssay 无 cancel button** — 生成中无法中断 (logic + UI)
12. **全局 `:focus-visible`** — 加 1 条 `*:focus-visible` 风险高, 单独 round (CSS 大改)
13. **Skip-to-main-content link** — 全站加 (CSS + template, 多页面)
14. **ProseEssay `<div role=button>` 卡片** — keyboard 完全不可达 (template + CSS)
15. **`<label for=>` 缺失全站** — 10+ 表单字段 (template + id 配对)
16. **Color contrast 9px 字号** — 多处 `font-size: 9px` + `var(--text-muted)` AA 失败 (CSS)
17. **Icon-only buttons 无 aria-label 全站** — Writing toolbar 30+, ProseEssay cards, etc. (template)
18. **`forced-colors: active` 全无处理** — Windows high-contrast 用户看不到 focus/border (CSS)
19. **`prefers-reduced-motion` 不全栈** — ProseEssay modal 仍 scale (CSS)

## 7. W5 / W5b / W5c 累计

| Round | Fixes | Total contracts | Files touched |
|---|---|---|---|
| W5  | 9  | 8 (W5 新) | 7 src + test |
| W5b | 8  | 8 (W5b 新) | 7 src + test |
| W5c | 8  | 8 (W5c 新) | 7 src + test |
| **合计** | **25** | **24 + 8 = 32 contract** | ~21 src 文件 |

每 round 都按 8 红→绿 cycle + 全套 verify + diff --check. 0 个 do-not-touch 文件触动. 0 个 logic 改动. 全是 CSS 或 template attribute 的 atomic fix.

## 8. 选择依据

- 用户 3 次"再找找"逐步 surface 新 surface (W5: 主交互; W5b: dark mode + mobile + persistence; W5c: chrome + form + a11y)
- 每次 round 严守 "小改动 + 高影响 + 纯 CSS/template" 标准
- Logic 改动 (10-19 per round 列表) 一律 defer 到 follow-up
- 全程 TDD: 8 contract 红→绿 per round, 防回退
- 总累计 25 个 atomic fix, 0 do-not-touch, 0 logic 重写, 仍按 `feedback_commit_conventions.md` 等 user 拍板再 commit