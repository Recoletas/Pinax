# UI-S17 — 世界书页 (WorldBookQuickImport) 简化重做

- 日期: 2026-06-27 CST
- 状态: design (待 user review)
- 调研基础: `/tmp/research-s17-{current,themes,competitors}.md` (3 subagent 报告)
- 目标: `src/pages/WorldBookQuickImport.vue` (3759 行 → 估计 ≤ 600 行) + 集成测试 + uiPolish 契约

---

## 0. 上下文与动机

### 0.1 用户反馈 (2026-06-27)

> "世界书这一页太乱了，多看子agent调研一下市面上同类产品的设计，然后精简一下，其实我之前主题1的open页就是这个想法，但是感觉和主题2不是很适配"

### 0.2 主题命名 (K5 spec, `src/views/WelcomeView.vue:19-37` + `src/stores/themeStore.js:3`)

- **主题 1** = `kao` variant = DEFAULT_VARIANT (档案册风)
- **主题 2** = `legacy` variant (经典蓝白 Material)

用户 "主题 1 open 页" 实际指 `src/pages/legacy/OpeningPage.vue` — Phase 1B 最初的 kao 档案册版 (frozen snapshot 424fe28), 拥有撕角/罗马/印章签名。用户感觉它跟 主题 2 (legacy Material) 不适配, 但跟 主题 1 (kao) 适配。

### 0.3 矛盾 #1 解 (themes 报告 2.3)

**OpeningPage 5C v3.5 立体感赢** — opening/experience 用 full-bleed character backdrop + orbit-drift + title glow 的"角色站在面前" 立体感语言。**世界书/笔记本/材料页 走档案册语言** — 撕角/罗马/印章的"纸上元素" 静态档案语言, 跟 opening/experience 形成视觉分工。

---

## 1. 用户目标覆盖

| # | 目标 | 概率 | 现状入口 | 新版入口 |
|---|---|---:|---|---|
| **G1** | 选默认世界, 1-click 开始冒险 | 55% | S1 (右上) + S2 (3 action-hook) **多入口** | A 段: 1 个主 CTA `开始冒险` |
| **G2** | 看已有世界书 / 切换当前 | 15% | **缺失** ⚠ | B 段: 我的世界书 select |
| **G3** | 导入 JSON / 小说 | 15% | S4 toggle → S5 (藏) | D 段: `导入小说 / JSON` 按钮 |
| **G4** | AI 生成新世界 | 10% | S4 toggle → S7 (藏) | D 段: `AI 生成` 按钮 |
| **G5** | 编辑已有世界书细节 | 5% | S8 (深) | B 段: `[管理 →]` 按钮 |

G2 由 "缺失" 提升为 "B 段 1 行可见"。

---

## 2. 整体信息架构 (1 屏 ≈ 880-1000 px)

```
+---[mast: Ⅰ体验 Ⅱ设定● Ⅲ写作 Ⅳ素材 Ⅴ画布] [⚙设置]-------------+
|  SettingsSectionNav: Ⅰ世界书* Ⅱ结构化 Ⅲ地图 Ⅳ高级            |  ← 已有, 不改
+--------------------------------------------------------------+
|  ╔════════════════════════════════════════════════════╗    |
|  ║   I         WORLD BOOK · 卷·壹                       ║    |  A. HERO 撕角主壳
|  ║              边境小镇 · 雾潮前夜                     ║    |     480px
|  ║              奇幻冒险 · 12 条目                       ║    |
|  ║              一段 hook 60-80 字                       ║    |
|  ║              <现场: 灯塔> · <阻力: 黑鸦> · <出口: 章节> ║    |
|  ║                                                    ║    |
|  ║              ▶  开 始 冒 险  ◀                      ║    |
|  ╚════════════════════════════════════════════════════╝    |
|                                                              |  B. 我的世界书 (1 行, 80px)
|  我的世界书: [边境小镇 ▾]  [切换]  [新建 +]  [管理 →]         |
|                                                              |
|  更多世界:  [Ⅰ 边境小镇] [Ⅱ 废墟灯塔] [Ⅲ 暮湾] [Ⅳ 灯塔档案]   |  C. Preset 网格 (1 行, 200px)
|                                                              |
|  ── 自定义 ─────────────────────────────────────            |  D. 1 行 2 个小按钮 (60px)
|  [ 导入小说 / JSON ]   [ AI 生成 ]                            |
+--------------------------------------------------------------+
   总高 ≈ 880-1000 px (vs 现在 3000-3300 / 4 屏, ↓ 70%)
```

5 段从上到下: A → B → C → D, 顺序对应 G1 → G2 → G1 备选 / G3-G4。

---

## 3. Hero 撕角主壳 (Section 2 详细)

### 3.1 主壳

```css
.worldbook-hero {
  position: relative;
  padding: 56px 28px 28px;
  background: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-olive) 18%, transparent);
  /* 撕角主壳: 跟 legacy/OpeningPage opening-shell 同款 clip-path */
  clip-path: polygon(
    0 24px, 26px 0, calc(100% - 44px) 0, 100% 44px,
    100% 100%, 0 100%
  );
  /* 3-D 阴影: 5C 立体感迁移同款 */
  box-shadow:
    0 28px 60px color-mix(in srgb, var(--archive-ink) 20%, transparent),
    22px 22px 0 color-mix(in srgb, var(--archive-olive) 14%, transparent);
}
```

### 3.2 装订条 (::before)

```css
.worldbook-hero::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 8px;
  background: linear-gradient(
    90deg,
    var(--archive-gold) 0%,
    var(--archive-olive) 50%,
    var(--archive-rose) 100%
  );
  /* 撕角胶带: 跟 WelcomeView 同款 */
  clip-path: polygon(0 0, 100% 0, calc(100% - 24px) 100%, 0 100%);
}
```

### 3.3 罗马 I 装饰 (左上)

```css
.worldbook-hero__roman {
  position: absolute;
  top: 24px; left: 28px;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 88px;
  font-style: italic;
  font-weight: 400;
  line-height: 1;
  color: color-mix(in srgb, var(--archive-rose) 28%, transparent);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  pointer-events: none;
  user-select: none;
}
```

### 3.4 C·01 rose 章 (右上角)

```css
.worldbook-hero__stamp {
  position: absolute;
  top: 32px; right: 36px;
  width: 64px; height: 64px;
  display: grid; place-content: center;
  border: 1.5px solid color-mix(in srgb, var(--archive-rose) 58%, transparent);
  border-radius: 50%;
  color: color-mix(in srgb, var(--archive-rose) 84%, var(--archive-ink));
  font-family: var(--font-display, serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transform: rotate(-9deg);
  opacity: 0.82;
  background: transparent;
  box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--archive-paper) 76%, transparent);
  pointer-events: none;
  user-select: none;
}
```

### 3.5 主 CTA (开始冒险 BookmarkButton)

复用既有 `<BookmarkButton variant="primary" :index="01" label="开始冒险" @click="enterDefaultWorld" />`, 无需新建组件。

### 3.6 内容字段

| 字段 | 来源 | 字数限制 |
|---|---|---|
| genre label | `featuredGenreLabel(preset)` 已有 | 12 字 |
| world name | `preset.name` | 30 字 |
| hook | `preset.openingHook.slice(0, 80) + (openingHook.length > 80 ? '…' : '')` | 80 字 |
| briefing 3 chip | `featuredPressureRow` 派生的 (现场/阻力/出口) 3 个 string, 用 `<`>`>` inline 包 | 12 字/chip |

### 3.7 不允许的视觉

- 圆角 > 2px
- 软 box-shadow (单层 0 4px 8px rgba)
- 渐变 (除了 ::before 装订条 + paper 渐变)
- 任何 SaaS 强调色 (`--accent` 蓝紫粉)
- emoji

---

## 4. 我的世界书 / Preset 网格 / 1 行 2 按钮

### 4.1 B — 我的世界书 (1 行)

```vue
<nav class="my-worldbooks">
  <span class="my-worldbooks__label">我的世界书</span>
  <select v-model="selectedWorldbookId" class="my-worldbooks__select" @change="onWorldbookChange">
    <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
      {{ wb.name }} ({{ wb.entryCount || 0 }} 条目)
    </option>
  </select>
  <button class="my-worldbooks__btn" @click="focusSelect">切换</button>
  <button class="my-worldbooks__btn" @click="openAdvanced('new')">新建 +</button>
  <button class="my-worldbooks__btn" @click="openAdvanced('manage')">管理 →</button>
</nav>
```

- select 视觉: 复用 `.wall__book-pill` 同款 (kao css 已有) — 1px hairline 边 + archive-paper 底 + 16px dropdown arrow + 圆角 0
- label + 4 个 inline 元素, flex gap 12px
- `selectedWorldbookId` 是本地 ref, 初始化从 `activeWorldbook.id` 同步; 用户改 → 调 `setActiveWorldbook`
- 3 个按钮均为 12px sans + archive-ink 文字 + archive-border 边 + 圆角 0; hover archive-olive 边
- "切换" 按钮 focus select (`document.querySelector('.my-worldbooks__select').focus()`)
- "新建 +" 跳 `/settings/worldbook/advanced?section=new` (用户在 advanced header 点 "新建世界书" 按钮即可创建;不弹模态)
- "管理 →" 跳 `/settings/worldbook/advanced?section=manage` (默认到 worldbook 列表 + 编辑器)

### 4.2 C — Preset 网格 (1 行 3-5 个 card)

```vue
<section class="preset-grid" aria-label="更多世界">
  <button
    v-for="(preset, idx) in featuredPresets"
    :key="preset.id"
    class="preset-card"
    @click="enterPresetWorld(preset)"
  >
    <span class="preset-card__roman">{{ ROMAN[idx] || '·' }}</span>
    <span class="preset-card__name">{{ preset.name }}</span>
    <span class="preset-card__genre">{{ preset.genreLabel }}</span>
    <span class="preset-card__entries">{{ countPresetEntries(preset, 'all') }} 条目</span>
  </button>
</section>
```

- `featuredPresets = computed(() => presets.slice(0, 5))` — 前 5 个
- `countPresetEntries(preset, 'all')` = preset.entries.length
- grid: `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`, gap 12px
- card 撕角小一号: `clip-path: polygon(0 12px, 12px 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)`
- card 罗马 12px var(--font-display) italic, 左上角
- card 名字 16px display (LXGW/ZCOOL), 主信息
- card genre + entry 数 11px sans archive-ink-soft
- card hover: archive-olive 18% → 34% 边色 + 1px 抬高
- 移动端 ≤ 760: grid 变 1 列, 每个 card 仍 180px min
- `ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']` 跟 mast tab 同款

### 4.3 D — 1 行 2 个小按钮 (60px)

```vue
<footer class="quick-extra">
  <hr class="quick-extra__divider" />
  <div class="quick-extra__row">
    <button class="extra-btn" @click="openAdvanced('import')">导入小说 / JSON</button>
    <button class="extra-btn" @click="openAdvanced('ai')">AI 生成</button>
  </div>
</footer>
```

- divider: 1px dashed color-mix(archive-gold 22%, transparent) 满宽
- 2 个 button 横排, gap 12px, padding 8px 0
- 按钮视觉: 12px sans + archive-ink 文字 + archive-border 边 + 圆角 0
- hover: archive-olive 边
- click 跳 `/settings/worldbook/advanced` 并 open 到对应 section
  - `import` → advanced 默认 tab + 滚到导入 section
  - `ai` → advanced 默认 tab + 滚到 AI 生成 section
  - 这 2 个跳转需要在 WorldBookEditor.vue 加 `?section=import` / `?section=ai` query param 支持, 由 WorldBookEditor 内部 watch route 处理滚到对应 section

---

## 5. 数据流

### 5.1 store API (全部复用, 不改)

```js
const worldStore = useWorldStore()
const { worldbooksIndex, activeWorldbook, ensureActiveWorldbook, setActiveWorldbook, createWorldbook } = worldStore
const { presets } = seedWorldbookPresets // presets 数组
```

### 5.2 状态

| 状态 | 类型 | 初始 | 用途 |
|---|---|---|---|
| `selectedWorldbookId` | `ref('')` | `activeWorldbook?.id` | select v-model + 切换触发 |
| `featuredPreset` | `computed(() => presets[0])` | — | Hero card 主世界 (现在已有) |
| `featuredPresets` | `computed(() => presets.slice(0, 5))` | — | C 段 preset 网格 |
| `featuredPressureRow` | `computed(() => [...])` (inline 实现, 从 `presets[0].factions/locations/events` 派生 3 段) | — | 现有, briefing 3 chip |
| `featuredBriefing` | `computed(() => featuredPressureRow.value.slice(0, 3))` | — | 简化为 3 chip |

### 5.3 砍掉的状态 (8+)

| 状态 | 去向 |
|---|---|
| `creating` | 挪到 advanced |
| `generatingNovel` | 挪到 advanced |
| `generatingRandom` | 挪到 advanced |
| `pendingImport` | 挪到 advanced |
| `novelFileInputRef` | 挪到 advanced |
| `novelSourceFileName` | 挪到 advanced |
| `conflictMode` | 挪到 advanced |
| `novelSegments` | 挪到 advanced |
| `editingSegmentIndex` | 挪到 advanced |
| `editingEntryIndex` | 挪到 advanced |
| `showWorldShelf` | 挪到 advanced (或完全删) |
| `showLegacyArchive` | 删 (legacy RPG 预设是死路径) |
| `showCustomTools` | 删 |
| `errorMessage / successMessage / infoMessage` | 挪到 advanced (跟导入流程一起) |

### 5.4 函数

| 函数 | 行为 |
|---|---|
| `enterDefaultWorld()` | `enterPresetWorld(featuredPreset.value)` (已有) |
| `enterPresetWorld(preset)` | 复用 (已有, push `/opening`) |
| `onWorldbookChange()` | `setActiveWorldbook(selectedWorldbookId.value)` (已有) |
| `openAdvanced(section)` | `router.push({ name: 'settings-worldbook-advanced', query: { section } })` (新增) |
| `focusSelect()` | `document.querySelector('.my-worldbooks__select').focus()` (新增) |

### 5.5 WorldBookEditor 接收 import + AI generation UI + query param 支持

**S17 把"导入小说/JSON" 和 "AI 生成" UI 从 WorldBookQuickImport 挪到 WorldBookEditor**, 让主页 1 行 2 个按钮的跳转目的地实际有内容。

具体改动:
- 把 `WorldBookQuickImport.vue` 的 `novelInput` / `randomInput` / `pendingImport` / `novelSegments` / `enterPresetWorld` / `createWorldbookFromPayload` / `tryAiExtractEntries` / `tryAiGenerateFromBrief` 等逻辑**提取到 `src/services/worldbookQuickImportHelpers.js`** 复用
- 在 `WorldBookEditor.vue` 加一个 `editorTab = 'create'` 第 6 个 tab "新建/导入" (在现有 5 个 tab 之后):
  - 嵌入 1 段 worldbookQuickImportHelpers 的 2 个表单 (小说导入 / AI 生成)
  - 给这 2 个表单 section 加 `data-section="import"` / `data-section="ai"` 属性
- `?section=` query param 处理:
  - `import` → 切到 `editorTab = 'create'` + 滚到 `data-section="import"`
  - `ai` → 切到 `editorTab = 'create'` + 滚到 `data-section="ai"`
  - `new` / `manage` → 切到 `editorTab = 'create'` (用户在 header 也能点 "新建世界书", 行为一致)
  - 默认 (无 query) → 不切, 维持 `editorTab = 'base'`

```js
// WorldBookEditor.vue script setup
const route = useRoute()
onMounted(() => {
  const section = route.query.section
  if (section === 'import' || section === 'ai' || section === 'new' || section === 'manage') {
    editorTab.value = 'create'
    await nextTick()
    if (section === 'import' || section === 'ai') {
      document.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ behavior: 'smooth' })
    }
  }
})
```

---

## 6. 暗色适配

Kao 主题已支持暗色 (kao.css:45-57 token rebind), 所有 archive-* token 自动暗色化。无需特别适配。

legacy 主题 (主题 2) 不走这个 hero 设计, 用 `legacy/OpeningPage.vue` 走 Material 蓝白。世界书页在 legacy 主题下可以**保留**此 hero 设计, 因为全部 token 是 archive-* 而 archive-* 在 legacy 主题下不消费 (token 不存在, color-mix 会 fallback 到 transparent, 视觉会塌掉)。

**对策**: 在 `.worldbook-hero` 上加 **Vue scoped** `.theme-legacy .worldbook-hero { ... }` (不用 `:global`, 符合用户硬规则) legacy 主题覆写, 用 legacy 的 `--bg-primary / --border / --accent` token 重画一个简化版 (1 张白底 + 1 边框 + 1 主按钮), 不带撕角/罗马/印章。这样世界书页在两个主题下都"能看", 但视觉重点在 kao 主题 (跟 主题 1 开放页同源)。**注意**: 这是 Vue scoped CSS, 选择器会编译为 `.theme-legacy .worldbook-hero[data-v-xxx]`, 但因为 `.theme-legacy` 加在 `<html>`, 父选择器会匹配, 不需要 `:global` 转义。

---

## 7. 错误处理 + 空状态

| 场景 | 行为 |
|---|---|
| `worldbooksIndex` 为空 (新用户) | select 灰显 "暂无世界书, 选 1 个 preset 开始"; 主 CTA 仍 work (直接进 preset) |
| `activeWorldbook` 为空 | `onMounted` 调 `ensureActiveWorldbook()` (已有) |
| preset 全部为空 | Hero 退化到 "暂无预设世界书, 请导入或 AI 生成"; 仍 show D 段按钮 |
| route 切到 advanced 失败 | `router.push` catch 不弹 toast (跟其他 page 一致) |

不新增 toast / modal 组件, 复用现有 `setWorldbookError` (在 advanced 子页) 或 console.error。

---

## 8. 性能 + 体积

- WorldBookQuickImport.vue: 3759 行 → 估计 ≤ 600 行 (↓ 84%)
- 删除: pressure-row / pressure-stack / threat-meter / brief-list / exit-strip / hero-path / signal-board / legacy-presets / showCustomTools / novel 导入卡 / brief AI 生成卡 / 章节分段预览 / 导入预览 / 冲突处理 14 段 (约 3000 行)
- 新增: 撕角 hero 模板 (~150 行) + preset card 模板 (~80 行) + 我的世界书 select (~50 行) + 1 行 2 按钮 (~30 行)
- 0 新依赖, 0 新组件 (BookmarkButton / SettingsSectionNav / FolioSurface 都已有)

---

## 9. 测试

### 9.1 `worldBookQuickImport.test.js` 重写

现有 3 个测试基于 showCustomTools 展开 + 章节分段 + AI 生成, 这些全部砍掉。重写为:

1. `世界书主页: 渲染 1 屏 hero + 我的世界书 + preset 网格 + 1 行 2 按钮` (snapshot 或 DOM count)
2. `Hero card: 显示默认 preset 的 name + hook + briefing 3 chip + 开始冒险主 CTA`
3. `我的世界书 select: 含 worldbooksIndex 全部 + 切换调 setActiveWorldbook`
4. `Preset 网格: 显示前 5 个 preset + 点击调 enterPresetWorld + push /opening`
5. `1 行 2 按钮: 点击跳 /settings/worldbook/advanced?section=import 或 =ai`
6. `空状态: worldbooksIndex 为空时 select 灰显 + 提示 "暂无世界书"`

(新 mock: `useRoute` 返回 `{ name: 'settings-worldbook' }`, `useRouter` 返回 `{ push: vi.fn() }`, `RouterLink` 是 stub)

### 9.2 `uiPolish.test.js` UI-S17 describe block 新增 7 条契约

1. UI-S17: WorldBookQuickImport 不含 `hero-path` / `signal-board` / `pressure-row` / `pressure-stack` / `threat-meter` / `brief-list` / `exit-strip` / `legacy-presets` / `showCustomTools` 9 个旧元素
2. UI-S17: 撕角主壳含 `clip-path: polygon(0 24px, 26px 0, ...)`
3. UI-S17: 罗马 I 装饰含 `font-size: 88px` + `archive-rose 28% transparent`
4. UI-S17: C·01 rose 章含 `border: 1.5px solid archive-rose 58% transparent` + `transform: rotate(-9deg)`
5. UI-S17: 装订条 ::before 含 `linear-gradient(90deg, archive-gold, archive-olive, archive-rose)`
6. UI-S17: 1 行 2 个小按钮 label 严格匹配 `导入小说 / JSON` + `AI 生成`
7. UI-S17: 0 `:global` / 0 `!important` / 0 raw hex in new hero CSS

### 9.3 Forbidden sweep

新 CSS 只用 `var(--archive-*)` + `color-mix`, 0 raw hex, 0 `:global`, 0 `!important`。

---

## 10. 报告 + 截图

- 报告: `docs/agent-runs/2026-06-27-visual/UI-S17-simplify-worldbook-page.report.md`
- 截图 4 张 1280×800 Playwright headless:
  1. `settings-s17-worldbook-1280.png` — 默认态 (kao 主题 + 默认世界 "边境小镇")
  2. `settings-s17-worldbook-with-worldbooks-1280.png` — 我的世界书 select 展开 (含 5+ worldbooks)
  3. `settings-s17-worldbook-dark-1280.png` — 暗色模式 (验证暗色适配)
  4. `settings-s17-worldbook-legacy-1280.png` — legacy 主题 (验证双主题适配)
- 截图脚本: `scripts/s17-screenshots.mjs` (跟 `scripts/s16-screenshots.mjs` 同结构)

---

## 11. Out of scope (logged for follow-up)

- WorldBookEditor (advanced) 内部页面不变, 这次只加 `data-section` 属性 + `?section=` query param 支持
- StructuredSettings 不变
- preset 列表超过 5 个的处理 (目前硬截前 5, 后续可加 "查看更多" 折叠)
- legacy 主题的 hero 视觉 (本 spec 给 1 段占位覆写, 详细 follow-up)
- 4 子页的"返回世界书" 按钮 (现在没有, 不在 S17 范围)
- 我的世界书 select 的 inline 编辑 (右键 / 拖拽 / 删除操作, 后续 power user 优化)

---

## 12. 实施步骤概览 (writing-plans 阶段细化)

1. 备份 `WorldBookQuickImport.vue` 的关键 inline 函数 (`enterPresetWorld` / `enterDefaultWorld` / `countPresetEntries` / `featuredPressureRow`) 到 `src/services/worldbookQuickImportHelpers.js` 备用 (因为这些函数会大量复用)
2. 改写 `WorldBookQuickImport.vue`: 删 3000 行, 写 600 行 (撕角 hero + 我的世界书 + preset 网格 + 1 行 2 按钮)
3. 改 `WorldBookEditor.vue`: 加 `data-section` 属性 + `?section=` query param 处理
4. 改 `workbenchNav.js` (S16 已经把 default 改为 `settings-worldbook`, 不动)
5. 改 `worldBookQuickImport.test.js`: 3 旧测试 → 6 新测试
6. 改 `uiPolish.test.js`: 新增 UI-S17 describe block 7 条契约
7. 写截图脚本 `scripts/s17-screenshots.mjs`
8. 验证: `npm run test:run` + `npm run build` + `git diff --check` + forbidden sweep
9. 截图 + 报告
10. STATUS.md 加 entry

