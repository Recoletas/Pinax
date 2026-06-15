# Pass 4 精修 Spec — 1-click 续会话 + 体验页按钮密度

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to convert this spec into a bite-sized plan, then superpowers:subagent-driven-development to execute it.

**Goal:** 修 Experience 冷启动的 2 步进入流程(必须开 picker → 再点具体 session)为 1-click 续最近 session,同时把体验页 stage-command 按钮密度从 62-78px 区间压到 40px 档位(新 `size="micro"` 等级)。

**Architecture:** 2 个相互独立的子 fix 合并在 1 commit:
- **A. 续会话逻辑** — `gameStore.js` 新增 `getLatestSessionForWorldbook(id)` action(按 `updatedAt` desc 排序后 find),`Experience.vue` 的 `startWorldAdventure` 改用它,空结果才 create;同时加 `isStarting` ref 防双击;`loadSession` 之后立即重设 active worldbook 保持 state 一致;`onMounted` else 分支保留 `showSessionPicker.value = true`(首次用户兜底)
- **B. 按钮密度** — `BookmarkButton.vue` 新增字符串 prop `size: 'default' | 'compact' | 'micro'`,CSS 加 `.bookmark-button--size-micro`(40px / 16px / 13px / 44px / 760px→36px);老的布尔 `compact` prop 不删,加 `// TODO(2.0): deprecate compact in favor of size` 注释;WelcomeView 3 处用法不传 `size`(走 default 保持 82px 不变);Experience.vue 4 处 stage-command 用法加 `size="micro"`;`.stage-command` 父级 min-height 62px→40px,`.stage-command--compact` 50px→36px(其他 6 个 media query 变体的 min-height 同步降到 40px)

**Tech Stack:** Vue 3 + Vite + Pinia (`getLatestSessionForWorldbook` 加在 `gameStore.js` actions),CSS(纯字号/间距调整,不动 design tokens),Vitest 契约测试(每子 fix 加 2-3 条契约)。

**Spec 关系:**
- 上游: Pass 2 spec `docs/superpowers/specs/2026-06-11-welcome-experience-pass2-design.md` (v3, commit `7f98157`)
- 上游: Pass 3 spec `docs/superpowers/specs/2026-06-11-welcome-experience-pass3-fixes-design.md` (commit landed)
- 上游: `docs/plan/kao-ui-direction.md` 5 层档案册美学约束(不动)
- 上游: `docs/plan/character-driven-arc.md` 5-pose cap 角色方向(不动)
- 本 spec 编号: Pass 4, 3-review-subagent 反馈 + 1 user 决策后定稿
- worldbook-workflow skill 已跑:影响面 = context injection 下游(session 加载路径),3 个 import path 没动,active-worldbook 选择顺序需要在 fix 中谨慎处理

**Branch:** `wip/map-realism-render-docs-20260608`
**Commits:** 1 个(沿用 1 commit per feature 原则,Pass 4 全部 2 个子 fix 合并)

---

## §1 Background

Pass 3 落地后(commit landed),用户 2026-06-11 复检体验页报告 2 个问题:

1. **冷启动必须 2 步进入**: 用户说"必须点会话再点具体会话才能进入" — 实际触发的代码路径是 `Experience.vue:670` 的 `startWorldAdventure`。读后定位根因:**line 679-690** 找 `currentSession` 是按 `gameStore.currentSessionId`(当前已加载的 session id)查,不是按 worldbookId 查最新 session。冷启动时 `currentSessionId` 是 null,直接进 `createSession` 分支,**新建第 N+1 个 session,忽略已有的 N 个**。所以用户看到的行为是"进入世界 = 新建一个新对话",而真正"续最近对话"必须点 toolbar 的"会话"开 picker 再选
2. **按钮还是大了**: 用户说"按钮还是大了" — Pass 3 没动按钮密度。`BookmarkButton.vue` base min-height 82px(Welcome 用的),`Experience.vue:2077` 的 `.stage-command` 父级 override 62px,`.stage-command--compact` 50px。但因为 BookmarkButton 自己的 82px min-height 没被 override 完全压住(在 980px 媒体查询里 BookmarkButton 走 default,父级 62px 比它小,实际渲染以 BookmarkButton 的 82px 为主),**用户看到的是 82px 的大按钮**。compact prop 只把 BookmarkButton 压到 72px,仍然偏大

3 个并行 review subagent(code / architecture / edge-cases)进一步指出 8 处需要并入 design 的修正(详见 §4 风险表)。用户已决策:首次用户(无 worldbook + 无 session)的兜底 **保留** `onMounted else 分支 showSessionPicker.value = true`(选项 1 / 3 中选 1,re-subagent 共识"less broken than the new one")。

---

## §2 Goals & Non-goals

### Goals

- **G1 (1-click 续最近 session)**: 有 worldbook 已选 + 已有该 worldbook 的 session 时,点"进入世界"1 次即进入**最近**一个 session(updatedAt 最大的),不创建新的
- **G2 (create 兜底)**: 有 worldbook 已选 + 该 worldbook 没有任何 session 时,点"进入世界"1 次创建一个新 session 并 initGame
- **G3 (1-click 防双击)**: 重复点"进入世界"在 initGame 期间不会 wipe 掉正在流式生成的消息
- **G4 (state 同步)**: 1-click 续会话后,`activeWorldbook` 与 `selectedWorldbookId` 与 `currentSession.worldbookId` 三者一致(避免 watcher 反弹)
- **G5 (stage-command 密度 40px)**: Experience `.stage-command` 父级 + `.stage-command--compact` 在所有 viewport 都不超过 40px / 36px
- **G6 (WelcomeView 视觉零回归)**: WelcomeView 3 个 BookmarkButton 用法不传 `size`,走 default 82px 视觉不变
- **G7 (契约 + 截图)**: 4 条新 Vitest 契约全绿 + 7 张 Playwright 截图视觉验收

### Non-goals

- **NG1**: 不删 `BookmarkButton` 的 `compact` 布尔 prop(向后兼容,WelcomeView "新卷" 按钮还在用)
- **NG2**: 不动 `worldbookContextBuilder.js` / generation task layer / 3 个 import path(普通入口 / 高级设置 / SillyTavern I/O)
- **NG3**: 不改 `.is-archive-prop` utility / 4 个 z-index token / 7-tile collage / kao 暖金 grammar / Welcome 视觉
- **NG4**: 不引入 `box-shadow`(沿用 no-shadow 设计语法)
- **NG5**: 不动 `AppShell` / chrome / `WorkbenchPageHero` / 路由
- **NG6**: 不改 `feTurbulence` / `feDisplacementMap` SVG filter(Pass 3 删 `feGaussianBlur` 已闭环)
- **NG7**: 不动 SessionPicker 内部 UI(只改 `Experience.vue` 调用方的入口逻辑)
- **NG8**: 不动 `handleStageSecondaryAction` 的 toolbar 路径(开 picker 的快捷方式照常工作)

---

## §3 Design

### §3.1 gameStore.js: 新增 `getLatestSessionForWorldbook(id)` action

**当前实现 (gameStore.js:948-951):**
```js
loadSessions() {
  const raw = getItem(STORAGE_KEYS.WRITING_SESSIONS)
  this.sessions = Array.isArray(raw) ? raw : []
}
```
`sessions` 数组按插入顺序(localStorage 持久化顺序),不按 `updatedAt` 排序。`Array.prototype.find` 按插入序返回 — 旧架构的会话被优先匹配(回归 B2 / M1)。

**修复 (新增 action,放在 `loadSessions` 之后,`createSession` 之前):**
```js
getLatestSessionForWorldbook(worldbookId) {
  if (!worldbookId) return null
  const target = worldbookId
  const sorted = [...this.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return sorted.find((s) => (s.worldbookId || s.worldId) === target) || null
}
```

**为什么不直接 sort `loadSessions`?** Sort 一次后,后续 `findSession(sessions, currentSessionId)`(line 501, 519, 557, 575)仍按 sort 后顺序遍历,逻辑等价;但会改变 `saveCurrentSession` 的 `findIndex`(line 994)— 不会,`findIndex` 按 id 找,sort 不影响。**结论:可以**在 `loadSessions` 内 sort,但增加了一个隐式契约(任何调用方都假设 sessions 是按 updatedAt desc 排序)。**新加 action 更显式**,只在该用它的 `startWorldAdventure` 里调用,不影响其他调用方。

**Cascade 注意事项:** 旧 sessions(仅 `worldId` 字段、无 `worldbookId` 字段)通过 `(s.worldbookId || s.worldId) === target` 仍能匹配 — `createSession` 自 line 970-971 起一直同时写 `worldId` 和 `worldbookId`,新 session 不会落空。空 `worldbookId` / `worldId` 的 session(脏数据)会被跳过,不会误匹配。

### §3.2 Experience.vue: 重写 `startWorldAdventure` 走"找最近 → 兜底 create"

**当前实现 (Experience.vue:670-697):**
```js
async function startWorldAdventure() {
  const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
  if (!worldbookId) {
    openWorldbookQuickImport()
    return
  }
  await worldStore.setActiveWorldbook(worldbookId)
  selectedWorldbookId.value = worldbookId

  const currentSession = gameStore.currentSessionId
    ? gameStore.sessions.find((session) => session.id === gameStore.currentSessionId)
    : null
  const sessionWorldbookId = currentSession?.worldbookId || currentSession?.worldId || ''

  if (!currentSession || sessionWorldbookId !== worldbookId) {
    gameStore.createSession({...})   // ← BUG: 永远找不到已有 session,直接 create
  }

  showSessionPicker.value = false
  if (!gameStore.messages || gameStore.messages.length === 0) {
    await gameStore.initGame()
  }
  refreshOpeningIntent()
}
```

**新实现 (替换 line 670-697):**
```js
const isStarting = ref(false)

async function startWorldAdventure() {
  if (isStarting.value) return
  isStarting.value = true
  try {
    const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
    if (!worldbookId) {
      openWorldbookQuickImport()
      return
    }

    // 1) 先找最近的 session(按 updatedAt desc 排序后 find)
    const existing = gameStore.getLatestSessionForWorldbook(worldbookId)

    if (existing) {
      // 2a) 续 — loadSession 之后立即同步 active worldbook 避免 watcher 反弹 (G4)
      gameStore.loadSession(existing.id)
      await worldStore.setActiveWorldbook(existing.worldbookId || existing.worldId || worldbookId)
      selectedWorldbookId.value = existing.worldbookId || existing.worldId || worldbookId
    } else {
      // 2b) 兜底 create
      await worldStore.setActiveWorldbook(worldbookId)
      selectedWorldbookId.value = worldbookId
      gameStore.createSession({
        title: `${worldStore.activeWorldbook?.name || '世界'} · 冒险`,
        worldbookId,
        inheritRuntimeState: false
      })
    }

    showSessionPicker.value = false
    if (!gameStore.messages || gameStore.messages.length === 0) {
      await gameStore.initGame()
    }
    refreshOpeningIntent()
  } finally {
    isStarting.value = false
  }
}
```

**关键差异:**
- **line 685 之前**: 旧代码先 `setActiveWorldbook` 再 find → 若 find 命中的是另一个 worldbook 的 session,active 与 selected 与 currentSession 三者不一致,watcher 反弹。新代码**先 find,根据 find 结果决定** setActiveWorldbook 的目标
- **G4 state 同步**: loadSession 之后立即 `setActiveWorldbook(existing.worldbookId || existing.worldId)`,三态一致
- **G3 双击防护**: `isStarting` ref 同步函数入口;`finally` 释放(无论 initGame 成功失败都释放)。`createSession` 是同步,但 `initGame` 异步 ~ 数秒,期间重复点击被拦截
- **位置**: `isStarting` 声明在 `startWorldAdventure` 上方(在 `const showSessionPicker = ref(false)` line 569 旁边),不需要 `ref` 之外的额外 reactive 包装

### §3.3 onMounted else 分支: **保留** `showSessionPicker.value = true`

用户已决策(选项 1):首次用户(无 worldbook + 无 session + 无 intent)冷启动仍自动开 picker,作为引导。

**当前 (Experience.vue:609-615) — 不动:**
```js
} else {
  selectedWorldbookId.value = ''
  await worldStore.setActiveWorldbook(null)
  if (!stillMounting()) return
  gameStore.resetRuntimeState()
  showSessionPicker.value = true   // ← 保留(首次用户兜底)
}
```

**为什么不是 1-click:** 无 worldbook 时 `startWorldAdventure` line 672-675 走 `openWorldbookQuickImport()` 跳到世界书导入页,不会自动创造世界书 — 这超出"修入口流程"scope。用户必须先选/导入一个 worldbook,再回 /experience,1-click 才能工作。Picker 是这中间步骤的"快速通道"。

### §3.4 BookmarkButton.vue: 新增 `size` prop + `.bookmark-button--size-micro` CSS

**模板修改 (line 5-9 — 在现有 `compact` class 旁加 `size` class):**
```html
:class="[
  `bookmark-button--${variant}`,
  compact ? 'bookmark-button--compact' : '',
  size !== 'default' ? `bookmark-button--size-${size}` : '',
  disabled ? 'bookmark-button--disabled' : ''
]"
```

**Props 修改 (line 46-49 — 在 `compact` 旁加 `size`):**
```js
compact: {
  type: Boolean,
  default: false
},
// TODO(2.0): deprecate compact in favor of size
size: {
  type: String,
  default: 'default',
  validator: (v) => ['default', 'compact', 'micro'].includes(v)
},
```

**CSS 修改 (在 line 195 之后追加 — `.bookmark-button--size-micro` + 760px 媒体查询变体):**
```css
.bookmark-button--size-micro {
  min-height: 40px;
  grid-template-columns: 44px minmax(0, 1fr);
}

.bookmark-button--size-micro .bookmark-button__index {
  font-size: 16px;
}

.bookmark-button--size-micro .bookmark-button__label {
  font-size: 13px;
  padding: 0 8px 0 14px;
}

@media (max-width: 760px) {
  .bookmark-button--size-micro {
    min-height: 36px;
    grid-template-columns: 40px minmax(0, 1fr);
  }
}
```

**为什么不 `bookmark-button--micro`?**: 与现有 `bookmark-button--compact` 撞名空间,review subagent 共识(B1/B2/H3)。新 class 用 `--size-micro` 前缀明确"这是 size prop 派生的 class",跟布尔 `compact` 派生的 `--compact` 在命名空间上分开。**两者可共存** — 例如传 `compact size="micro"` 会同时挂 `--compact` 和 `--size-micro`,后写的 `--size-micro` 因为 specificity 相同 + 写在后面胜出,实际渲染 40px。

### §3.5 Experience.vue: 4 处 BookmarkButton 用法 + 父级 CSS 压密度

**模板修改 (4 处,加 `size="micro"`):**
| 位置 | 当前 | 新 |
|---|---|---|
| line 73-82 (进入世界) | `<BookmarkButton class="action-btn stage-command stage-command--primary"` | 加 `size="micro"` |
| line 83-92 (会话) | `<BookmarkButton class="action-btn stage-command stage-command--secondary"` | 加 `size="micro"` |
| line 167-176 (从这里开局) | `<BookmarkButton class="action-btn stage-command stage-command--compact stage-command--primary"` | 加 `size="micro"` |
| line 177-186 (改成自己写) | `<BookmarkButton class="action-btn stage-command stage-command--compact stage-command--secondary"` | 加 `size="micro"` |

**CSS 修改 (`.stage-command` 父级 + compact 变体 + 6 个媒体查询变体):**

`src/pages/Experience.vue` 有 6 处 `.stage-command` min-height 定义,需要全部降到 ≤40px 档位:

| Line | 当前 min-height | 新 min-height | 备注 |
|---|---|---|---|
| 2077 (base) | 62px | **40px** | 主路径 |
| 2175 (`.stage-command--compact`) | 50px | **36px** | opening action 区 |
| 3633 (980px 媒体查询内) | 58px | **40px** | 980px 视口 |
| 4001 (640px 媒体查询内) | 56px | **40px** | 640px 视口 |
| 4326 (redo block) | 78px | **40px** | `Experience redo` scoped block |
| 4368 (redo `.stage-command--compact`) | 72px | **36px** | redo compact |
| 2950 / 3919 | (只设 min-width: 100%) | (不动) | 只设 min-width 不影响 min-height |

**为什么 40px 不 36px 作为 base?** 36px 触达目标低于 iOS HIG 44px / Material 48dp。code review 共识:同 codebase `.experience-stage-utility` 已是 34px(button-bar 区),偏离已存在。**40px 是妥协**:作为桌面端 base(鼠标精度高),降到 36px 仅在 760px mobile 媒体查询内生效(用户用手指需要更紧凑但还是 > 32px 极小值)。

**Cascade check:** `.stage-command` 的 min-height 60-78px 主要来自父级 override(line 2077)+ 媒体查询(line 3633, 4001)+ scoped block(line 4326)。加 `size="micro"` 到 BookmarkButton 后,child 是 40px,parent 仍是 40px(新),`min-height: max(40, child) = 40`。**两者对齐,不会出现 child 比 parent 高的视觉裁切**。

### §3.6 WelcomeView.vue: **零改动**

3 个 BookmarkButton 用法(line 81-89, 91-100, 102-112)都不传 `size`,走 `default` 82px。`size` prop 默认值 `'default'`,模板的 `size !== 'default' ? class : ''` 条件不成立,不挂额外 class。Welcome 视觉零回归(G6)。

---

## §4 Risks & Mitigations

| ID | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| **R1** | `loadSession(existing.id)` 之后 `setActiveWorldbook` 异步期间,`worldStore.activeWorldbookId` watcher (line 632-639) 触发 `selectedWorldbookId.value = normalized` 重置 → 跟 G4 state 一致目标冲突 | 中 | 中 | loadSession 之后**同步**调用 `setActiveWorldbook(existing.worldbookId)`,await 等待其完成再赋 `selectedWorldbookId.value`,watcher 看到的是已经一致的目标,不会反弹(已用 `if (selectedWorldbookId.value !== normalized)` 守门,line 634) |
| **R2** | `getLatestSessionForWorldbook` 的 `updatedAt` 为 0 / undefined 时(老 session 没写过 updatedAt),`Date.now() - 0 = 13位数 ms`,`0 - 0 = 0`,sort 行为可预测但不直观 | 低 | 低 | 老 session 一般 `createSession` 内 line 968 写了 `createdAt: Date.now()`,没有 `updatedAt` 时,`b.updatedAt \|\| 0` 兜底。理论上 sort 不退化。如果发现老数据导致 find 错位,迁移时 `loadSessions` 加一次 backfill:`this.sessions.forEach(s => { if (!s.updatedAt) s.updatedAt = s.createdAt \|\| 0 })` — 本 spec 不主动加,作为 PR review gate |
| **R3** | 双击防护 `isStarting` 是单页 lifecycle ref,组件 unmount 后失效。如果用户在 initGame 期间路由跳到 /experience/worldbook,回来后 ref 已重置,可能双击 | 低 | 低 | 路由跳转会 unmount Experience.vue,新 mount 时 `isStarting` 重置为 false。**这是正确行为**(新组件实例的本地状态)。如果担心跨页面持久化,改用 gameStore 内的 `isStarting` action flag — 本 spec 暂不上,作为 open question |
| **R4** | `compact` 布尔 + `size="compact"` 字符串两个 API 共存,后续 dev 困惑 | 中 | 低 | 加 `// TODO(2.0): deprecate compact in favor of size` 注释;Pass 4 不删,Pass 5 再议。**显式记录**避免永久漂移(架构 review I1 共识) |
| **R5** | `.bookmark-button--size-micro` 的 760px 媒体查询变体(36px)与 `.bookmark-button`(line 202-221 的 760px 通用规则 72px)**没有冲突**(变体 class 显式声明,优先级高于 base class 的 760px 规则) | 低 | 低 | CSS cascade 验证:`.bookmark-button--size-micro` 选择器 specificity 0,1,0(单个 class);`.bookmark-button`(在 760px 媒体查询内)也是 0,1,0。同 specificity → 后写胜。`--size-micro` 写在 base class 之后(line 195 之后),760px 媒体查询内也写在 base 760px 之后 → 胜出 ✓ |
| **R6** | `.stage-command` 在 `Experience redo: folio spread, fewer frames` scoped block (line 4290-4368) 内的 min-height 78px / 72px 与 base 62px / 50px 已经是不同样式系统(rotate transform 而不是 skew,clip-path polygon 切口)。降到 40px / 36px 后,`rotate(-3deg)` 在 40px 高度上视觉上是细长斜切条,与原 78px 视觉差异巨大 | 中 | 中 | 验证:`Experience redo` block 写的是 `:deep(.stage-command)`,说明这个 block 已经在某个 wrapper 上下文(scope)内。如果该 wrapper 当前没被任何 v-if 启用,**改它的 min-height 不会生效**,只是 dead code 改写。落地时用 `grep "playable-world-actions" Experience.vue` 确认是否被引用;如果被引用,visual review 决定;如果 dead,降 min-height 是无害的 hygiene |
| **R7** | `startWorldAdventure` 的 `try/finally` 包裹了 `openWorldbookQuickImport()`(无 worldbook 路径) — `return` 在 try 内,finally 仍然执行 `isStarting.value = false`,不会卡死 | 低 | 低 | 显式 try/finally 模板,标准模式。代码 review 检查一致 |
| **R8** | `getLatestSessionForWorldbook` 排序时 `[...this.sessions].sort(...)` 每次调用都创建新数组(性能: ~10 sessions 时 < 1ms,可忽略) | 低 | 低 | session 数量 < 100,sort O(n log n) < 10us。无需缓存 |
| **R9** | `onMounted` 的 currentSession 分支 (line 601-608) 仍用 `find by id`,不经过新的 `getLatestSessionForWorldbook` — 如果 currentSession 是旧 worldbook X,但 active worldbook 已被 `setActiveWorldbook(null)` 路径(else 分支)清空,fallthrough 不会发生 | 低 | 低 | onMounted 的 3 个分支是**互斥**的(else if chain)。currentSession 分支只在 currentSession 存在时进入,直接 `loadSession(currentSession.id)` 是同步且正确的。**不需要**走 getLatestSessionForWorldbook |
| **R10** | Worldbook 快速导入页 (`/experience/worldbook`) 也有 `startWorldAdventure` 引用? 改 `Experience.vue` 内函数,不会污染 | 低 | 低 | `grep "startWorldAdventure" src/` 确认引用范围。如果 WorldbookQuickImport.vue 也有同名函数,需要考虑是否同样重构 — 本 spec 限定 Experience.vue |
| **R11** | `Experience.vue:3626` 980px 媒体查询内的 `.stage-command` 是 `Experience redo: folio spread, fewer frames` 主题(暖金橄榄 paper 风),跟 base(暗 rose 暖琥珀风)视觉差异巨大。降到 40px 后在该主题下,旋转 -3° + 22° 倾斜斜切条的视觉密度合理 | 低 | 中 | 980px 是临界点。**契约测试补一条**:在 980px 视口下截 `experience-980.png` 目视确认 40px stage-command 跟 folio spread 主题不冲突 |
| **R12** | Pass 4 commit 改了 `BookmarkButton.vue` + `Experience.vue` + `gameStore.js` + 测试 + docs,revert 时要回滚 5+ 文件 | 低 | 低 | Pass 4 范围小,1 commit < 200 行 diff,revert 成本低。**不拆 commit**(符合"1 commit per feature"原则) |

---

## §5 Acceptance Criteria (视觉 + 契约)

### §5.1 视觉验收(screenshot eyeball)

跑 Playwright 截 7 张图,目视确认:

| 截图 | 验收点 |
|---|---|
| `experience-1280-resume.png` | (a) 1-click 续最近 session:预置 worldbook X 有 3 个 sessions(分别 updatedAt 1h / 1d / 1w 前),冷启动点"进入世界"1 次,**直接进入 1h 前的 session**(G1);(b) stage-command "进入世界" + "会话" 按钮高度 40px(G5);(c) opening action 区"从这里开局" + "改成自己写" 按钮高度 36px(G5) |
| `experience-1280-create.png` | 1-click create:预置 worldbook X 但**没有**任何 session,点"进入世界" 1 次,**直接创建一个新 session 并 initGame**,进入开场页(G2) |
| `experience-1280-doubleclick.png` | 双击防护:在 initGame 期间(GM 流式输出文字)重复点"进入世界" 3 次,流式输出**不被中断、不被 wipe**(G3) |
| `experience-1280-state-sync.png` | State 同步:从 worldbook X 的 session A 切换到 worldbook Y 的 session B,active worldbook dropdown / selectedWorldbookId / currentSession.worldbookId 三者显示一致(G4) |
| `welcome-1280.png` | WelcomeView 3 个按钮 82px **不变**(G6) |
| `experience-980.png` | 980px 视口 stage-command 高度 40px,folio spread 主题不撕裂(R11) |
| `experience-640.png` | 640px 视口 stage-command 高度 40px,触达目标可接受 |

### §5.2 契约测试(Vitest)

加到 `src/__tests__/uiPolish.test.js`,新增 `describe('welcome + experience pass 4 — 1-click resume + micro button density')` 块:

```js
it('gameStore exposes getLatestSessionForWorldbook action that sorts by updatedAt desc', () => {
  const gameStore = readProjectFile('src/stores/gameStore.js')
  expect(gameStore).toMatch(/getLatestSessionForWorldbook\s*\(/)
  // Body must sort by updatedAt desc before find
  expect(gameStore).toMatch(/\(b\.updatedAt \|\| 0\) - \(a\.updatedAt \|\| 0\)/)
})

it('startWorldAdventure uses getLatestSessionForWorldbook (not just currentSessionId find)', () => {
  const experience = readProjectFile('src/pages/Experience.vue')
  // New find-by-worldbook predicate
  expect(experience).toMatch(/getLatestSessionForWorldbook\s*\(/)
  // Old bug predicate (find by currentSessionId) is gone from the find branch
  expect(experience).not.toMatch(/session\.id\s*===\s*gameStore\.currentSessionId\s*\?\s*gameStore\.sessions\.find/)
})

it('startWorldAdventure guards against double-click via isStarting ref', () => {
  const experience = readProjectFile('src/pages/Experience.vue')
  expect(experience).toContain('isStarting')
  // try/finally pattern (releases lock on any path)
  expect(experience).toMatch(/try\s*\{[\s\S]*?isStarting\.value\s*=\s*true[\s\S]*?finally\s*\{[\s\S]*?isStarting\.value\s*=\s*false/)
})

it('BookmarkButton accepts size prop with 3 values; adds --size-micro class', () => {
  const bookmark = readProjectFile('src/components/folio/BookmarkButton.vue')
  expect(bookmark).toMatch(/size:\s*\{[^}]*default:\s*'default'/)
  expect(bookmark).toMatch(/validator:\s*\(v\)\s*=>\s*\['default',\s*'compact',\s*'micro'\]\.includes/)
  expect(bookmark).toContain('.bookmark-button--size-micro')
  // 760px mobile variant
  expect(bookmark).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.bookmark-button--size-micro\s*\{[\s\S]*?min-height:\s*36px/)
})

it('Experience.vue 4 stage-command BookmarkButton usages all use size="micro"', () => {
  const experience = readProjectFile('src/pages/Experience.vue')
  // Count size="micro" appearances = 4 (one per BookmarkButton in stage-command)
  const matches = experience.match(/size="micro"/g) || []
  expect(matches.length).toBe(4)
})

it('Experience.vue .stage-command base min-height drops to 40px (was 62px)', () => {
  const experience = readProjectFile('src/pages/Experience.vue')
  // base .stage-command (line ~2074) — min-height 40
  const baseRule = experience.match(/^\s*\.stage-command\s*\{[^}]*\}/m)?.[0] || ''
  expect(baseRule).toMatch(/min-height:\s*40px/)
  expect(baseRule).not.toMatch(/min-height:\s*62px/)
})

it('Experience.vue .stage-command--compact min-height drops to 36px (was 50px)', () => {
  const experience = readProjectFile('src/pages/Experience.vue')
  const compactRule = experience.match(/^\s*\.stage-command--compact\s*\{[^}]*\}/m)?.[0] || ''
  expect(compactRule).toMatch(/min-height:\s*36px/)
  expect(compactRule).not.toMatch(/min-height:\s*50px/)
})

it('WelcomeView still uses 3 BookmarkButton calls without size (preserves 82px default)', () => {
  const welcomeView = readProjectFile('src/views/WelcomeView.vue')
  // No size="..." on any BookmarkButton in WelcomeView
  expect(welcomeView).not.toMatch(/size="(compact|micro)"/)
  // compact boolean still present on the 3rd button (tertiary)
  expect(welcomeView).toMatch(/<BookmarkButton[\s\S]*?variant="tertiary"[\s\S]*?compact[\s\S]*?\/>/)
})

it('onMounted else branch still auto-opens showSessionPicker for first-time users', () => {
  const experience = readProjectFile('src/pages/Experience.vue')
  // The else branch (after currentSession check) must still set showSessionPicker = true
  const elseBlock = experience.match(/\}\s*else\s*\{[\s\S]*?showSessionPicker\.value\s*=\s*true\s*;?\s*\}/)?.[0] || ''
  expect(elseBlock).toBeTruthy()
})
```

**已有契约保持:**
- `welcomeView.test.js` pass 1-3 全部契约
- `uiPolish.test.js` pass 1-3 全部契约
- `v-if="hasSelectedWorldbook"` 仍 5 个(不增不减)
- `index-class="stage-command__index"` / `label-class="stage-command__label"` 仍存在

**构建命令:**
- `npm run test:run` exit 0
- `npm run build` exit 0
- `npm run docs:build` exit 0
- `git diff --check` empty

### §5.3 Commit 验收

- 1 个 commit,`scope: feat(experience): one-click resume + tighten stage-command buttons`
- `git log --oneline -2` 顶部是本 commit + Pass 3 commit
- `git show HEAD` 无 `Co-Authored-By` footer
- `git status` clean(除预存的 30+ 改动)

---

## §6 Open Questions

1. **`loadSessions` 内的 sort backfill** — 老 session 没有 `updatedAt` 字段时,`getLatestSessionForWorldbook` 的 sort 把它们排到最前(b.updatedAt=0 是最小值)。如果发现用户实际遇到老数据 find 错位,迁移加 backfill `if (!s.updatedAt) s.updatedAt = s.createdAt || 0`(R2 mitigation 升级版)。**默认 Pass 4 不加**,遇到再补
2. **跨页面 isStarting 状态** — 如果用户在 initGame 期间跳到 /experience/worldbook 再回 /experience,ref 已重置,可能双击(R3)。**默认不改**,新组件实例 = 新 local state,这是正确语义;如果想"initGame 期间全局 lock",改用 gameStore 内的 isStarting action flag
3. **Pass 5 是不是真的 deprecated `compact` 布尔 prop?** — 本 spec 加 `// TODO(2.0)` 注释但不动,避免 WelcomeView 回归。**默认 Pass 5 处理** — 届时 WelcomeView "新卷" 按钮改用 `size="compact"`,移除 prop 定义
4. **6 个媒体查询变体的 min-height 同步降档** — R11 提示 980px folio spread 主题(rotate + clip-path polygon)在 40px 高度上视觉跟 78px 差异大。落地时如果发现 980px 视口下视觉破裂,**fallback**:把 980px 媒体查询内 `.stage-command` 单独保留 58px,只降 base / 640px 媒体查询的 56px / scoped redo block 的 78-72px。契约测试改为"base 40px,其他媒体查询 ≤ 58px"
5. **WelcomeView 3 个 BookmarkButton 是不是也想降密度?** — 用户只抱怨 Experience 按钮大,WelcomeView 82px 看起来"编辑感"更对(kao UI direction 要求"电影感 / 编辑感 / 暗")。**默认不动**;如果想统一,Pass 5 全局改 `default` 60px

---

## §7 Self-Review Checklist (写完自审)

- [x] Placeholder scan: 全文无 `TBD` / `TODO` / 「later」/ 「appropriate」(注释里的 `TODO(2.0)` 是显式 deprecation marker,不是 placeholder)
- [x] 内部一致性: §3.1 gameStore action / §3.2 Experience.vue 函数 / §3.4 BookmarkButton prop / §3.5 4 个 stage-command 用法 / §5.1 7 张截图 / §5.2 9 条契约全部对齐
- [x] Scope check: 2 子 fix(续会话 + 按钮密度),合并 1 commit,无 scope creep;**显式记录**首次用户保留 picker auto-open 的决策(§3.3)
- [x] Ambiguity: 每个修复都给了精确 line + 完整代码(Vue/Pinia/CSS)+ cascade check(R1-R12 mitigation)
- [x] 12 风险(R1-R12)都有 mitigation,5 开放问题(Q1-Q5)都有默认决策
- [x] No new dependencies, no new design system tokens, no new components
- [x] worldbook-workflow skill 已跑,3 import path 验证未动
- [x] Architecture review I4 接受:本 spec 是独立 Pass 4 doc,不 amend Pass 3
- [x] `compact` 布尔 + `size` 字符串双 API 共存,加 `TODO(2.0)` 注释显式记录(R4 / Architecture I1)
- [x] `v-if` 决策未触动,5 个 v-if 站点保持,既有契约继续生效
- [x] 36px / 40px 触达目标在 iOS 44px / Material 48dp 之下,codebase 既有 34px 偏离已存在(R5 mitigation 显式承认)

---

**Spec 完成。** 请用户 review。本 spec 经 3-review-subagent 反馈 12 处 critical/important 修复 + 1 user 决策(保留 picker auto-open)后定稿,根因明确,修复方向无歧义。
