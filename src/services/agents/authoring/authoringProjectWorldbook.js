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
      if (!anchorWorldbookId) continue
      if (nextId && anchorWorldbookId !== nextId) affectedAnchorCount += 1
      if (!nextId) affectedAnchorCount += 1
    }
  }
  return { affectedAnchorCount, requiresConfirmation: affectedAnchorCount > 0 }
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
