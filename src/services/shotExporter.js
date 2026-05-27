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
import { getAssetKindLabel } from './narrativeAssets'

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

  const normalizedNodes = normalizePoetryLabNodes(nodes)
  const nodeMap = new Map(normalizedNodes.map((node) => [node.id, node]))
  const edgeTransitionMap = new Map()

  for (const edge of edges || []) {
    const sourceId = resolvePoetryLabEdgeEndpoint(edge, 'source')
    const targetId = resolvePoetryLabEdgeEndpoint(edge, 'target')
    if (!sourceId || !targetId) continue
    const normalizedType = String(edge.type || '').toLowerCase()
    edgeTransitionMap.set(`${sourceId}->${targetId}`, normalizedType)
    if (!edgeTransitionMap.has(sourceId)) {
      edgeTransitionMap.set(sourceId, normalizedType)
    }
  }

  let orderedNodes
  if (groups && groups.length > 0) {
    orderedNodes = []
    const groupedIds = new Set()

    for (const group of groups) {
      if (!Array.isArray(group.nodeIds)) continue
      const groupNodes = group.nodeIds.map((id) => nodeMap.get(id)).filter(Boolean)
      orderedNodes.push(...groupNodes)
      for (const id of group.nodeIds) groupedIds.add(id)
    }

    for (const node of normalizedNodes) {
      if (!groupedIds.has(node.id)) {
        orderedNodes.push(node)
      }
    }
  } else {
    orderedNodes = dfsOrder(normalizedNodes)
  }

  const shots = []
  for (let i = 0; i < orderedNodes.length; i++) {
    const node = orderedNodes[i]
    const extra = node.extraFields || {}
    const emotion = node.emotion || extra.emotion || ''
    const examples = Array.isArray(node.examples) ? node.examples.filter(Boolean) : []
    const transition = i > 0
      ? edgeTransitionMap.get(`${orderedNodes[i - 1].id}->${node.id}`) || edgeTransitionMap.get(orderedNodes[i - 1].id) || 'jump_cut'
      : 'none'

    shots.push({
      sequence: i + 1,
      nodeId: node.id,
      content: node.content || node.text || node.title || '',
      shotType: extra.shotType || inferShotTypeFromEmotion(emotion),
      camera: extra.cameraMovement || 'fixed',
      duration: extra.duration || 3,
      tone: extra.toneDescription || inferToneFromEmotion(emotion),
      sound: extra.soundDescription || extra.soundEffects || '',
      emotion,
      transition: transition === 'none' ? 'none' : (TRANSITION_EXPORT_MAP[transition] || 'cut'),
      dialogue: extra.dialogue || examples[0] || ''
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
      assetId: entry.assetId || card.assetId || '',
      content: card.content || '',
      shotType: extra.shotType || inferShotTypeFromEmotion(emotion),
      camera: extra.cameraMovement || 'fixed',
      duration: extra.duration || entry.duration || 3,
      tone: extra.toneDescription || inferToneFromEmotion(emotion),
      sound: extra.soundDescription || extra.soundEffects || '',
      emotion: emotion,
      transition: i > 0 ? 'cut' : 'none',
      dialogue: extra.dialogue || '',
      imageReferences: Array.isArray(entry.imageReferences) ? entry.imageReferences : []
    })
  }

  return shots
}

/**
 * 从体验素材提取分镜列表
 * @param {object} options - 选项
 * @param {Array} options.assets - 素材数组
 * @param {string} [options.sourceLabel] - 来源标题
 * @returns {Shot[]} 分镜列表
 */
export function extractShotsFromNarrativeAssets({ assets, sourceLabel = '' }) {
  if (!Array.isArray(assets) || assets.length === 0) return []

  const orderedAssets = [...assets]
    .filter((asset) => String(asset?.content || '').trim())
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
    .slice(-12)

  return orderedAssets.map((asset, index) => {
    const kind = String(asset?.kind || 'inspiration')
    const content = String(asset?.content || '').trim()
    const title = String(asset?.title || '').trim() || summarizeShotTitle(content, getAssetKindLabel(kind))
    const summary = summarizeShotTitle(content, title)
    const shotType = inferShotTypeFromNarrativeAsset(kind, content)
    const camera = inferCameraMovementFromNarrativeAsset(kind, content)

    return {
      sequence: index + 1,
      nodeId: String(asset?.id || `asset_${index + 1}`),
      content: title,
      shotType,
      camera,
      duration: inferDurationFromNarrativeAsset(content),
      tone: summary,
      sound: '',
      emotion: '',
      transition: index === 0 ? 'none' : 'cut',
      dialogue: '',
      sourceText: content,
      visual: summary,
      notes: sourceLabel ? `${sourceLabel} · ${getAssetKindLabel(kind)}` : getAssetKindLabel(kind)
    }
  })
}

/**
 * 从章节纲要或正文提取分镜列表
 * @param {object} options - 选项
 * @param {string} [options.chapterTitle] - 章节标题
 * @param {string} [options.chapterContent] - 章节正文
 * @param {Array} [options.outlineItems] - 章节纲要项
 * @returns {Shot[]} 分镜列表
 */
export function extractShotsFromChapter({ chapterTitle = '', chapterContent = '', outlineItems = [] } = {}) {
  const normalizedOutline = Array.isArray(outlineItems)
    ? outlineItems.filter((item) => String(item?.content || '').trim()).slice(0, 12)
    : []

  const sourceItems = normalizedOutline.length > 0
    ? normalizedOutline.map((item, index) => ({
      id: item.id || `outline_${index + 1}`,
      title: item.title || `章节纲要 ${index + 1}`,
      content: item.content || '',
      assetKind: item.assetKind || 'chapter'
    }))
    : splitChapterContentIntoBlocks(chapterContent).slice(0, 12).map((content, index) => ({
      id: `chapter_${index + 1}`,
      title: summarizeShotTitle(content, chapterTitle || `章节片段 ${index + 1}`),
      content,
      assetKind: 'chapter'
    }))

  return sourceItems.map((item, index) => {
    const sourceText = String(item.content || '').trim()
    const title = String(item.title || '').trim() || summarizeShotTitle(sourceText, chapterTitle || '章节片段')
    const kind = String(item.assetKind || 'chapter')
    const summary = summarizeShotTitle(sourceText, title)

    return {
      sequence: index + 1,
      nodeId: String(item.id || `chapter_${index + 1}`),
      content: title,
      shotType: inferShotTypeFromChapterSource(kind, sourceText),
      camera: inferCameraMovementFromChapterSource(kind, sourceText),
      duration: inferDurationFromChapterAsset(sourceText),
      tone: summary,
      sound: '',
      emotion: '',
      transition: index === 0 ? 'none' : 'cut',
      dialogue: '',
      sourceText,
      visual: summary,
      notes: chapterTitle ? `章节：${chapterTitle}` : '章节片段'
    }
  })
}

/**
 * 深度优先遍历排序
 * @param {Array} nodes - 节点数组
 * @returns {Array} 排序后的节点数组
 */
function dfsOrder(nodes) {
  const nodeMap = new Map()
  const childrenMap = new Map()

  for (const node of nodes) {
    if (!node?.id) continue
    nodeMap.set(node.id, node)
    if (!node.parentId) continue
    if (!childrenMap.has(node.parentId)) {
      childrenMap.set(node.parentId, [])
    }
    childrenMap.get(node.parentId).push(node.id)
  }

  const visited = new Set()
  const result = []

  function dfs(nodeId) {
    if (!nodeId || visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) return
    result.push(node)
    for (const childId of childrenMap.get(nodeId) || []) {
      dfs(childId)
    }
  }

  const roots = nodes.filter((node) => node?.id && !node.parentId)
  for (const root of roots) {
    dfs(root.id)
  }

  for (const node of nodes) {
    if (node?.id && !visited.has(node.id)) {
      result.push(node)
    }
  }

  return result
}

function summarizeShotTitle(text, fallback = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return String(fallback || '').trim()
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized
}

function inferShotTypeFromNarrativeAsset(kind, content) {
  const normalizedKind = String(kind || '').trim()
  const length = String(content || '').trim().length
  const kindMap = {
    'draft-prose': 'medium',
    event: 'wide',
    'character-fact': 'close_up',
    'worldbook-draft': 'wide',
    inspiration: 'wide',
    'storyboard-seed': 'medium'
  }
  return kindMap[normalizedKind] || (length > 120 ? 'wide' : 'medium')
}

function inferCameraMovementFromNarrativeAsset(kind, content) {
  const normalizedKind = String(kind || '').trim()
  const kindMap = {
    'draft-prose': 'fixed',
    event: 'track',
    'character-fact': 'push',
    'worldbook-draft': 'pan',
    inspiration: 'fixed',
    'storyboard-seed': 'fixed'
  }
  return kindMap[normalizedKind] || (String(content || '').trim().length > 120 ? 'pan' : 'fixed')
}

function inferDurationFromNarrativeAsset(content) {
  const length = String(content || '').trim().length
  if (length > 220) return 5
  if (length > 120) return 4
  return 3
}

function splitChapterContentIntoBlocks(content = '') {
  const blocks = String(content || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length > 0) return blocks

  return String(content || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function inferShotTypeFromChapterSource(kind, content) {
  const normalizedKind = String(kind || '').trim()
  const kindMap = {
    chapter: 'wide',
    'draft-prose': 'medium',
    event: 'wide',
    'character-fact': 'close_up',
    'worldbook-draft': 'wide',
    inspiration: 'medium',
    'storyboard-seed': 'medium'
  }
  return kindMap[normalizedKind] || (String(content || '').trim().length > 100 ? 'wide' : 'medium')
}

function inferCameraMovementFromChapterSource(kind, content) {
  const normalizedKind = String(kind || '').trim()
  const kindMap = {
    chapter: 'fixed',
    'draft-prose': 'fixed',
    event: 'track',
    'character-fact': 'push',
    'worldbook-draft': 'pan',
    inspiration: 'fixed',
    'storyboard-seed': 'fixed'
  }
  return kindMap[normalizedKind] || (String(content || '').trim().length > 120 ? 'pan' : 'fixed')
}

function inferDurationFromChapterAsset(content) {
  const length = String(content || '').trim().length
  if (length > 260) return 5
  if (length > 140) return 4
  return 3
}

function normalizePoetryLabNodes(nodes = []) {
  const normalized = []
  const seen = new Set()

  function visit(node, parentId = null) {
    if (!node || typeof node !== 'object') return
    const id = String(node.id || '').trim()
    if (!id || seen.has(id)) return
    seen.add(id)

    const copy = {
      ...node,
      id,
      parentId: node.parentId || parentId || null,
      children: Array.isArray(node.children) ? node.children : []
    }

    normalized.push(copy)

    for (const child of copy.children) {
      if (child && typeof child === 'object') {
        visit(child, copy.id)
      }
    }
  }

  for (const node of nodes) {
    visit(node)
  }

  return normalized
}

function resolvePoetryLabEdgeEndpoint(edge, endpoint) {
  if (!edge || typeof edge !== 'object') return ''
  const directKey = `${endpoint}Id`
  const value = edge[directKey] ?? edge[endpoint]
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    return String(value.id || value.nodeId || value[directKey] || '').trim()
  }
  return ''
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
export function toMarkdown(shots, options = {}) {
  const {
    title = '分镜脚本',
    topic = ''
  } = options

  const lines = [`# ${title}`, '']
  if (topic) {
    lines.push(`**主题：** ${topic}`)
    lines.push('')
  }

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

/**
 * 导出为 Premiere CSV 格式
 * @param {Shot[]} shots - 分镜列表
 * @returns {string} CSV 字符串
 */
export function toPremiereCSV(shots) {
  let csv = '序号,景别,运镜,时长(秒),画面描述,台词,音效\n'
  shots.forEach((shot, index) => {
    const desc = csvEscape(shot.content || '')
    const dialogue = csvEscape(shot.dialogue || '')
    const sound = csvEscape(shot.sound || '')
    csv += `${index + 1},"${SHOT_TYPES[shot.shotType]?.label || shot.shotType}","${CAMERA_MOVEMENTS[shot.camera]?.label || shot.camera}",${shot.duration || 3},"${desc}","${dialogue}","${sound}"\n`
  })
  return csv
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

function csvEscape(value) {
  return String(value || '').replace(/"/g, '""').replace(/\n/g, ' ')
}

export default {
  extractShotsFromPoetryLab,
  extractShotsFromProseEssay,
  extractShotsFromNarrativeAssets,
  extractShotsFromChapter,
  toJianyingDraft,
  toFCPXML,
  toMarkdown,
  toPremiereCSV
}
