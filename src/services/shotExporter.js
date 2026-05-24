/**
 * shotExporter - 分镜导出服务
 *
 * 职责：
 * - 从 PoetryLab / ProseEssay 数据提取分镜列表
 * - 导出为剪映 JSON / Premiere FCP XML 格式
 */

import {
  SHOT_TYPES,
  CAMERA_MOVEMENTS,
  TRANSITION_EXPORT_MAP,
  FPS,
  inferShotTypeFromEmotion,
  inferToneFromEmotion
} from '../types/director'

/**
 * @typedef {Object} Shot
 * @property {number} sequence - 序号
 * @property {string} nodeId - 节点 ID
 * @property {string} content - 内容描述
 * @property {string} shotType - 景别
 * @property {string} camera - 运镜
 * @property {number} duration - 时长（秒）
 * @property {string} tone - 色调描述
 * @property {string} sound - 声音描述
 * @property {string} emotion - 情绪标签
 * @property {string} transition - 转场类型
 * @property {string} [dialogue] - 台词
 */

/**
 * 从 PoetryLab 数据提取分镜列表
 * @param {object} options - 选项
 * @param {Array} options.nodes - 节点数组
 * @param {Array} options.edges - 边数组
 * @param {Array} [options.groups] - 意象群数组
 * @returns {Shot[]} 分镜列表
 */
export function extractShotsFromPoetryLab({ nodes, edges, groups = [] }) {
  if (!nodes || nodes.length === 0) return []

  // 1. 构建边类型查找表：source → transition type
  const edgeTransitionMap = new Map()
  if (edges) {
    for (const edge of edges) {
      edgeTransitionMap.set(edge.source, edge.type)
    }
  }

  // 2. 构建节点 ID → 节点的 Map
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // 3. 确定节点顺序
  let orderedNodes

  if (groups && groups.length > 0) {
    // 按意象群顺序展开节点
    orderedNodes = []
    for (const group of groups) {
      if (group.nodeIds) {
        const groupNodes = group.nodeIds.map(id => nodeMap.get(id)).filter(Boolean)
        orderedNodes.push(...groupNodes)
      }
    }
    // 添加未分组的节点
    const groupedIds = new Set(groups.flatMap(g => g.nodeIds || []))
    for (const node of nodes) {
      if (!groupedIds.has(node.id)) {
        orderedNodes.push(node)
      }
    }
  } else {
    // 深度优先遍历
    orderedNodes = dfsOrder(nodes)
  }

  // 4. 映射为 Shot 对象
  const shots = []
  for (let i = 0; i < orderedNodes.length; i++) {
    const node = orderedNodes[i]
    const extra = node.extraFields || {}
    const transition = i > 0
      ? (edgeTransitionMap.get(orderedNodes[i - 1].id) || 'jump_cut')
      : 'none'

    shots.push({
      sequence: i + 1,
      nodeId: node.id,
      content: node.content || '',
      shotType: extra.shotType || 'medium',
      camera: extra.cameraMovement || 'fixed',
      duration: extra.duration || 3,
      tone: extra.toneDescription || '',
      sound: extra.soundDescription || '',
      emotion: node.emotion || extra.emotion || '',
      transition: TRANSITION_EXPORT_MAP[transition] || 'cut'
    })
  }

  return shots
}

/**
 * 从 ProseEssay 数据提取分镜列表
 * @param {object} options - 选项
 * @param {Array} options.cards - 卡片数组
 * @param {Array} [options.timeline] - 时间轴数组
 * @returns {Shot[]} 分镜列表
 */
export function extractShotsFromProseEssay({ cards, timeline = [] }) {
  if (!cards || cards.length === 0) return []

  // 1. 构建 cardId → card 的 Map
  const cardMap = new Map(cards.map(c => [c.id, c]))

  // 2. 确定时间轴顺序
  let orderedTimeline
  if (timeline && timeline.length > 0) {
    orderedTimeline = [...timeline].sort((a, b) => (a.order || 0) - (b.order || 0))
  } else {
    orderedTimeline = cards.map((c, i) => ({
      cardId: c.id,
      order: i,
      emotion: c.emotion,
      duration: 3
    }))
  }

  // 3. 映射为 Shot 对象
  const shots = []
  for (let i = 0; i < orderedTimeline.length; i++) {
    const entry = orderedTimeline[i]
    const card = cardMap.get(entry.cardId)
    if (!card) continue

    const extra = card.extraFields || {}
    const emotion = card.emotion || entry.emotion || ''

    shots.push({
      sequence: i + 1,
      nodeId: card.id,
      content: card.content || '',
      shotType: extra.shotType || inferShotTypeFromEmotion(emotion),
      camera: extra.cameraMovement || 'fixed',
      duration: extra.duration || entry.duration || 3,
      tone: extra.toneDescription || inferToneFromEmotion(emotion),
      sound: extra.soundDescription || '',
      emotion: emotion,
      transition: i > 0 ? 'cut' : 'none',
      dialogue: extra.dialogue || ''
    })
  }

  return shots
}

/**
 * 深度优先遍历排序
 * @param {Array} nodes - 节点数组
 * @returns {Array} 排序后的节点数组
 */
function dfsOrder(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const visited = new Set()
  const result = []

  function dfs(id) {
    if (visited.has(id)) return
    visited.add(id)
    const node = nodeMap.get(id)
    if (!node) return
    result.push(node)
    for (const childId of (node.children || [])) {
      dfs(childId)
    }
  }

  // 找根节点（无父节点）
  const childIds = new Set(nodes.flatMap(n => n.children || []))
  const roots = nodes.filter(n => !childIds.has(n.id))

  for (const root of roots) {
    dfs(root.id)
  }

  // 孤儿节点追加
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      result.push(node)
    }
  }

  return result
}

/**
 * 导出为剪映 JSON 格式
 * @param {Shot[]} shots - 分镜列表
 * @param {object} options - 选项
 * @returns {object} 剪映草稿对象
 */
export function toJianyingDraft(shots, options = {}) {
  const {
    width = 1920,
    height = 1080,
    framerate = FPS
  } = options

  const totalFrames = shots.reduce((sum, s) => sum + (s.duration || 3) * framerate, 0)
  let currentFrame = 0

  const videoTrack = { id: 'v1', type: 'video', clips: [] }
  const audioTrack = { id: 'a1', type: 'audio', clips: [] }
  const textTrack = { id: 't1', type: 'text', clips: [] }

  for (const shot of shots) {
    const durationFrames = (shot.duration || 3) * framerate
    const clipId = `clip_${shot.sequence}`

    // 视频轨道
    videoTrack.clips.push({
      id: clipId,
      shotId: String(shot.sequence),
      content: shot.content || '',
      startFrame: currentFrame,
      endFrame: currentFrame + durationFrames,
      duration: durationFrames,
      transition: mapTransitionForJianying(shot.transition),
      shotType: shot.shotType,
      camera: shot.camera,
      tone: shot.tone || '',
      placeholder: true
    })

    // 音频轨道
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

    // 文本轨道（台词）
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
    description: '由 WriterHelper 编导模式导出',
    duration: totalFrames,
    framerate,
    resolution: { width, height },
    tracks: {
      videoTracks: [videoTrack],
      audioTracks: audioTrack.clips.length > 0 ? [audioTrack] : [],
      textTracks: textTrack.clips.length > 0 ? [textTrack] : []
    }
  }
}

/**
 * 导出为 FCP XML 格式
 * @param {Shot[]} shots - 分镜列表
 * @param {object} options - 选项
 * @returns {string} FCP XML 字符串
 */
export function toFCPXML(shots, options = {}) {
  const {
    name = '编导模式导出',
    framerate = FPS
  } = options

  const totalDuration = shots.reduce((s, shot) => s + (shot.duration || 3) * framerate, 0)
  let currentFrame = 0

  const clipItems = []
  const audioClipItems = []

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]
    const start = currentFrame
    const durationFrames = (shot.duration || 3) * framerate
    const end = currentFrame + durationFrames

    // 视频剪辑项
    const transitionEffect = buildTransitionEffect(shot.transition, framerate)
    const metadata = buildFCPMetadata(shot)

    clipItems.push(`
        <clipitem id="clipitem_${i + 1}">
          <name>Shot ${shot.sequence}</name>
          <duration>${durationFrames}</duration>
          <start>${start}</start>
          <end>${end}</end>
          <in>0</in>
          <out>${durationFrames}</out>
          <source>
            <pathurl>file://placeholder_shot_${shot.sequence}</pathurl>
          </source>
          ${metadata}
          ${transitionEffect}
        </clipitem>`)

    // 音频剪辑项
    if (shot.sound) {
      audioClipItems.push(`
        <clipitem id="audio_clipitem_${i + 1}">
          <name>Sound ${shot.sequence}</name>
          <duration>${durationFrames}</duration>
          <start>${start}</start>
          <end>${end}</end>
          <source>
            <pathurl>file://audio_placeholder_${shot.sequence}</pathurl>
          </source>
        </clipitem>`)
    }

    currentFrame = end
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${name}</name>
    <duration>${totalDuration}</duration>
    <rate>
      <timebase>${framerate}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <media>
      <video>
        <track>
          ${clipItems.join('\n')}
        </track>
      </video>
      ${audioClipItems.length > 0 ? `<audio>
        <track>
          ${audioClipItems.join('\n')}
        </track>
      </audio>` : ''}
    </media>
  </sequence>
</xmeml>`
}

/**
 * 导出为 Markdown 格式
 * @param {Shot[]} shots - 分镜列表
 * @returns {string} Markdown 字符串
 */
export function toMarkdown(shots) {
  const lines = ['# 分镜脚本\n']

  for (const shot of shots) {
    lines.push(`## Shot ${shot.sequence}`)
    lines.push(``)
    lines.push(`**内容**: ${shot.content || '（无描述）'}`)
    lines.push(``)
    lines.push(`| 属性 | 值 |`)
    lines.push(`|------|------|`)
    lines.push(`| 景别 | ${SHOT_TYPES[shot.shotType]?.label || shot.shotType} |`)
    lines.push(`| 运镜 | ${CAMERA_MOVEMENTS[shot.camera]?.label || shot.camera} |`)
    lines.push(`| 时长 | ${shot.duration}s |`)
    if (shot.tone) lines.push(`| 色调 | ${shot.tone} |`)
    if (shot.sound) lines.push(`| 声音 | ${shot.sound} |`)
    if (shot.emotion) lines.push(`| 情绪 | ${shot.emotion} |`)
    if (shot.dialogue) lines.push(`| 台词 | ${shot.dialogue} |`)
    lines.push(``)
  }

  return lines.join('\n')
}

// ========== 辅助函数 ==========

function mapTransitionForJianying(transition) {
  if (transition === 'dissolve') {
    return { type: 'dissolve', duration: 15 }
  }
  if (transition === 'fade') {
    return { type: 'fade', duration: 20 }
  }
  return { type: 'cut' }
}

function buildTransitionEffect(transition, fps) {
  if (transition === 'dissolve') {
    return `<effect>
          <name>Cross Dissolve</name>
          <parameter>
            <name>Duration</name>
            <value>${Math.floor(fps * 0.5)}</value>
          </parameter>
        </effect>`
  }
  if (transition === 'fade') {
    return `<effect>
          <name>Dip to Black</name>
          <parameter>
            <name>Duration</name>
            <value>${Math.floor(fps * 0.8)}</value>
          </parameter>
        </effect>`
  }
  return ''
}

function buildFCPMetadata(shot) {
  return `<metadata>
        <shot_type>${shot.shotType}</shot_type>
        <camera_movement>${shot.camera}</camera_movement>
        <tone>${shot.tone || ''}</tone>
        <emotion>${shot.emotion || ''}</emotion>
      </metadata>`
}

export default {
  extractShotsFromPoetryLab,
  extractShotsFromProseEssay,
  toJianyingDraft,
  toFCPXML,
  toMarkdown
}
