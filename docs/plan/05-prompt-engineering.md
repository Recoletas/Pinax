# 05 - 提示词工程详细规划

> 本框架的提示词工程基于两大来源：**酒馆风格提示词** 和 **prompt-optimizer**（待集成）。

## 5.1 酒馆风格提示词

### 核心原则

- **变量注入**：通过 `{{variable}}` 语法注入动态内容
- **第一人称扮演**：AI 作为角色直接与用户对话
- **场景锚定**：通过上下文变量注入当前情境

### 变量系统

| 变量 | 说明 | 示例 |
|------|------|------|
| `{{char}}` | 当前角色名 | "艾伦" |
| `{{user}}` | 用户名/角色名 | "主角" |
| `{{scenario}}` | 当前场景描述 | "在酒馆中与商人交谈" |
| `{{context}}` | 世界书条目注入 | 角色/地点/物品等设定 |
| `{{memory}}` | 记忆上下文 | 之前的对话摘要 |
| `{{time}}` | 当前时间 | "清晨"、"傍晚" |

### 叙事格式

```markdown
*角色动作描述*
"对话内容"
（心理活动）
```

### 系统提示词模板

```python
SYSTEM_PROMPT_TEMPLATE = """
【角色扮演】你正在扮演 {{char}}。

【角色设定】
{{context}}

【对话规则】
- 你就是这个角色，以第一人称视角直接与用户对话
- 所有对话使用「"对话内容"」格式
- 动作和心理描写使用「*动作*」和「（心理）」格式
- 不要以旁白身份说话，不要描述角色自身的内心活动
- 保持角色性格、说话方式和语气一致

【当前场景】
{{scenario}}

请以该角色的身份，延续对话并回应用户的行动。
"""
```

## 5.2 分层提示词架构

本框架对不同模块采用差异化分层架构。**小说体验模块**基于 01-novel-experience.md 的状态引擎与叙事引擎严格分离设计，实现"既定事实硬性约束 + AI 负责叙事翻译"的范式。

### 小说体验模块（Novel Experience）

采用**四层架构 + 动态 Author's Note 插入**：

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Layer 0: 固定叙事规则                             │
│  【硬性约束】时间/地点/活动不可篡改，违规输出拒绝                           │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Layer 1: 系统提示词                               │
│  - 叙事者身份定义                                                         │
│  - 格式规则（*动作* "对话" （心理））                                    │
│  - 风格指导（文学性/流畅/对话/简洁，选自 5.3 预设）                       │
│  - 分流规则：AI 仅做叙事翻译，不得执行状态变更                             │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Layer 2: 世界书递归注入                            │
│  - 首次扫描（Depth=0）：匹配 keys + keysSecondary                        │
│  - 递归扫描（Depth=1~scanDepth）：content 内实体触发联动条目              │
│  - constant 条目：无条件注入                                              │
│  - selective 条目：按 probability 概率注入                                │
│  - 分组注入（group mode）：同组按权重比例选择                              │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Author's Note 插入点                               │
│  位置：对话历史倒数第 3 轮（history[-3]）                                │
│  内容：时间/地点/活动的强制约束 + 当前叙事风格                             │
│  约束级别：【硬性】必须遵守，违反则输出无效                                 │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Layer 3: 既定事实上下文                            │
│  时间（period）| 地点（currentScene）| 活动（activities[0]）             │
│  心境（mood）| 天气 | 已发现地点 | NPC 关系                               │
│  格式：[事实块]，AI 仅翻译，不得推翻                                       │
└──────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         Layer 4: Few-shot 示例                            │
│  - 2-3 个高质量叙事片段                                                   │
│  - 按场景类型（combat/exploration/dialogue）动态选择                      │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Layer 0 固定叙事规则（硬性约束）

```typescript
const NARRATIVE_CONSTRAINT_PROMPT = `
【硬性约束 - 违反将导致输出被拒绝】

1. 时间约束：当前时间为 {currentPeriod}，不得在叙事中使用其他时间词汇。
2. 地点约束：当前位置为 {currentScene}，不得描述前往其他地点或否认当前位置。
3. 活动约束："{latestActivity}" 已记录为重要活动，必须在叙事中自然衔接。
4. 角色约束：不得替用户做出未输入的决策或行动。
5. 世界书约束：注入的世界书条目内容必须遵守，不得与之一致。

【违规示例 - 严禁出现】
❌ "当清晨的阳光洒进..."   （违反时间约束）
❌ "艾伦决定返回酒馆..."   （违反地点约束）
❌ "虽然还没出发，但..."   （违反活动约束）
`
```

#### Layer 1 系统提示词

```typescript
function buildNovelExperienceSystemPrompt(narrativeStyle: string): string {
  const stylePreset = STYLE_PRESETS[narrativeStyle] ?? STYLE_PRESETS['literary']

  return `你是一位资深的文学叙事者，擅长用生动的语言描绘场景氛围、环境细节、人物动作与心理活动。

【叙事规则】
- 用中文回复
- 用 *动作* 格式描述角色动作
- 用 "对话" 格式描述对话
- 用 （心理） 格式描述心理活动
- 段落分明，场景转换时使用空行
- 长度适中，一般 50-200 字
- 仅负责叙事翻译，不得执行状态变更

【叙事风格】
${stylePreset.system_prompt_addition}`
}
```

#### Layer 2 世界书递归注入

```typescript
// 递归扫描算法（详见 01-novel-experience.md 1.6.1）

interface ScanResult {
  entries: WorldEntry[]           // 已激活条目（按优先级排序）
  triggerChain: TriggerChain[]    // 触发链（用于调试）
  tokenBudget: number             // 当前已占用 token
}

function recursiveScan(
  inputText: string,
  entries: WorldEntry[],
  options: { scanDepth: number; tokenBudget: number; excludeRecursion: boolean }
): ScanResult

// 优先级判定
const INJECTION_PRIORITY = {
  CONSTANT: 0,   // injection.mode = 'constant' → P0，无条件注入
  HIGH: 1,       // probability >= 80 && depth <= 1 → P1
  NORMAL: 2,     // probability >= 30 → P2
  LOW: 3,        // probability < 30 || depth > 2 → P3
  COOLDOWN: 4    // cooldown > 0 → P4，跳过
}
```

#### Author's Note 插入机制

插入位置 = `conversationHistory.length - 3`

```
对话历史（6 轮示例）：
[0] 系统：叙事者身份 + Layer1 系统提示词 + Layer2 世界书注入
[1] 用户：前往幽暗森林
[2] AI：描绘进入森林的场景
[3] 用户：艾伦发现了什么？
[4] AI：描述艾伦发现足迹
[5] 用户：追踪足迹

插入点 = 3
     ↓
[0] 系统（完整提示词）
[1] 用户：前往幽暗森林
[2] AI：描绘场景
[3] ← Author's Note 插入（Layer 0 硬性约束 + 时间/地点/活动）
[4] AI：描述足迹
[5] 用户：追踪足迹
```

```typescript
function buildNarrativePrompt(params: {
  userInput: string
  conversationHistory: Message[]
  worldbook: WorldBook
  experienceState: ExperienceState
  narrativeStyle: string
}): Message[] {
  const { userInput, conversationHistory, worldbook, experienceState, narrativeStyle } = params

  // 1. 构建 Layer 1 系统提示词
  const systemPrompt = buildNovelExperienceSystemPrompt(narrativeStyle)

  // 2. 构建 Layer 2 世界书注入（递归扫描）
  const scanResult = recursiveScan(userInput, worldbook.entries, {
    scanDepth: worldbook.settings.scanDepth,
    tokenBudget: worldbook.settings.tokenBudget,
    excludeRecursion: worldbook.settings.recursiveScanning
  })
  const worldbookInjection = scanResult.entries
    .map(entry => buildWorldBookInjection(entry))
    .join('\n\n')

  // 3. 构建 Layer 0 固定约束（用于 Author's Note）
  const constraintBlock = buildNarrativeConstraintBlock(experienceState)

  // 4. 构建 Author's Note（插入到 history[-3]）
  const authorNote = `【Author's Note - 硬性约束】\n${constraintBlock}\n【写作风格】${narrativeStyle}`

  // 5. 组装完整上下文
  const systemWithWorldbook = `${systemPrompt}\n\n【世界书注入】\n${worldbookInjection}`

  if (conversationHistory.length <= 3) {
    // 历史不足 3 轮：直接前置到首轮
    return [
      { role: 'system', content: `${systemWithWorldbook}\n\n【约束】\n${constraintBlock}` },
      ...conversationHistory,
      { role: 'user', content: userInput }
    ]
  }

  return [
    { role: 'system', content: systemWithWorldbook },
    ...conversationHistory.slice(0, -3),
    { role: 'system', content: authorNote },  // 插入点
    ...conversationHistory.slice(-3),
    { role: 'user', content: userInput }
  ]
}
```

#### Layer 3 既定事实上下文

```typescript
function buildFactsContext(experienceState: ExperienceState): string {
  const { writingTime, worldMapState, activities, writingCharacter } = experienceState

  return `【既定事实 - 必须严格遵循】
时间：${writingTime.eraName}${writingTime.year}年${writingTime.month}月${writingTime.day}日 ${writingTime.period}
地点：${worldMapState.currentScene}
最近活动：${activities[0]?.title ?? '（无）'}
角色心境：${writingCharacter.mood}%（${getMoodLabel(writingCharacter.mood)}）
已发现地点：${worldMapState.discoveredScenes.join('、')}

【规则】以上既定事实必须体现在叙事中，不得否认或更改。`
}

function getMoodLabel(mood: number): string {
  if (mood >= 80) return '愉悦'
  if (mood >= 60) return '平静'
  if (mood >= 40) return '一般'
  if (mood >= 20) return '焦虑'
  return '低落'
}
```

#### 完整数据流总览

```
用户输入
     │
     ▼
┌─────────────────────────────┐
│  状态引擎（State Engine）    │
│  判定 intent                 │
│  更新 worldMap/time/activities│
│  写入 experience_state       │
└─────────────────────────────┘
     │
     ▼
buildFactsContext() ──► Layer 3 既定事实（时间/地点/活动）
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
│  Layer 0 硬性约束             │
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

### 编辑器 AI 模块

```
┌─────────────────────────────────────────┐
│ Layer 1: 系统提示词                      │
│ - 写作助手身份                           │
│ - 续写格式规则                           │
│ - 文风要求                               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ Layer 2: 世界书注入                       │
│ - 关联的角色设定                         │
│ - 关联的地点描述                         │
│ - 相关物品/势力                          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ Layer 3: 当前文本上下文                   │
│ - 当前章节内容                           │
│ - 光标位置附近内容                       │
│ - 最近 500 字                            │
└─────────────────────────────────────────┘
```

### 编导模式模块

```
┌─────────────────────────────────────────┐
│ Layer 1: 系统提示词                      │
│ - 分镜师身份                             │
│ - 景别/运镜/时长规则                     │
│ - 格式要求                               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ Layer 2: 内容分析                         │
│ - 诗歌/散文的意象提取                    │
│ - 情感基调分析                           │
│ - 节奏感分析                             │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│ Layer 3: 输出格式                         │
│ - JSON 结构要求                          │
│ - 必填字段                               │
└─────────────────────────────────────────┘
```

## 5.3 叙事风格预设

```python
STYLE_PRESETS = {
  "literary": {
    "name": "文学性强",
    "description": "注重文笔、环境描写、内心刻画，叙事优美流畅",
    "system_prompt_addition": """
- 使用优美的意象和修辞
- 注重环境氛围的营造
- 深入人物心理描写
- 叙事节奏舒缓
- 使用书面语
"""
  },
  "smooth": {
    "name": "流畅叙事",
    "description": "节奏紧凑、可读性强，适合商业向小说",
    "system_prompt_addition": """
- 句子简洁有力
- 节奏紧凑
- 对话自然生活化
- 减少冗余修饰
- 快速推进剧情
"""
  },
  "dialogue_heavy": {
    "name": "对话丰富",
    "description": "以人物对话推动情节，对话自然生活化",
    "system_prompt_addition": """
- 增加对话比重
- 对话简洁口语化
- 通过对话展现性格
- 减少大段叙述
- 用对话推动情节
"""
  },
  "minimal": {
    "name": "简洁白描",
    "description": "少修饰、重情节，快节奏叙事",
    "system_prompt_addition": """
- 极简描写
- 只保留必要信息
- 快节奏
- 减少形容词
- 直接陈述事实
"""
  }
}
```

## 5.4 prompt-optimizer 集成（待接入）

### 目标

- 自动压缩冗余提示词
- 提升 Token 效率
- 保持输出质量

### 集成方式

```typescript
// 规划中
interface OptimizerConfig {
  maxTokens: number
  model: string
  compressionRatio: number  // 压缩比
}

// 使用
const optimized = await optimize({
  prompt: rawPrompt,
  maxTokens: 2048,
  model: 'gpt-4'
})
```

## 5.5 Token 偏置控制

> 本节定义如何通过 API 参数（logit_bias / frequency_penalty / presence_penalty）控制词汇出现概率，抑制陈词滥调，提升叙事新鲜感。

### 5.5.1 问题定义

AI 叙事中常见陈词滥调（Cliché）：

| 类型 | 示例 | 影响 |
|------|------|------|
| 过度使用的形容词 | "深邃的眼眸"、"苍白的脸庞" | 叙事同质化 |
| 固定句式 | "突然"、"就在这时"、"只见" | 节奏模式化 |
| 重复意象 | 每次描写黑暗都是"伸手不见五指" | 缺乏变化 |
| 角色动作套路 | "皱了皱眉"、"叹了口气" | 动作库枯竭 |

### 5.5.2 API 参数控制机制

#### logit_bias（词汇偏置）

通过在 API 请求中传入 `logit_bias` 字典，对特定 token 进行正/负偏置，改变其被采样的概率。

```typescript
interface TokenBiasEntry {
  token: string           // 要偏置的 token 或词
  bias: number            // 偏置值：-100（禁用）到 +100（强制）
}

// 常用偏置预设
const LOGIT_BIAS_PRESETS = {
  // 禁用过度使用的词
  disable_overused: {
    '突然': -50,
    '就在这时': -80,
    '只见': -40,
    '深邃的': -30,
    '苍白的': -30,
    '冰冷的': -25,
  },

  // 鼓励描写多样性
  encourage_variety: {
    '眼眸': +10,
    '目光': +15,
    '身影': +10,
    '轮廓': +10,
    '气息': +10,
  },

  // 动作词汇增强
  action_variety: {
    '踉跄': +20,
    '凝视': +15,
    '攥紧': +20,
    '颤抖': +15,
    '屏息': +20,
  }
}
```

#### frequency_penalty（频率惩罚）

降低已大量出现的 token 的概率。适合长期对话中防止某些词反复出现。

```typescript
// 使用场景：在多轮叙事中，防止重复词汇累积
const frequencyPenaltyByRound = {
  round_1_3: 0,    // 初期不惩罚，让 AI 自由发挥
  round_4_8: 0.3,  // 中期轻微惩罚
  round_9_plus: 0.5  // 后期较强惩罚，强制换词
}
```

#### presence_penalty（存在惩罚）

只要 token 出现过就降低其后续出现概率，适合打破固定句式。

```typescript
// 使用场景：防止"突然"、"然后"等连接词过度使用
const presencePenaltyPresets = {
  connectors: {
    '突然': -0.8,
    '然后': -0.5,
    '接着': -0.5,
    '就在这时': -1.0,
    '只见': -0.6,
  },

  // 减轻叙事开始的套路
  opening_patterns: {
    '夜幕降临': -0.5,
    '阳光普照': -0.5,
    '微风拂过': -0.4,
  }
}
```

### 5.5.3 动态偏置策略

#### 按叙事阶段调整

```typescript
function getDynamicTokenBias(context: {
  narrativePhase: 'opening' | 'development' | 'climax' | 'resolution'
  stylePreset: string
  recentTokens: string[]    // 最近 50 个 token（用于动态检测）
}): Record<string, number> {
  const baseBias = { ...LOGIT_BIAS_PRESETS.disable_overused }

  // 开场阶段：禁用固定开场模式
  if (context.narrativePhase === 'opening') {
    Object.assign(baseBias, PRESET_PRESETS.opening_patterns)
  }

  // 高潮阶段：增强动作描写，减少冗余描述
  if (context.narrativePhase === 'climax') {
    Object.assign(baseBias, LOGIT_BIAS_PRESETS.action_variety)
    // 禁用慢节奏词
    baseBias['慢慢地'] = -30
    baseBias['缓缓地'] = -30
  }

  // 检测近期重复词汇，动态加入惩罚
  const recentFrequencies = countFrequencies(context.recentTokens)
  for (const [token, count] of Object.entries(recentFrequencies)) {
    if (count >= 3) {
      baseBias[token] = baseBias[token] ?? 0
      baseBias[token] -= count * 5  // 每重复一次加 -5 惩罚
    }
  }

  return baseBias
}
```

#### 按角色/场景类型调整

```typescript
// 不同场景类型切换偏置预设
const SCENE_BIAS_PRESETS = {
  combat: {
    // 战斗场景：禁用拖沓词，增强动作强度
    '慢慢地': -40,
    '缓缓地': -40,
    '突然': +20,    // 战斗需要突然性
    '刹那间': +20,
    '闪过': +30,
    '斩向': +30,
  },

  dialogue: {
    // 对话场景：禁用叙述性开头，增强对话自然度
    '他说道': -30,
    '她回答': -30,
    '然后': -40,
    '接着': -40,
  },

  emotional: {
    // 情感场景：增强心理描写词汇
    '心头': +20,
    '眼眶': +15,
    '颤抖': +25,
    '沉默': +20,
  }
}
```

### 5.5.4 偏置预算与冲突解决

当多条偏置规则对同一 token 产生冲突时，按以下优先级解决：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| P0 | 用户手动指定 | 最高优先，用户明确想要的词 |
| P1 | 当前场景类型预设 | SceneBiasPresets |
| P2 | 动态检测（近期重复惩罚） | 自动触发 |
| P3 | 风格预设全局禁用 | 通用陈词滥调禁用 |

```typescript
function resolveTokenBias冲突(token: string, sources: TokenBiasEntry[]): number {
  // 取绝对值最大的（最极端的）偏置
  return sources.sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))[0].bias
}
```

### 5.5.5 API 调用集成

```typescript
// src/services/tokenBiasEngine.js

interface GenerateOptions {
  model: string
  temperature?: number
  maxTokens?: number
  // Token 偏置控制
  logitBias?: Record<string, number>
  frequencyPenalty?: number
  presencePenalty?: number
}

function buildTokenBiasOptions(context: {
  narrativePhase: string
  stylePreset: string
  recentTokens: string[]
  sceneType?: 'combat' | 'dialogue' | 'emotional' | 'exploration'
}): GenerateOptions {
  const dynamicBias = getDynamicTokenBias(context)

  // 合并场景类型预设
  if (context.sceneType && SCENE_BIAS_PRESETS[context.sceneType]) {
    for (const [token, bias] of Object.entries(SCENE_BIAS_PRESETS[context.sceneType])) {
      dynamicBias[token] = resolveTokenBias冲突(token, [
        { token, bias: dynamicBias[token] ?? 0 },
        { token, bias }
      ])
    }
  }

  return {
    logitBias: dynamicBias,
    frequencyPenalty: getFrequencyPenaltyByPhase(context.narrativePhase),
    presencePenalty: 0.3  // 固定轻微存在惩罚，打破固定句式
  }
}

// 在 sendChat 中注入
async function sendChatWithTokenBias(messages, context) {
  const biasOptions = buildTokenBiasOptions(context)

  return sendChat(messages, {
    ...getResolvedApiSettings(),
    ...biasOptions
  })
}
```

### 5.5.6 效果评估与迭代

```typescript
// 定期分析输出质量，持续优化偏置表

interface ClichéReport {
  overusedTokens: Array<{ token: string, count: number, percentage: number }>
  recommendedBiases: Array<{ token: string, suggestedBias: number }>
  qualityScore: number  // 0-100
}

async function analyzeNarrativeQuality(outputText: string): Promise<ClichéReport> {
  const tokens = tokenize(outputText)
  const frequencies = countFrequencies(tokens)

  // 检测高频陈词滥调
  const overused = Object.entries(frequencies)
    .filter(([_, count]) => count / tokens.length > 0.02)  // 超过 2%
    .sort((a, b) => b[1] - a[1])

  return {
    overusedTokens: overused.map(([token, count]) => ({
      token,
      count,
      percentage: count / tokens.length
    })),
    recommendedBiases: overused.map(([token]) => ({
      token,
      suggestedBias: -30  // 建议 -30 偏置
    })),
    qualityScore: calculateQualityScore(outputText)
  }
}
```

### 5.5.7 验收标准

```bash
# 偏置效果验收
- logit_bias 禁用"突然"后，AI 输出中"突然"出现频率降低 80%+
- frequency_penalty 启用后，长期对话中词汇多样性提升
- 动态检测到重复 3 次的词后，第 4 次出现时自动惩罚生效

# 场景适配验收
- combat 场景输出中动作词密度显著高于 dialogue 场景
- emotional 场景输出中心理描写词汇密度高于其他场景

# 质量评估验收
- ClichéReport 检测准确率 > 85%（人工验证）
- 偏置迭代周期：每 2 周根据报告更新偏置表
```

---

## 5.6 架构守卫

### sendChat 调用约束

**业务层（pages/stores/composables）不允许直接调用 `sendChat`。**

统一通过生成计划：

```typescript
interface GenerationPlan {
  name: string
  firstAttempt: {
    systemPrompt: string
    userPrompt: string
    model?: string
    temperature?: number
  }
  retryAttempts?: {
    systemPrompt: string
    userPrompt: string
    maxRetries: number
  }[]
  parser: (raw: string) => ParsedResult
  fallback: () => string  // 降级策略
}

async function runGenerationRetryPlan(plan: GenerationPlan): Promise<ParsedResult> {
  // 1. 首轮生成
  // 2. JSON 解析
  // 3. 字段归一化
  // 4. 失败重试
  // 5. 降级兜底
}
```

### 错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| 网络错误 | 重试 3 次，间隔 1s/2s/4s |
| API 限流 | 等待后重试，提示用户 |
| 解析失败 | 尝试修复，无效则降级 |
| 超时 | 使用已有响应或降级回复 |

## 5.7 提示词模板存储

| localStorage Key | 内容 | 说明 |
|-----------------|------|------|
| `prompt_templates` | 自定义模板 | 用户自定义提示词模板 |
| `prompt_history` | 使用历史 | 最近使用的提示词（用于优化） |
| `style_presets` | 风格预设 | 自定义风格预设 |

## 5.8 实施任务清单

### 已完成

| 任务 | 文件 | 说明 |
|------|------|------|
| sendChat 统一入口 | `src/services/api.js` | `getResolvedApiSettings` 合并配置 |
| 分层提示词模板 | `src/services/api.js` | `buildContextMessage` 等函数 |

### P0 - 基础能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 提示词模板中心 | 集中管理所有模板 | `src/services/promptBuilder.js` |
| 风格预设管理 | 切换风格时更新模板 | 同上 |
| 架构守卫强化 | 检查直接调用 sendChat | ESLint 规则 |
| Layer 0 硬性约束注入 | 状态引擎硬性规则写入系统提示词 | `promptBuilder.js` |
| 递归世界书注入 | 深度扫描 + 联动激活 | `useWorldEntry.js` |
| Author's Note 插入 | 插入到 history[-3] 位置 | `promptBuilder.js` |

### P0 - Token 偏置控制

| 任务 | 子任务 | 文件 |
|------|--------|------|
| logit_bias 引擎 | 偏置表管理 + API 参数注入 | `src/services/tokenBiasEngine.js` |
| 动态偏置计算 | 按叙事阶段/场景类型自动切换 | 同上 |
| 陈词滥调检测 | 分析输出质量并迭代偏置表 | `clichéAnalyzer.js` |
| 偏置预设配置 | disable_overused / action_variety 等预设 | `tokenBiasEngine.js` |

### P1 - 增强能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| Few-shot 示例管理 | 收集/选择/切换示例 | `src/services/fewShotManager.js` |
| 提示词版本历史 | 回溯/对比 | `promptBuilder.js` |
| 用户自定义模板 | 模板编辑/保存 | 组件 |

### P2 - 优化能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| prompt-optimizer 集成 | API 接入 | `src/services/promptOptimizer.js` |
| 自动压缩 | Token 预算管理 | 同上 |
| 提示词分析 | 效果统计 | 分析面板 |

## 5.9 验收标准

```bash
# P0 验收（小说体验模块提示词）
- Layer 0 硬性约束正确注入，AI 输出不违背既定时间/地点/活动
- 递归世界书注入深度 = 3 时，联动激活条目数符合预期
- Author's Note 正确插入到 history[-3] 位置
- 切换风格预设（literary/smooth/dialogue_heavy/minimal）后，AI 叙事语气有明显差异

# P0 验收（Token 偏置控制）
- logit_bias 禁用"突然"后，AI 输出中"突然"出现频率降低 80%+
- frequency_penalty 启用后，长期对话中词汇多样性提升
- 动态检测到重复 3 次的词后，第 4 次出现时自动惩罚生效
- combat 场景输出中动作词密度显著高于 dialogue 场景

# P1 验收
- Few-shot 示例正确注入
- 提示词版本可回溯
- 用户可创建自定义模板

# P2 验收
- prompt-optimizer 正确压缩
- Token 使用优化 20%+
- 提示词效果有数据支撑
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验（Layer 0-4 架构实例）
- [02-editor-ai.md](./02-editor-ai.md) - 编辑器 AI（Copilot 提示词）
- [04-memory-system.md](./04-memory-system.md) - 记忆力系统（记忆上下文注入）
- [07-proactive-advisor.md](./07-proactive-advisor.md) - 主动顾问（Token 偏置控制）