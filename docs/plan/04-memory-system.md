# 04 - 记忆力系统详细规划

> mem0 API 已接通，尚未融合进项目主逻辑。本模块目标是实现**跨会话的写作上下文记忆**。

## 4.1 mem0 简介

mem0 是一个长期记忆服务，核心能力：
- **跨会话记忆**：记住用户偏好、创作风格、常用设定
- **实体关系**：自动维护角色/地点/事件之间的关系图
- **自适应**：根据使用情况自动优化记忆权重

### 已有接口

```
mem0 API 端点：已部署，可访问
POST /v1/memories    - 存储记忆
GET /v1/memories     - 检索记忆
DELETE /v1/memories/{id} - 删除记忆
```

## 4.2 记忆类型

### 写作上下文记忆

| 记忆类型 | 示例 | 注入场景 |
|---------|------|---------|
| **角色设定** | 主角名"艾伦"，性格"内向坚韧" | AI 续写/扩展时 |
| **世界观** | "埃利城"是首都，"幽暗森林"在东边 | 世界书生成时 |
| **写作偏好** | 用户偏好"文学性强"风格 | 所有 AI 生成时 |
| **叙事视角** | 用户常用"第三人称有限视角" | 叙事生成时 |

### 体验状态记忆

| 记忆类型 | 示例 | 注入场景 |
|---------|------|---------|
| **决策历史** | 玩家选择"帮助村民"而非"收受贿赂" | AI 叙事时 |
| **关系变化** | "艾伦"和"玛丽亚"从陌生变为信任 | 对话/互动时 |
| **剧情进度** | 已完成"幽暗森林"章节 | 自动注入上下文 |

## 4.3 数据流设计

```
┌──────────────────────────────────────────────────────────────┐
│                     用户创作 / 体验                          │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │   自动提取关键设定        │
                  │  (角色/地点/偏好/决策)   │
                  └─────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │     mem0 API            │
                  │  POST /v1/memories      │
                  └─────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │      记忆存储            │
                  └─────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     AI 生成请求                              │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │     mem0 API            │
                  │  GET /v1/memories       │
                  └─────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │   记忆检索 + 注入        │
                  │  构建上下文             │
                  └─────────────────────────┘
                              │
                              ▼
                  ┌─────────────────────────┐
                  │      AI 生成            │
                  └─────────────────────────┘
```

## 4.4 API 封装

### useMem0 Composable

```typescript
// src/composables/useMem0.js

interface Memory {
  id: string
  content: string
  metadata: {
    type: 'character' | 'location' | 'preference' | 'decision' | 'relationship'
    entityId?: string
    importance: number
  }
  createdAt: string
}

interface Mem0Config {
  apiUrl: string        // mem0 服务地址
  userId: string        // 用户标识
}

// 核心方法
export function useMem0(config: Mem0Config) {
  // 存储记忆
  async function storeMemory(memory: Omit<Memory, 'id' | 'createdAt'>): Promise<Memory>

  // 检索记忆
  async function searchMemories(query: string, filters?: MemoryFilter): Promise<Memory[]>

  // 删除记忆
  async function deleteMemory(id: string): Promise<void>

  // 按类型检索
  async function getMemoriesByType(type: Memory['metadata']['type']): Promise<Memory[]>

  // 更新记忆权重
  async function updateImportance(id: string, importance: number): Promise<void>
}
```

### 上下文构建

```typescript
// 构建 AI 生成的记忆上下文
async function buildMemoryContext(userId: string, currentSituation: string): Promise<string> {
  const memories = await mem0.searchMemories(currentSituation, { limit: 10 })

  const sections = []
  for (const memory of memories) {
    sections.push(`[${memory.metadata.type}] ${memory.content}`)
  }

  return sections.join('\n')
}

// 在 sendChat 中注入
async function sendChatWithMemory(messages, context) {
  const memoryContext = await buildMemoryContext(userId, context.currentText)
  const systemMessage = {
    role: 'system',
    content: `【记忆上下文】\n${memoryContext}\n\n【当前情境】\n${context.situation}`
  }
  return sendChat([systemMessage, ...messages])
}
```

## 4.5 自动提取策略

### 角色设定提取

```typescript
// 从文本中提取角色信息
function extractCharacterSettings(text: string): Partial<Memory>[] {
  const patterns = [
    /^(.{2,4})（(.+?)）/,           // "艾伦（内向坚韧）"
    /(.+?)是(.+?)的角色/,            // "这是艾伦的角色"
    /角色(.+?)：(.+)/,              // "角色：艾伦"
  ]

  // ... 提取逻辑
}

// 触发时机：用户创建新角色、导入角色卡
```

### 决策历史提取

```typescript
// 从体验日志中提取决策
function extractDecisions(activities: Activity[]): Partial<Memory>[] {
  const decisionActivities = activities.filter(a =>
    a.type === 'decision' || a.title.includes('选择')
  )
  return decisionActivities.map(a => ({
    content: `决定：${a.title}`,
    metadata: { type: 'decision', importance: a.importance || 5 }
  }))
}
```

### 写作偏好提取

```typescript
// 从用户设置中提取偏好
function extractPreferences(settings: UserSettings): Partial<Memory>[] {
  return [
    {
      content: `叙事风格：${settings.narrativeStyle}`,
      metadata: { type: 'preference', importance: 8 }
    },
    {
      content: `叙事视角：${settings.viewpoint}`,
      metadata: { type: 'preference', importance: 7 }
    }
  ]
}
```

## 4.6 记忆注入规则

| 记忆类型 | 优先级 | 注入方式 | 预算占比 |
|---------|--------|---------|---------|
| 角色设定 | P0 | 直接注入 system prompt | ~20% |
| 当前情境关键决策 | P0 | 注入 context | ~10% |
| 世界观 | P1 | 按需注入（关键词触发） | ~15% |
| 写作偏好 | P1 | 注入 system prompt | ~10% |
| 历史关系 | P2 | 按需注入 | ~10% |

## 4.7 存储设计

| localStorage Key | 内容 | 说明 |
|-----------------|------|------|
| `mem0_user_id` | 用户 ID | 用于 mem0 API 认证 |
| `mem0_cache` | 记忆缓存 | 最近检索的记忆（避免频繁请求） |
| `mem0_sync_state` | 同步状态 | 上次同步时间、待同步操作 |

## 4.8 实施任务清单

### P0 - 基础能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| mem0 API 客户端封装 | 基本 CRUD + 错误处理 | `src/composables/useMem0.js` |
| 上下文自动提取 | 从创作中提取关键设定 | 同上 |
| 记忆检索注入 | 构建上下文 + 注入 AI | 同上 |

### P0 - 事件驱动同步

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 同步队列管理 | 去重节流 + 请求调度 | `src/composables/useMem0.js` |
| 角色卡同步触发器 | WorldBookEditor 保存时 enqueue | `WorldBookEditor.vue` |
| 重要活动同步触发器 | NovelExperience 活动触发时 enqueue | `NovelExperience.vue` |
| 设置偏好同步触发器 | Settings 保存时 enqueue | `Settings.vue` |
| 记忆检索拦截器 | 三条主发送流的 AOP 拦截 | `useChat.js` / `useCopilot.js` / `useDirector.js` |
| L1 + L2 缓存层 | 进程内 Map + localStorage | `useMem0.js` |

### P1 - 增强能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 体验状态记忆 | 从体验日志提取决策 | `useMem0.js` |
| 记忆权重管理 | 重要性更新 | 同上 |
| 记忆缓存 | 本地缓存 + 定期同步 | 同上 |

### P2 - 可视化

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 关系图谱可视化 | 世界书编辑器中展示关系 | `WorldBookEditor.vue` |
| 记忆管理面板 | 查看/编辑/删除记忆 | 组件 |

## 4.10 事件驱动同步机制

### 4.10.1 触发事件定义

#### 事件一：角色卡创建 / 大幅修改（writing_character）

**触发条件：**
- 用户在世界书编辑器中新建角色卡，并完成首次保存
- 用户对已有角色卡的核心设定（姓名、性格、背景、关键关系）进行修改，修改幅度 > 20% 字符或涉及 `personality` / `background` / `relationships` 字段

**同步数据结构：**

```typescript
interface CharacterMemoryPayload {
  type: 'character'
  entityId: string           // 角色卡 ID，用于去重更新
  content: string            // 格式化的角色描述文本
  importance: number         // 1-10，基于角色在故事中的出场频次与叙事权重
  metadata: {
    source: 'writing_character'
    version: number          // 角色卡版本号，用于增量判断
    tags: string[]           // 自动打标：['主角', '女性', '幽暗森林'] 等
  }
}
```

**示例 content 字段：**
```
角色：艾伦（Alen）
性别：女 | 年龄：约25岁
性格关键词：内向坚韧、有责任感的观察者
关键背景：曾是埃利城档案馆的见习管理员，因事件触发被迫离开
核心关系：与玛丽亚（原室友）关系从疏离转为深度信任
当前状态（最后同步时）：居住在幽暗森林边缘的小屋中
```

#### 事件二：新重要活动记录（important_activity）

**触发条件：**
- 用户在小说体验（NovelExperience）中触发任意 `type === 'important_activity'` 的活动节点
- 或活动标题 / 描述中出现关键词：决定、选择、命运、转折、秘密、发现

**同步数据结构：**

```typescript
interface ActivityMemoryPayload {
  type: 'decision' | 'event' | 'revelation'
  entityId: string           // 活动 ID
  content: string            // 活动描述，AI 友好格式
  importance: number         // 1-10，活动对剧情的权重（高冲突=高权重）
  metadata: {
    source: 'important_activity'
    chapterId?: string       // 所属章节（如果已分配）
    sceneTags: string[]      // 场景标签：['幽暗森林', '夜晚', '秘密']
    involvedCharacters: string[] // 涉及角色 ID 列表
    consequence?: string     // 可选：记录该活动导致的即时后果
  }
}
```

#### 事件三：API 设置或行文偏好更新（apiSettings）

**触发条件：**
- 用户在设置页修改 `AIProvider` / `modelId` / `temperature` / `maxTokens` 等任一字段
- 用户在偏好设置中修改 `narrativeStyle` / `viewpoint` / `language` 等写作相关字段

**同步数据结构：**

```typescript
interface PreferenceMemoryPayload {
  type: 'preference'
  entityId: string           // 固定值：'user_api_settings'
  content: string            // 格式化的偏好描述
  importance: number          // 7（行文偏好为固定高优先级）
  metadata: {
    source: 'apiSettings'
    category: 'ai_provider' | 'writing_style' | 'language'
  }
}
```

**示例 content 字段：**
```
AI 提供商偏好：Google Gemini 2.0 Flash
温度参数：0.7（偏向有创意的生成）
行文风格偏好：文学性强、注重心理描写
叙事视角：第三人称有限视角，聚焦主角内心
语言：简体中文，句式偏长复合句
```

### 4.10.2 异步 POST 请求的节流逻辑

mem0 的 `POST /v1/memories` 为异步写入操作，且前端可能在短时间内触发多次同步（如批量导入角色卡）。需要以下节流机制：

#### 去重与合并（Event Deduplication）

在 `useMem0` composable 内部维护一个待同步队列：

```typescript
interface SyncQueue {
  pending: Map<string, { payload: object, timestamp: number }>
  processing: boolean
}

const syncQueue = new Map<string, { payload: object, timestamp: number }>()
const DEBOUNCE_MS = 2000  // 同一 entityId 在 2 秒内多次触发只保留最新
```

**去重规则：**
- 按 `entityId + source` 作为唯一键
- 新事件入队时，若队列中已存在相同键且未超过 `DEBOUNCE_MS`，则覆盖 payload（不创建新条目）
- 若超过 `DEBOUNCE_MS`，视为新事件，正常入队

#### 请求调度（Request Scheduling）

```typescript
const BATCH_INTERVAL_MS = 500   // 每 500ms 出队一批
const MAX_CONCURRENT = 3        // 最多同时 3 个请求
const MAX_PER_MINUTE = 20       // 速率上限：20 req/min

async function processQueue() {
  if (processing || pending.size === 0) return

  const batch = Array.from(pending.values()).slice(0, MAX_CONCURRENT)
  await Promise.all(batch.map(item => storeMemory(item.payload)))
  // 移除已处理的
  batch.forEach(item => pending.delete(item.entityId))

  setTimeout(processQueue, BATCH_INTERVAL_MS)
}
```

#### 错误重试与回退

```typescript
async function storeMemoryWithRetry(payload: object, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await mem0.storeMemory(payload)
      return
    } catch (err) {
      if (err.status === 429) {
        // 速率超限：指数回退
        await sleep(2 ** i * 1000)
      } else if (err.status >= 500) {
        await sleep(1000 * (i + 1))
      } else {
        throw err
      }
    }
  }
  // 全部失败：落本地队列，待下次全局重试
  persistFailedSync(payload)
}
```

### 4.10.3 触发器与 Hook 挂载点

| 事件 | 挂载位置 | 触发函数 |
|------|---------|---------|
| 角色卡创建/修改 | `WorldBookEditor.vue` 保存时 | `triggerCharacterSync(characterData)` |
| 重要活动记录 | `NovelExperience.vue` 活动节点触发时 | `triggerActivitySync(activityData)` |
| 设置变更 | `Settings.vue` 保存设置时 | `triggerPreferenceSync(settingsData)` |

所有触发函数均走 `useMem0().enqueueSync()` 接口，不直接调用 `storeMemory`，确保经过节流队列。

---

## 4.11 记忆检索与 Context 注入

### 4.11.1 检索触发机制

#### 触发时机

在以下三个主发送流发起前，系统自动从 mem0 检索相关记忆片段：

| 触发场景 | 检索关键词来源 | mem0 查询语句模板 |
|---------|--------------|------------------|
| 主对话（Chat） | 当前章节主题 + 用户输入关键词 | `"关于{characterName}的设定，在{chapterTheme}场景下的关键记忆"` |
| AI 续写（Copilot） | 当前光标所在段落的上下文主题 | `"当前叙事风格偏好，近期关键剧情决定"` |
| 编导生成（Director） | 当前选中的场景/节点的情绪标签 | `"场景{sceneName}相关的角色状态和历史决定"` |

#### 检索函数设计

```typescript
interface MemoryRetrievalOptions {
  query: string                    // 自然语言检索词
  limit?: number                   // 最多返回条数，默认 8
  filters?: {
    type?: Memory['metadata']['type']
    entityId?: string
    minImportance?: number
  }
}

async function retrieveMemories(options: MemoryRetrievalOptions): Promise<Memory[]> {
  const cacheKey = `mem0:${hash(options.query)}`

  // 缓存命中检查（避免 30s 内重复检索同一 query）
  const cached = getFromCache(cacheKey)
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.results
  }

  const results = await mem0.searchMemories(options.query, {
    limit: options.limit ?? 8,
    filters: options.filters
  })

  setCache(cacheKey, { results, timestamp: Date.now() })
  return results
}
```

### 4.11.2 记忆上下文构建

检索返回的 `Memory[]` 需要格式化为 AI 可理解的上下文片段：

```typescript
function buildMemoryContextBlock(memories: Memory[]): string {
  if (memories.length === 0) return ''

  // 按 type 分组，相同 type 的记忆合并为一个段落
  const grouped = groupBy(memories, m => m.metadata.type)

  const blocks = []
  for (const [type, items] of Object.entries(grouped)) {
    const header = {
      character: '【角色设定】',
      decision: '【近期关键决定】',
      event: '【重要事件】',
      preference: '【写作偏好】',
      location: '【世界观设定】',
    }[type] ?? `【${type}】`

    const content = items
      .sort((a, b) => b.metadata.importance - a.metadata.importance)
      .map(m => `・${m.content}`)
      .join('\n')

    blocks.push(`${header}\n${content}`)
  }

  return blocks.join('\n\n')
}
```

### 4.11.3 系统提示词注入

```typescript
interface InjectMemoryOptions {
  memories: Memory[]
  tokenBudget: number      // 总可用 token 预算（从模型上下文窗口中分配）
  memoryRatio: number      // 记忆上下文占总预算的比例，默认 0.3（30%）
}

function injectIntoSystemPrompt(
  originalSystemPrompt: string,
  options: InjectMemoryOptions
): { prompt: string, consumedTokens: number } {
  const memoryBlock = buildMemoryContextBlock(options.memories)
  const maxMemoryTokens = Math.floor(options.tokenBudget * options.memoryRatio)

  // 如果记忆块超过预算，按重要性从低到高裁剪
  let trimmedBlock = memoryBlock
  while (estimateTokens(trimmedBlock) > maxMemoryTokens && trimmedBlock.length > 0) {
    const lines = trimmedBlock.split('\n')
    lines.pop()  // 移除最低优先级行
    trimmedBlock = lines.join('\n')
  }

  const enhancedPrompt = `${originalSystemPrompt}\n\n${trimmedBlock}`

  return {
    prompt: enhancedPrompt,
    consumedTokens: estimateTokens(trimmedBlock)
  }
}
```

**注入位置：** 在 `sendChat` / `useCopilot` / `useDirector` 的消息构建阶段，在发出请求前调用 `injectIntoSystemPrompt()`，将返回的 `prompt` 替换原 system message。

### 4.11.4 三条主发送流的检索策略

#### 流一：主对话（Chat）

```typescript
// 在 sendChat 的外层包装
async function sendChatWithMemory(messages: Message[], context: ChatContext) {
  // 提取当前章节主题 + 输入关键词
  const chapterTheme = getCurrentChapter().theme
  const inputKeywords = extractKeywords(context.userMessage)

  const memories = await retrieveMemories({
    query: `${chapterTheme} ${inputKeywords.join(' ')}`,
    limit: 8,
    filters: { minImportance: 4 }
  })

  const { prompt: enhancedSystemPrompt } = injectIntoSystemPrompt(SYSTEM_PROMPT, {
    memories,
    tokenBudget: getModelContextBudget() - estimateTokens(messages),
    memoryRatio: 0.3
  })

  return sendChat([{ role: 'system', content: enhancedSystemPrompt }, ...messages])
}
```

#### 流二：AI 续写（Copilot）

```typescript
// 在 copilotGenerate 前拦截
async function copilotGenerateWithMemory(params: CopilotParams) {
  const cursorContext = getCursorParagraphContext()  // 光标所在段落的叙事摘要
  const narrativeStyle = await retrieveMemories({
    query: `写作风格偏好 ${cursorContext.theme}`,
    limit: 5,
    filters: { type: 'preference' }
  })

  const recentDecisions = await retrieveMemories({
    query: `近期关键剧情决定`,
    limit: 3,
    filters: { type: 'decision', minImportance: 7 }
  })

  const allMemories = [...narrativeStyle, ...recentDecisions]
  const { prompt } = injectIntoSystemPrompt(COPILOT_SYSTEM_PROMPT, {
    memories: allMemories,
    tokenBudget: getModelContextBudget() - estimateTokens(params.existingText),
    memoryRatio: 0.25
  })

  return copilotGenerate({ ...params, systemPrompt: prompt })
}
```

#### 流三：编导生成（Director）

```typescript
// 在 directorGenerate 前拦截
async function directorGenerateWithMemory(params: DirectorParams) {
  const sceneNode = getSelectedSceneNode()
  const sceneEmotion = sceneNode.emotionLabel ?? sceneNode.emotion ?? 'calm'
  const involvedCharacters = sceneNode.involvedCharacterIds ?? []

  // 并行检索：场景情绪 + 涉及角色状态
  const [emotionMemories, characterMemories] = await Promise.all([
    retrieveMemories({
      query: `场景情绪${sceneEmotion}相关记忆`,
      limit: 5
    }),
    retrieveMemories({
      query: involvedCharacters.map(id => `角色${id}当前状态`).join(' '),
      limit: 6,
      filters: { type: 'character', entityId: involvedCharacters }
    })
  ])

  const allMemories = [...emotionMemories, ...characterMemories]
  const { prompt } = injectIntoSystemPrompt(DIRECTOR_SYSTEM_PROMPT, {
    memories: allMemories,
    tokenBudget: getModelContextBudget() - estimateTokens(params.existingContent),
    memoryRatio: 0.35  // 编导需要更多世界观上下文
  })

  return directorGenerate({ ...params, systemPrompt: prompt })
}
```

### 4.11.5 缓存策略

为避免同一检索词短时间内重复请求 mem0 API，在 `useMem0` 内部维护两层缓存：

```typescript
interface Mem0Cache {
  // L1: 进程内缓存（Map），TTL 30s
  l1: Map<string, { data: Memory[], timestamp: number }>
  // L2: localStorage 缓存，TTL 5min（跨会话）
  l2Key: 'mem0_retrieval_cache'
}

function getCachedMemories(query: string): Memory[] | null {
  // L1 检查
  const l1Entry = l1.get(query)
  if (l1Entry && Date.now() - l1Entry.timestamp < 30000) return l1Entry.data

  // L2 检查（localStorage）
  const l2Cache = JSON.parse(localStorage.getItem('mem0_retrieval_cache') ?? '{}')
  const l2Entry = l2Cache[query]
  if (l2Entry && Date.now() - l2Entry.timestamp < 300000) {
    l1.set(query, l2Entry)  // 升级到 L1
    return l2Entry.data
  }

  return null
}
```

---

## 4.12 验收标准

```bash
# 事件同步验收
- 角色卡保存后 3s 内，mem0 可检索到对应记忆（GET /v1/memories?q={角色名}）
- 重要活动触发后，同步队列在 5s 内出队并 POST 成功
- API 设置变更后，偏好记忆在下一次 AI 请求中正确注入
- 连续快速保存同一角色卡（< 2s），只产生 1 次 POST（去重生效）
- POST 触发速率超限时，指数回退重试不超过 3 次

# 记忆检索验收
- 主对话发送后，AI 响应中出现角色设定一致的内容（不矛盾）
- Copilot 续写风格与用户偏好 memory 中描述的风格一致
- Director 生成时，涉及角色状态与最近决策 memory 保持一致
- 相同检索词在 30s 内第二次请求，命中 L1 缓存，无 mem0 HTTP 请求

# 跨会话验收
- 关闭浏览器后重新打开，L2 缓存（localStorage）中仍有 5min 内的检索结果
- 角色记忆在 30 天后仍可检索到（mem0 服务端保留）
```

```bash
# P0 验收
- 存储记忆后，下次请求能检索到
- 检索到的记忆正确注入 AI 生成
- 跨会话后记忆仍然存在

# P1 验收
- 体验中的决策自动记录为记忆
- 关系变化（如"艾伦变得信任玛丽亚"）被记录
- 记忆重要性更新后，检索结果排序正确

# P2 验收
- 世界书编辑器中显示关系图谱
- 记忆管理面板可查看/编辑/删除
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验（triggerActivitySync 挂载于 NovelExperience）
- [02-editor-ai.md](./02-editor-ai.md) - 编辑器 AI（Copilot 为三大记忆检索流之一）
- [05-prompt-engineering.md](./05-prompt-engineering.md) - 提示词工程（记忆上下文注入系统提示词）
- [07-proactive-advisor.md](./07-proactive-advisor.md) - 主动顾问（共享 AdvisorStore）