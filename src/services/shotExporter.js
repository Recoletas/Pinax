/**
 * shotExporter - 分镜导出服务
 *
 * 职责：
 * - 从关系画布 / 卡片画布数据提取分镜列表
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
 * @property {string} [assetId] - 来源素材 ID
 * @property {string} [relationType] - 与上一镜的关系类型
 * @property {string} [relationLabel] - 与上一镜的关系标签
 * @property {Array} [imageReferences] - 参考图轻量引用
 */

/**
 * 从关系画布数据提取分镜列表
 * @param {object} options - 选项
 * @param {Array} options.nodes - 节点数组
 * @param {Array} options.edges - 边数组
 * @param {Array} [options.groups] - 意象群数组
 * @returns {Shot[]} 分镜列表
 */
export function extractShotsFromRelationCanvas({ nodes, edges, groups = [] }) {
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

export const extractShotsFromPoetryLab = extractShotsFromRelationCanvas

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
      relationType: entry.relationType || '',
      relationLabel: entry.relationLabel || '',
      imageReferences: normalizeImageReferences(entry.imageReferences)
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
      nodeId: shot.nodeId || '',
      assetId: shot.assetId || '',
      content: shot.content || '',
      startFrame: currentFrame,
      endFrame: currentFrame + durationFrames,
      duration: durationFrames,
      transition: mapTransitionForJianying(shot.transition),
      shotType: shot.shotType,
      camera: shot.camera,
      tone: shot.tone || '',
      relation: buildShotRelationMetadata(shot),
      referenceImages: getShotImageReferences(shot),
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
    if (shot.assetId) lines.push(`| 素材 | ${shot.assetId} |`)
    if (shot.relationLabel || shot.relationType) lines.push(`| 承接 | ${shot.relationLabel || shot.relationType} |`)
    const referenceText = formatImageReferences(getShotImageReferences(shot))
    if (referenceText) lines.push(`| 参考图 | ${referenceText} |`)
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
  let csv = '序号,素材ID,关系,景别,运镜,时长(秒),画面描述,台词,音效,参考图\n'
  shots.forEach((shot, index) => {
    const assetId = csvEscape(shot.assetId || '')
    const relation = csvEscape(shot.relationLabel || shot.relationType || '')
    const desc = csvEscape(shot.content || '')
    const dialogue = csvEscape(shot.dialogue || '')
    const sound = csvEscape(shot.sound || '')
    const references = csvEscape(formatImageReferences(getShotImageReferences(shot)))
    csv += `${index + 1},"${assetId}","${relation}","${SHOT_TYPES[shot.shotType]?.label || shot.shotType}","${CAMERA_MOVEMENTS[shot.camera]?.label || shot.camera}",${shot.duration || 3},"${desc}","${dialogue}","${sound}","${references}"\n`
  })
  return csv
}

/**
 * 构建统一剪辑交付包。
 * 页面层只负责下载，具体格式和文件清单在服务层保持稳定。
 * @param {Shot[]} shots - 分镜列表
 * @param {object} options - 选项
 * @returns {object} 剪辑交付包
 */
export function buildEditingPackage(shots = [], options = {}) {
  const {
    topic = '未命名',
    exportedAt = new Date().toISOString(),
    storyboardDocumentId = '',
    storyboardVersionId = '',
    validation = null,
    name = topic || '卡片画布'
  } = options

  const normalizedShots = Array.isArray(shots) ? shots : []
  const markdown = toMarkdown(normalizedShots, {
    title: '分镜脚本',
    topic
  })
  const premiereCsv = toPremiereCSV(normalizedShots)
  const jianyingDraft = toJianyingDraft(normalizedShots)
  const fcpxml = toFCPXML(normalizedShots, { name })
  const metadata = {
    schemaVersion: 1,
    topic,
    exportedAt,
    storyboardDocumentId,
    storyboardVersionId,
    validation,
    shotCount: normalizedShots.length,
    durationSeconds: normalizedShots.reduce((sum, shot) => sum + (Number(shot.duration) || 3), 0),
    shots: normalizedShots
  }

  const files = [
    createPackageFile('manifest.json', 'application/json', {
      packageType: 'storyboard-editing-package',
      schemaVersion: 2,
      topic,
      exportedAt,
      storyboardDocumentId,
      storyboardVersionId,
      shotCount: metadata.shotCount,
      durationSeconds: metadata.durationSeconds,
      formats: ['markdown', 'premiere-csv', 'jianying-draft', 'fcpxml', 'metadata-json'],
      recommendedUse: [
        '先查看 storyboard.md 确认镜头顺序与关系。',
        'Premiere 可从 premiere.csv 读取镜头表。',
        'FCP XML 可作为剪辑时间线占位导入。',
        'jianying-draft.json 保留剪映草稿结构和素材/参考图元数据。'
      ]
    }),
    createPackageFile('storyboard.md', 'text/markdown', markdown),
    createPackageFile('premiere.csv', 'text/csv', premiereCsv),
    createPackageFile('jianying-draft.json', 'application/json', jianyingDraft),
    createPackageFile('timeline.fcpxml', 'application/xml', fcpxml),
    createPackageFile('metadata.json', 'application/json', metadata)
  ]

  return {
    schemaVersion: 2,
    packageType: 'storyboard-editing-package',
    exportedAt,
    topic,
    storyboardDocumentId,
    storyboardVersionId,
    validation,
    manifest: JSON.parse(files[0].content),
    shots: normalizedShots,
    files,
    formats: {
      markdown,
      premiereCsv,
      jianyingDraft,
      fcpxml,
      metadata
    }
  }
}

/**
 * 将剪辑交付包打成无压缩 ZIP。
 * @param {object} editingPackage - buildEditingPackage 返回值
 * @returns {Uint8Array} ZIP 二进制
 */
export function buildEditingPackageZip(editingPackage = {}) {
  const files = Array.isArray(editingPackage.files) ? editingPackage.files : []
  return buildStoredZip(files.map((file) => ({
    path: file.path,
    content: file.content
  })))
}

// ========== 辅助函数 ==========

function createPackageFile(path, mimeType, content) {
  const serialized = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  return {
    path,
    mimeType,
    encoding: 'utf-8',
    content: serialized
  }
}

function buildStoredZip(files = []) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encodeUtf8(normalizeZipPath(file.path))
    const contentBytes = encodeUtf8(file.content)
    const crc = crc32(contentBytes)
    const localHeader = createZipLocalHeader(nameBytes, contentBytes.length, crc)
    const centralHeader = createZipCentralHeader(nameBytes, contentBytes.length, crc, offset)

    localParts.push(localHeader, nameBytes, contentBytes)
    centralParts.push(centralHeader, nameBytes)
    offset += localHeader.length + nameBytes.length + contentBytes.length
  }

  const centralDirectory = concatBytes(centralParts)
  const localData = concatBytes(localParts)
  const end = createZipEndRecord(files.length, centralDirectory.length, localData.length)
  return concatBytes([localData, centralDirectory, end])
}

function createZipLocalHeader(nameBytes, size, crc) {
  const bytes = new Uint8Array(30)
  writeUint32(bytes, 0, 0x04034b50)
  writeUint16(bytes, 4, 20)
  writeUint16(bytes, 6, 0x0800)
  writeUint16(bytes, 8, 0)
  writeUint16(bytes, 10, 0)
  writeUint16(bytes, 12, 0)
  writeUint32(bytes, 14, crc)
  writeUint32(bytes, 18, size)
  writeUint32(bytes, 22, size)
  writeUint16(bytes, 26, nameBytes.length)
  writeUint16(bytes, 28, 0)
  return bytes
}

function createZipCentralHeader(nameBytes, size, crc, offset) {
  const bytes = new Uint8Array(46)
  writeUint32(bytes, 0, 0x02014b50)
  writeUint16(bytes, 4, 20)
  writeUint16(bytes, 6, 20)
  writeUint16(bytes, 8, 0x0800)
  writeUint16(bytes, 10, 0)
  writeUint16(bytes, 12, 0)
  writeUint16(bytes, 14, 0)
  writeUint32(bytes, 16, crc)
  writeUint32(bytes, 20, size)
  writeUint32(bytes, 24, size)
  writeUint16(bytes, 28, nameBytes.length)
  writeUint16(bytes, 30, 0)
  writeUint16(bytes, 32, 0)
  writeUint16(bytes, 34, 0)
  writeUint16(bytes, 36, 0)
  writeUint32(bytes, 38, 0)
  writeUint32(bytes, 42, offset)
  return bytes
}

function createZipEndRecord(fileCount, centralDirectorySize, centralDirectoryOffset) {
  const bytes = new Uint8Array(22)
  writeUint32(bytes, 0, 0x06054b50)
  writeUint16(bytes, 4, 0)
  writeUint16(bytes, 6, 0)
  writeUint16(bytes, 8, fileCount)
  writeUint16(bytes, 10, fileCount)
  writeUint32(bytes, 12, centralDirectorySize)
  writeUint32(bytes, 16, centralDirectoryOffset)
  writeUint16(bytes, 20, 0)
  return bytes
}

function encodeUtf8(value) {
  return new TextEncoder().encode(String(value || ''))
}

function concatBytes(parts = []) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function writeUint16(bytes, offset, value) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(bytes, offset, value) {
  const v = value >>> 0
  bytes[offset] = v & 0xff
  bytes[offset + 1] = (v >>> 8) & 0xff
  bytes[offset + 2] = (v >>> 16) & 0xff
  bytes[offset + 3] = (v >>> 24) & 0xff
}

function normalizeZipPath(path) {
  return String(path || 'file.txt')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|$)/g, '')
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  return c >>> 0
})

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
  const references = getShotImageReferences(shot)
  return `<metadata>
        <asset_id>${escapeXml(shot.assetId || '')}</asset_id>
        <relation_type>${escapeXml(shot.relationType || '')}</relation_type>
        <relation_label>${escapeXml(shot.relationLabel || '')}</relation_label>
        <reference_images>${escapeXml(formatImageReferences(references))}</reference_images>
        <shot_type>${shot.shotType}</shot_type>
        <camera_movement>${shot.camera}</camera_movement>
        <tone>${escapeXml(shot.tone || '')}</tone>
        <emotion>${escapeXml(shot.emotion || '')}</emotion>
      </metadata>`
}

function csvEscape(value) {
  return String(value || '').replace(/"/g, '""').replace(/\n/g, ' ')
}

function getShotImageReferences(shot = {}) {
  return normalizeImageReferences(shot.imageReferences || shot.referenceImages || [])
}

function normalizeImageReferences(references = []) {
  if (!Array.isArray(references)) return []
  const seen = new Set()
  return references
    .map((reference) => ({
      id: String(reference?.id || '').trim(),
      assetId: String(reference?.assetId || '').trim(),
      assetKind: String(reference?.assetKind || '').trim(),
      source: String(reference?.source || '').trim(),
      title: String(reference?.title || '').trim(),
      prompt: String(reference?.prompt || '').trim(),
      width: Number(reference?.width) || null,
      height: Number(reference?.height) || null,
      hasData: Boolean(reference?.hasData)
    }))
    .filter((reference) => reference.id || reference.assetId || reference.title || reference.prompt)
    .filter((reference) => {
      const key = `${reference.assetId}:${reference.id}:${reference.title}:${reference.prompt}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function formatImageReferences(references = []) {
  return normalizeImageReferences(references)
    .map((reference) => {
      const name = reference.title || reference.assetId || reference.id || reference.prompt
      const size = reference.width && reference.height ? ` ${reference.width}x${reference.height}` : ''
      const source = reference.source ? `@${reference.source}` : ''
      return `${name}${source}${size}`
    })
    .join('；')
}

function buildShotRelationMetadata(shot = {}) {
  if (!shot.relationType && !shot.relationLabel) return null
  return {
    type: shot.relationType || '',
    label: shot.relationLabel || shot.relationType || ''
  }
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default {
  extractShotsFromRelationCanvas,
  extractShotsFromPoetryLab,
  extractShotsFromProseEssay,
  extractShotsFromNarrativeAssets,
  extractShotsFromChapter,
  buildEditingPackage,
  buildEditingPackageZip,
  toJianyingDraft,
  toFCPXML,
  toMarkdown,
  toPremiereCSV
}
