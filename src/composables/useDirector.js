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
  getShotTypes,
  getCameraMovements,
  getTransitionTypes,
  inferShotTypeFromEmotion,
  inferToneFromEmotion
} from '../types/director'

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
