# 01 - 小说体验模块详细规划

> 本模块是框架的核心场景，定位为"类酒馆但导向写作辅助"的体验工具。

## 1.1 核心定位

### 与酒馆的关键差异

| 维度 | 酒馆 (SillyTavern) | 本模块 |
|------|-------------------|--------|
| **输出目标** | 娱乐对话 | 可沉淀到写作的叙事片段 |
| **叙事方式** | 第一人称对话为主 | 第三人称叙事 + 第一人称对话混合 |
| **界面风格** | 功能常驻（背包/任务等始终可见） | 平时简洁，事件触发才显示机制 |
| **世界书** | AI 角色设定 | 写作参考，可导出到编辑器 |
| **扮演功能** | AI 扮演角色与用户对话 | 用户可扮演角色，也可旁观 |

### 事件驱动设计原则

**机制存在但平时隐藏，叙事触发时才显示对应面板。**

```
正常状态 ──► 叙事触发关键词 ──► 显示选项按钮
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              战斗面板          交易面板         任务面板
              攻击/防御         物品/金币        描述/目标
                    │                │                │
                    └────────────────┴────────────────┘
                                     │
                                     ▼
                              完成后自动隐藏
```

## 1.2 世界书系统

### 数据结构

```typescript
// 世界书
interface WorldBook {
  id: string
  name: string
  description: string
  author: string
  version: string
  createdAt: number
  updatedAt: number
  settings: WorldBookSettings
  entries: WorldEntry[]
}

// 世界书设置
interface WorldBookSettings {
  scanDepth: number        // 关键词扫描深度，默认 3
  tokenBudget: number      // Token 预算，默认 4096
  recursiveScanning: boolean // 递归扫描，默认 true
}

// 世界条目
interface WorldEntry {
  id: string
  keys: string[]           // 主关键词（触发用）
  keysSecondary: string[]  // 次要关键词
  content: string          // 条目核心内容
  name: string             // 条目名称（显示用）
  type: EntryType          // 条目类型
  injection: InjectionConfig
  relations: EntryRelations
  metadata: EntryMetadata
}

// 条目类型
type EntryType =
  | 'location'   // 地点
  | 'character'  // 角色
  | 'item'       // 物品
  | 'lore'       // 世界观/lore
  | 'quest'      // 任务
  | 'event'      // 事件
  | 'general'    // 一般

// 注入配置
interface InjectionConfig {
  mode: 'selective' | 'constant' | 'group'
  probability: number    // 触发概率 0-100
  cooldown: number        // 冷却时间（轮次）
  depth: number           // 递归深度
  excludeRecursion: boolean // 排除递归
  group: string | null   // 分组名称
}

// 关系映射
interface EntryRelations {
  tags: string[]
  locations: string[]    // 关联的地点 ID
  characters: string[]    // 关联的角色 ID
  events: string[]       // 关联的事件 ID
}

// 元数据
interface EntryMetadata {
  createdAt: number
  updatedAt: number
  importSource: string    // 'sillytavern' | 'novel-ai' | 'manual'
}
```

### 与 SillyTavern 字段映射

| SillyTavern 字段 | 本模块字段 | 说明 |
|-----------------|-----------|------|
| `entries.{id}.key` | `keys[0]` | 兼容单 key 场景 |
| `entries.{id}.keysecondary` | `keysSecondary[]` | 次要关键词数组 |
| `entries.{id}.content` | `content` | 条目内容 |
| `entries.{id}.comment` | `name` | 映射到 name |
| `entries.{id}.selective` | `injection.mode='selective'` | 布尔转枚举 |
| `entries.{id}.constant` | `injection.mode='constant'` | 布尔转枚举 |
| `entries.{id}.group` | `injection.group` | 分组 |
| `entries.{id}.depth` | `injection.depth` | 递归深度 |
| `entries.{id}.probability` | `injection.probability` | 触发概率 |
| `entries.{id}.cooldown` | `injection.cooldown` | 冷却时间 |
| `entries.{id}.excludeRecursion` | `injection.excludeRecursion` | 排除递归 |

### 存储设计

| localStorage Key | 内容 | 大小估计 |
|-----------------|------|---------|
| `worldbooks_index` | 世界书元数据列表 | ~1KB/世界书 |
| `worldbook_{id}` | 单个世界书完整数据 | ~100KB-1MB |
| `experience_state` | 当前体验状态 | ~5KB |

**存储策略：**
- `worldbooks_index` 只存元数据（id、name、entryCount）
- 按需加载：读取世界书时只加载索引，需要详情才加载完整数据
- 大型世界书（>500 条目）考虑 IndexedDB

## 1.3 导入流程

### SillyTavern 导入（优先级 P0）

**流程：**
```
1. 用户上传 .json 文件（或拖拽）
2. 解析 SillyTavern JSON 结构
3. 字段映射（SillyTavern → 内部格式）
4. 显示预览：
   - 条目数量
   - 类型分布（饼图）
   - 关键词统计
5. 用户确认
6. 写入 localStorage
7. 跳转世界书详情页
```

**预览数据结构：**
```typescript
interface ImportPreview {
  worldbookName: string
  entryCount: number
  typeDistribution: Record<EntryType, number>
  topKeywords: string[]
  duplicateKeys: string[]   // 重复关键词警告
}
```

**同名冲突策略（必须显式选择）：**
- `rename`：自动重命名后新建（保留原数据）
- `samedir`：保持同名直接新建（允许并行同名）
- `overwrite`：覆盖同名世界书（高风险，需二次确认）

### 小说文本 AI 导入（优先级 P1）

**流程：**
```
1. 用户上传 TXT/MD 文件或粘贴文本
2. 自动分段（按章节或固定长度 2000 字）
3. 对每段调用 AI 提取实体：
   - 地点 → 创建 location 条目
   - 角色 → 创建 character 条目 + 角色卡
   - 物品/道具 → 创建 item 条目
   - 重要事件 → 创建 event 条目
   - Lore/设定 → 创建 lore 条目
4. 生成关系映射（角色-地点、事件-角色等）
5. 用户预览
6. 确认后正式导入
7. 导入后可编辑补充
```

**AI 提取提示词：**
```python
{
  "role": "system",
  "content": """
你是一位小说分析师，擅长从文本中提取世界设定。
请从给定文本中提取：
1. 地点（场所、建筑、自然景观）
2. 角色（人物名称、身份、性格标签）
3. 物品（重要道具、武器、道具）
4. 事件（重要剧情、转折点）
5. Lore（世界观设定、历史、规则）

输出格式为 JSON：
{
  "locations": [{"name": "地点名", "keys": ["关键词"], "content": "描述"}],
  "characters": [{"name": "角色名", "keys": ["关键词"], "personality": ["性格"], "content": "描述"}],
  "items": [...],
  "events": [...],
  "lore": [...]
}
"""
}
```

### AI 生成草案（优先级 P1）

**流程：**
```
1. 用户输入至少 8 字说明（世界观、核心冲突、角色关系）
2. 选择风格（玄幻/都市/科幻/奇幻）和目标条目数（10/20/50）
3. AI 生成条目预览
4. 用户检查条目命名、关键词、分组
5. 确认导入
```

## 1.4 体验主界面

### 界面布局

```
┌────────────────────────────────────────────────────────────────┐
│ [小说体验 ▼]  世界书: Adolion Fantasy ▼   [AI: ON]  [⚙️]     │
├──────────┬─────────────────────────────────────────────────────┤
│          │                                                     │
│  角色     │   叙事输出区域                                       │
│  ┌────┐ │   ┌─────────────────────────────────────────────┐   │
│  │头像│ │   │                                             │   │
│  └────┘ │   │ 暮色降临，埃利奥诺公爵领的主城大门缓缓关闭。│   │
│  艾伦    │   │ 艾伦站在城墙上，望着远方黑压压的森林，      │   │
│          │   │ 心中隐隐不安...                             │   │
│  位置     │   │                                             │   │
│  埃利城    │   │ *翻越城墙*                                 │   │
│          │   │ "站住！"守兵喝道。                         │   │
│  最近活动 │   └─────────────────────────────────────────────┘   │
│  ·发现密道│                                                  │
│  ·公爵密函│   ┌─────────────────────────────────────────────┐   │
│          │   │ > 翻越城墙进入城内                         │   │
│  [收起]   │   └─────────────────────────────────────────────┘   │
├──────────┴─────────────────────────────────────────────────────┤
│ [场景] [对话] [心理] [继续]                      Token: 2048/4096 │
└────────────────────────────────────────────────────────────────┘
```

### 侧边栏状态管理

| 状态 | 数据来源 | 存储位置 |
|------|---------|---------|
| 当前角色 | 用户选择或 AI 叙事推断 | `experience_state.characterId` |
| 当前位置 | AI 叙事中的地点关键词匹配 | `experience_state.locationId` |
| 最近活动 | 记录用户动作和 AI 响应 | `experience_state.activities` |
| 心情数值 | 用户输入或 AI 叙事更新 | `experience_state.mood` |

## 1.5 状态推进与叙事渲染分离机制

> 核心设计原则：**硬性状态更新（时间推进、地图切换、活动记录）由前端/后端逻辑执行，大模型仅负责将这些已确定的"既定事实"翻译为感官叙事。**

### 1.5.1 机制概述

传统酒馆架构中，大模型往往"兼职"处理状态变更——这导致 AI 可能擅自篡改时间、否认已发生的事件，或将角色移动到不该去的地方。本框架引入**状态引擎（State Engine）**与**叙事引擎（Narrative Engine）**的严格分离。

```
┌──────────────────────────────────────────────────────────────────────┐
│                         用户输入                                      │
│                  "离开酒馆，前往幽暗森林"                              │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      状态引擎（State Engine）                          │
│   前端 Store / 后端逻辑执行，职责：                                    │
│   1. 解析用户意图，判定目标地点、时间推进量                             │
│   2. 更新 worldMapState.location → "幽暗森林"                         │
│   3. 更新 writingTime → 从下午变为黄昏                                │
│   4. activities prepend → "启程前往幽暗森林"                         │
│   5. 评估是否触发双轨制 UI 反馈（如：首次进入新场景，唤起弹窗）         │
│   6. 持久化到 localStorage                                          │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        双轨制 UI 反馈判定                              │
│   - 侧边栏组件（StatusBar, WorldMap, QuestLog）静默更新               │
│   - 检测到新场景解锁 → 唤起全屏视觉 Modal 弹窗：“【场景解锁】幽暗森林”   │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                ▼

┌──────────────────────────────────────────────────────────────────────┐
│                        既定事实（Fact）                               │
│   [时间] 黄昏                                                         │
│   [地点] 幽暗森林                                                     │
│   [重要活动] 启程前往幽暗森林                                           │
│   [心境] 70%（愉悦）                                                  │
│   [同行角色] 玛丽亚                                                    │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       叙事引擎（Narrative Engine）                     │
│   大模型接收"既定事实"，职责：                                        │
│   - 仅将这些变化翻译为画面感强的叙事文本                               │
│   - 严格遵循既定事实，不得擅自更改时间/地点/已发生活动                  │
│   - 用文学化的语言描绘场景转换时的感官体验                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.5.2 状态引擎职责边界

状态引擎负责以下**确定性更新**，绝不委托给大模型：

| 状态类型 | 更新逻辑 | 存储位置 |
|---------|---------|---------|
| **地图状态** | 根据用户目的地关键词匹配 worldMap，更新 currentCountry/City/Scene | `experience_state.worldMapState` |
| **时间状态** | 根据行动类型推进时间（离开酒馆→+2小时，穿越森林→+1天） | `experience_state.writingTime` |
| **重要活动** | append 到 activities 数组，记录 title/type/date | `experience_state.activities` |
| **心境状态** | 根据行动结果调整 mood（战斗失败-20，任务完成+15） | `experience_state.writingCharacter.mood` |
| **已发现地点** | 首次进入新地点时 add 到 discoveredPlaces | `experience_state.discoveredPlaces` |
| **NPC 关系** | 根据对话/行动结果更新 npcRelations | `experience_state.npcRelations` |


1.5.3 双轨制 UI 反馈机制 (Dual-Track UI Feedback)
为了避免静默刷新导致的叙事脱节，状态引擎在更新数据后，会评估状态变更的”剧烈程度”，采用不同的 UI 反馈路径：

```
状态更新完毕 ──► 评估变更权重
                      │
        ┌─────────────┴─────────────┐
        ▼ 低权重                    ▼ 高权重（里程碑事件）
  【静默更新轨道】              【主动弹窗轨道】
  侧边栏数据静默刷新              唤起全屏/卡片式 Modal 弹窗
  (时间流逝、心境小幅波动)        (大地图切换、跨年、角色登场、关键活动)
```

**常态静默更新 (Sidebar-only)：**
适用于常规变化。例如：时间微调、心境微弱波动、非核心道具变动。表现：侧边栏 StatusBar 或 QuestLog 产生轻微的数值和文本变动，主界面不中断。

**主动弹窗通知 (Modal / Toast)：**
适用于写作中的”里程碑事件”：
- 大地图切换 (Location Unlock)：当 `worldMapState.currentScene` 变更为未探索地点时，触发场景解锁弹窗
- 时间重大跃迁 (Timeskip)：当时间跨度产生”天/月/年”跃迁时，弹出时间流逝过渡动画
- 重要角色登场 (Character Appearance)：当新角色 `isActive === true` 时，弹出角色卡片亮相弹窗
- 重大进展达成 (Milestone Event)：当活动 `importance >= 8` 时，弹出大事件记录卡片


### 1.5.4 状态反馈与时序流程

以用户输入”离开酒馆前往幽暗森林”为例，展示状态判定、双轨制 UI 反馈和叙事渲染的时序：

```
│ 步骤 1：状态引擎处理（确定性状态更新）                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   // 1. 更新地图与时间                                                  │
│   state.worldMapState.currentScene = '幽暗森林'                         │
│   state.writingTime.period = '黄昏'                                     │
│                                                                         │
│   // 2. 写入活动记录                                                    │
│   state.activities.unshift({                                            │
│     id: 'act_01',                                                       │
│     title: '启程前往幽暗森林',                                           │
│     type: 'movement',                                                   │
│     importance: 8                                                       │
│   })                                                                    │
│                                                                         │
│   // 3. 评估 UI 反馈（检测到新场景解锁且活动重要度为 8）                 │
│   state.uiFeedback = {                                                  │
│     type: 'modal',                                                      │
│     effect: 'location-unlock',                                          │
│     title: '【场景解锁】幽暗森林',                                       │
│     targetEntityId: 'loc_forest'                                        │
│   }                                                                     │
│                                                                         │
│   localStorage.setItem('experience_state', JSON.stringify(state))       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 2：UI 渲染与主动弹窗                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   - 侧边栏：StatusBar 显示"黄昏"；WorldMap 显示"幽暗森林"                  │
│   - 主页面：检测到 uiFeedback.type === 'modal'                          │
│   - 触发弹出：全屏新地点解锁弹窗，展示世界书中关于“幽暗森林”的冷酷环境介绍     │
│   - 用户点击弹窗内的“深入探索”，弹窗收起，继续主线叙事                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 3：构建既定事实上下文并注入叙事引擎                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   拼装成不可篡改的 Fact 块：                                             │
│   ```                                                                    │
│   【既定事实】                                                           │
│   时间：黄昏                                                             │
│   地点：幽暗森林                                                         │
│   最新活动：已启程前往幽暗森林                                           │
│   ```                                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 步骤 4：大模型进行叙事渲染                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   大模型基于 Fact 输出：                                                 │
│   *艾伦与玛丽亚踏入幽暗森林的边缘，枯黄的树枝在黄昏暮色中投下扭曲的阴影。*  │
│   "小心脚下，"玛丽亚提醒道，"这里的泥土有些湿滑。"                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘


### 1.5.8 完整时序流程

以下以用户输入"**离开酒馆前往幽暗森林**"为例，完整时序流程：

```
步骤 1：用户输入解析
  用户输入："离开酒馆前往幽暗森林"
  状态引擎解析：
    - 意图识别：travel（地点切换）
    - 目标地点：从 worldMap 中匹配关键词 "幽暗森林"
    - 时间消耗：根据距离查表（如 forest = +4 小时）
    - 特殊标记：穿越森林 可能触发随机遭遇

步骤 2：状态更新（确定性写入）
  // 1. 地图状态更新
  experience_state.worldMapState = {
    currentCountry: '埃利奥诺公国',
    currentCity: '边陲镇',
    currentScene: '幽暗森林'   // ✅ 已确定
  }

  // 2. 时间状态更新（从下午推进到黄昏）
  experience_state.writingTime = {
    eraId: 'gregorian', eraName: '公元',
    year: 1047, month: 9, day: 23,
    period: '黄昏'             // ✅ 已确定
  }

  // 3. 重要活动追加
  experience_state.activities = [{
    id: uuid(),
    title: '启程前往幽暗森林', // ✅ 已确定
    type: 'movement',
    date: '1047-09-23黄昏',
    location: '幽暗森林',
    createdAt: Date.now()
  }, ...previousActivities]

  // 4. 持久化
  localStorage.setItem('experience_state', JSON.stringify(state))
  // → UI 立即更新（侧边栏 WorldMap 显示"幽暗森林"）

步骤 3：构建既定事实上下文
  【既定事实 - 必须严格遵循】
  时间：公元1047年9月23日 黄昏
  地点：幽暗森林（从边陲镇酒馆出发，穿越小路抵达）
  重要活动：启程前往幽暗森林
  心境：70%（愉悦），略有紧张
  天气：阴沉，远处有雷声

步骤 4：大模型叙事渲染
  系统提示词约束：
    - 时间必须是黄昏，不得自行更改
    - 地点必须切换至幽暗森林，不得否认或回退
    - "启程前往幽暗森林"已发生，不可否认
    - 绝对不得在叙事中更改时间/地点/否认已发生事件

  大模型输出示例：
    黄昏的余晖如血般倾洒在小径尽头。艾伦与玛丽亚踏入幽暗森林的边界，
    空气中弥漫着潮湿的腐叶气息，远处传来不明的鸟鸣。
    头顶的枝叶交错如网，将最后一缕日光切割成斑驳的碎片。
    "这条路……我们真的没走错？"玛丽亚压低声音问道。
    *艾伦没有回答，只是将手按在剑柄上，脚步不停地向前迈去。*
```

### 1.5.9 与现有组件的对应关系

状态引擎的状态变更直接驱动以下组件更新：

| 组件 | 读取状态 | 显示内容 |
|------|---------|---------|
| **StatusBar** | `writingCharacter` + `writingTime` | 当前角色/心境数值/时间 |
| **WorldMap** | `worldMapState.currentScene` | 当前位置（幽暗森林） |
| **Inventory** | `worldMapState` | 场景信息（实际管理地图状态） |
| **QuestLog** | `activities[]` | 重要活动列表（最新5条） |

```
状态引擎更新 ──► experience_state 写入
       │
       ├─► StatusBar.watch('writingTime') ──► 时间显示更新
       │
       ├─► StatusBar.watch('writingCharacter.mood') ──► 心境进度条更新
       │
       ├─► WorldMap.watch('currentScene') ──► 地图位置更新
       │
       ├─► Inventory.watch('worldMapState') ──► 场景信息更新
       │
       └─► QuestLog.watch('activities') ──► 活动记录追加
```

### 1.5.10 状态更新触发规则

状态引擎根据用户输入的**意图类型**自动决定更新策略：

| 意图类型 | 触发条件 | 状态更新 |
|---------|---------|---------|
| `travel` | 输入包含目的地关键词 | `worldMapState` + `writingTime` + `activities` |
| `dialogue` | 输入包含"说话"、"询问"等词 | `activities`（记录对话） |
| `combat` | 输入包含"攻击"、"战斗"等词 | `activities` + 触发 CombatPanel |
| `trade` | 输入包含"购买"、"卖"等词 | `activities` + 触发 TradePanel |
| `rest` | 输入包含"休息"、"睡觉"等词 | `writingTime`（推进到下一时段）+ `mood` 恢复 |
| `explore` | 输入包含"搜索"、"探索"等词 | `activities` + 随机事件判定 |

### 1.5.11 状态引擎数据结构

```typescript
// src/stores/experienceStore.js（新）

interface ExperienceState {
  // 地图状态（WorldMap 组件）
  worldMapState: {
    currentCountry: string
    currentCity: string
    currentScene: string    // 当前场景名
    discoveredScenes: string[]  // 已发现场景
  }

  // 时间状态（StatusBar 组件）
  writingTime: {
    eraId: string           // 'gregorian' | 'custom'
    eraName: string
    year: number
    month: number
    day: number
    period: string         // '早晨' | '上午' | '中午' | '下午' | '黄昏' | '夜晚' | '深夜'
  }

  // 角色状态（StatusBar 组件）
  writingCharacter: {
    name: string
    mood: number            // 0-100
    traits: string[]
  }

  // 重要活动（QuestLog 组件）
  activities: Activity[]

  // NPC 关系
  npcRelations: Record<string, number>  // npcId -> 好感度

  // 已发现地点
  discoveredPlaces: string[]
}

// 活动记录
interface Activity {
  id: string
  title: string
  type: 'movement' | 'dialogue' | 'combat' | 'discovery' | 'decision' | 'milestone'
  date: string              // 格式：'1047-09-23黄昏'
  location: string
  createdAt: number
}
```

### 1.5.12 提示词强制约束

在系统提示词中明确大模型的**行为边界**：

```python
NARRATIVE_CONSTRAINT_PROMPT = """
【硬性约束 - 违反将导致输出被拒绝】
1. 你绝对不得更改既定时间。当前时间是 {current_period}，不得在叙事中写"清晨"、"深夜"等其他时间词汇。
2. 你绝对不得更改既定地点。当前地点是 {current_scene}，不得在叙事中写"回到酒馆"、"离开森林"等矛盾描述。
3. 你绝对不得否认已发生的活动。"{latest_activity}" 已记录为重要活动，必须在叙事中体现或自然衔接。
4. 你只能描述感官体验（视觉、听觉、嗅觉、触觉），不得在叙事中替用户做未输入的决策。

【违规示例 - 严禁出现】
❌ "当清晨的阳光洒进..."  （违反时间约束）
❌ "艾伦决定返回酒馆..."    （违反地点约束）
❌ "虽然还没出发，但..."   （违反活动约束）

【合规示例】
✅ "黄昏的余晖渐渐消散..."
✅ "艾伦踏入幽暗森林的深处..."
✅ "回想起离开酒馆时老板的叮嘱..."
"""
```

## 1.6 世界书递归触发与优先级控制

> 本节深度设计**递归扫描（Recursive Scan）算法**与 **Author's Note 深度插入机制**，实现与世界书系统深度集成的上下文注入。

### 1.6.1 递归扫描算法

传统世界书注入仅做单次关键词匹配——这导致隐含关联（如 A 地提及 B 人，但 B 人无直接关键词）无法被触发。本框架引入**递归扫描**，模拟 SillyTavern 的深层注入逻辑。

#### 扫描算法流程

```
输入：用户输入文本 + 世界书条目集合
输出：按优先级排序的已激活条目列表

算法步骤：
1. 首次扫描（Depth = 0）
   - 对用户输入文本进行分词
   - 匹配每个条目的 keys 和 keysSecondary
   - 标记命中条目，加入 activated[]

2. 递归扫描（Depth = 1 to scanDepth）
   - 对已激活条目的 content 进行扫描
   - 提取 content 中的实体名词（正则 /[A-Z][a-z]+/ 或命名实体识别）
   - 用提取的实体再次匹配其他条目的 keys
   - 新命中的条目加入 activated[]（去重）
   - 重复直到达 scanDepth 或无新条目

3. 过滤与排序
   - 移除 excludeRecursion=true 的条目的反向触发
   - 按 injection.probability 过滤
   - 按 depth + injection.cooldown 排序
```

#### 递归扫描示意

```
用户输入："在酒馆遇到艾伦，他提到幽暗森林有宝物"

首次扫描（Depth 0）：
  输入文本匹配到：
    - "酒馆" → [酒馆场景条目] ✅
    - "艾伦" → [艾伦角色条目] ✅
    - "幽暗森林" → [幽暗森林地点条目] ✅

递归扫描（Depth 1）：
  [艾伦角色条目] content 包含 "玛丽亚是他信任的伙伴"
    → "玛丽亚" 未在输入中，但 content 触发
    → [玛丽亚角色条目] ✅ 联动激活

  [幽暗森林地点条目] content 包含 "森林深处有一座古老神殿"
    → "神殿" 触发
    → [古老神殿条目] ✅ 联动激活

递归扫描（Depth 2）：
  [古老神殿条目] content 提及 "守卫是石化蜥蜴"
    → [石化蜥蜴怪物条目] ✅ 联动激活

最终 activated 队列：
[酒馆场景, 艾伦角色, 幽暗森林地点, 玛丽亚角色, 古老神殿, 石化蜥蜴]
```

#### 递归扫描数据结构

```typescript
// src/composables/useWorldEntry.js

interface ScanResult {
  entries: WorldEntry[]        // 已激活的条目（按优先级排序）
  triggerChain: TriggerChain[] // 触发链（用于调试）
  tokenBudget: number          // 当前已占用 token
}

interface TriggerChain {
  entryId: string
  triggerKeyword: string
  sourceEntryId: string | null  // null 表示首次扫描触发
  depth: number
}

function recursiveScan(
  inputText: string,
  entries: WorldEntry[],
  options: {
    scanDepth: number          // 来自 WorldBookSettings，默认 3
    tokenBudget: number        // 最大注入 token 预算
    excludeRecursion: boolean  // 是否排除递归触发
  }
): ScanResult {
  const { scanDepth, tokenBudget } = options
  const activated = new Map()  // entryId -> TriggerChain
  const queue = []

  // 首次扫描
  for (const entry of entries) {
    if (matchesKeywords(inputText, entry.keys) ||
        matchesKeywords(inputText, entry.keysSecondary)) {
      activated.set(entry.id, { entryId: entry.id, triggerKeyword: 'input', sourceEntryId: null, depth: 0 })
      queue.push(entry)
    }
  }

  // 递归扫描
  for (let depth = 1; depth <= scanDepth; depth++) {
    const nextQueue = []
    for (const entry of queue) {
      const entities = extractEntities(entry.content)  // 提取 content 中的实体
      for (const entity of entities) {
        for (const target of entries) {
          if (activated.has(target.id)) continue
          if (target.injection.excludeRecursion) continue
          if (matchesKeywords(entity, target.keys) ||
              matchesKeywords(entity, target.keysSecondary)) {
            activated.set(target.id, {
              entryId: target.id,
              triggerKeyword: entity,
              sourceEntryId: entry.id,
              depth
            })
            nextQueue.push(target)
          }
        }
      }
    }
    queue = nextQueue
    if (queue.length === 0) break
  }

  // 按 depth + probability 排序后截断到 tokenBudget
  const sorted = Array.from(activated.values())
    .sort((a, b) => a.depth - b.depth || getEntryProbability(a.entryId) - getEntryProbability(b.entryId))
    .map(chain => getEntry(chain.entryId))

  return {
    entries: fitTokenBudget(sorted, tokenBudget),
    triggerChain: Array.from(activated.values()),
    tokenBudget: calculateUsedBudget(sorted)
  }
}
```

### 1.6.2 注入优先级与权重控制

#### 优先级规则

| 优先级 | 条件 | 注入方式 |
|--------|------|---------|
| **P0 - 常量注入** | `injection.mode = 'constant'` | 无条件全部注入 |
| **P1 - 高权重** | `probability >= 80` 且 `depth <= 1` | 必定注入 |
| **P2 - 正常** | `probability >= 30` | 按概率随机注入 |
| **P3 - 低权重** | `probability < 30` 或 `depth > 2` | 仅在 token 充裕时注入 |
| **P4 - 冷却中** | `cooldown > 0` | 跳过本次 |

#### 分组注入（Group Mode）

当 `injection.mode = 'group'` 时，同一分组的条目按权重比例选择：

```typescript
function selectGroupEntries(entries: WorldEntry[], groupName: string, maxCount: number): WorldEntry[] {
  const groupEntries = entries.filter(e => e.injection.group === groupName)
  const totalWeight = groupEntries.reduce((sum, e) => sum + e.injection.probability, 0)

  const selected = []
  let remaining = maxCount

  for (const entry of groupEntries.sort((a, b) => b.injection.probability - a.injection.probability)) {
    if (remaining <= 0) break
    // 按概率决定是否选择
    if (Math.random() * totalWeight < entry.injection.probability) {
      selected.push(entry)
      remaining--
    }
  }

  return selected
}
```

### 1.6.3 Author's Note 深度插入机制

参考 SillyTavern 的 Author's Note，本框架在对话历史的**倒数第 3 轮**位置动态插入高强度写作约束。

#### 插入位置策略

```
对话历史（假设 6 轮）：
[0] 系统：你是叙事者...
[1] 用户：我前往幽暗森林
[2] AI：描绘了进入森林的场景
[3] 用户：艾伦发现了什么？
[4] AI：描述艾伦发现足迹
[5] 用户：追踪足迹

插入点 = len(history) - 3 = 位置 3
         ↓
[0] 系统
[1] 用户：前往幽暗森林
[2] AI：描绘场景
[3] AI：Author's Note 注入
    ↓
    【Author's Note】
    时间：黄昏（严格遵守）
    地点：幽暗森林（不得更改）
    写作风格：文学性强，注重氛围营造...
    【Author's Note 结束】
[4] AI：描述足迹
[5] 用户：追踪足迹
```

#### 提示词组装

```python
def buildWorldBookInjection(entry, authorNoteContext):
    injection_text = f"""
【世界书注入 - 条目：{entry.name}】
类型：{entry.type}
内容：
{entry.content[:500]}  # 限制每条 500 字

【Author's Note 约束】（插入在对话历史倒数第 3 轮）
时间：{authorNoteContext['time']}（绝对不得更改）
地点：{authorNoteContext['location']}（绝对不得更改）
活动：{authorNoteContext['latest_activity']}（必须衔接）
写作要求：{authorNoteContext['style_requirement']}

【注入规则】
- constant=true 条目必须全部注入
- selective 条目按 probability 概率注入
- depth 越大优先级越低
- 避免重复注入相同内容
"""
    return injection_text
```

#### 完整提示词组装流程

```typescript
// src/services/promptBuilder.js

function buildNarrativePrompt(params: {
  userInput: string
  conversationHistory: Message[]
  worldbook: WorldBook
  experienceState: ExperienceState
  narrativeStyle: string
}): string {
  const { userInput, conversationHistory, worldbook, experienceState, narrativeStyle } = params

  // 1. 构建既定事实（1.5 节）
  const facts = buildFactsContext(experienceState)

  // 2. 递归扫描世界书
  const scanResult = recursiveScan(userInput, worldbook.entries, {
    scanDepth: worldbook.settings.scanDepth,
    tokenBudget: worldbook.settings.tokenBudget,
    excludeRecursion: worldbook.settings.recursiveScanning
  })

  // 3. 构建 Layer 1（系统提示词）
  const systemPrompt = buildSystemPrompt(narrativeStyle)

  // 4. 构建 Layer 2（世界书注入）
  const worldbookInjection = scanResult.entries
    .map(entry => buildWorldBookInjection(entry, facts))
    .join('\n\n')

  // 5. 构建 Author's Note（插入到 history[-3]）
  const authorNote = buildAuthorNote(facts, narrativeStyle)

  // 6. 组装完整上下文
  const context = [
    { role: 'system', content: `${systemPrompt}\n\n${worldbookInjection}` },
    ...conversationHistory.slice(0, -3),
    { role: 'system', content: authorNote },  // 插入点
    ...conversationHistory.slice(-3),
    { role: 'user', content: userInput }
  ]

  return context
}
```

### 1.6.4 完整数据流总览

```
用户输入
    │
    ▼
┌─────────────────────────────┐
│  状态引擎                    │
│  判定 travel intent          │
│  更新 worldMap/time/activities│
│  写入 experience_state       │
└─────────────────────────────┘
    │
    ▼
buildFactsContext() ──► 既定事实（时间/地点/活动）
    │
    ▼
┌─────────────────────────────┐
│  递归扫描                    │
│  inputText + worldbook.entries│
│  scanDepth=3, 递归匹配        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Author's Note 组装          │
│  插入 history[-3]            │
│  强制约束时间/地点/活动       │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  完整提示词                  │
│  [System] + [WorldBook] +     │
│  [History -3] + [AuthorNote] │
│  + [History -2,-1] + [User]  │
└─────────────────────────────┘
    │
    ▼
    sendChat()
```

## 1.7 事件触发面板

### 面板类型

| 触发场景 | 面板 | 触发关键词示例 |
|---------|------|--------------|
| 战斗 | CombatPanel | "战斗"、"攻击"、"敌人" |
| 交易 | TradePanel | "商人"、"购买"、"金币" |
| 任务 | QuestPanel | "任务"、"委托"、"奖励" |
| NPC 对话 | DialoguePanel | "说话"、"对话"、"询问" |
| 探索 | DiscoveryPanel | "发现"、"入口"、"密道" |

### CombatPanel 详细设计

```typescript
interface CombatState {
  enemyId: string
  enemyName: string
  enemyHP: number
  enemyMaxHP: number
  playerHP: number
  playerMaxHP: number
  turns: number
  choices: CombatChoice[]
  log: CombatLogEntry[]
}

interface CombatChoice {
  id: string
  label: string        // "攻击" / "防御" / "技能" / "道具" / "逃跑"
  enabled: boolean
  cooldown?: number    // 技能冷却
}

interface CombatLogEntry {
  turn: number
  actor: 'player' | 'enemy'
  action: string
  damage: number
  hpChange: number    // 正负值
}
```

### 面板生命周期

```
触发显示
    │
    ▼
用户选择动作
    │
    ▼
执行动作 → 更新状态 → 播放动画
    │
    ├──► 战斗结束 → 结算奖励 → 收起面板
    │
    └──► 继续战斗 → 下一回合
```

## 1.8 分层提示词架构

### Layer 1: 系统提示词

```python
SYSTEM_PROMPT = """
你是一位资深的文学叙事者，擅长用生动的语言描绘场景氛围、环境细节、人物动作与心理活动。

【叙事规则】
- 用中文回复
- 用 *动作* 格式描述角色动作
- 用 "对话" 格式描述对话
- 用 （心理） 格式描述心理活动
- 段落分明，场景转换时使用空行
- 长度适中，一般 50-200 字

【叙事风格】
{style_prompt}
"""

# 叙事风格预设
STYLE_PRESETS = {
  "literary": "注重文笔、环境描写、内心刻画，叙事优美流畅",
  "smooth": "节奏紧凑、可读性强，适合商业向小说",
  "dialogue_heavy": "以人物对话推动情节，对话自然生活化",
  "minimal": "少修饰、重情节，快节奏叙事"
}
```

### Layer 2: 世界书注入

```python
WORLD_BOOK_INJECTION = """
【当前世界设定】
{worldbook_entries}

【注入规则】
- 根据用户输入关键词匹配相关条目
- constant=true 的条目始终注入
- group 条目按权重随机选择
- 避免重复注入同一内容
"""
```

### Layer 3: 情境上下文

```python
SITUATION_CONTEXT = """
【当前情境】
角色：{character_name}（{character_trait}）
位置：{location_name}
时间：{time_description}

【心境状态】
{mood_description}
（基于 mood 数值 0-100 映射叙事走向）

【最近活动】
{activities_summary}
"""
```

### Layer 4: Few-shot 示例

```python
FEW_SHOT_EXAMPLES = """
【示例：战斗场景】
*艾伦拔出长剑，剑锋在月光下闪着寒芒。*
"来者何人？"他喝道。

【示例：日常场景】
*夕阳西斜，小镇的街道上行人渐少。*
*玛丽亚推开酒馆的门，铃铛发出清脆的响声。*
"老规矩，一杯麦酒。"她在吧台前坐下。

【示例：情感场景】
*艾琳的手指轻轻拂过那封泛黄的信。*
*泪水无声地滑落，浸湿了纸角。*
"你为什么要离开……"
"""
```

## 1.9 上下文压缩策略

```python
COMPRESSION_STRATEGY = """
触发条件：已使用 token > tokenBudget * 0.8

步骤：
1. 标记重要信息
   - 角色关系变化（关系建立/破裂）
   - 剧情转折点（重大发现/决定）
   - 关键发现（新地点/新角色）

2. 保留优先级
   P0: 重要信息 + 最近 N 轮对话
   P1: 最近摘要（AI 生成）
   P2: 早期对话（已摘要）

3. 压缩格式
   [摘要：角色A与角色B在某地发生冲突，关系降为敌对]
"""
```

## 1.10 实施任务清单

### M1 - 世界书基础（第 1-2 月）

| 任务 | 子任务 | 优先级 | 文件 |
|------|--------|--------|------|
| ExperienceStore 重构 | 创建 `experienceStore.js`，清理无效字段 | P0 | `src/stores/` |
| ExperienceStore 重构 | 统一数据源，组件从 Store 读取 | P0 | 组件文件 |
| SillyTavern 解析器 | 解析 JSON → 字段映射 → 预览 | P0 | `src/composables/useSillyTavern.js` |
| SillyTavern 导出器 | 条目 → JSON → 下载 | P0 | 同上 |
| 主界面简化 | 按 1.4 布局重构 Experience.vue | P0 | `src/pages/Experience.vue` |
| 世界书选择器 | 顶部下拉切换 | P1 | 组件 |
| 文件重命名 | Game.vue → Experience.vue | P2 | `src/pages/` |

### M2 - 世界书编辑器（第 2-3 月）

| 任务 | 子任务 | 优先级 | 文件 |
|------|--------|--------|------|
| 编辑器页面布局 | WorldBookEditor.vue | P0 | `src/pages/` |
| 条目 CRUD | 增删改查条目 | P0 | 组件 |
| 条目搜索/筛选 | 按类型/分组/关键词 | P0 | 组件 |
| 导入确认流程 | 预览 → 确认 → 导入 | P0 | 组件 |
| 分组管理 | 创建/编辑/删除/迁移分组 | P1 | 组件 |
| 小说 AI 导入 | 分段 → AI 提取 → 预览确认 | P1 | `useNovelImporter.js` |
| 批量编辑 | 多选 + 批量修改 | P2 | 组件 |

### M3 - AI 叙事优化（第 3-4 月）

| 任务 | 子任务 | 优先级 | 文件 |
|------|--------|--------|------|
| 分层提示词实现 | 四层架构接入 | P0 | `src/services/promptBuilder.js` |
| 叙事风格预设 | 4 档预设切换 | P0 | 同上 |
| 关键词注入系统 | 匹配 → 注入世界书条目 | P0 | `src/composables/useWorldEntry.js` |
| 上下文压缩 | 智能摘要，保留重要信息 | P1 | 同上 |
| Few-shot 系统 | 片段收集 + 动态选择 | P2 | 同上 |

### M4 - 事件触发面板（第 4-5 月）

| 任务 | 子任务 | 优先级 | 文件 |
|------|--------|--------|------|
| 战斗面板 | CombatPanel 组件 | P0 | `src/components/combat/` |
| 交易面板 | TradePanel 组件 | P0 | `src/components/trade/` |
| 任务面板 | QuestPanel 组件 | P0 | `src/components/quest/` |
| 面板生命周期 | 触发 → 显示 → 收起 | P0 | 组件 |
| 角色卡系统 | 导入/导出/关联世界书 | P1 | `src/composables/useCharacter.js` |

### M5 - 顾问与打磨（第 5-6 月）

| 任务 | 子任务 | 优先级 | 文件 |
|------|--------|--------|------|
| 问答模式 | 用户主动提问获取建议 | P1 | 组件 |
| 叙事分析 | 分析最近叙事的优缺点 | P1 | `src/services/narrativeAnalyzer.js` |
| 方向建议 | 2-3 个可选情节发展方向 | P1 | 同上 |
| 界面细节打磨 | 动画、反馈、空状态 | P1 | 组件 |
| 性能优化 | 虚拟列表/按需渲染 | P2 | 组件 |

## 1.11 验收标准

每个阶段完成后必须验证：

```bash
# M1 验收
- SillyTavern JSON 导入后条目数量正确
- 导出 JSON 可被 SillyTavern 正常导入
- 切换世界书后剧情生成正常
- 侧边栏状态与世界书同步

# M2 验收
- 新建/编辑/删除条目操作正常
- 搜索和筛选结果准确
- 导入预览显示正确统计数据

# M3 验收
- 叙事风格切换后语气有明显差异
- 关键词触发后相关条目被注入
- 长对话后上下文压缩正常

# M4 验收
- 战斗/交易/任务面板正常显示和收起
- 面板操作后状态正确更新
- 完成后面板自动收起

# M5 验收
- 问答响应准确
- 叙事分析有实际参考价值
- 无明显 UI bug 或性能问题
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [02-editor-ai.md](./02-editor-ai.md) - 编辑器 AI 规划