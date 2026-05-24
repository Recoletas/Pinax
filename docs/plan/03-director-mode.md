# 03 - 编导模式详细规划

> 编导模式将创意写作从纯文本扩展到**视觉叙事**层面，面向 AI 视频创作的剧本提示词生成。

## 3.1 双模式定位

| 模式 | 目标 | 节点字段 | 边类型 | 序列 | 导出 |
|------|------|---------|--------|------|------|
| **写作模式** | 纯文学创作 | 意象/情绪/例句 | 隐喻/并置/断裂/回声 | 大纲序列 | Markdown/TXT |
| **编导模式** | AI 视频剧本 | 景别/运镜/时长/色调/声音 | 跳切/叠化/淡入淡出/蒙太奇 | 时间轴 | 剪映 JSON / Premiere EDL |

## 3.2 应用场景

```
场景 1：诗歌 → 分镜 → 剪映 → AI 视频生成
  《静夜思》→ 分镜图 → 剪映格式 → AI 生成视频

场景 2：散文 → 分镜 → Premiere → 剪辑
  随笔片段 → 分镜脚本 → Premiere XML → 人工剪辑

场景 3：诗歌工坊灵感 → 视觉化呈现
  树状意象 → 可视化节点 → 分镜导出
```

## 3.3 景别与运镜

### 景别定义

| 景别 | 英文 | 说明 | 典型用途 |
|------|------|------|---------|
| 远景 | Extreme Wide Shot (EWS) | 展现广阔场景 | 建立场景、氛围 |
| 全景 | Wide Shot (WS) | 完整展示人物与环境 | 交代关系 |
| 中景 | Medium Shot (MS) | 膝盖以上 | 日常对话、动作 |
| 近景 | Close-Up (CU) | 胸部以上 | 表情、情感 |
| 特写 | Extreme Close-Up (ECU) | 局部细节 | 强调、紧张感 |

### 运镜定义

| 运镜 | 英文 | 说明 |
|------|------|------|
| 推 | Push In | 镜头向前推进 |
| 拉 | Pull Out | 镜头向后拉远 |
| 摇 | Pan | 镜头左右摇动 |
| 移 | Track | 镜头左右移动 |
| 跟 | Follow | 镜头跟随主体 |
| 固定 | Fixed | 镜头固定 |

### 景别-运镜组合表

| 场景类型 | 景别 | 运镜 | 示例 |
|---------|------|------|------|
| 建立镜头 | 远景 | 拉 | 从天空拉到地面 |
| 角色出场 | 全景→中景 | 推 | 镜头从环境推向角色 |
| 对话 | 中景 | 固定/摇 | 正反打 |
| 情感特写 | 近景/特写 | 推 | 推向角色表情 |
| 紧张感 | 近景→特写 | 推 | 推向角色眼神 |
| 回忆 | 中景 | 淡出→淡入 | 软切 |

## 3.4 数据结构

### 节点 extraFields（编导模式）

```typescript
interface DirectorNodeExtra {
  // 景别
  shotType: 'extreme_wide' | 'wide' | 'medium' | 'close_up' | 'extreme_close_up'
  // 运镜
  camera: 'push' | 'pull' | 'pan' | 'track' | 'follow' | 'fixed'
  // 时长（秒）
  duration: number
  // 色调描述
  tone: string      // "冷色调、低饱和度"
  // 声音描述
  sound: string     // "雨声、远处的雷鸣"
  // 台词（可选）
  dialogue?: string
}
```

### 边类型定义（编导模式）

```typescript
interface DirectorEdgeType {
  id: string
  label: string
  color: string
  dashArray: string  // SVG dash array
  description: string
}

const DIRECTING_EDGE_TYPES: DirectorEdgeType[] = [
  { id: 'jump_cut', label: '跳切', color: '#ff6b6b', dashArray: '0', description: '同一场景快速切换' },
  { id: 'dissolve', label: '叠化', color: '#4ecdc4', dashArray: '4,4', description: '画面渐变过渡' },
  { id: 'fade_in_out', label: '淡入淡出', color: '#45b7d1', dashArray: '8,4', description: '黑转/转黑' },
  { id: 'contrast_montage', label: '对比蒙太奇', color: '#f9ca24', dashArray: '2,2', description: '对比画面切换' },
  { id: 'cross_cut', label: '交叉剪辑', color: '#9b59b6', dashArray: '6,3', description: '双线交替' },
  { id: 'match_cut', label: '匹配剪辑', color: '#6ab04c', dashArray: '0', description: '相似形状/动作切换' }
]
```

## 3.5 诗歌工坊编导模式数据流

### 现有存储结构

```
localStorage:
  poetry_idea_tree_v2    ← 灵感树节点数组
  poetry_graph_edges_v1  ← 关系边数组（source, target, type）
  poetry_snapshots_v1    ← 版本历史快照
  poetry_imagery_groups_v1 ← 意象群/场景组（Group）
```

**节点数据结构（`poetry_idea_tree_v2` 中的节点）：**

```typescript
interface PoetryNode {
  id: string
  content: string        // 节点文本（意象/情绪/例句）
  children?: string[]    // 子节点 ID 数组（树结构）
  extraFields?: {
    shotType?: string    // 景别：extreme_wide | wide | medium | close_up | extreme_close_up
    cameraMovement?: string  // 运镜：push | pull | pan | track | follow | fixed
    duration?: number    // 时长（秒），默认 3
    toneDescription?: string  // 色调描述
    soundDescription?: string // 声音描述
    emotion?: string     // 情绪标签
  }
  emotion?: string       // 情绪标签（顶层字段，与 extraFields 并存）
}
```

**边数据结构（`poetry_graph_edges_v1`）：**

```typescript
interface GraphEdge {
  id: string
  source: string   // 源节点 ID
  target: string   // 目标节点 ID
  type: string     // 边类型：jump_cut | dissolve | fade_in_out | cross_cut | contrast_montage | match_cut
}
```

**快照数据结构（`poetry_snapshots_v1`）：**

```typescript
interface PoetrySnapshot {
  id: string
  label: string
  tree: PoetryNode[]     // 快照时的完整树数据
  edges: GraphEdge[]     // 快照时的边数据
  groups: ImageryGroup[] // 快照时的意象群数据
  timestamp: string      // ISO 时间戳
  mode: 'writing' | 'directing'  // 快照时的模式
}
```

### 分镜数据提取算法

从画布数据到线性分镜列表，分两步：**拓扑排序 + 边类型映射**。

**第一步：节点序列化为 shot list**

```typescript
// src/services/shotExporter.js

interface Shot {
  sequence: number
  nodeId: string
  content: string           // 节点文本（意象描述）
  shotType: string         // 景别
  camera: string           // 运镜
  duration: number         // 时长（秒）
  tone: string             // 色调描述
  sound: string            // 声音描述
  emotion: string          // 情绪标签
  transition: string       // 入点转场类型（从上一节点边继承）
}

/**
 * 从 PoetryLab 数据提取线性分镜列表
 * @param {object} options
 * @param {PoetryNode[]} options.nodes - poetry_idea_tree_v2
 * @param {GraphEdge[]} options.edges - poetry_graph_edges_v1
 * @param {ImageryGroup[]} options.groups - poetry_imagery_groups_v1（可选）
 */
function extractShotsFromPoetryLab({ nodes, edges, groups = [] }): Shot[] {
  // 1. 构建边类型查找表：source → transition type
  const edgeTransitionMap = new Map<string, string>()
  for (const edge of edges) {
    edgeTransitionMap.set(edge.source, edge.type)
  }

  // 2. 构建节点 ID → 节点的 Map
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // 3. 拓扑排序：以根节点为起点，沿子节点关系深度优先遍历
  const rootNodes = nodes.filter(n => !n.children?.length === false && nodes.every(other => other.children?.includes(n.id) !== true))
  // 简化：直接使用节点数组顺序（PoetryLab 中节点已按生成顺序排列）
  //    若存在 groups，则按 Group 顺序 + 组内节点顺序
  let orderedNodes: PoetryNode[]

  if (groups.length > 0) {
    // 按意象群顺序展开节点
    orderedNodes = []
    for (const group of groups) {
      const groupNodes = group.nodeIds.map(id => nodeMap.get(id)).filter(Boolean)
      orderedNodes.push(...groupNodes)
    }
  } else {
    // 深度优先遍历
    orderedNodes = dfsOrder(nodes)
  }

  // 4. 映射为 Shot 对象
  const shots: Shot[] = []
  for (let i = 0; i < orderedNodes.length; i++) {
    const node = orderedNodes[i]
    const extra = node.extraFields || {}
    const transition = i > 0 ? (edgeTransitionMap.get(orderedNodes[i - 1].id) || 'jump_cut') : 'none'

    shots.push({
      sequence: i + 1,
      nodeId: node.id,
      content: node.content,
      shotType: extra.shotType || 'medium',
      camera: extra.cameraMovement || 'fixed',
      duration: extra.duration || 3,
      tone: extra.toneDescription || '',
      sound: extra.soundDescription || '',
      emotion: node.emotion || extra.emotion || '',
      transition
    })
  }

  return shots
}

function dfsOrder(nodes: PoetryNode[]): PoetryNode[] {
  // 以任一节点为起点，沿 children 深度优先展开
  // PoetryLab 实际用 flatNodes 因此也可按 flatNodes 顺序
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set<string>()
  const result: PoetryNode[] = []

  function dfs(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const node = nodeMap.get(id)
    if (!node) return
    result.push(node)
    for (const childId of node.children || []) {
      dfs(childId)
    }
  }

  // 找根节点（无父节点）
  const childIds = new Set(nodes.flatMap(n => n.children || []))
  const roots = nodes.filter(n => !childIds.has(n.id))
  for (const root of roots) dfs(root.id)
  // 孤儿节点追加
  for (const node of nodes) {
    if (!visited.has(node.id)) result.push(node)
  }

  return result
}
```

**第二步：转场类型标准化映射**

```typescript
// poetry_graph_edges_v1 中的边 type → Shot.transition
const TRANSITION_MAP: Record<string, string> = {
  'jump_cut': 'cut',           // 跳切 → 硬切
  'dissolve': 'dissolve',      // 叠化
  'fade_in_out': 'fade',       // 淡入淡出
  'cross_cut': 'cut',          // 交叉剪辑 → 硬切
  'contrast_montage': 'cut',   // 对比蒙太奇 → 硬切
  'match_cut': 'cut'           // 匹配剪辑 → 硬切
}
```

### 节点渲染

```
┌─────────────────────────┐
│ N1: 夜色                │
├─────────────────────────┤
│ 景别: 特写              │
│ 运镜: 固定              │
│ 时长: 3s                │
│ 色调: 冷色调            │
│ 声音: 夜蝉鸣            │
└─────────────────────────┘
       │
       │ 跳切
       ▼
┌─────────────────────────┐
│ N2: 月光                │
├─────────────────────────┤
│ 景别: 远景              │
│ 运镜: 拉                │
│ 时长: 5s                │
│ 色调: 银白色            │
│ 声音: 风声              │
└─────────────────────────┘
```

### 生成流程

```
诗歌文本输入
      │
      ▼
AI 分析诗歌意象
      │
      ▼
提取关键视觉意象（月、夜、光）
      │
      ▼
分配景别/运镜/时长/色调/声音
      │
      ▼
生成节点 → 构建时间轴
      │
      ▼
导出剪映 JSON
```

### AI 生成提示词

```python
DIRECTOR_SYSTEM_PROMPT = """
你是一位电影分镜师，擅长将诗歌/散文转化为视觉分镜。

【分镜规则】
- 每个分镜包含：景别、运镜、时长、色调、声音
- 景别：远景/全景/中景/近景/特写
- 运镜：推/拉/摇/移/跟/固定
- 时长：根据内容合理分配（1-10秒）
- 色调：描述画面整体色调
- 声音：描述环境声音或音乐

【输出格式】
JSON 数组：
[
  {
    "sequence": 1,
    "shotType": "extreme_close_up",
    "camera": "fixed",
    "duration": 3,
    "tone": "冷色调，低饱和",
    "sound": "雨声",
    "description": "一滴水从叶尖滑落"
  }
]
"""

DIRECTOR_USER_PROMPT = """
诗歌内容：
{poetry_text}

请为这首诗歌创建分镜描述：
"""
```

## 3.6 散文随笔编导模式数据流

### 现有存储结构

```
localStorage:
  prose_cards_v1      ← 卡片数组
  prose_edges_v1      ← 卡片关系边
  prose_outline_v1    ← 大纲序列
  prose_timeline_v1   ← 时间轴数据
```

**卡片数据结构（`prose_cards_v1`）：**

```typescript
interface ProseCard {
  id: string
  content: string     // 卡片文本内容
  emotion: string     // 情绪标签：joy | sadness | anger | fear | surprise | nostalgia | longing | calm | anxiety | excitement
  emotionIntensity?: number  // 情绪强度 1-10
  createdAt: string
  updatedAt: string
  extraFields?: {
    shotType?: string          // 景别
    cameraMovement?: string    // 运镜
    duration?: number          // 时长（秒）
    toneDescription?: string   // 色调描述
    soundDescription?: string  // 声音描述
    dialogue?: string          // 台词
  }
}
```

**时间轴条目（`prose_timeline_v1`）：**

```typescript
interface TimelineEntry {
  id: string
  cardId: string      // 关联的卡片 ID
  order: number       // 时间轴顺序
  emotion: string     // 情绪（冗余存储，便于快速读取）
  duration: number    // 预估时长（秒）
}
```

**情绪标签系统（已有）：**

| emotion 值 | 标签 | 色调 |
|-----------|------|------|
| joy | 喜悦 | #FFD93D |
| sadness | 悲伤 | #6BCB77 |
| anger | 愤怒 | #FF6B6B |
| fear | 恐惧 | #9B59B6 |
| surprise | 惊讶 | #45B7D1 |
| nostalgia | 怀旧 | #F4A460 |
| longing | 思念 | #DDA0DD |
| calm | 平静 | #87CEEB |
| anxiety | 焦虑 | #FFB347 |
| excitement | 兴奋 | #FF6B81 |

### 分镜数据提取算法

```typescript
// src/services/shotExporter.js

/**
 * 从 ProseEssay 数据提取线性分镜列表
 * @param {object} options
 * @param {ProseCard[]} options.cards - prose_cards_v1
 * @param {TimelineEntry[]} options.timeline - prose_timeline_v1
 */
function extractShotsFromProseEssay({ cards, timeline }: {
  cards: ProseCard[]
  timeline: TimelineEntry[]
}): Shot[] {
  // 1. 构建 cardId → card 的 Map
  const cardMap = new Map(cards.map(c => [c.id, c]))

  // 2. 若无 timeline，按 cards 数组顺序
  const orderedTimeline = timeline.length > 0
    ? [...timeline].sort((a, b) => a.order - b.order)
    : cards.map((c, i) => ({ cardId: c.id, order: i, emotion: c.emotion, duration: 3 }))

  // 3. 映射为 Shot 对象
  const shots: Shot[] = []
  for (let i = 0; i < orderedTimeline.length; i++) {
    const entry = orderedTimeline[i]
    const card = cardMap.get(entry.cardId)
    if (!card) continue

    const extra = card.extraFields || {}

    shots.push({
      sequence: i + 1,
      nodeId: card.id,
      content: card.content,
      shotType: extra.shotType || inferShotTypeFromEmotion(card.emotion),
      camera: extra.cameraMovement || 'fixed',
      duration: extra.duration || entry.duration || 3,
      tone: extra.toneDescription || emotionColors[card.emotion]?.tone || '',
      sound: extra.soundDescription || '',
      emotion: card.emotion,
      transition: i > 0 ? 'cut' : 'none',
      dialogue: extra.dialogue || ''
    })
  }

  return shots
}

/** 根据情绪标签推断默认景别（情绪→景别映射） */
function inferShotTypeFromEmotion(emotion: string): string {
  const EMOTION_SHOT_MAP: Record<string, string> = {
    'joy': 'wide',
    'sadness': 'medium',
    'anger': 'close_up',
    'fear': 'extreme_close_up',
    'surprise': 'medium',
    'nostalgia': 'medium',
    'longing': 'close_up',
    'calm': 'wide',
    'anxiety': 'close_up',
    'excitement': 'medium'
  }
  return EMOTION_SHOT_MAP[emotion] || 'medium'
}
```

### 节点渲染

```
┌─────────────────────────┐
│ P1: 回忆                │
├─────────────────────────┤
│ 景别: 中景              │
│ 运镜: 固定              │
│ 时长: 4s                │
│ 色调: 暖黄怀旧          │
│ 声音: 老式挂钟          │
│ 台词: "那时候..."      │
└─────────────────────────┘
       │
       │ 淡入淡出
       ▼
┌─────────────────────────┐
│ P2: 现在                │
├─────────────────────────┤
│ 景别: 近景              │
│ 运镜: 推                │
│ 时长: 3s                │
│ 色调: 冷白光            │
│ 声音: 无声              │
│ 台词: ""                │
└─────────────────────────┘
```

### 与诗歌工坊的差异

| 维度 | 诗歌工坊 | 散文随笔 |
|------|---------|---------|
| 节点来源 | AI 生成或手动创建 | 卡片转化 |
| 序列类型 | 树状灵感树 | 时间轴 |
| 导出重点 | 诗歌意境 | 叙事节奏 |
| 边类型 | 隐喻/并置/断裂/回声 | 跳切/叠化/淡入淡出/蒙太奇 |

## 3.7 导出格式细化

### 剪映 JSON（draft_content.json）

剪映草稿格式包含**视频轨道**、**文本轨道**（字幕/台词）、**音频轨道**三部分。

**接口定义：**

```typescript
interface JianyingDraft {
  version: string
  description: string
  duration: number              // 总时长（帧，25fps）
  framerate: number            // 帧率，默认 25
  resolution: { width: number; height: number }
  tracks: {
    videoTracks: VideoTrack[]
    audioTracks: AudioTrack[]
    textTracks: TextTrack[]
  }
}
```

**序列化函数（src/services/shotExporter.js）：**

```typescript
const FPS = 25

function toJianyingDraft(shots: Shot[]): JianyingDraft {
  const totalFrames = shots.reduce((sum, s) => sum + s.duration * FPS, 0)
  let currentFrame = 0

  const videoTrack: VideoTrack = { id: 'v1', type: 'video', clips: [] }
  const audioTrack: AudioTrack = { id: 'a1', type: 'audio', clips: [] }
  const textTrack: TextTrack = { id: 't1', type: 'text', clips: [] }

  for (const shot of shots) {
    const durationFrames = shot.duration * FPS
    const clipId = `clip_${shot.sequence}`

    videoTrack.clips.push({
      id: clipId,
      shotId: String(shot.sequence),
      content: shot.content,
      startFrame: currentFrame,
      endFrame: currentFrame + durationFrames,
      duration: durationFrames,
      transition: mapTransition(shot.transition),
      shotType: shot.shotType,
      camera: shot.camera,
      tone: shot.tone,
      placeholder: true
    })

    if (shot.sound) {
      audioTrack.clips.push({
        id: `audio_${clipId}`,
        shotId: String(shot.sequence),
        sound: shot.sound,
        startFrame: currentFrame,
        duration: durationFrames,
        type: 'environment'
      })
    }

    if (shot.dialogue) {
      textTrack.clips.push({
        id: `text_${clipId}`,
        shotId: String(shot.sequence),
        dialogue: shot.dialogue,
        startFrame: currentFrame,
        duration: durationFrames,
        style: {
          fontSize: 24,
          fontColor: '#FFFFFF',
          backgroundColor: 'rgba(0,0,0,0.5)',
          position: { x: 0.5, y: 0.85 }
        }
      })
    }

    currentFrame += durationFrames
  }

  return {
    version: '1.0',
    description: '由编导模式导出',
    duration: totalFrames,
    framerate: FPS,
    resolution: { width: 1920, height: 1080 },
    tracks: {
      videoTracks: [videoTrack],
      audioTracks: [audioTrack],
      textTracks: [textTrack]
    }
  }
}

function mapTransition(t: string): { type: string; duration?: number } {
  if (t === 'dissolve') return { type: 'dissolve', duration: 15 }
  if (t === 'fade') return { type: 'fade', duration: 20 }
  return { type: 'cut' }
}
```

### Premiere FCP XML 导出格式

FCP XML（Final Cut Pro XML）是标准的多轨道时间线交换格式，兼容 Premiere Pro、DaVinci Resolve、Final Cut Pro。

**音视频轨道映射规则：**

| 字段 | 说明 |
|------|------|
| `<sequence>/<duration>` | 总帧数 = sum(shot.duration) × 25 |
| `<track>/<clipitem>` | 每个分镜对应一个 clipitem |
| `<clipitem>/<name>` | "Shot {sequence}" |
| `<clipitem>/<start>` / `<end>` | 时间线入出点（帧） |
| `<clipitem>/<source>/<pathurl>` | 占位视频路径（`file://placeholder_shot_{n}`） |
| `<effect>/<name>` | 转场名称（Cross Dissolve / Dip to Black 等） |
| `<effect>/<parameter>/<value>` | 转场时长（帧） |
| `<metadata>` | 自定义元数据命名空间（景别/运镜/色调） |

**导出函数（src/services/shotExporter.js）：**

```typescript
function toFCPXML(shots: Shot[]): string {
  const totalDuration = shots.reduce((s, shot) => s + shot.duration * FPS, 0)
  let currentFrame = 0

  const clipItems = shots.map((shot, idx) => {
    const start = currentFrame
    const end = currentFrame + shot.duration * FPS
    const transitionEffect = buildTransitionEffect(shot.transition)
    const metadata = buildMetadata(shot)
    currentFrame = end

    return `
          <clipitem id="clipitem_${idx + 1}">
            <name>Shot ${shot.sequence}</name>
            <duration>${shot.duration * FPS}</duration>
            <start>${start}</start>
            <end>${end}</end>
            <in>0</in>
            <out>${shot.duration * FPS}</out>
            <source>
              <pathurl>file://placeholder_shot_${shot.sequence}</pathurl>
            </source>
            ${metadata}
            ${transitionEffect}
          </clipitem>`
  }).join('\n')

  const audioClipItems = shots.map((shot, idx) => {
    const start = shots.slice(0, idx).reduce((s, sk) => s + sk.duration * FPS, 0)
    const end = shots.slice(0, idx + 1).reduce((s, sk) => s + sk.duration * FPS, 0)
    return `
          <clipitem id="audio_clipitem_${idx + 1}">
            <name>Sound ${shot.sequence}</name>
            <duration>${shot.duration * FPS}</duration>
            <start>${start}</start>
            <end>${end}</end>
            <source>
              <pathurl>file://audio_placeholder_${shot.sequence}</pathurl>
            </source>
          </clipitem>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>编导模式导出</name>
    <duration>${totalDuration}</duration>
    <rate>
      <timebase>25</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <track>
          ${clipItems}
        </track>
      </video>
      <audio>
        <track>
          ${audioClipItems}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>`
}

function buildTransitionEffect(transition: string): string {
  if (transition === 'dissolve') {
    return `
            <effect>
              <name>Cross Dissolve</name>
              <parameter name="Duration"><value>15</value>
            </effect>`
  }
  if (transition === 'fade_in_out') {
    return `
            <effect>
              <name>Cross Dissolve</name>
              <parameter name="Duration"><value>20</value>
            </effect>`
  }
  return ''
}
```

### 3.10 实施任务清单

#### P0 - 核心能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| PoetryLab 画布节点扩展 | `shotType`/`cameraMovement`/`duration`/`toneDescription`/`soundDescription` 字段 | `PoetryLab.vue` |
| 边类型扩展 | jump_cut / dissolve / fade_in_out / cross_cut / contrast_montage / match_cut | 图谱组件 |
| 景别 / 运镜定义 | 5 档景别 × 6 种运镜的 TypeScript 定义 | `src/types/director.ts` |
| 分镜提取算法 | `extractShotsFromPoetryLab()` / `extractShotsFromProseEssay()` | `useDirector.js` |

#### P1 - 导出格式

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 剪映 JSON 导出 | `toJianyingDraft()` / VideoTrack / AudioTrack / TextTrack | `shotExporter.js` |
| Premiere FCP XML 导出 | `toFCPXML()` / clipitem / effect / transition | `shotExporter.js` |
| ProseEssay 分镜适配 | emotion → shotType 推断 / TimelineEntry → shot 映射 | `useDirector.js` |

#### P2 - 增强能力

| 任务 | 子任务 | 文件 |
|------|--------|------|
| 双轨切换 | 写作模式 ↔ 编导模式的状态隔离与切换逻辑 | `PoetryLab.vue` / `ProseEssay.vue` |
| 景别预览 | Canvas 节点上叠加景别标签可视化 | `Canvas.vue` |
| 导出预览 | 导出前预览分镜列表，确认后正式导出 | 组件 |

### 3.11 验收标准

```bash
# P0 验收
- PoetryLab 节点 extraFields 包含 shotType / camera / duration / tone / sound
- extractShotsFromPoetryLab() 对标准树状结构输出有序 shot 数组
- extractShotsFromProseEssay() 对 ProseEssay timeline 输出有序 shot 数组

# P1 验收
- 剪映 JSON 导入剪映桌面版后，时间轴上 clip 数量与 shot 数一致
- Premiere XML 导入后，video/audio track 结构正确，transition 有效

# P2 验收
- 写作模式切到编导模式后，原有文本内容不丢失
- 导出的分镜可在剪映/Premiere 中正常播放
```

---

## 相关文档

- [00-overview.md](./00-overview.md) - 项目总览
- [01-novel-experience.md](./01-novel-experience.md) - 小说体验（Activity 数据结构参考）
- [02-editor-ai.md](./02-editor-ai.md) - 编辑器 AI（Copilot 续写参考）
- [05-prompt-engineering.md](./05-prompt-engineering.md) - 提示词工程（Token 偏置控制）
- [07-proactive-advisor.md](./07-proactive-advisor.md) - 主动顾问（OpenClaw 审查集成）