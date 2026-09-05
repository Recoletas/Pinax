// Authoring 书与世界书显式绑定：book.worldbookId 是唯一的设定源真源。
// 纯函数模块：不做全局 active worldbook 回退，不做 provider I/O。

import { ref, shallowRef } from 'vue'

export function normalizeBookWorldbookBinding(book = {}) {
  return String(book?.worldbookId ?? '').trim()
}

export function resolveBookWorldbookStatus({ book, worldbooks }) {
  const worldbookId = normalizeBookWorldbookBinding(book)
  if (!worldbookId) return { status: 'unbound', worldbookId: '', worldbook: null }
  const indexEntry = (Array.isArray(worldbooks) ? worldbooks : [])
    .find((item) => String(item?.id) === worldbookId)
  return indexEntry
    ? { status: 'bound', worldbookId, worldbook: indexEntry }
    : { status: 'missing', worldbookId, worldbook: null }
}

export function previewWorldbookRebind({ book, nextWorldbookId }) {
  const nextId = String(nextWorldbookId || '').trim()
  const chapters = Array.isArray(book?.chapters) ? book.chapters : []
  let affectedAnchorCount = 0
  for (const chapter of chapters) {
    const anchors = Array.isArray(chapter?.sceneAnchors) ? chapter.sceneAnchors : []
    for (const anchor of anchors) {
      const anchorWorldbookId = String(anchor?.worldbookId || '').trim()
      if (!nextId) {
        const hasDirectoryRefs = Boolean(
          anchorWorldbookId
          || String(anchor?.locationId || '').trim()
          || String(anchor?.viewpointCharacterId || '').trim()
          || (Array.isArray(anchor?.presentCharacterIds) && anchor.presentCharacterIds.length)
        )
        if (hasDirectoryRefs) affectedAnchorCount += 1
        continue
      }
      if (anchorWorldbookId && anchorWorldbookId !== nextId) affectedAnchorCount += 1
    }
  }
  return { affectedAnchorCount, requiresConfirmation: affectedAnchorCount > 0 }
}

// 首次关联世界书时，未绑定阶段创建的锚点（此时 UI 只允许填写时间）可以
// 安全归属到新世界书。已有非空归属绝不迁移：其中的人物/地点 ID 属于旧目录，
// 必须继续由 worldbook-mismatch 要求作者重新确认。
export function bindUnboundSceneAnchors({ chapters, nextWorldbookId } = {}) {
  const nextId = String(nextWorldbookId || '').trim()
  const source = Array.isArray(chapters) ? chapters : []
  if (!nextId) return { chapters: source, migratedAnchorCount: 0 }
  let migratedAnchorCount = 0
  const nextChapters = source.map((chapter) => {
    if (!Array.isArray(chapter?.sceneAnchors)) return chapter
    let chapterChanged = false
    const sceneAnchors = chapter.sceneAnchors.map((anchor) => {
      if (!anchor?.unitId || String(anchor.worldbookId || '').trim()) return anchor
      chapterChanged = true
      migratedAnchorCount += 1
      return { ...anchor, worldbookId: nextId }
    })
    return chapterChanged ? { ...chapter, sceneAnchors } : chapter
  })
  return { chapters: migratedAnchorCount ? nextChapters : source, migratedAnchorCount }
}

// 解绑时保留不依赖世界书的时间轴；人物、视角与地点 ID 属于旧目录，
// 必须在用户确认后一起移除，不能伪装成仍有效的未绑定引用。
export function detachSceneAnchorsFromWorldbook({ chapters } = {}) {
  const source = Array.isArray(chapters) ? chapters : []
  let clearedReferenceCount = 0
  const nextChapters = source.map((chapter) => {
    if (!Array.isArray(chapter?.sceneAnchors)) return chapter
    let changed = false
    const sceneAnchors = chapter.sceneAnchors.map((anchor) => {
      if (!anchor?.unitId) return anchor
      const hadWorldbookReference = Boolean(
        String(anchor.worldbookId || '').trim()
        || String(anchor.locationId || '').trim()
        || String(anchor.viewpointCharacterId || '').trim()
        || (Array.isArray(anchor.presentCharacterIds) && anchor.presentCharacterIds.length)
      )
      if (!hadWorldbookReference) return anchor
      changed = true
      clearedReferenceCount += 1
      return {
        ...anchor,
        worldbookId: '',
        presentCharacterIds: [],
        locationId: '',
        viewpointCharacterId: ''
      }
    })
    return changed ? { ...chapter, sceneAnchors } : chapter
  })
  return { chapters: clearedReferenceCount ? nextChapters : source, clearedReferenceCount }
}

// 绑定世界书的时序安全同步（复验修复 2）：
// - 激活新书的第一步就同步清空旧绑定（异步窗口内生成链读到 null，而不是上一书）；
// - 竞态令牌保证慢返回不覆盖更新的选择；
// - syncing 暴露加载窗口，供回合提交门禁在加载完成前暂停。
export function createBoundWorldbookSync({ loadWorldbookForProject }) {
  const boundWorldbook = shallowRef(null)
  const syncing = ref(false)
  let token = 0

  async function sync(book, activeBookId) {
    token += 1
    const myToken = token
    // 同步清空：从这一刻起到加载完成，旧书世界书不再可见。
    boundWorldbook.value = null
    syncing.value = true
    try {
      const id = normalizeBookWorldbookBinding(book)
      const loaded = id ? await loadWorldbookForProject(id) : null
      if (myToken !== token || String(activeBookId ?? '') !== String(book?.id ?? '')) return null
      boundWorldbook.value = loaded
      return loaded
    } finally {
      if (myToken === token) syncing.value = false
    }
  }

  // 提交门禁：加载窗口内不应发起下一拍。
  function ready() {
    return !syncing.value
  }

  return { boundWorldbook, syncing, sync, ready }
}

// 章节边界的归属（复验修复 1）：换书的边界派生必须显式携带“旧项目 ID”。
// 在 selectedBookId 被改成新书之前用旧值构造载荷；返回 null 表示无出向章节。
export function buildChapterBoundaryPayload({
  previousChapterId = '',
  previousProjectId = '',
  text = '',
  revision = ''
} = {}) {
  const chapterId = String(previousChapterId || '').trim()
  if (!chapterId) return null
  return {
    scopeKey: `chapter:${chapterId}`,
    text: String(text || ''),
    sourceRefs: [`chapter:${chapterId}`],
    revision,
    memoryProjectId: String(previousProjectId || '')
  }
}
