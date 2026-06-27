# UI-S17 — 世界书页 (WorldBookQuickImport) 简化重做

- 日期: 2026-06-27 CST
- 范围: `src/components/workbench/{WorldbookHeroCard,MyWorldbooksNav,WorldbookPresetGrid,WorldbookExtraActions}.vue` (新增) + `src/services/worldbookQuickImportHelpers.js` (新增) + `src/pages/{WorldBookQuickImport,WorldBookEditor}.vue` (改) + `src/__tests__/{worldbookQuickImportHelpers,WorldbookHeroCard,MyWorldbooksNav,WorldbookPresetGrid,WorldbookExtraActions,worldBookQuickImport}.test.js` (改/新增) + `src/__tests__/uiPolish.test.js` (UI-S17 describe block 新增)
- 截图: `docs/agent-runs/2026-06-27-visual/settings-s17-{worldbook,worldbook-with-worldbooks,worldbook-dark,worldbook-legacy}-1280.png`
- Spec: `docs/superpowers/specs/2026-06-27-s17-simplify-worldbook-page-design.md` (c3451fc)
- Plan: `docs/superpowers/plans/2026-06-27-s17-simplify-worldbook-page.md` (89f314f)
- 调研报告: `/tmp/research-s17-{current,themes,competitors}.md` (3 subagent)

---

## 1. 用户反馈 (2026-06-27)

> "世界书这一页太乱了，多看子agent调研一下市面上同类产品的设计，然后精简一下，其实我之前主题1的open页就是这个想法，但是感觉和主题2不是很适配"

补 2 个 user-driven fix (ship 后再发现):
- "你上面这里不应该随着切换世界书文字也要变吗" → hero 卡 reactive 跟随 activeWorldbook (fix 2e66bb7)
- "你这里的跳转体验页有问题啊，怎么是在open里的一个以前的体验页版本" → 开始冒险 直进 /experience 而非 /opening (fix 7e86dac)

---

## 2. 改动落地

### 2.1 4 个新 focus 组件 (Ship)

| 组件 | 职责 | 关键视觉 |
|---|---|---|
| `WorldbookHeroCard.vue` | A 段: 撕角主壳 + 罗马 I (88px) + C·01 章 + 装订条 (gold/olive/rose 渐变) + briefing 3 chip (现场/阻力/出口) + BookmarkButton 撕角楔形 primary CTA | 5 件套撕角/罗马/印章/装订条/撕角楔形 |
| `MyWorldbooksNav.vue` | B 段: 1 行 select (含全部 worldbooksIndex) + 切换/新建+/管理→ 3 inline 按钮 | kao 自绘 arrow select (1px hairline, archive-paper 底) |
| `WorldbookPresetGrid.vue` | C 段: 横向 grid `repeat(auto-fit, minmax(180px, 1fr))`, cap 前 5 preset | 小撕角 (12px 尖) + 罗马 Ⅰ-Ⅴ + genre + entry 数 |
| `WorldbookExtraActions.vue` | D 段: 1 行 2 个小按钮 "导入小说 / JSON" + "AI 生成" + hairline 分隔 | kao 硬切角 + 12px sans |

每个组件都做 `.theme-legacy` 简化覆写 (Material 蓝白, 无撕角/罗马/章) — 保证 主题 2 (legacy) 下能正常显示.

### 2.2 主页 `WorldBookQuickImport.vue`: 3761 → 137 行 (↓ 96%)

- **删 14 段冗余** (`hero-path` / `signal-board` / `pressure-row` / `pressure-stack` / `threat-meter` / `brief-list` / `exit-strip` / `legacy-presets` / `showCustomTools` / 小说导入卡 / AI 生成卡 / 章节分段 / 导入预览 / 冲突处理)
- **删 8+ 状态** (`creating` / `generatingNovel` / `generatingRandom` / `pendingImport` / `novelSegments` / `editingSegmentIndex` / `errorMessage` / `successMessage` / `infoMessage` 等)
- 装配 4 个新组件 + 现有 SettingsSectionNav
- **reactive hero** (`featuredPreset` computed): 优先返回 activeWorldbook (用 activeWorldbookToPreset 派生 hero shape), 没有再 fallback 默认 preset. 用户在 MyWorldbooksNav 切换后 hero 自动 re-render (fix 2e66bb7)
- **直进 /experience** (`enterPresetWorld` helper push 到 `name: 'experience'`, 不是 `name: 'opening'`). 跳过 5C v3.5 vibe UI splash, 直进 Experience.vue workstation (聊条 + quest + status). uiPolish contract line 526 "experience should NOT read getPlayableWorldEntryIntent" 一致 (fix 7e86dac)

### 2.3 `WorldBookEditor.vue` 加 `create` tab (第 6 个)

- 新增 `editorTab = 'create'` 第 6 个 tab "新建 / 导入"
- create tab 内嵌 2 个 section (`data-section="import"` + `data-section="ai"`):
  - 小说导入 (复用 `tryAiExtractEntries` + 本地回退)
  - AI 生成 (复用 `tryAiGenerateFromBrief`)
- 导入按钮调 `createWorldbookFromPayload` (从 helper 复用)
- `watch route.query.section`: `import` / `ai` / `new` / `manage` → 切到 create tab + `scrollIntoView` 滚到对应 section
- 主页 1 行 2 个小按钮 → click → `push '/settings/worldbook/advanced?section=import/ai'` → editor 滚到对应表单

### 2.4 helper 函数提取 `src/services/worldbookQuickImportHelpers.js` (~580 行)

23 个 export:
- 核心流程: `enterPresetWorld` / `createWorldbookFromPayload` / `tryAiExtractEntries` / `tryAiGenerateFromBrief` / `buildPendingPayload` / `normalizeGeneratedEntry` / `createSeedEntry`
- 归一函数: `normalizeText` / `normalizeEntryType` / `normalizeKeywords` / `uniqueGroups` / `ensureEntryContent` / `resolveInjectionPolicy` / `defaultGroupByType` / `inferEntryType` / `clampNumber`
- UI 派生: `getFeaturedPressureRow` / `getHookExcerpt`
- Preset re-export: `seedWorldbookPresets` / `formatWorldbookStatus`

主页用 `enterPresetWorld(worldStore, router, preset)`, editor 用 `createWorldbookFromPayload` + `tryAiExtractEntries` + `tryAiGenerateFromBrief` + `buildPendingPayload` 等 6 个其他函数.

---

## 3. 验证

### 3.1 测试 (35 个新 / 改, 全 pass)

```
$ npm run test:run -- src/__tests__/worldbookQuickImportHelpers.test.js
  → 12/12 pass (含 spec-aligned getFeaturedPressureRow (preset) → 现场/阻力/出口,
    getHookExcerpt (preset, 80) 自动取 openingHook)

$ npm run test:run -- src/__tests__/WorldbookHeroCard.test.js
  → 4/4 pass (name/genre/hook/briefing 渲染, CTA emit, 罗马 I, C·01)

$ npm run test:run -- src/__tests__/MyWorldbooksNav.test.js
  → 4/4 pass (label + select + 切换 emit + new/manage)

$ npm run test:run -- src/__tests__/WorldbookPresetGrid.test.js
  → 3/3 pass (渲染 / cap 5 / select emit)

$ npm run test:run -- src/__tests__/WorldbookExtraActions.test.js
  → 4/4 pass (label 严格匹配 / import emit / ai emit / divider)

$ npm run test:run -- src/__tests__/worldBookQuickImport.test.js
  → 7/7 pass (S17-1 渲染 4 段, S17-2 hero briefing, S17-3 CTA,
    S17-4 select 切 worldbook, S17-5 1 行 2 小按钮, S17-6 空状态,
    S17-7 preset cap 5)

$ npm run test:run -- src/__tests__/uiPolish.test.js -t "UI-S17"
  → 7/7 pass (9 旧元素删 / 4 子组件存在 / 撕角 clip-path / 罗马 88px /
    C·01 rose 章 / 装订条 gold-olive-rose / 1 行 2 小按钮 + 0 forbidden)

合计 39 tests pass (12 + 4 + 4 + 3 + 4 + 7 + 7)
```

### 3.2 Build

```
$ npm run build
✓ built in 3.79s
```

clean, 0 new forbidden pattern.

### 3.3 diff --check + forbidden sweep

```
$ git diff --check
(clean)

新 6 文件 + 改 4 文件, forbidden sweep:
- :global(.theme-kao) → 0
- !important → 0
- raw hex (#XXX) → 0
- (pre-existing WIP 中其他 worker 的 hex 已在 main 之前, 不算 S17 新增)
```

### 3.4 4 截图 1280×800 Playwright headless

| 截图 | 大小 | 验证 |
|---|---|---|
| `settings-s17-worldbook-1280.png` | 88KB | kao light 默认态: 撕角主壳 + 罗马 I + C·01 章 + 装订条 + briefing 3 chip + 撕角楔形 CTA + 我的世界书 select + 3 preset card + 1 行 2 小按钮, 1 屏可见 |
| `settings-s17-worldbook-with-worldbooks-1280.png` | 89KB | 我的世界书 select focus 高亮 (边色 archive-olive) |
| `settings-s17-worldbook-dark-1280.png` | 88KB | kao 暗色: archive-* token 翻转, ink-on-paper, 罗马 + 印章颜色保留 |
| `settings-s17-worldbook-legacy-1280.png` | 79KB | 主题 2 legacy: 简化覆写生效 (无撕角/罗马/章, Material 蓝白, 1 个白底主 CTA) |

---

## 4. 数据对比

| 维度 | 旧 | 新 | 变化 |
|---|---:|---:|---:|
| `WorldBookQuickImport.vue` 行数 | 3761 | 137 | ↓ 96% |
| 主页总高 | 3000-3300 / 4 屏 | 880-1000 / 1.1 屏 | ↓ 70% |
| 用户目标覆盖 (G1-G5) | 4/5 (G2 缺失) | 5/5 | +1 (G2 = 我的世界书 select 由缺失提升为 1 行可见) |
| Section 数量 | 8 段 | 4 段 | ↓ 50% |
| 冗余信息 (pressure 写 3 遍) | 3 处 | 1 处 | ↓ 67% |
| 新组件 | 0 | 4 | +4 |
| 集成测试 | 3 | 7 | +4 |
| UI 契约 (uiPolish) | 0 | 7 | +7 |
| helper service | 0 行 (inline) | 580 行 (extract) | 服务化 |
| Ship commits | — | 10 | (helpers + 4 组件 + page + editor + test + uiPolish + 2 fix) |

---

## 5. 用户反馈 ↔ 落地映射

| 反馈 | 落地 |
|---|---|
| "世界书这一页太乱了" | 4 段 1 屏 137 行, 14 段冗余 + 8+ 状态全删, 总高 ↓ 70% |
| "调研下市面上同类产品" | 3 subagent 调研 (current audit / 主题对照 / SillyTavern+Agnai+NovelAI) |
| "精简一下" | 4 个 focus 组件拼装, 主页 137 行, 决策路径 5 步 (1-click 开始 / 切换 / 导入 / AI / 编辑) |
| "主题 1 open 页就是这个想法" | 撕角/罗马/印章 5 件套 (来自 legacy/OpeningPage) 复用, kao archive-* token 替换 |
| "跟主题 2 不是很适配" | legacy 主题覆写让 2 主题都"能看", 重点在 kao |
| (ship 后) "hero 切换世界书不更新" | `featuredPreset` 改为 computed reactive 跟随 activeWorldbook (fix 2e66bb7) |
| (ship 后) "跳转是 open 里旧体验页版本" | `enterPresetWorld` push 到 `/experience` 而非 `/opening` (fix 7e86dac) |

---

## 6. 不在范围 (out of scope, logged for follow-up)

- `WorldBookEditor` create tab 的精细化: 章节分段预览 / 冲突处理 (rename/create/overwrite) / diff 列表 / group migration 4 个 sub-section 暂未移植, 用户走 advanced 路径时只看到简化版 create 表单; 后续可加 expand/collapse 或更详细的 pending preview
- preset 列表超过 5 个的处理: 目前硬截前 5, 后续可加 "查看更多" 折叠
- 4 子页的 "返回世界书" 按钮: 现在没有, 不在 S17 范围
- 我的世界书 select 的 inline 编辑 (右键 / 拖拽 / 删除操作), 后续 power user 优化
- `savePlayableWorldEntryIntent` 现在是 dead-write (因为我们跳过 /opening), 后续可彻底删
- `hero CTA` 文案固定 "开始冒险", 没考虑 activeWorldbook 已有/没有不同 wording (e.g. "继续冒险" 如果已有 session)
- pre-existing uiPolish WIP 6+ fail (UI-E11-A / E3 / E10 / E12-W2 / E12-FIX1) 不在 S17 commit 范围, 等各自 worker 修