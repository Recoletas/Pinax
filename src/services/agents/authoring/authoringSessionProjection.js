import { appendExperienceTurnToChapter } from '../../writing/writingExperienceImport.js'
import { normalizeBookWorldbookBinding } from './authoringProjectWorldbook.js'
import { normalizeSceneAnchor, normalizeSceneAnchors } from './authoringSceneAnchors.js'

// 把旧体验会话的历史成功回合幂等投影为可编辑 writingUnit。
// 只导入已提交的助手正文；不导入用户指令、不创建场景分支、不生成平行文档。
//
// worldbook scene closure Task 7：导入输出扩展——
// - 目标书未绑定世界书且调用方显式确认时，把会话世界书写为 book.worldbookId；
// - 未确认时返回 bindingProposal，绝不隐式改绑定；
// - 确认后为第一个导入单元创建一个 source:'legacy-import' 的场景锚点，
//   锚点只携带 legacySceneSnapshot 归一化后的稳定 ID（人物/地点/视角/时间标签），
//   不复制聊天历史、模型 transcript 或任意运行时正文。
export function projectExperienceSession({
  session,
  books,
  bookId,
  chapterId,
  worldbookId,
  confirmWorldbookBinding = false,
  legacySceneSnapshot = null
} = {}) {
  let nextBooks = books
  let importedCount = 0
  const skipped = []
  let firstImportedUnitId = ''

  for (const turn of session.turns || []) {
    const message = (session.messages || []).find((item) => turn.assistantMessageIds?.includes(String(item.id)))
    const result = appendExperienceTurnToChapter({
      books: nextBooks,
      bookId,
      chapterId,
      sessionId: session.id,
      branchId: session.branchId || 'main',
      worldbookId,
      turn,
      message,
      messages: session.messages,
      activeTurnIds: session.activeTurnIds
    })
    if (result.ok) {
      nextBooks = result.books
      importedCount += 1
      if (!firstImportedUnitId) firstImportedUnitId = String(result.unitId || '')
    } else {
      skipped.push({ turnId: turn.id, reason: result.reason })
    }
  }

  // —— 绑定与锚点（Task 7）——
  let bindingApplied = false
  let bindingProposal = null
  const sessionWorldbookId = String(session?.worldbookId || worldbookId || '').trim()
  const targetBook = (Array.isArray(nextBooks) ? nextBooks : [])
    .find((item) => String(item?.id) === String(bookId || ''))
  const currentBinding = normalizeBookWorldbookBinding(targetBook)

  if (sessionWorldbookId && targetBook && !currentBinding) {
    if (confirmWorldbookBinding === true) {
      // appendExperienceTurnToChapter 每回合深克隆；无导入时这里也克隆一次，
      // 保证绝不原地修改调用方的 books 输入。
      if (nextBooks === books) {
        nextBooks = JSON.parse(JSON.stringify(books))
      }
      const clonedBook = nextBooks.find((item) => String(item?.id) === String(bookId || ''))
      clonedBook.worldbookId = sessionWorldbookId
      bindingApplied = true
    } else {
      bindingProposal = { worldbookId: sessionWorldbookId }
    }
  }

  let sceneAnchorCreated = false
  if (bindingApplied && firstImportedUnitId) {
    const boundBook = nextBooks.find((item) => String(item?.id) === String(bookId || ''))
    const targetChapter = boundBook?.chapters?.find((item) => String(item?.id) === String(chapterId || ''))
    if (targetChapter) {
      const snapshot = legacySceneSnapshot && typeof legacySceneSnapshot === 'object' ? legacySceneSnapshot : {}
      const anchor = normalizeSceneAnchor({
        unitId: firstImportedUnitId,
        worldbookId: sessionWorldbookId,
        castMode: snapshot.presentCharacterIds?.length ? 'manual' : 'manual',
        presentCharacterIds: snapshot.presentCharacterIds || [],
        locationId: snapshot.locationId || '',
        viewpointCharacterId: snapshot.viewpointCharacterId || '',
        time: {
          label: snapshot.time?.label || '',
          period: snapshot.time?.period || ''
        },
        source: 'legacy-import'
      })
      targetChapter.sceneAnchors = normalizeSceneAnchors([
        ...(Array.isArray(targetChapter.sceneAnchors) ? targetChapter.sceneAnchors : []),
        anchor
      ])
      sceneAnchorCreated = true
    }
  }

  return {
    books: nextBooks,
    importedCount,
    skipped,
    unitId: firstImportedUnitId || null,
    book: targetBook || null,
    chapter: targetBook?.chapters?.find((item) => String(item?.id) === String(chapterId || '')) || null,
    bindingApplied,
    bindingProposal,
    sceneAnchorCreated
  }
}
