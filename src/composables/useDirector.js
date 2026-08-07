/**
 * useDirector - 编导模式组合式函数
 *
 * 职责：
 * - 管理编导模式状态
 * - 提供分镜编辑功能
 * - 支持导出为多种格式
 */

import { ref, computed } from 'vue'
import {
  getCurrentStoryboardVersion,
  getStoryboardDocument,
  getStoryboardVersion,
  listStoryboardVersions,
  restoreStoryboardSnapshot,
  restoreStoryboardVersion,
  saveStoryboardVersion,
  validateStoryboardShots
} from '../services/storyboardStore'
import {
  extractShotsFromRelationCanvas,
  extractShotsFromProseEssay,
  toJianyingDraft,
  toFCPXML,
  toMarkdown
} from '../services/shotExporter'
import {
  CAMERA_MOVEMENTS,
  SHOT_TYPES,
  getShotTypes,
  getCameraMovements,
  getTransitionTypes,
  inferShotTypeFromEmotion,
  inferToneFromEmotion
} from '../types/director'
import { mergeSourceRefs } from '../services/narrativeAssets'

const VIDEO_PROMPT_LIMIT = 2000
const CAMERA_PROMPT_TEXT = Object.freeze({
  push: '[推进] 镜头向主体缓慢推进',
  pull: '[拉远] 镜头从主体平稳拉远',
  pan: '镜头缓慢横摇，逐步揭示空间关系',
  track: '镜头平稳横移，保持主体构图稳定',
  follow: '[跟随] 镜头平稳跟随主体运动',
  fixed: '[固定] 镜头保持固定机位'
})
const TRANSITION_PROMPT_TEXT = Object.freeze({
  cut: '紧接上一镜切入当前画面',
  jump_cut: '从上一镜跳切进入当前画面',
  dissolve: '画面由上一镜柔和叠化进入',
  fade: '画面从黑场淡入',
  fade_in_out: '画面由上一镜淡出后再淡入',
  contrast_montage: '通过对比蒙太奇进入当前画面',
  cross_cut: '从并行场景交叉剪辑至当前画面',
  match_cut: '沿用上一镜的形状或动作匹配切入'
})
const RELATION_PROMPT_LABELS = Object.freeze({
  continuation: '前后镜',
  elaboration: '因果',
  contrast: '对照',
  parallel: '同场',
  consciousness: '视觉呼应'
})

function normalizePromptText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function truncatePromptPart(value, maxChars) {
  const text = normalizePromptText(value)
  if (text.length <= maxChars) return text
  const candidate = text.slice(0, maxChars)
  const sentenceEnd = Math.max(
    candidate.lastIndexOf('。'),
    candidate.lastIndexOf('！'),
    candidate.lastIndexOf('？'),
    candidate.lastIndexOf('；')
  )
  return `${sentenceEnd >= Math.floor(maxChars * 0.55) ? candidate.slice(0, sentenceEnd + 1) : candidate}…`
}

function trimVideoPrompt(value) {
  const prompt = String(value || '').trim()
  if (prompt.length <= VIDEO_PROMPT_LIMIT) return prompt
  return prompt.slice(0, VIDEO_PROMPT_LIMIT).trim()
}

export function buildShotVideoPrompt(input = {}) {
  const shot = input.shot || {}
  const previousShot = input.previousShot || null
  const content = truncatePromptPart(
    shot.content || shot.sourceText || shot.description || shot.visual,
    920
  )
  if (!content) return ''

  const shotTypeId = shot.shotType || shot.shotSize || 'medium'
  const cameraId = shot.camera || shot.cameraMovement || 'fixed'
  const shotType = SHOT_TYPES[shotTypeId]?.label || normalizePromptText(shotTypeId)
  const camera = CAMERA_PROMPT_TEXT[cameraId]
    || CAMERA_MOVEMENTS[cameraId]?.description
    || normalizePromptText(cameraId)
  const sequence = Number(shot.sequence) || Number(input.shotIndex) + 1 || 1
  const lines = [
    `镜头 ${sequence}。画面主体、场景与动作：${content}`,
    `构图与镜头运动：${shotType || '中景'}；${camera || '[固定] 镜头保持固定机位'}。`
  ]

  if (previousShot) {
    const transition = TRANSITION_PROMPT_TEXT[shot.transition] || '承接上一镜进入当前画面'
    const relation = truncatePromptPart(
      shot.relationLabel || RELATION_PROMPT_LABELS[shot.relationType] || shot.relationType,
      60
    )
    const previousAnchor = truncatePromptPart(
      previousShot.content || previousShot.sourceText || previousShot.description || previousShot.visual,
      180
    )
    const relationText = relation ? `，以“${relation}”关系衔接` : ''
    const anchorText = previousAnchor ? `；上一镜的视觉锚点是“${previousAnchor}”` : ''
    lines.push(`镜头衔接：${transition}${relationText}${anchorText}。保持人物、服装、空间方位和光线连续。`)
  }

  const atmosphere = [shot.tone || shot.visual, shot.emotion]
    .map((item) => truncatePromptPart(item, 160))
    .filter(Boolean)
  if (atmosphere.length) lines.push(`视觉氛围：${atmosphere.join('；')}。`)

  const dialogue = truncatePromptPart(shot.dialogue, 180)
  if (dialogue) lines.push(`人物表演：口型和动作配合对白“${dialogue}”。`)
  const sound = truncatePromptPart(shot.sound, 140)
  if (sound) lines.push(`环境表现：画面中的声源与“${sound}”对应。`)

  lines.push('画面中不出现字幕、镜头参数文字、界面文字或水印。')
  return trimVideoPrompt(lines.join('\n'))
}

export function buildStoryboardVideoJobInput(input = {}) {
  const shots = Array.isArray(input.shots) ? input.shots : []
  const requestedIndex = Number.isFinite(Number(input.shotIndex)) ? Number(input.shotIndex) : 0
  const shotIndex = Math.max(0, Math.min(shots.length - 1, Math.round(requestedIndex)))
  const shot = shots[shotIndex] || null
  const previousShot = shotIndex > 0 ? shots[shotIndex - 1] : null
  const durationSeconds = Math.max(1, Math.min(60, Math.round(
    Number(input.durationSeconds) || Number(shot?.duration) || 5
  )))
  const prompt = trimVideoPrompt(input.promptOverride || buildShotVideoPrompt({
    shot,
    previousShot,
    shotIndex
  }))
  const referenceImages = (Array.isArray(shot?.imageReferences) ? shot.imageReferences : [])
    .filter((reference) => typeof reference?.data === 'string' && reference.data.startsWith('data:image/'))
    .slice(0, 4)
    .map((reference) => ({ data: reference.data, mediaAssetId: reference.mediaAssetId || null }))
  const sourceRefs = mergeSourceRefs(
    input.sourceRefs,
    input.versionId ? [{
        refType: 'storyboard-shot',
        refId: input.versionId,
        projectId: input.projectId || null,
        version: input.versionFingerprint || null,
        excerpt: prompt.slice(0, 240)
      }] : []
  )
  for (const reference of referenceImages) {
    if (!reference.mediaAssetId) continue
    sourceRefs.push({
      refType: 'image',
      refId: reference.mediaAssetId,
      projectId: input.projectId || null,
      version: null,
      excerpt: ''
    })
  }

  return {
    projectId: input.projectId || null,
    shot: shot
      ? {
          shotId: shot.shotId || shot.nodeId || null,
          sequence: Number(shot.sequence) || shotIndex + 1,
          shotType: shot.shotType || shot.shotSize || null,
          camera: shot.camera || shot.cameraMovement || null,
          transition: shot.transition || null,
          relationType: shot.relationType || null,
          relationLabel: shot.relationLabel || null
        }
      : null,
    input: {
      prompt,
      durationSeconds,
      aspectRatio: input.aspectRatio || '16:9',
      sourceRefs: mergeSourceRefs(sourceRefs),
      referenceImages
    }
  }
}

/**
 * 创建编导模式状态
 * @param {object} options - 配置选项
 * @returns {object} 编导模式状态和方法
 */
export function useDirector(options = {}) {
  const {
    initialMode = 'writing',
    defaultDuration = 3
  } = options

  // 模式状态：writing | directing
  const mode = ref(initialMode)

  // 当前分镜列表
  const shots = ref([])

  // 分镜来源与历史
  const storyboardSource = ref({
    sourceType: initialMode === 'poetry' ? 'relation-canvas' : 'prose-card',
    sourceLabel: initialMode === 'poetry' ? '关系画布' : '散文随笔',
    sourceId: ''
  })
  const storyboardDocumentId = ref('')
  const storyboardVersionId = ref('')
  const snapshotHistory = ref([])
  const lastValidation = ref({
    valid: true,
    errors: [],
    warnings: []
  })

  // 选中的分镜
  const selectedShotIndex = ref(-1)

  // 导出格式
  const exportFormat = ref('jianying') // jianying | fcpxml | markdown

  // 景别和运镜选项
  const shotTypeOptions = getShotTypes()
  const cameraOptions = getCameraMovements()
  const transitionOptions = getTransitionTypes()

  function refreshSnapshotHistory() {
    if (!storyboardDocumentId.value) {
      snapshotHistory.value = []
      return
    }

    const versions = listStoryboardVersions(storyboardDocumentId.value)
    snapshotHistory.value = versions
    const currentDocument = getStoryboardDocument(storyboardDocumentId.value)
    const currentVersion = currentDocument ? getCurrentStoryboardVersion(currentDocument) : null

    if (currentVersion) {
      storyboardVersionId.value = currentVersion.versionId
      lastValidation.value = currentVersion.validation || lastValidation.value
    }
  }

  function captureSnapshot(reason = 'update') {
    if (shots.value.length === 0) return null

    const result = saveStoryboardVersion({
      documentId: storyboardDocumentId.value,
      source: {
        sourceType: storyboardSource.value.sourceType,
        sourceLabel: storyboardSource.value.sourceLabel,
        sourceId: storyboardSource.value.sourceId
      },
      shots: shots.value,
      taskType: `director.${reason}`,
      parameters: {
        mode: mode.value,
        reason
      }
    })

    storyboardDocumentId.value = result.document.id
    storyboardVersionId.value = result.version.versionId
    lastValidation.value = result.version.validation || lastValidation.value
    refreshSnapshotHistory()
    return {
      ...result.version,
      documentId: result.document.id,
      sourceType: result.document.source.sourceType,
      sourceId: result.document.source.sourceId,
      sourceLabel: result.document.source.title
    }
  }

  function syncValidation() {
    lastValidation.value = validateStoryboardShots(shots.value)
    return lastValidation.value
  }

  // 当前选中的分镜
  const selectedShot = computed(() => {
    if (selectedShotIndex.value < 0 || selectedShotIndex.value >= shots.value.length) {
      return null
    }
    return shots.value[selectedShotIndex.value]
  })

  // 总时长（秒）
  const totalDuration = computed(() => {
    return shots.value.reduce((sum, shot) => sum + (shot.duration || defaultDuration), 0)
  })

  // 分镜数量
  const shotCount = computed(() => shots.value.length)

  /**
   * 切换模式
   * @param {string} newMode - 新模式
   */
  function switchMode(newMode) {
    mode.value = newMode
  }

  /**
   * 从关系画布数据加载分镜
   * @param {Array} nodes - 节点数组
   * @param {Array} edges - 边数组
   * @param {Array} groups - 分组数组
   */
  function loadFromRelationCanvas(nodes, edges = [], groups = []) {
    shots.value = extractShotsFromRelationCanvas({ nodes, edges, groups })
    selectedShotIndex.value = shots.value.length > 0 ? 0 : -1
    storyboardSource.value = {
      sourceType: 'relation-canvas',
      sourceLabel: '关系画布',
      sourceId: ''
    }
    captureSnapshot('load')
  }

  function loadFromPoetryLab(nodes, edges = [], groups = []) {
    loadFromRelationCanvas(nodes, edges, groups)
  }

  /**
   * 从 ProseEssay 数据加载分镜
   * @param {Array} cards - 卡片数组
   * @param {Array} timeline - 时间轴数组
   */
  function loadFromProseEssay(cards, timeline = []) {
    shots.value = extractShotsFromProseEssay({ cards, timeline })
    selectedShotIndex.value = shots.value.length > 0 ? 0 : -1
    storyboardSource.value = {
      sourceType: 'prose-card',
      sourceLabel: '散文随笔',
      sourceId: ''
    }
    captureSnapshot('load')
  }

  /**
   * 更新分镜
   * @param {number} index - 分镜索引
   * @param {object} updates - 更新内容
   */
  function updateShot(index, updates) {
    if (index < 0 || index >= shots.value.length) return
    shots.value[index] = { ...shots.value[index], ...updates }
    captureSnapshot('update')
  }

  /**
   * 删除分镜
   * @param {number} index - 分镜索引
   */
  function removeShot(index) {
    if (index < 0 || index >= shots.value.length) return
    shots.value.splice(index, 1)
    // 重新编号
    shots.value.forEach((shot, i) => {
      shot.sequence = i + 1
    })
    // 调整选中索引
    if (selectedShotIndex.value >= shots.value.length) {
      selectedShotIndex.value = shots.value.length - 1
    }
    captureSnapshot('remove')
  }

  /**
   * 添加分镜
   * @param {object} shotData - 分镜数据
   */
  function addShot(shotData = {}) {
    const newShot = {
      sequence: shots.value.length + 1,
      nodeId: `shot_${Date.now()}`,
      content: shotData.content || '',
      shotType: shotData.shotType || 'medium',
      camera: shotData.camera || 'fixed',
      duration: shotData.duration || defaultDuration,
      tone: shotData.tone || '',
      sound: shotData.sound || '',
      emotion: shotData.emotion || '',
      transition: shots.value.length > 0 ? 'cut' : 'none',
      ...shotData
    }
    shots.value.push(newShot)
    selectedShotIndex.value = shots.value.length - 1
    captureSnapshot('add')
  }

  /**
   * 移动分镜位置
   * @param {number} fromIndex - 原索引
   * @param {number} toIndex - 目标索引
   */
  function moveShot(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= shots.value.length) return
    if (toIndex < 0 || toIndex >= shots.value.length) return
    if (fromIndex === toIndex) return

    const [shot] = shots.value.splice(fromIndex, 1)
    shots.value.splice(toIndex, 0, shot)
    // 重新编号
    shots.value.forEach((s, i) => {
      s.sequence = i + 1
    })
    captureSnapshot('move')
  }

  /**
   * 选择分镜
   * @param {number} index - 分镜索引
   */
  function selectShot(index) {
    if (index >= -1 && index < shots.value.length) {
      selectedShotIndex.value = index
    }
  }

  /**
   * 清空分镜
   */
  function clearShots() {
    shots.value = []
    selectedShotIndex.value = -1
    captureSnapshot('clear')
  }

  /**
   * 导出为指定格式
   * @param {string} format - 导出格式
   * @returns {string|object} 导出内容
   */
  function exportShots(format = exportFormat.value) {
    if (shots.value.length === 0) {
      return null
    }

    const report = syncValidation()
    if (!report.valid) {
      return null
    }

    switch (format) {
      case 'jianying':
        return toJianyingDraft(shots.value)
      case 'fcpxml':
        return toFCPXML(shots.value)
      case 'markdown':
        return toMarkdown(shots.value)
      default:
        return toJianyingDraft(shots.value)
    }
  }

  /**
   * 导出并下载
   * @param {string} format - 导出格式
   * @param {string} filename - 文件名
   */
  function downloadExport(format = exportFormat.value, filename = 'storyboard') {
    const content = exportShots(format)
    if (!content) return

    let mimeType, extension

    switch (format) {
      case 'jianying':
        mimeType = 'application/json'
        extension = 'json'
        break
      case 'fcpxml':
        mimeType = 'application/xml'
        extension = 'xml'
        break
      case 'markdown':
        mimeType = 'text/markdown'
        extension = 'md'
        break
      default:
        mimeType = 'application/json'
        extension = 'json'
    }

    const blob = new Blob(
      [typeof content === 'string' ? content : JSON.stringify(content, null, 2)],
      { type: mimeType }
    )

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function restoreSnapshot(snapshotId) {
    if (!storyboardDocumentId.value) return false

    const restored = restoreStoryboardVersion(storyboardDocumentId.value, snapshotId)
    if (!restored.success) {
      const snapshot = restoreStoryboardSnapshot(snapshotId)
      if (!snapshot) return false
      shots.value = Array.isArray(snapshot.shots) ? snapshot.shots.map((shot) => ({ ...shot })) : []
      selectedShotIndex.value = shots.value.length > 0 ? 0 : -1
      lastValidation.value = snapshot.validation || lastValidation.value
      refreshSnapshotHistory()
      return true
    }

    shots.value = Array.isArray(restored.version.shots) ? restored.version.shots.map((shot) => ({ ...shot })) : []
    selectedShotIndex.value = shots.value.length > 0 ? 0 : -1
    lastValidation.value = restored.version.validation || lastValidation.value
    refreshSnapshotHistory()
    return true
  }

  return {
    // 状态
    mode,
    shots,
    selectedShotIndex,
    selectedShot,
    exportFormat,

    // 计算属性
    totalDuration,
    shotCount,
    snapshotHistory,
    lastValidation,
    storyboardDocumentId,
    storyboardVersionId,
    storyboardDocument: computed(() => getStoryboardDocument(storyboardDocumentId.value)),
    storyboardVersion: computed(() => {
      if (!storyboardDocumentId.value || !storyboardVersionId.value) return null
      return getStoryboardVersion(storyboardDocumentId.value, storyboardVersionId.value)
    }),

    // 选项
    shotTypeOptions,
    cameraOptions,
    transitionOptions,

    // 方法
    switchMode,
    loadFromRelationCanvas,
    loadFromPoetryLab,
    loadFromProseEssay,
    updateShot,
    removeShot,
    addShot,
    moveShot,
    selectShot,
    clearShots,
    exportShots,
    downloadExport,
    captureSnapshot,
    restoreSnapshot,
    refreshSnapshotHistory,
    getLatestSnapshot: () => getCurrentStoryboardVersion(getStoryboardDocument(storyboardDocumentId.value)),
    validateCurrent: () => validateStoryboardShots(shots.value)
  }
}

/**
 * 快速创建编导模式实例
 * @param {string} sourceType - 数据源类型
 * @param {object} data - 数据
 * @returns {object} 编导模式实例
 */
export function createDirectorFromData(sourceType, data) {
  const director = useDirector()

  if (sourceType === 'relation-canvas') {
    director.loadFromRelationCanvas(data.nodes, data.edges, data.groups)
  } else if (sourceType === 'poetry' || sourceType === 'poetry-tree') {
    director.loadFromPoetryLab(data.nodes, data.edges, data.groups)
  } else if (sourceType === 'prose' || sourceType === 'prose-card') {
    director.loadFromProseEssay(data.cards, data.timeline)
  }

  return director
}

export default useDirector
