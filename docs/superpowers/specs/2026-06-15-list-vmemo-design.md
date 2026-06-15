# v-memo on Large List Components — Perf Tier 1 优化

**Date**: 2026-06-15
**Status**: Draft (v2 — 整合 user review 6 修)
**Branch base**: `wip/map-realism-render-docs-20260608` (current)
**Research source**: [`docs/plan/comprehensive-research-synthesis-20260615.md` §1 #1](../../plan/comprehensive-research-synthesis-20260615.md) (v3 — §0.6 v2→v3 修正)
**Related**:
- `docs/superpowers/specs/2026-06-15-stereo-migration-design.md` (5A, 在飞,无冲突)
- `docs/superpowers/specs/2026-06-10-ui-redesign-design.md` (Phase 1B 视觉)
- `src/__tests__/uiPolish.test.js` (contract test 模板)

---

## v2 vs v1 修清单(整合 user review 6 项反馈)

| # | 类型 | v1 主张 | v2 修 | 引用源 |
|---|---|---|---|---|
| 1 | **HIGH** | QuestLog L158 deps `[activity.id, activity.time, activity.title, activity.status]` | **`status` → `type`**;模板实情为 `activity.type`(L166 marker 颜色 + L171-172 type label),**无 `status`** | spec v1:64 / `src/components/QuestLog.vue:164-172` |
| 2 | **HIGH** | MemoryIndicator L101 deps `[kind, scope, value, updatedAt, selected, editing]` | **整 `<article>` 跳过**(article 100+ 行含读/编辑/批量/同步/冲突 5 状态,deps 完整性成本 > 收益);`candidate.value` 实际不存在,`candidate.content` / `scopeId` / `status` / `duplicateOf` / `similarTo` / `conflictsWith` / `syncStatus` / `lastSyncedAt` / `lastSyncError` / `panelMode` / `batchBusy` + edit 时 `editDraft.kind/scope/scopeId/content` 全未列 | spec v1:190 / `src/components/MemoryIndicator.vue:100-180` |
| 3 | **HIGH** | ImageGenRail L93 deps `[img.id, img.status, img.url, img.thumbDataUrl, img.error, idx]` | **简化为 `[img.id, img.data]`**;`img.status` / `img.url` / `img.thumbDataUrl` / `img.error` **字段在 imageLibrary 中不存在**(`img.data` 已是 dataURL string);`idx` 仅 click handler 用,不入 deps | spec v1:237 / `src/components/ImageGenRail.vue:88-99` |
| 4 | **MEDIUM** | "MemoryIndicator 不适合第一刀用单个 v-memo 包整个复杂 article" | 同 #2 跳过处理,落到 Tier 2 follow-up 候选(后续可拆 read-only 子树) | — |
| 5 | **MEDIUM** | uiPolish test 只查 v-memo 数量 + 非空 deps 数组,无法防 deps 漏写 | **升 string-level 断言** — 正向必须含关键字段名(QuestLog `activity.type/time/title`、ImageGenRail `img.data`),反向断言不能含**模板没有的字段**(`activity.status` / `img.status` / `img.url` 等) | spec v1 §uiPolish Contract Test |
| 6 | **LOW** | L27 表 "QuestLog L240 = 高胜",L31 prose "L240 是 fixed 数据 不包 v-memo" 自相矛盾 | **L27 表为真**(L240 `availableRelations` 是 reactive computed,改活动 / 改 `editRelations` 频繁),**L31 prose 错**;v2 修 L31 对齐 L27 | spec v1:27 vs :31 / `src/components/QuestLog.vue:240-247` |

**v1 → v2 落点数**:4 → 3(去 MemoryIndicator L101)。`grep -rE "v-memo=" src/` ≥ 3(非 ≥ 4)。

**v2 加一条新 Non-Goal**:不动 MemoryIndicator 整 article v-memo(改 Tier 2 follow-up,不在 v2 范围)。

---

## Context

Pinax 4 个超 1k LoC 组件里有 2 个是长列表渲染,`v-for` 子项多,子项的响应式字段(status / timestamp / selected / status badge)任意一改即触发整个列表重渲。

经 `grep -rE "v-memo|v-once" src/` 全项目零命中(本 spec 撰写前 v3 review 二次复核确认)。Vue 3.2+ 的 `v-memo` 指令对**子项独立 + 兄弟不互相影响**的列表场景是教科书级 zero-risk 优化,无新依赖,无行为变化。

v3 综合报告 Tier 1 #1 把这条列为 ROI 最高项(≤ 1 小时工作量,零风险,perf 立即可见)。

**v2 落点清单**(经 grep + 文件读行核实):

| 文件 | v-for 行 | 子项类型 | 评估 | v2 实装? |
|---|---|---|---|---|
| `src/components/QuestLog.vue` | L158 | `activity in group` | **高胜** | ✅ v-memo |
| `src/components/QuestLog.vue` | L240 | `activity in availableRelations` | **高胜** | ✅ v-memo |
| `src/components/MemoryIndicator.vue` | L101 | `candidate in visibleCandidates` | ~~高胜~~ → **v2 跳过** | ❌ skip (整 article,见 #2) |
| `src/components/ImageGenRail.vue` | L93 | `(img, idx) in imageLibrary` | **中胜** | ✅ v-memo |

L9 summaryItems / L29 triggerMetaItems / L154 dateGroup / L224 activityTypes 是 fixed 数据,L55/71/111/119 scopeFilters/Scopes/MEMORY_KINDS/MEMORY_SCOPES / L33/41/57/142 modelConfigs/sizePresets/[1..4]/modelTypes 是常量 / SSR token,**不**包 v-memo(包了反而引入 deps 维护负担,React reconciler 不会因数据不变而更快)。

**v2 只动 3 个 v-for 块**(标 **高胜/中胜**),不追求覆盖率。

---

## Goals(v2 修订:5 → 4)

1. **3 个 v-for 子项层** 加 `<template v-memo="[deps...]">` 或元素级 `v-memo` 包裹,deps 列表覆盖该子项**所有**参与渲染的响应式字段
2. **新增 1 条 uiPolish contract** — 升 string-level 断言(正向必须含关键字段 + 反向不能含**不存在字段**)
3. **手动 perf 验收** — QuestLog / ImageGenRail 100 项下,翻 status / 插生图 < 50ms(目测 `performance.now()`)
4. **零行为变化 / 零新依赖**

---

## Non-Goals(v2 加 1 条)

- 不动 MemoryIndicator 整 article v-memo(改 Tier 2 follow-up,可单独立 sub-block v-memo 项目)
- 不上 deps 完整性单测(本 spec 只升 string-level 静态断言;运行时 deps 漏写 = 行为级测试,Tier 2)
- 不给 fixed / constant 数据列表加 v-memo(浪费 deps 维护,无 perf 收益)
- 不动 date-grouped activity tree L154 外层(其变化是"新增一组日期",频率低,v-memo 收益 < deps 维护成本)
- 不动 4 个 do-not-touch 文件(`gameStore.js` / `worldbookContextBuilder.js` / `generation*` / `StatusBar.vue`)
- 不动 5A 5B worktree 范围(Opening / Experience / folio/*)
- 不上 perf benchmark 自动测试(无 perf 测试基础设施,目测即可)
- 不引 VueUse / pinia-plugin-persist 等间接方案

---

## Approach: 1 PR, 1 commit, 3 文件, 5 步走

**节奏**(每步都是 2-5 分钟级,严格 TDD,contract test 先 red):

1. **红灯** — `uiPolish.test.js` 加 1 条 `it('wraps high-churn v-for item blocks with v-memo and deps cover rendered fields (not stale, not over-specified)', ...)`;跑测试,确认 fail
2. **实装 QuestLog L158** — `activity in group` 子项 v-memo,deps = `[activity.id, activity.time, activity.title, activity.type]`
3. **实装 QuestLog L240** — `activity in availableRelations` 子项 v-memo,deps = `[activity.id, activity.title, editRelations.includes(activity.id)]`
4. **实装 ImageGenRail L93** — `(img, idx) in imageLibrary` 子项 v-memo,deps = `[img.id, img.data]`
5. **绿灯** — 跑 `npm run test:run -- src/__tests__/uiPolish.test.js` 确认新增 contract green,再跑 `npm run test:run` 全量确认无回归
6. **manual perf** — 起 dev server,打开 QuestLog + ImageGenRail,加 100 项,翻 status,`performance.now()` 验证
7. **commit** — `perf(list): v-memo 3 high-churn v-for blocks in QuestLog/ImageGenRail`

中途任意一步失败 = 整 commit revert,无中间态。

---

## Architecture: 3 落点(v2 修订)

### 公共契约:v-memo deps 选取规则

每个子项的 v-memo deps 数组**必须覆盖**该子项模板中**所有**读取的响应式字段。漏一个 = 子项不更新 = 真 bug。

**判定步骤**(每个 v-for 块实装前必走):
1. 读该 `<article>` / `<button>` / `<div>` 子项模板
2. 列出模板中**所有** 形如 `{{ x.y }}` / `:class="x.y"` / `v-if="x.y"` / `@click="x.y()"` 的引用
3. 把所有 `x.y` 提到 deps 数组
4. 若模板引父级 ref(如 `editingCandidateId`),把"父 ref 当前是否等于子项 id"也加进去(否则父级 ref 变时所有子项都不更新 = 全 stale)
5. 跑相关 test(若有 `uiPolish` contract 之外的子项行为 test,加 1 条)
6. **反查**:deps 数组**不可含模板不读的字段**(避免噪音 + 防错字段名)

### 落点 1 — `src/components/QuestLog.vue` L158

**当前模板**(L154-176 摘,经 grep 验证):
```vue
<div v-for="(group, dateKey) in groupedActivities" :key="dateKey" class="timeline-group">
  <div class="timeline-date">{{ formatDateKey(dateKey) }}</div>
  <div class="timeline-items">
    <button
      v-for="activity in group"
      :key="activity.id"
      type="button"
      class="timeline-item"
      @click="editActivity(activity)"
    >
      <div class="item-time">{{ formatTime(activity.time) }}</div>          <!-- L164: time -->
      <div class="item-marker">
        <div class="marker-dot" :style="{ background: getActivityColor(activity.type) }"></div>  <!-- L166: type -->
        <div class="marker-line"></div>
      </div>
      <div class="item-content">
        <div class="item-title">{{ activity.title }}</div>                  <!-- L170: title -->
        <div class="item-type" :style="{ color: getActivityColor(activity.type) }"> <!-- L171-172: type -->
          {{ getActivityLabel(activity.type) }}
        </div>
      </div>
    </button>
  </div>
</div>
```

**v2 实装后**:
```vue
<button
  v-for="activity in group"
  v-memo="[activity.id, activity.time, activity.title, activity.type]"
  :key="activity.id"
  type="button"
  class="timeline-item"
  @click="editActivity(activity)"
>
  <!-- 模板不变 -->
</button>
```

**deps 推导**:
- `activity.id` (key,Vue 官方说 key 不需进 v-memo,但漏写无副作用,此处保险起见带)
- `activity.time` (L164 `formatTime(activity.time)`)
- `activity.title` (L170)
- `activity.type` (L166 marker 颜色 + L171-172 type label) — **v1 误为 `activity.status`,v2 修**

`editActivity` 是稳定函数引用,**不进** deps。

**视觉回归防线**:既有 `uiPolish.test.js` 走 `readFileSync` + 字符串匹配,继续确保 `.timeline-item` / `.item-time` / `.item-marker` / `.item-title` / `.item-type` 5 个 class 名仍出现。

### 落点 2 — `src/components/QuestLog.vue` L240

**当前模板**(L237-247 摘,经 grep 验证):
```vue
<div class="relation-list">
  <button
    v-for="activity in availableRelations"
    :key="activity.id"
    type="button"
    :class="['relation-btn', { active: editRelations.includes(activity.id) }]"
    @click="toggleRelation(activity.id)"
  >
    {{ activity.title.slice(0, 10) }}
  </button>
</div>
```

**v2 实装后**:
```vue
<button
  v-for="activity in availableRelations"
  v-memo="[activity.id, activity.title, editRelations.includes(activity.id)]"
  :key="activity.id"
  type="button"
  :class="['relation-btn', { active: editRelations.includes(activity.id) }]"
  @click="toggleRelation(activity.id)"
>
  {{ activity.title.slice(0, 10) }}
</button>
```

**deps 推导**:
- `activity.id`
- `activity.title` (渲染用)
- `editRelations.includes(activity.id)` (`active` class 用 — **必须**带,父级 ref 变化时这是关键 deps)

**v1 错修正**:v1 把 L240 同时在 L27 表中标"高胜"又在 L31 prose 中说"fixed 数据 不包",**v2 以 L27 表为真**(L240 `availableRelations` 是 reactive computed,改活动 / 改 `editRelations` 频繁),删 L31 矛盾 prose。

### 落点 3 — `src/components/ImageGenRail.vue` L93

**当前模板**(L88-99 摘,经 grep 验证):
```vue
<div v-if="imageLibrary.length > 0" class="image-gen-results">
  <div class="image-gen-results-title">历史记录</div>
  <div class="image-gen-grid">
    <div
      v-for="(img, idx) in imageLibrary"
      :key="img.id"
      class="image-gen-thumb"
      @click="imagePreviewIndex = idx"
    >
      <img :src="img.data" alt="generated" />
    </div>
  </div>
</div>
```

**v2 实装后**:
```vue
<div
  v-for="(img, idx) in imageLibrary"
  v-memo="[img.id, img.data]"
  :key="img.id"
  class="image-gen-thumb"
  @click="imagePreviewIndex = idx"
>
  <img :src="img.data" alt="generated" />
</div>
```

**deps 推导**:
- `img.id` (key)
- `img.data` (L98 `<img :src="img.data">`)

**v1 错修正**:v1 列了 `img.status` / `img.url` / `img.thumbDataUrl` / `img.error` / `idx` — **这 5 个字段在 imageLibrary 中均不存在**(`imageLibrary` 经 `urlToDataUrl()` 处理后,每条 entry 是 `{ id, data: 'data:image/png;base64,...' }` 结构;`idx` 仅 click handler 用,不入 deps)。**v2 简化为 `[img.id, img.data]`**。

**实装前必读**:`src/components/ImageGenRail.vue` L88-99 整段,确认 `imageLibrary` 数据结构(以 `imageLibrary.value.unshift({...})` 调用 L410 字段为基准)未变;若 v1→v2 之间重构,deps 按需调整。**禁止凭印象写 deps**。

---

## uiPolish Contract Test(v2 升 string-level,镜像现有 `it(...)` 风格)

新增到 `src/__tests__/uiPolish.test.js`:

```js
it('wraps high-churn v-for item blocks with v-memo and deps cover rendered fields (not stale, not over-specified)', () => {
  const questLog = readProjectFile('src/components/QuestLog.vue')
  const imageGenRail = readProjectFile('src/components/ImageGenRail.vue')

  // 1. 计数: ≥ 3 v-memo 落点(v2 修:4 → 3)
  const { execSync } = require('node:child_process')
  const total = parseInt(
    execSync('grep -rE "v-memo=" src/ | wc -l', { encoding: 'utf-8' }),
    10
  )
  expect(total).toBeGreaterThanOrEqual(3)

  // 2. QuestLog: ≥ 2 个 v-memo 落点(L158 + L240)
  const qlMemoBlocks = questLog.match(/v-memo="(\[[^\]]+\])"/g) || []
  expect(qlMemoBlocks.length).toBeGreaterThanOrEqual(2)

  // 3. QuestLog 每个 v-memo deps 必须含渲染字段,不能含不存在字段
  qlMemoBlocks.forEach((deps) => {
    // 正向:必须含 type / time / title
    expect(deps).toMatch(/activity\.type/)
    expect(deps).toMatch(/activity\.time/)
    expect(deps).toMatch(/activity\.title/)
    // 反向:模板无 status(防 v1 错)
    expect(deps).not.toMatch(/activity\.status/)
  })

  // 4. ImageGenRail: 1 个 v-memo 落点 + deps 字段
  const imgMemoBlock = imageGenRail.match(/v-memo="(\[[^\]]+\])"/)
  expect(imgMemoBlock).toBeTruthy()
  const imgDeps = imgMemoBlock[1]
  // 正向:必须含 img.data
  expect(imgDeps).toMatch(/img\.data/)
  expect(imgDeps).toMatch(/img\.id/)
  // 反向:imageLibrary 中无 status/url/thumbDataUrl/error(idx 仅 click 用)
  expect(imgDeps).not.toMatch(/img\.status/)
  expect(imgDeps).not.toMatch(/img\.url/)
  expect(imgDeps).not.toMatch(/img\.thumbDataUrl/)
  expect(imgDeps).not.toMatch(/img\.error/)
})
```

**red light 验证**:`npm run test:run -- src/__tests__/uiPolish.test.js -t "v-memo"` 期望 fail(当前 0 命中)。

**green light 验证**:实装 3 个落点后再跑,期望 pass。

**契约 vs 行为**:本 contract 是**静态 readFileSync + 字符串断言**,捕获 deps 数组的字段集合,**不能**捕获"deps 漏掉渲染字段导致的 stale render"——后者需 vitest + vue-test-utils 行为测试,留 Tier 2 follow-up。**manual perf 验收** + **手动反向验证**(场景 A-D)是当前唯一的运行时防线。

---

## Verification

### 必跑(自动化)

| 命令 | 期望 |
|---|---|
| `npm run test:run -- src/__tests__/uiPolish.test.js` | 1 file, n+1 tests, 全 pass(原 n + 新增 v-memo contract) |
| `npm run test:run` | 87 files, 625+ tests, exit 0,0 regression(经 v2 §2.1 验证基线) |
| `npm run build` | pass,3-4 s(经 v2 §2.1 验证基线) |
| `git diff --check` | clean(无 whitespace 噪声) |
| `grep -rE "v-memo=" src/ \| wc -l` | ≥ 3(防御性,实装后必 = 3) |

### 手动(perf 验证)

启动 dev server `npm run dev`,打开 QuestLog(同时用 ImageGenRail 抽屉):

1. **场景 A — 状态机翻动**(QuestLog 时间线):
   - 100 条 activity 下,翻其中 1 条 `type` 从 `event` → `quest`
   - 期望只有该 1 条 button 重渲,marker 颜色 + label 即时变
   - Chrome DevTools Performance 面板 "Rendering → Recalculate Style" 计数 < 10
2. **场景 B — 列表插入**:
   - 100 → 101 条 activity,期望仅 1 个新 button 创建 + 0 旧 button 重渲
3. **场景 C — relations 选中**:
   - 50 条 availableRelations 下,点 5 条 toggle
   - 期望只有这 5 个 button 重渲(其 `active` class 变),其余 45 个跳过
4. **场景 D — 生图结果插入**:
   - ImageGenRail imageLibrary 0 → 20 张,期望仅 20 个新 thumb 创建,逐张插入时 0 旧 thumb 重渲

视觉检查:marker 颜色 / type label / time / title / relation active class / 缩略图 data URL **全部正常**(v-memo 漏 deps 会在这里暴露)。

### 反向验证(回归)

- QuestLog 时间线编辑 modal 仍可正常打开
- ImageGenRail 缩略图点击预览仍正常
- 列表删除(任意一组件) 仍正常,key 复用无 stale

---

## Risks & Mitigations(v2 修订:加 1 条)

| 风险 | 缓解 |
|---|---|
| **漏 deps** = 子项不更新 = 真 bug | 每落点实装前按"判定步骤"列字段;反向验证(场景 A-D)目测覆盖;`uiPolish` contract 验 deps 数组含关键字段名 + 不含不存在字段 |
| **错字段名进 deps** = 子项不更新 = 真 bug | v2 升 string-level 断言 — 双向(正向必有 + 反向必无)防 v1 类错误 |
| **v-memo 与 `:key` 重复** = 误把 id 双重考虑 | 明确:`:key` 控制 DOM 复用身份,`v-memo` 控制是否重渲;**两者都写**是 Vue 官方推荐 |
| **deps 数组里进了稳定函数** = 永远 stale | 实装指引禁止把 `editActivity` / `toggleRelation` 之类函数引用进 deps;deps 只进**读到的字段 / 返回值** |
| **整 article 错套 v-memo** = 漏一个 deps = 全 stale | v2 显式跳过 MemoryIndicator L101(整 article 100+ 行,5 状态合一,deps 完整性成本 > 收益);后续 Tier 2 拆 read-only 子树再立专项 |
| **dev / build 体积** = v-memo 内置无新依赖,无 bundle 影响 | `npm run build` 输出与 main baseline 对比,无新增 chunk |
| **5A 5B worktree 冲突** = 5A 已合 Opening / Experience / folio,本 spec 不动这些路径 | 文件路径隔离(QuestLog / ImageGenRail 不在 5A scope);5A 5B 走独立 worktree 不受影响 |

---

## Rollout

1. **本 spec v2 落盘** → user review → user 批准 → 转 `docs/superpowers/plans/2026-06-15-list-vmemo.md` (writing-plans skill 模板) → 1 commit
2. **1 commit** = `perf(list): v-memo 3 high-churn v-for blocks in QuestLog/ImageGenRail`(v2 修订:4 → 3)
3. **commit 后** → 更新 `docs/STATUS.md` Recently done(参考 5A 15:55 CST 模板:文件 + 3 sites 接入 + 1 contract test 落地 + 1 commit 总结 + 全量验证清单)
4. **post-merge** → 监控 dev server perf,确认无用户可感回归;若稳定 7 天无问题,可考虑进 v3 Tier 2 用 `v-memo` 扫其它 1k+ LoC 组件的次级 v-for 块(L9 / L29 / L224 / L55-119 其它 list)或 **MemoryIndicator read-only 子树**专项

---

## Open Questions(v2 修订 4 → 3 项)

1. **v1 漏字段 + 错字段名问题在 v2 已修** — 用户是否还需**额外**给 deps 数组加 vitest 行为测试(动态 mount + 改字段 + 断言子项更新)?本 spec v2 升 string-level 静态断言后已能挡 v1 类错误,但**不能**挡"deps 漏掉某个未被测到的字段"——后者需 vue-test-utils 行为测试。
2. **是否进 plan**?本 spec v2 完即可进 `writing-plans` 写 `2026-06-15-list-vmemo.md`,无需新 brainstorming;若用户希望先扩 scope(MemoryIndicator 拆 read-only 子树 / 扫更广 list),再回 brainstorming。
3. **是否复用 v1 修前 deps 的失败模式做 Tier 2 测试基础设施立项**(deps 完整性行为测试 + perf benchmark 自动测试)?本 spec 仅升静态断言;真正"漏 deps"和"perf 退化"两个回归类,目前无自动防线。
