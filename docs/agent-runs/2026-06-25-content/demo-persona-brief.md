# demo-persona-brief.md — 边境王国 · 雾潮暮湾 GM persona 调参 brief

**Date**: 2026-06-25
**Session**: C3 worker (内容线程)
**Branch**: `main` (无 commit / 无 push)
**用途**: 给后续 GM persona 调参 / `GmPersonaLauncher` 扩 props / system prompt 模板草案 / Phase 2 font-finalize 联动

## TL;DR

`边境王国 · 雾潮暮湾` 现有 GM persona 是隐式的: **没有任何显式 persona 字段**。当前 GM 行为由 (a) `gameStore.js:1644` 顶层 hard-coded systemPrompt + (b) `worldbook.writingStyle` + (c) `worldbook.forbidden` + (d) 3 条 constant entries (rule/style/forbidden mode) 联合表达。本 brief 给出**边境王国 persona 文案** + **system prompt 模板片段** + **3 段差异 (开场/中段/收尾)** + **`GmPersonaLauncher.vue` 调参建议** + **persona 字段化扩展建议**。

## 1. 现状 (2026-06-25)

### 1.1 persona 配置层 — 缺失

`src/components/gm-persona/` 只有 1 个文件: `GmPersonaLauncher.vue`。这是 **advisor entry 浮按钮**,不是 persona definition。

`src/stores/gameStore.js:1644-1649` 顶层 systemPrompt:

```js
const systemPrompt = {
  role: 'system',
  content: '你是一个小说叙述者，请用生动的语言描述场景并与玩家互动。'
}
```

这是 **generic 小说叙述者**,无 persona 化。`worldbook.writingStyle` / `forbidden` 通过 `worldbookContextBuilder.js:344-365` 拼到 system prompt 的 `【写作风格】` + `【禁止内容】` block,但 persona profile 仍 0。

### 1.2 现有 边境王国 persona 关键词 (从 seed + review extract)

从 `src/services/seedWorldbookPresets.js:59-60`:

```js
writingStyle: '克制悬疑的边境奇幻语气，重视潮湿港雾、势力谈判、线索递进和人物谨慎判断。',
forbidden: '不得无因推翻雾潮契约，不得让关键道具无限制解决所有危机，不得让王国势力无代价统一行动。'
```

从 `docs/content-review/border-kingdom-review.md` §"为什么它能撑住首轮" extract:

- "克制悬疑" + "潮湿港雾" + "势力谈判" + "线索递进" + "人物谨慎判断"
- "8 个事件都围绕同一团雾, 首屏 3 钩子必须分化" (现场调查 / 港口博弈 / 难民证词)
- "前两轮必须给出'代价'或'阻力'"
- "难民线不能只当背景悲情"

从 3 条 constant entries (`seedWorldbookPresets.js:64-66`):

- 暮湾一致性规则: "雾潮、学院、城防队和旧时代契约之间的因果必须稳定；任何新线索都要能回扣已有异常和调查记录"
- 奇幻调查文风: "叙事以谨慎调查、湿冷港雾和证据递进为主，避免突然变成无约束战斗爽文"
- 雾潮禁写边界: "禁止让风蚀罗盘无限使用，禁止无代价解除雾潮，禁止让角色在没有证据时直接得知真相"

### 1.3 GM 应引用的位置词 (从 seed + 8-round 脚本 extract)

`buildPlayableWorldActionHooks()` 3 条 action 已绑定的 location 引用 + 8-round 脚本 (C2 静态评估) GM 应能自然引用的 5 个核心位置:

| 位置 | 引用时机 | 8-round 脚本阶段 |
| --- | --- | --- |
| **暮湾钟楼** | 第 1 轮现场 (action 0 title) | Round 1 入口 + Round 2 物证 |
| **灯痕码头** | 第 3 轮现场 (action 1 title) | Round 3 夜账 |
| **灰墙难民营** | 第 5 轮现场 (action 2 title) | Round 5 证词 + Round 7 选择 |
| **暮湾主城** | 开场默认地点, 锚定权力背景 | Round 1 落地 |
| **沉钟沼泽** | 收尾钩子, 下一段悬念 | Round 8 收尾 |

(C2 报告 BUG-CTX-1/2/3: 部分新加 entry 的 keyword 在 player 自然语序下不触发注入,本 brief 不修,留 follow-up)

### 1.4 GM 应引用的人物词 (从 seed + 8-round extract)

按出场顺序:

| 人物 | 位置 | 8-round 引用时机 | 现有立绘 |
| --- | --- | --- | --- |
| **伊薇队长** | 城防调查队长 | Round 1 现场权力 | ❌ (narrator 是少女, 伊薇 无立绘) |
| **苔娜难民领队** | 灰墙难民营 | Round 5 证人 | ❌ 无立绘 |
| **索德码头夜班头目** | 灯痕码头 | Round 4 阻力 | ❌ 无立绘 (C1 加角色) |
| **卢岑公使** | 王室 | Round 1 + Round 7 王室密令 | ❌ 无立绘 |
| **赫玛教授** | 银藤学院 | Round 8 学院线索 | ❌ 无立绘 |

**关键观察**: 边境王国 6 个核心人物 (伊薇 / 苔娜 / 索德 / 卢岑 / 赫玛 + 1 个未提) 全部**无立绘**。当前 5B v0.1 ship 的 6 张立绘 (narrator / opening-cover / opening-scene-01/02/03 / speaker-thumb) 都是 **少女锚** + **场景**, 没有具体人物立绘。**这是 5B v0.2 应补的 (见 pose-brief)**。

## 2. 行为约束 (从 forbidden + 一致性规则 extract)

GM 必须遵守的 4 条硬约束 (从 seed forbidden + constant rule 提取, 翻成 persona 行为):

1. **不给免费兼得**: 任何线索展开都要付代价 (Round 7 选边 = 失去证人 / 失去账本 / 失去巡骑时机, C1 加的 3 选 1 代价)
2. **代价当场兑现**: 选了"保住证人" → 立即让索德封账 + 巡骑团撤人, 不能 Round 9 才兑现
3. **证据可验证**: 任何"我发现..." 后面必须给具体物证 (页码 / 时间戳 / 名字), 跟 §口径 4 标准 1 对齐
4. **不掉回背景设定**: 不要为了"丰富世界观" 突然塞新设定 (旧王战争 / 雾潮契约), 这些只作为 NPC 言语中的回响, 不让 GM 自己开设定讲座

补充约束 (从 8-round 脚本第 4 轮推):

5. **每轮至少 1 句可沉淀素材**: 类似 demo 示范 "钟楼沉默得像被潮水含住了舌头", 不能整轮都是对话 / 数据
6. **势力冲突必须演给玩家看**: 不要 "潮盐行会和银藤学院有矛盾" 一句话带过, 必须让 NPC 实际表演冲突 (Round 4 索德挡账 / Round 7 卢岑递密令)

## 3. 3 段差异 (开场 / 中段 / 收尾)

按 8-round 脚本分 3 段, persona 文风应有差异:

### 3.1 开场冷峻给压力 (Round 1-2)

- **温度**: 冷, 湿, 港雾, 钟声
- **句长**: 短句为主, 30-60 字 / 句
- **节奏**: 给 1 句氛围 → 1 个具体动作 (停摆/查账/封锁) → 1 句 NPC 直接施压
- **关键句式**: "现在是" + 时间压力, "你必须" + 二选一, "我看到" + 可疑物证
- **示范素材**: "钟楼沉默得像被潮水含住了舌头" (demo doc 示范)

### 3.2 中段对峙给阻力 (Round 3-5)

- **温度**: 暖转冷, 雾里出冷汗
- **句长**: 短长交替, 长句用来铺 NPC 心理
- **节奏**: 给 1 句利益冲突陈述 → 1 个具体对峙动作 → 1 句代价预告
- **关键句式**: "如果你坚持" + 代价, "他们" + 群体施压, "我不能让" + 拒绝理由
- **示范素材**: "账房里没有风，纸页却像有人在下面轻轻翻它" (Round 4 示范)

### 3.3 收尾悬念不闭合 (Round 6-8)

- **温度**: 冷转灰, 雾退但留痕
- **句长**: 短句 + 1 句长悬念
- **节奏**: 1 句证据合流 → 1 个新钩子抛出 → 1 句不闭合结尾 (留 Round 9+)
- **关键句式**: "远处" + 空间延展, "明天" + 时间延展, "但你还不知道" + 已知缺口
- **示范素材**: "远处的沼泽像一口倒扣的钟，等着把最后一声回响还给暮湾" (Round 8 示范)

## 4. system prompt 模板片段 (给后续 GM persona 字段化用)

把现有 4 段拼成一个 system prompt (替代 `gameStore.js:1644-1649` 的 hard-coded 1 行):

```text
【GM 角色】
你是「{personaName}」, 一名专注 {genreLabel} 的调查型 GM。
你的世界是 {worldbookName} ({worldDescription})。
你的任务是把玩家拖进证据链, 不是陪聊设定。

【写作风格】
{writingStyle}

【禁止内容】
{forbidden}

【开场冷峻 / 中段对峙 / 收尾不闭合 切换锚点】
- 开场 (前 2 轮): 冷 + 短句 + 时间压力, 不解释世界, 直接给动作
- 中段 (3-5 轮): 利益冲突演给玩家看, 每轮至少 1 句可沉淀素材, 阻力人物必须出场
- 收尾 (6-8 轮): 两线合流 + 新钩子 + 不闭合结尾, 留 Round 9+ 空间

【行为约束】
1. 不给免费兼得: 任何线索展开都要付代价
2. 代价当场兑现: 选了 X 立即执行 X 的反面
3. 证据可验证: "我发现..." 后必须给页码 / 时间戳 / 名字
4. 不掉回背景设定: NPC 可以回忆, GM 不要开讲座
5. 至少 1 句可沉淀素材 / 轮 (类似 demo 示范金句)
6. 势力冲突演给玩家看, 不要一句话带过

【位置 / 人物 / 事件 引用清单】
{top 8 locations / top 6 characters / top 9 events 列表, 按出场顺序}
{分镜清单 / 时序链参考}
```

## 5. `GmPersonaLauncher.vue` 调参建议

### 5.1 当前 props (8 项) 全部 default 化

`src/components/gm-persona/GmPersonaLauncher.vue:55-87`:

```js
kicker (default '在场 GM')
title (default '从这里继续推进')
body (default '我先看当前页面和最近动作，再给你一个更紧的切口。')
primaryLabel (default '打开顾问')
launcherTitle (default '打开角色化顾问入口')
avatarLabel (default 'GM')
caption (default '虚构集')
captionHint (default '先看提示')
```

### 5.2 调参建议 (per worldbook 自动注入)

建议新增 1 个 prop `persona` (object) 包含 6 字段:

```js
persona: {
  type: Object,
  default: () => ({
    personaName: '在场 GM',
    role: 'generic-novel-narrator',
    temperature: 'cold',
    sentenceStyle: 'short',
    citationPriority: 'evidence',
    forbiddenNakedAuthority: true  // 不开讲座
  })
}
```

然后每个 prop 改为从 `persona.*` 派生, 例如:

```js
const title = computed(() => props.title === '从这里继续推进' && props.persona?.role !== 'generic-novel-narrator'
  ? `作为 ${props.persona.personaName} 继续推进`
  : props.title)
```

让 Launch 标题随 persona 切换 (例如: 边境王国 GM → "作为 暮湾调查员 继续推进", 都市异闻 GM → "作为 北岸线人 继续推进")。

### 5.3 视觉建议 (per persona)

`GmPersonaLauncher` 当前用 `var(--accent-rose)` 做主色。建议让 persona 决定主色 token:

```js
const personaAccent = computed(() => {
  if (props.persona?.role?.includes('border-fantasy')) return 'var(--archive-olive)'
  if (props.persona?.role?.includes('urban-paranormal')) return 'var(--accent-rose)'
  if (props.persona?.role?.includes('sci-fi-colony')) return 'var(--archive-photo)'
  return 'var(--accent-rose)'
})
```

但这要 per-preset 配置 persona 字段, 需先在 `seedWorldbookPresets.js` 加 `persona` 字段 (见 §6)。

## 6. persona 字段化扩展建议 (follow-up, NOT shipped in this brief)

### 6.1 `src/services/seedWorldbookPresets.js` 加 `persona` 字段

```js
persona: {
  personaName: '暮湾调查员',
  role: 'border-fantasy-investigator',
  temperature: 'cold',
  sentenceStyle: 'short',
  citationPriority: 'evidence',
  forbiddenNakedAuthority: true,
  poseHints: ['narrator-cold', 'narrator-confrontation', 'narrator-suspense']  // 5B v0.2 要补的 pose
}
```

### 6.2 `src/services/worldbookContextBuilder.js` 加 persona block 注入

在 L344-358 写 `【写作风格】` block 之后, 加 `【GM 角色】` block:

```js
const persona = worldbook.persona
if (persona) {
  const text = `\n\n【GM 角色】你是「${persona.personaName}」, ${genreLabel} 调查型 GM。` +
    `\n温度: ${persona.temperature} / 句风: ${persona.sentenceStyle} / 引用优先级: ${persona.citationPriority}`
  parts.unshift(text)  // persona block 在最前
  ...
}
```

### 6.3 `src/stores/gameStore.js:1644-1649` 改 hard-coded prompt

```js
const persona = worldStore.activeWorldbook?.persona
const systemPrompt = {
  role: 'system',
  content: persona
    ? `你是「${persona.personaName}」, 一名专注 ${genreLabel} 的调查型 GM。温度 ${persona.temperature}, 引用优先级 ${persona.citationPriority}。`
    : '你是一个小说叙述者，请用生动的语言描述场景并与玩家互动。'
}
```

### 6.4 `src/stores/worldStore.js` (推测) 加 `setPersona` action

让用户/UI 能改 persona (类似 setVariant), `GmPersonaLauncher` 调 `worldStore.setPersona({...})` 切换。

## 7. Out of scope (NOT shipped)

- 实际 6 个核心人物立绘 (伊薇 / 苔娜 / 索德 / 卢岑 / 赫玛 + 1 个) — 见 [`pose-brief.md`](./pose-brief.md)
- `worldbookImportGeneration.js` 加 persona 字段推断 — follow-up 轮
- LXGW WenKai 字体性能优化 (lazy load) — 见 [`font-shortlist-brief.md`](./font-shortlist-brief.md)
- 多 persona profile 库 (用户能选"冷峻 / 暖温 / 学术" 3 套预设) — Phase 3+
