# W5b: UX sweep tier 2 — dark mode / mobile / scroll-snap 8 atomic fix

> 2026-07-01 CST · Codex on `main` · 跟 W5 同一个 session 继续扫
>
> **范围**: 在 W5 (9 个 fix) 之后用户再要求"再找找". 派 3 个新 Explore 探子覆盖 dark mode / theme variant, mobile / 窄视口, persistence / reload 存活. 总回报 ~24 个新 bug. 按"小改动 + 高影响 + 纯 CSS/template"过滤 → 8 个 fix.
>
> **不在范围**: 持久化层需要 logic 改的 bug (e.g. quota 报警, multi-tab 同步, schemaVersion migration, Backup import) — out of scope per 用户 "不要大改".

---

## 1. 调查 (3 个并行 Explore)

| Agent | 范围 | Top bugs 回报 |
|---|---|---|
| #1 Dark mode / variant | `main.css` + `kao.css` + `legacy.css` + 11 page/component 文件 | 8 个 (含 raw hex 警告色、theme-legacy 缺 dossier-stamp、text-shadow 不分 variant) |
| #2 Mobile / narrow viewport | 所有 `@media` + 7 page + 8 component | 8 个 (preset grid 不 1col collapse、tap target <44px、breakpoint 不一致) |
| #3 Persistence / reload | `useStorage` + `useDebounce` + `backupExport` + 3 store + `main.js` | 8 个 (schemaVersion 不读、corrupt JSON 吞错、no importBackup、no errorHandler) |

按 W5 同款筛选 → **8 个 fix 进入本轮** (全 CSS / 全 template，0 logic)。

## 2. 选出的 8 个 Fix (按 tier 分组)

### Tier A — dark mode + variant token (4 fix)

| # | Bug | File:line | 改动 |
|---|---|---|---|
| 1 | `data-dossier-stamp` 缺 in `legacy.css` → 主题2 Experience 右栏 section title "卷宗一/二/三" 完全消失 | `src/styles/themes/legacy.css:224` | CSS 1 规则 (`.theme-legacy .ws-section::before { content: attr(data-dossier-stamp); ... }`) |
| 2 | `WorldMapPanel .ai-warning` 用 raw `#f59e0b / #b45309` (warm orange) → 在 theme-legacy (steel-blue) 上 off-palette，在 dark kao paper 上 WCAG ~2.7:1 fail | `src/components/geography/WorldMapPanel.vue:324-328` | CSS 3 行换 `var(--warning)` token |
| 3 | `ProseEssay .export-status.is-stale/.is-warning .export-status-dot` 用 raw `#f59f00` → 在 dark mode 看不见 | `src/pages/ProseEssay.vue:4236-4239` | CSS 1 行换 `var(--warning)` |
| 4 | `QuestLog .count-badge` 用 `accent 82% + #fff 18%` 高饱和底 + 白字 → dark kao 上 WCAG ~3.6:1 fail | `src/components/QuestLog.vue:731-735` | CSS 重写：soft accent wash over page bg + accent 文字 + 38% accent border |

### Tier B — hardcoded color audit + 1col collapse (3 fix)

| # | Bug | File:line | 改动 |
|---|---|---|---|
| 5 | `OpeningPage` 的 `text-shadow: 0 0 Npx rgba(0,0,0,0.68~0.8)` 10+ 处写在 unscoped selector → 在 theme-legacy (亮 steel-blue) 上叠 halo | `src/pages/OpeningPage.vue` | 加 1 块 `.theme-legacy .opening-kicker, ... { text-shadow: none; }` 覆盖 |
| 6 | `WelcomeView .welcome-collage-tile` border 硬编 `color-mix(in srgb, #fff 92%, var(--archive-paper-soft))` → dark kao paper 上白边亮瞎 | `src/views/WelcomeView.vue:593` | CSS 1 行换 `var(--archive-paper-soft) 92%, transparent` (`.welcome-frame-cut` 同步) |
| 7 | `WorldbookPresetGrid` 在 <480px 仍是 2 列 cramped (`minmax(140px, 1fr)` 太小撑破 viewport) | `src/components/workbench/WorldbookPresetGrid.vue` | 加 1 块 `@media (max-width: 480px) { .preset-grid { grid-template-columns: 1fr; } }` |

### Tier C — scroll-snap active tab (1 fix)

| # | Bug | File:line | 改动 |
|---|---|---|---|
| 8 | `SettingsSectionNav` 在 <760px 是 `overflow-x: auto` 但 active tab 经常滑出可见区 (用户切到 /settings/worldbook-advanced 即 4th tab 时指示器在屏外) | `src/components/workbench/SettingsSectionNav.vue` | CSS `.settings-section-nav { scroll-padding-inline: 8px; scroll-behavior: smooth; }` + `.settings-section-tab.active { scroll-snap-align: start; scroll-margin-inline-start: 8px; }` |

## 3. TDD 流程 (8 contract 全红→全绿)

`src/__tests__/uiPolish.test.js` 新 describe block `ui polish — UX sweep W5b`, 8 个 contract:

1. `legacy.css` defines `.theme-legacy .ws-section::before` with `content: attr(data-dossier-stamp)`
2. `WorldMapPanel .ai-warning` 用 `var(--warning)` 不含 raw hex
3. `ProseEssay .export-status-dot` 用 `var(--warning)`
4. `QuestLog .count-badge` 用 soft accent wash + accent text
5. `OpeningPage` 有 `.theme-legacy` reset block + 4 个 known selectors
6. `WelcomeView .welcome-collage-tile` border 用 archive-paper-soft token + 不含 `#fff`
7. `WorldbookPresetGrid` 有 `<480px` 媒体查询强制 1fr
8. `SettingsSectionNav` 有 `scroll-padding` + `scroll-snap-align`

```
uiPolish -t "UX sweep W5b": 8/8 全绿
```

## 4. 改动文件 (7 src + 1 test)

| 文件 | Δ 行 | 改动 |
|---|---|---|
| `src/styles/themes/legacy.css` | +14 | 1 CSS 规则块 (data-dossier-stamp 镜像) |
| `src/components/geography/WorldMapPanel.vue` | +5 | 3 CSS 行换 token |
| `src/pages/ProseEssay.vue` | +4 | 1 CSS 行换 token |
| `src/components/QuestLog.vue` | +8 | 重写 `.count-badge` |
| `src/pages/OpeningPage.vue` | +12 | 加 `.theme-legacy` reset block |
| `src/views/WelcomeView.vue` | +7 | 2 行换 token (border + frame-cut) |
| `src/components/workbench/WorldbookPresetGrid.vue` | +8 | 加 1 `<480px` 媒体查询 |
| `src/components/workbench/SettingsSectionNav.vue` | +8 | scroll-padding + scroll-snap-align |
| `src/__tests__/uiPolish.test.js` | +94 | 8 contract |

总计: 8 个 fix，~70 行 CSS（绝大多数是 token 替换 + media query），+94 行 test。
0 个 do-not-touch 文件改动 (gameStore / worldbookContextBuilder / generation / StatusBar).
0 个 logic / store mutation / API 改动.

## 5. 验证

```bash
# W4b 3 + W4c 5 + W5 8 + W5b 8 = 24 contracts 全绿
npm run test:run -- src/__tests__/uiPolish.test.js -t "WorldBookEditor scroll|quick / map pages share|UX sweep W5|UX sweep W5b"
# → Tests 24 passed | 284 skipped (308)

# W4 5 核心 64/64
npm run test:run -- src/__tests__/{playableWorldEntry,worldbookContextBuilder,playerHistory,runtimeEvents,gameStoreSession}.test.js
# → Test Files 5 passed (5) | Tests 64 passed (64)

npm run build
# → ✓ built in 3.90s

git diff --check
# → exit=0 (clean)
```

## 6. 显式 Out of Scope (W5b tier 3, 需要 logic 改动, 用户说不要大改)

1. **`setItem` quota failure 沉默** — `useStorage.js:110` 返回 `false` 但 `gameStore.saveCurrentSession` 当 fire-and-forget 处理；需要 banner + 重新设计的 safe write path (logic)
2. **`schemaVersion` 写了不读** — `gameStore.js:1020-1046` 创建 session 时设了但 `loadSession` 不检查；需要 `migrateSession()` + 失败 toast (logic)
3. **`active_worldbook_id` dangling** — `worldStore.ensureActiveWorldbook` 有 fallback 但其他 page 直接读 `activeWorldbookId` 不会 fallback；需要集中 getter (logic)
4. **`loadWorldbook` 吞错** — corrupt JSON 时只 `lastError = "世界书不存在"`，UI 看不到；需要 chip + "重置此世界书" 按钮 (logic + template)
5. **`chunk-reload` 强制跳转丢半保存** — `router.onError` 的 `window.location.href` 不等 sync setItem；需要软 router.push + chunk manifest 拉取 (logic)
6. **AI stream chunk 不持久化** — `gameStore.sendAction` 只在 stream 完成时 saveCurrentSession；中段 tab 关闭丢所有 streamed content (logic)
7. **无 `importBackup`** — `backupExport.js` 只有 export 没有 import；需要 import + dedup-by-id (template + logic)
8. **无全局 errorHandler** — `main.js:8-13` 没 `app.config.errorHandler`；runtime 错误白屏（WSOD）；需要 wrapper + 重载按钮 (logic + template)
9. **InputArea context arc raw hex** — `InputArea.vue:417-420` 的 3 个 fallback hex; 可换 `var(--success|--warning|--danger)` 但需要 trigger 重算 (template)
10. **AppShell mast tabbar 在 <480px `display: none`** — 隐藏所有 nav；用户只能从看不见的 drawer 进入；需要保留 condensed strip 或 label hamburger (template + CSS)

## 7. 选 Fix 的依据

按用户 "你仔细排查一下，优化使用逻辑，不要大改记得" + "再找找":
- 优先 1-3 行 CSS / template 原子改动
- 任何 logic / store / API 改动直接 defer (out of scope)
- do-not-touch 边界严格守住
- 8 contract 锁住防回退

总计 W5 + W5b 共 **17 个 atomic fix**, 全 CSS / template, 0 logic, 0 do-not-touch 触动.