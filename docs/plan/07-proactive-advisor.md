# 07 - 主动创作顾问与 OpenClaw 深度集成规划

> 本模块实现从"用户被动提问"到"AI 隐形副驾驶主动介入"的交互范式转变。通过非侵入式的感知层捕捉写作上下文，后端异步调用 OpenClaw 进行深度审查，最终通过视觉轻提示引导用户修正。

## 7.1 核心定位与设计原则

### 7.1.1 从被动到主动的交互范式转变

传统 AI 写作辅助的范式为**响应式（Reactive）**：用户发起指令，AI 给出回复。此模式的问题在于：

- 用户在沉浸式写作时，打断提问会破坏心流
- 人设冲突、时间矛盾等问题往往在写作完成后才被发现
- 节奏失控等深层问题需要通读全文才能识别

**主动型顾问（Proactive Advisor）**的范式将 AI 定位为**隐形副驾驶（Invisible Copilot）**：

```
传统响应式：
  用户 ──► [提问] ──► AI ──► [回复] ──► 用户

主动顾问式：
  用户写作（持续）
       │
       ▼
  后台无声分析（AI 不打断）
       │
       ▼
  发现问题 ──► [视觉轻提示] ──► 用户自行决定是否查看
       │
       ▼
  用户点击查看 ──► [顾问报告] ──► 用户采纳或忽略
```

### 7.1.2 非侵入式交互原则

**核心约束：AI 顾问在用户写作过程中绝不弹窗、不打断、不强制呈现。**

| 交互方式 | 触发条件 | 用户感知 |
|---------|---------|---------|
| 悬浮按钮呼吸灯 | 后台分析中 | 按钮泛光微脉动 |
| 红点提示 | 产生新警报 | 按钮旁小红点 |
| 行内灰色波浪线 | 发现设定冲突 | 文字下淡灰色波浪，hover 显示说明 |
| 侧边栏滑出 | 用户主动点击 | 轻量侧边栏滑入 |

**禁止使用的交互方式：**
- 模态弹窗自动弹出打断写作
- 推送通知强制展示
- Toast 长时间遮挡屏幕
- 任何形式的中断性 input 强制填写

### 7.1.3 非侵入判断基准

当 OpenClaw 分析结果为以下级别时，仅使用轻提示，不主动拉取用户注意力：

- `info` 级别（信息性提示，如"当前场景为幽暗森林，与之前设定的东部平原略有偏差，但可接受"）→ 仅记录，用户主动查看历史报告
- `warning` 级别（设定轻度违背，如角色年龄前后矛盾）→ 行内波浪线 + hover 说明

当结果为以下级别时，通过红点 + 悬浮按钮脉冲提示用户：

- `alert` 级别（严重冲突，如时间线矛盾导致剧情不可能）→ 悬浮按钮脉冲 + 红点
- `critical` 级别（剧情失控，如与大纲偏离度 > 60%）→ 悬浮按钮持续亮红 + 声音可选提示

---

## 7.2 前端主动触发与监听器设计

### 7.2.1 写作停顿监听器（Writing Pause Listener）

**挂载位置：** `src/composables/useRichEditor.js`（富文本编辑器 composable）

**工作原理：**

```
用户持续输入
     │
     ▼
每字符输入后重置 pauseTimer
     │
     ├──► 3 秒内无新字符输入 ──► pauseTimer 触发
     │
     ▼
检查连续写作字数 ≥ 200
     │
     ├──► 是 ──► 提取光标前后各 500 字符上下文
     │         发送异步 POST /api/openclaw/proactive-check
     │
     └──► 否 ──► 等待下一轮触发
```

**实现代码：**

```typescript
// src/composables/useRichEditor.js

interface PauseListenerOptions {
  minWordCount: number        // 触发最低字数，默认 200
  pauseThresholdMs: number    // 停顿阈值，默认 3000
  contextRadius: number       // 光标前后提取字符数，默认 500
  maxDelayMs: number          // 最长延迟触发（防止极端情况），默认 10000
}

export function usePauseListener(options: PauseListenerOptions = {}) {
  const {
    minWordCount = 200,
    pauseThresholdMs = 3000,
    contextRadius = 500,
    maxDelayMs = 10000
  } = options

  let pauseTimer: ReturnType<typeof setTimeout> | null = null
  let maxDelayTimer: ReturnType<typeof setTimeout> | null = null
  let accumulatedText = ''
  let lastCursorPos = 0

  function onTextInput(event: InputEvent) {
    const text = extractCurrentText(event.target)
    accumulatedText += text
    lastCursorPos = getCursorPosition(event.target)

    // 重置停顿计时器
    clearTimeout(pauseTimer)
    clearTimeout(maxDelayTimer)

    // 设置最大延迟保护（即使未达字数也触发）
    maxDelayTimer = setTimeout(() => {
      triggerAnalysis()
    }, maxDelayMs)

    // 设置停顿计时器
    pauseTimer = setTimeout(() => {
      if (accumulatedText.length >= minWordCount) {
        triggerAnalysis()
      }
    }, pauseThresholdMs)
  }

  async function triggerAnalysis() {
    accumulatedText = ''  // 重置累计文本

    const editorContent = getEditorContent()
    const cursorPos = lastCursorPos

    // 提取光标前后上下文
    const before = editorContent.slice(Math.max(0, cursorPos - contextRadius), cursorPos)
    const after = editorContent.slice(cursorPos, cursorPos + contextRadius)
    const context = before + after

    // 发送异步分析请求（不阻塞写作）
    proactiveCheck(context, {
      type: 'writing_pause',
      cursorPosition: cursorPos,
      timestamp: Date.now()
    })
  }

  return { onTextInput }
}
```

### 7.2.2 一致性监控器（Consistency Monitor）

**挂载位置：** `src/composables/useWorldEntry.js`（世界书关键词匹配流程）

**工作原理：**

```
用户输入文本
     │
     ▼
世界书条目递归扫描（参见 01-novel-experience.md 1.6.1）
命中核心词条（type = 'character' | 'location' | 'lore'）
     │
     ▼
同时命中 ≥ 2 个条目
     │
     ▼
后台交叉对比检查冲突
     │
     ├──► 发现冲突 ──► 生成 alert 对象
     │                  推送 SSE 到前端
     │                  渲染行内波浪线
     │
     └──► 无冲突 ──► 静默通过
```

**一致性检查类型：**

| 检查项 | 数据来源 | 冲突判定逻辑 |
|--------|---------|------------|
| 角色年龄前后一致 | `writingCharacter.age` vs 输入中提及的年龄 | 输入年龄与状态引擎中的值偏差 > 2 岁 |
| 角色当前位置 | `worldMapState.currentScene` vs 输入描述的地点 | 角色出现在与当前场景不符的地点描述中 |
| 时间线一致性 | `writingTime` vs 输入描述的时间 | 输入描述的时间带（早晨/黄昏）与状态引擎 period 不匹配 |
| 角色关系状态 | `npcRelations` vs 输入中的关系描述 | 描述的关系强度（信任/敌对）与 npcRelations 偏差 > 2 档 |
| 物品归属 | `inventory` vs 输入中角色持有的物品 | 角色"使用"未在 inventory 中的物品 |

**实现代码：**

```typescript
// src/composables/useConsistencyMonitor.js

interface ConsistencyCheckResult {
  isConsistent: boolean
  violations: ConsistencyViolation[]
}

interface ConsistencyViolation {
  type: 'age' | 'location' | 'time' | 'relationship' | 'item'
  severity: 'info' | 'warning' | 'alert' | 'critical'
  title: string
  content: string
  anchorRange: { start: number, end: number }  // 文本中的位置
  relatedEntityId: string
  expectedValue: string
  actualValue: string
}

async function checkConsistency(inputText: string, context: {
  worldbook: WorldBook
  experienceState: ExperienceState
}): Promise<ConsistencyCheckResult> {
  const violations: ConsistencyViolation[] = []

  // 1. 提取输入中的实体提及
  const mentionedCharacters = extractCharacterMentions(inputText)
  const mentionedLocations = extractLocationMentions(inputText)
  const mentionedTime = extractTimeMentions(inputText)

  // 2. 角色年龄一致性检查
  for (const char of mentionedCharacters) {
    const entry = findWorldEntry(context.worldbook, char.name)
    if (!entry || !entry.metadata?.age) continue

    const inputAge = extractAgeFromText(inputText, char.name)
    if (inputAge !== null) {
      const expectedAge = context.experienceState.writingCharacter.age
      if (Math.abs(inputAge - expectedAge) > 2) {
        violations.push({
          type: 'age',
          severity: 'warning',
          title: `角色年龄不一致：${char.name}`,
          content: `输入中描述 ${char.name} 的年龄为 ${inputAge} 岁，但根据故事时间推算应为 ${expectedAge} 岁。`,
          anchorRange: char.range,
          relatedEntityId: entry.id,
          expectedValue: String(expectedAge),
          actualValue: String(inputAge)
        })
      }
    }
  }

  // 3. 地点一致性检查
  const currentScene = context.experienceState.worldMapState.currentScene
  for (const loc of mentionedLocations) {
    if (loc.name !== currentScene && !isAdjacent(loc.name, currentScene, context.worldbook)) {
      violations.push({
        type: 'location',
        severity: 'warning',
        title: `地点冲突：${loc.name}`,
        content: `当前场景为"${currentScene}"，但输入描述的角色活动似乎在"${loc.name}"发生。`,
        anchorRange: loc.range,
        relatedEntityId: findWorldEntry(context.worldbook, loc.name)?.id ?? '',
        expectedValue: currentScene,
        actualValue: loc.name
      })
    }
  }

  // 4. 时间线一致性检查
  const currentPeriod = context.experienceState.writingTime.period
  for (const time of mentionedTime) {
    if (!isCompatiblePeriod(time.period, currentPeriod)) {
      violations.push({
        type: 'time',
        severity: 'alert',
        title: `时间线矛盾`,
        content: `当前时间为"${currentPeriod}"，但输入描述似乎发生在"${time.period}"。`,
        anchorRange: time.range,
        relatedEntityId: '',
        expectedValue: currentPeriod,
        actualValue: time.period
      })
    }
  }

  return {
    isConsistent: violations.length === 0,
    violations
  }
}
```

### 7.2.3 剧情失控度分析（Plot Drift Monitor）

**挂载位置：** `src/composables/useNovelExperience.js`（小说体验主逻辑）

**工作原理：**

```
每轮剧情交互完成后
     │
     ▼
交互计数 +1
     │
     ├──► 达到 3 轮 ──► 触发剧情分析
     │                  检查 activities 与大纲偏离度
     │                  重置计数
     │
     └──► 未达阈值 ──► 静默继续
```

**剧情偏离度判定：**

```typescript
// src/composables/usePlotDriftMonitor.js

interface PlotDriftResult {
  driftScore: number          // 0-100，0=完全吻合，100=完全偏离
  driftLevel: 'none' | 'minor' | 'moderate' | 'severe'
  summary: string             // AI 生成的分析摘要
  suggestions: string[]       // 修正建议
}

async function analyzePlotDrift(context: {
  activities: Activity[]        // 来自 experience_state.activities
  outline: StoryOutline | null  // 可选：预设大纲
  recentNarrative: string       // 最近 3-5 轮叙事摘要
}): Promise<PlotDriftResult> {
  // 若无预设大纲，则基于 activities 序列分析剧情走向突变
  if (!context.outline) {
    return analyzeWithoutOutline(context)
  }

  // 有大纲时：对比活动序列与预设节点
  const outlineNodes = context.outline.nodes
  const activityTypes = context.activities.map(a => a.type)

  // 计算偏离度：已跳过关键节点数 / 关键节点总数
  const skippedNodes = outlineNodes.filter(node =>
    node.type === 'milestone' &&
    !activityTypes.includes(node.relatedActivityType)
  )

  const driftScore = Math.min(100, (skippedNodes.length / Math.max(1, outlineNodes.length)) * 100)

  return {
    driftScore,
    driftLevel: classifyDrift(driftScore),
    summary: await generateDriftSummary(context, driftScore),
    suggestions: await generateDriftSuggestions(context, driftScore)
  }
}

function classifyDrift(score: number): PlotDriftResult['driftLevel'] {
  if (score < 15) return 'none'
  if (score < 35) return 'minor'
  if (score < 60) return 'moderate'
  return 'severe'
}
```

---

## 7.3 后端异步队列与 SSE 实时通道

### 7.3.1 接口设计

**POST /api/openclaw/proactive-check**

接收前端发送的分析请求，立即返回 HTTP 200 释放连接，后端异步执行 OpenClaw 审查。

**请求格式：**

```typescript
interface ProactiveCheckRequest {
  type: 'writing_pause' | 'consistency_check' | 'plot_drift'
  context: {
    text: string                    // 写作上下文或完整输入
    experienceState?: ExperienceState // 当前体验状态（用于一致性检查）
    activities?: Activity[]         // 活动记录（用于剧情失控分析）
    worldbook?: WorldBook            // 世界书（按需传递，减少带宽）
    cursorPosition?: number          // 光标位置（用于行内标注）
  }
  metadata: {
    timestamp: number
    source: 'richEditor' | 'novelExperience' | 'worldBookEditor'
    userId: string
  }
}
```

**响应格式（即时）：**

```json
{
  "status": "analyzing",
  "requestId": "uuid-v4",
  "queuedAt": 1716500000000
}
```

### 7.3.2 异步处理流水线

```
后端接收到 POST /api/openclaw/proactive-check
         │
         ▼
立即返回 HTTP 200 { status: "analyzing", requestId }
         │
         ▼
请求入队到 async-processing-queue（内存队列或 Redis）
         │
         ▼
Worker 线程池消费队列
         │
         ▼
按 type 分发到对应分析器：
  ├── writing_pause ──► OpenClaw_WritingAnalyzer
  ├── consistency_check ──► OpenClaw_ConsistencyChecker
  └── plot_drift ──► OpenClaw_PlotAnalyzer
         │
         ▼
OpenClaw 返回审查结果
         │
         ├──► 发现问题 ──► 构造 activeAlert 对象
         │                  通过 SSE 推送到前端
         │
         └──► 无问题 ──► 结果缓存（供下次 GET 备用）
```

### 7.3.3 SSE 通道设计

**SSE 端点：** `GET /api/openclaw/alerts/stream`

**服务端推送格式：**

```typescript
// event: new-alert
data: {
  "id": "alert_uuid",
  "type": "consistency" | "plot_drift" | "writing_style" | "scene_unlock",
  "title": "时间线冲突警告",
  "content": "当前场景为黄昏，但输入描述提到'清晨的阳光'。",
  "severity": "alert",
  "anchorRange": { "start": 120, "end": 130 },  // 行内波浪线位置
  "suggestedAction": "将'清晨的阳光'修改为'黄昏的余晖'",
  "createdAt": 1716500000000
}

// event: analysis-complete
data: {
  "requestId": "uuid-v4",
  "result": "ok" | "issues_found",
  "summary": "未发现明显问题"
}
```

**前端订阅示例：**

```typescript
// src/composables/useProactiveAdvisor.js

class ProactiveAdvisor {
  private eventSource: EventSource | null = null
  private requestId: string | null = null

  connect(userId: string) {
    this.eventSource = new EventSource(`/api/openclaw/alerts/stream?userId=${userId}`)

    this.eventSource.addEventListener('new-alert', (event) => {
      const alert: ActiveAlert = JSON.parse(event.data)
      this.handleNewAlert(alert)
    })

    this.eventSource.addEventListener('analysis-complete', (event) => {
      const result = JSON.parse(event.data)
      this.handleAnalysisComplete(result)
    })

    this.eventSource.onerror = () => {
      // SSE 断开时自动重连
      setTimeout(() => this.connect(userId), 3000)
    }
  }

  private handleNewAlert(alert: ActiveAlert) {
    // 写入 Pinia store
    advisorStore.addAlert(alert)

    // 触发 UI 渲染（根据 severity 决定交互方式）
    if (alert.severity === 'critical') {
      advisorStore.triggerCriticalPulse()
    } else if (alert.severity === 'alert') {
      advisorStore.triggerAlertDot()
    }
  }

  async proactiveCheck(payload: ProactiveCheckRequest) {
    const response = await fetch('/api/openclaw/proactive-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json()
    this.requestId = data.requestId
    return data
  }
}
```

### 7.3.4 OpenClaw 审查结果映射

```typescript
interface OpenClawResult {
  findings: OpenClawFinding[]
  overallScore: number       // 0-100
  summary: string
}

interface OpenClawFinding {
  category: 'consistency' | 'plot_structure' | 'character' | 'pacing' | 'world_logic'
  severity: 'info' | 'warning' | 'alert' | 'critical'
  message: string
  location?: {
    type: 'text_range' | 'character_id' | 'scene_id'
    identifier: string
    range?: { start: number, end: number }
  }
  suggestion?: string
}

function mapToActiveAlert(result: OpenClawResult, requestType: string): ActiveAlert[] {
  return result.findings.map(finding => ({
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: mapCategoryToAlertType(finding.category),
    title: generateAlertTitle(finding),
    content: finding.message,
    severity: finding.severity,
    anchorRange: finding.location?.range ?? null,
    suggestedAction: finding.suggestion ?? null,
    createdAt: Date.now()
  }))
}

function mapCategoryToAlertType(category: string): ActiveAlert['type'] {
  const map: Record<string, ActiveAlert['type']> = {
    consistency: 'consistency',
    plot_structure: 'plot_drift',
    character: 'consistency',
    pacing: 'writing_style',
    world_logic: 'consistency'
  }
  return map[category] ?? 'general'
}
```

---

## 7.4 Pinia Store 状态管理扩展

### 7.4.1 AdvisorStore 接口定义

```typescript
// src/stores/advisorStore.js

import { defineStore } from 'pinia'

export const useAdvisorStore = defineStore('advisor', {
  state: () => ({
    // 后台分析状态
    isBackgroundAnalyzing: false,

    // 活跃警报列表
    activeAlerts: [] as ActiveAlert[],

    // 已读警报历史（保留最近 50 条）
    alertHistory: [] as ActiveAlert[],

    // SSE 连接状态
    sseStatus: 'disconnected' | 'connecting' | 'connected' | 'error',

    // 悬浮按钮视觉状态
    floatingButtonState: 'idle' | 'pulsing' | 'alert',

    // 当前选中的警报（用于侧边栏详情）
    selectedAlertId: null as string | null,

    // 侧边栏展开状态
    isSidebarOpen: false
  }),

  getters: {
    unreadAlertCount: (state) =>
      state.activeAlerts.filter(a => !a.isRead).length,

    criticalAlerts: (state) =>
      state.activeAlerts.filter(a => a.severity === 'critical'),

    alertListByType: (state) => {
      const grouped = {}
      for (const alert of state.activeAlerts) {
        if (!grouped[alert.type]) grouped[alert.type] = []
        grouped[alert.type].push(alert)
      }
      return grouped
    }
  },

  actions: {
    // 添加新警报
    addAlert(alert: ActiveAlert) {
      // 避免重复添加相同 id
      if (this.activeAlerts.find(a => a.id === alert.id)) return

      this.activeAlerts.unshift(alert)

      // 更新悬浮按钮状态
      if (alert.severity === 'critical') {
        this.floatingButtonState = 'alert'
      } else if (this.floatingButtonState === 'idle') {
        this.floatingButtonState = 'pulsing'
      }
    },

    // 标记警报为已读
    markAsRead(alertId: string) {
      const alert = this.activeAlerts.find(a => a.id === alertId)
      if (alert) {
        alert.isRead = true
        // 移动到历史
        this.alertHistory.unshift(alert)
        if (this.alertHistory.length > 50) {
          this.alertHistory.pop()
        }
        // 重新计算按钮状态
        this.recalculateFloatingButtonState()
      }
    },

    // 清除单个警报
    dismissAlert(alertId: string) {
      this.activeAlerts = this.activeAlerts.filter(a => a.id !== alertId)
      this.recalculateFloatingButtonState()
    },

    // 清除所有已读警报
    clearReadAlerts() {
      this.activeAlerts = this.activeAlerts.filter(a => !a.isRead)
      this.recalculateFloatingButtonState()
    },

    // 重算悬浮按钮状态
    recalculateFloatingButtonState() {
      const hasUnread = this.activeAlerts.some(a => !a.isRead)
      const hasCritical = this.criticalAlerts.length > 0

      if (hasCritical) {
        this.floatingButtonState = 'alert'
      } else if (hasUnread) {
        this.floatingButtonState = 'pulsing'
      } else {
        this.floatingButtonState = 'idle'
        this.isSidebarOpen = false
      }
    },

    triggerCriticalPulse() {
      this.floatingButtonState = 'alert'
    },

    triggerAlertDot() {
      if (this.floatingButtonState === 'idle') {
        this.floatingButtonState = 'pulsing'
      }
    },

    openSidebar(alertId?: string) {
      this.isSidebarOpen = true
      if (alertId) this.selectedAlertId = alertId
    },

    closeSidebar() {
      this.isSidebarOpen = false
    }
  }
})

// ActiveAlert 数据结构
interface ActiveAlert {
  id: string
  type: 'consistency' | 'plot_drift' | 'writing_style' | 'scene_unlock' | 'general'
  title: string
  content: string
  severity: 'info' | 'warning' | 'alert' | 'critical'
  anchorRange: { start: number, end: number } | null  // 行内标注位置
  suggestedAction: string | null
  createdAt: number
  isRead: boolean
}
```

### 7.4.2 与 experienceStore 的状态联动

```typescript
// advisorStore 与 experienceStore 的联动
// 挂载在 useNovelExperience 的状态变更监听上

watch(() => experienceStore.activities, (newActivities, oldActivities) => {
  // 每 3 轮触发一次剧情失控度分析
  if (newActivities.length - (oldActivities?.length ?? 0) >= 3) {
    advisorStore.isBackgroundAnalyzing = true
    proactiveAdvisor.checkPlotDrift({
      activities: newActivities,
      recentNarrative: getRecentNarrativeSummary()
    }).finally(() => {
      advisorStore.isBackgroundAnalyzing = false
    })
  }
}, { deep: true })
```

---

## 7.5 主动提示分类与 UI 渲染

### 7.5.1 A 类 - 大地图 / 场景剧烈更新

**触发条件：**
- `worldMapState.currentScene` 变更为全新未探索地点
- 或 `writingTime` 发生跨天以上的时间跃迁

**UI 渲染方式：**

```
检测到场景剧烈更新
         │
         ▼
全屏 Modal 弹窗（唯一符合场景解锁级别的强提示）
         │
         ▼
┌────────────────────────────────────────────┐
│  【场景解锁】幽暗森林                         │
│                                            │
│  暮色已深，枯枝在风中发出细碎的沙沙声。       │
│  空气中弥漫着潮湿的腐叶气息。               │
│                                            │
│  [世界书设定预览]                           │
│  类型：location | 关键词：森林、幽暗、危险    │
│                                            │
│  [深入探索]  [跳过]                         │
└────────────────────────────────────────────┘
```

**代码实现：**

```typescript
// src/components/advisor/SceneUnlockModal.vue

// 当 advisorStore 接收到 type === 'scene_unlock' 的 alert 时渲染
// 渲染时机由 useProactiveAdvisor 监听 alertStream 并匹配 type

watch(() => advisorStore.activeAlerts, (alerts) => {
  const sceneAlert = alerts.find(a => a.type === 'scene_unlock' && !a.isRead)
  if (sceneAlert) {
    showSceneUnlockModal(sceneAlert)
  }
}, { immediate: true })

function showSceneUnlockModal(alert: ActiveAlert) {
  const modal = createModal({
    component: SceneUnlockModal,
    props: {
      sceneData: parseSceneAlert(alert),
      onEnter: () => {
        advisorStore.markAsRead(alert.id)
        advisorStore.dismissAlert(alert.id)
      },
      onSkip: () => {
        advisorStore.markAsRead(alert.id)
      }
    },
    overlay: true,
    closable: false  // 场景解锁不允许直接关闭，必须选择操作
  })
}
```

### 7.5.2 B 类 - 设定冲突警告

**触发条件：**
- 一致性监控器发现 `warning` 或 `alert` 级别冲突
- 如角色年龄矛盾、地点冲突、时间线矛盾

**UI 渲染方式：**

```
行内浅灰色波浪下划线 + hover 悬浮气泡
         │
         ▼
用户写作区域（richEditor）：
"艾伦走进酒馆，清晨的阳光洒在地板上。"

                              ↓ hover 在"清晨"上
                    ┌─────────────────────┐
                    │ ⚠️ 时间线冲突          │
                    │ 当前时间为"黄昏"，     │
                    │ 描述"清晨"与之矛盾      │
                    │                      │
                    │ 建议：改为"黄昏的余晖"  │
                    │                      │
                    │ [应用修正] [忽略]      │
                    └─────────────────────┘
```

**样式定义：**

```css
/* 行内波浪线样式 */
.inline-consistency-warning {
  text-decoration: underline wavy rgba(180, 180, 180, 0.6);
  text-underline-offset: 3px;
  cursor: pointer;
  position: relative;
}

/* Hover 气泡 */
.warning-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #2a2a2a;
  color: #e0e0e0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  max-width: 280px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  z-index: 1000;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.inline-consistency-warning:hover .warning-tooltip {
  opacity: 1;
}
```

**代码实现：**

```typescript
// src/components/advisor/InlineConsistencyMarker.vue

// 渲染引擎在输出叙事文本时，遇到 anchorRange 标记的区间
// 自动包裹 <span class="inline-consistency-warning" data-alert-id="...">

function renderWithMarkers(narrativeText: string, alerts: ActiveAlert[]) {
  let result = narrativeText

  // 按 start 降序排列，先处理后面的区间，避免位置偏移
  const sortedAlerts = [...alerts]
    .filter(a => a.anchorRange && a.type === 'consistency')
    .sort((a, b) => b.anchorRange!.start - a.anchorRange!.start)

  for (const alert of sortedAlerts) {
    const { start, end } = alert.anchorRange!
    const before = result.slice(0, start)
    const marked = result.slice(start, end)
    const after = result.slice(end)

    result = `${before}<span class="inline-consistency-warning" data-alert-id="${alert.id}">${marked}<span class="warning-tooltip">${alert.title}<br>${alert.content}<br><button onclick="applyFix('${alert.id}')">应用修正</button></span></span>${after}`
  }

  return result
}
```

### 7.5.3 C 类 - 行文节奏与失控警报

**触发条件：**
- 剧情失控度分析返回 `driftLevel` 为 `moderate` 或 `severe`
- 或 OpenClaw 发现行文节奏问题（如重复句式、节奏拖沓）

**UI 渲染方式：**

```
创作顾问悬浮按钮轻微脉冲泛光闪烁
         │
         ▼
用户点击悬浮按钮 ──► 侧边栏从右侧滑出顾问报告
         │
         ▼
┌────────────────────────────────────────────┐
│  ✦ 创作顾问报告                    [×]     │
│                                            │
│  剧情偏离度：62%（严重）                    │
│                                            │
│  已跳过关键节点：                           │
│  · "发现密道"（milestone）                  │
│  · "公爵密函交易"（milestone）              │
│                                            │
│  最近剧情走向摘要：                         │
│  艾伦在酒馆与商人交谈后直接前往幽暗森林，   │
│  跳过了原本预设的"调查图书馆档案"章节。    │
│                                            │
│  修正建议：                                 │
│  1. 在进入森林前插入一段"查阅资料"的情节   │
│  2. 将"密道发现"重定位到森林深处作为第二   │
│     章节的探索成果                         │
│                                            │
│  [采纳建议]  [查看大纲]  [忽略此警报]        │
└────────────────────────────────────────────┘
```

**悬浮按钮 CSS：**

```css
/* 悬浮按钮 - idle 状态 */
.advisor-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4a4a4a, #2a2a2a);
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  cursor: pointer;
  transition: all 0.3s ease;
}

/* 悬浮按钮 - pulsing 状态（轻微泛光闪烁） */
.advisor-fab.pulsing {
  animation: advisor-pulse 2s ease-in-out infinite;
}

@keyframes advisor-pulse {
  0%, 100% {
    box-shadow: 0 4px 12px rgba(100, 100, 100, 0.25);
  }
  50% {
    box-shadow: 0 4px 24px rgba(180, 180, 180, 0.5), 0 0 8px rgba(180, 180, 180, 0.3);
  }
}

/* 悬浮按钮 - alert 状态（亮红持续） */
.advisor-fab.alert {
  background: linear-gradient(135deg, #c0392b, #8e0000);
  animation: advisor-alert-glow 1s ease-in-out infinite;
}

@keyframes advisor-alert-glow {
  0%, 100% {
    box-shadow: 0 4px 16px rgba(192, 57, 43, 0.6);
  }
  50% {
    box-shadow: 0 4px 32px rgba(192, 57, 43, 0.9), 0 0 12px rgba(192, 57, 43, 0.5);
  }
}

/* 红点提示 */
.advisor-fab::after {
  content: '';
  position: absolute;
  top: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  background: #e74c3c;
  border-radius: 50%;
  border: 2px solid #2a2a2a;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.advisor-fab.has-unread::after {
  opacity: 1;
}
```

### 7.5.4 警报优先级与渲染决策矩阵

| 警报级别 | 类型 | 视觉呈现 |
|---------|------|---------|
| `info` | 轻微风格提示 | 不主动展示，仅在侧边栏历史中可查 |
| `warning` | 设定轻度违背 | 行内灰色波浪线 + hover 气泡 |
| `alert` | 严重冲突 / 节奏偏差 | 悬浮按钮脉冲 + 红点 |
| `critical` | 剧情失控 / 时间矛盾 | 悬浮按钮持续亮红 + 声音可选提示 |
| `scene_unlock` | 新场景解锁 | 全屏 Modal（唯一强制打断场景） |

---

## 7.6 实施任务清单

### P0 - 核心基础设施

| 任务 | 子任务 | 文件 |
|------|--------|------|
| AdvisorStore 创建 | 状态定义、Getters、Actions | `src/stores/advisorStore.js` |
| SSE 通道实现 | 后端 EventSource、前端订阅、重连 | `api/openclaw/alerts/stream` |
| POST 接口实现 | 即时 200 + 异步队列处理 | `api/openclaw/proactive-check` |
| OpenClaw 集成 | 结果映射到 activeAlert 结构 | `services/openclawAdapter.js` |

### P0 - 监听器实现

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 写作停顿监听器 | pauseTimer、上下文提取、触发 | `src/composables/useRichEditor.js` |
| 一致性监控器 | 实体提取、冲突判定 | `src/composables/useConsistencyMonitor.js` |
| 剧情失控度分析器 | driftScore 计算、大纲对比 | `src/composables/usePlotDriftMonitor.js` |

### P1 - UI 渲染

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 悬浮按钮组件 | 三态渲染（idle/pulsing/alert）、红点 | `src/components/advisor/AdvisorFAB.vue` |
| 侧边顾问面板 | 滑入动画、报告详情、建议采纳 | `src/components/advisor/AdvisorSidebar.vue` |
| 行内波浪线标注 | anchorRange 渲染、hover 气泡 | `src/components/advisor/InlineConsistencyMarker.vue` |
| 场景解锁 Modal | 全屏弹窗、世界书预览 | `src/components/advisor/SceneUnlockModal.vue` |

### P1 - 集成联动

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 与 experienceStore 联动 | activities 监听触发 plot_drift | `useNovelExperience.js` |
| 与 worldbook 联动 | 核心词条触发 consistency_check | `useWorldEntry.js` |
| 修正采纳流程 | applyFix 调用、文本替换 | `InlineConsistencyMarker.vue` |

### P2 - 增强能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 警报历史管理 | 查看历史、重新呼出 | `AdvisorSidebar.vue` |
| 警报免打扰模式 | 用户设置、一段时间内静音 | `Settings.vue` |
| 声音提示（可选） | 音效文件、Web Audio API | `src/services/audioManager.js` |

---

## 7.7 验收标准

```bash
# 核心机制验收
- POST /api/openclaw/proactive-check 在 100ms 内返回 200（不阻塞前端）
- SSE 通道建立后，OpenClaw 发现问题时 500ms 内推送到前端
- AdvisorStore.activeAlerts 正确更新，渲染层无延迟

# 监听器验收
- 写作停顿监听器：连续输入 200 字后停顿 3 秒，触发 proactive-check
- 一致性监控器：输入中提到与 worldMapState.currentScene 不符的地点，触发 alert
- 剧情失控分析器：每 3 轮活动自动触发 driftScore 计算

# UI 验收
- 悬浮按钮 idle 状态：静止无动画
- 悬浮按钮 pulsing 状态：每 2 秒泛光一次
- 悬浮按钮 alert 状态：亮红持续脉冲
- 行内波浪线：hover 显示气泡，无误报
- 侧边栏滑入：动画时长 300ms，无卡顿

# 场景解锁验收
- 新场景进入时弹出全屏 Modal，关闭须选择操作
- 弹出后 AdvisorStore.activeAlerts 中对应 alert 标记为已读
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验模块（ExperienceState、activities 数据结构）
- [04-memory-system.md](./04-memory-system.md) - 记忆力系统（与 mem0 的上下文注入模式）
- [05-prompt-engineering.md](./05-prompt-engineering.md) - 提示词工程（Token 偏置控制）
- [06-project-structure.md](./06-project-structure.md) - 项目结构（advisorStore、useProactiveAdvisor 等）