import { nextTick } from 'vue'
import { tr } from '../i18n/index.js'

/**
 * 导入弹窗的状态与两个出口。
 *
 * - 建书（既有行为）：确认后新建一本书并绑定到当前浏览器存储。
 * - 建章节（正文新建 → 导入章节…）：确认后把选中的作品/文件变成当前作品的新章节。
 *
 * 两条出口共用同一个导入弹窗与同一套选文件/拆章逻辑，区别只在「落到哪里」。
 * 章节的创建与保存走 Core（章节规则不在页面里复制），失败一律类型化告知，不假装成功。
 */
export function useManuscriptImport({
  show,
  target,
  returnFocus,
  books,
  chapters,
  chapterCore,
  currentBook,
  bookId,
  author,
  route,
  router,
  selectBook,
  selectChapter,
  saveBooks,
  blocked = () => false
} = {}) {
  const notify = (message) => author?.notify?.(message)
  // 弹窗状态由页面持有（页面里更早的位置就要读它），这里只管两个出口的流程。

  function rememberFocus() {
    if (show.value) return
    returnFocus.value = typeof document !== 'undefined' ? document.activeElement : null
  }

  function openBook({ clearRouteIntent = false } = {}) {
    rememberFocus()
    target.value = 'book'
    show.value = true
    if (!clearRouteIntent || String(route?.query?.start || '') !== 'import') return
    const query = { ...route.query }
    delete query.start
    void router?.replace({ name: 'authoring', query })
  }

  /** 正文新建 → 导入作品/文件。 */
  function openChapters() {
    if (!bookId?.value || blocked()) {
      notify(tr('请先选中一本书，并处理当前文稿'))
      return false
    }
    rememberFocus()
    target.value = 'chapters'
    show.value = true
    return true
  }

  function close() {
    show.value = false
    const back = returnFocus.value
    returnFocus.value = null
    nextTick(() => {
      if (back?.isConnected) back.focus()
    })
  }

  function confirmBook(book, respond = null) {
    if (!book?.id || !Array.isArray(book.chapters) || !book.chapters.length) {
      notify(tr('书稿结构无效，未执行导入'))
      respond?.(false)
      return false
    }
    const previousBooks = books.value
    books.value = [...books.value, book]
    if (!saveBooks()) {
      books.value = previousBooks
      notify(tr('导入未能保存，请检查浏览器存储空间'))
      respond?.(false)
      return false
    }
    show.value = false
    returnFocus.value = null
    selectBook?.(book.id)
    notify(tr('已导入《{value0}》· {value1} 章', { value0: book.title, value1: book.chapters.length }))
    respond?.(true)
    return true
  }

  /**
   * 导入章节：把选中的作品/文件变成当前作品的新章节，不覆盖已有章节。
   * 建章与写正文都走 Core；任一章落盘失败就停下并如实报「没导入成功」。
   */
  async function confirmChapters(chaptersToImport, respond = null) {
    const id = String(bookId?.value || '')
    if (!id || !Array.isArray(chaptersToImport) || !chaptersToImport.length) {
      notify(tr('没有可导入的章节'))
      respond?.(false)
      return false
    }
    const created = []
    let cleanupFailed = false
    for (const chapter of chaptersToImport) {
      const result = await chapterCore.createChapter(id)
      if (!result.ok) break
      const target = chapters.value.find((item) => String(item?.id) === String(result.value?.id))
      if (!target) break
      const saved = chapterCore.saveChapter({
        bookId: id,
        chapter: { ...target, title: String(chapter?.title || '').trim(), content: String(chapter?.content || '') },
        expectedRevision: chapterCore.revisionOf(target)
      })
      if (!saved) {
        // create 已落盘；只移除本轮刚建、尚未写入正文的空章。
        cleanupFailed = !chapterCore.removeChapter({
          bookId: id, chapterId: target.id, expectedRevision: chapterCore.revisionOf(target)
        })
        break
      }
      created.push(result.value.id)
    }
    if (!created.length) {
      notify(tr('导入未能保存，请检查浏览器存储空间'))
      if (cleanupFailed) notify(tr('未能清理导入失败的空章节，请在目录中检查'))
      respond?.(false)
      return false
    }
    show.value = false
    returnFocus.value = null
    selectChapter?.(created[0])
    if (created.length < chaptersToImport.length) {
      notify(tr('仅导入 {value0}/{value1} 章，其余未导入，请检查存储空间', { value0: created.length, value1: chaptersToImport.length }))
    } else {
      notify(tr('已导入 {value0} 章到《{value1}》', { value0: created.length, value1: currentBook?.value?.title || '' }))
    }
    if (cleanupFailed) notify(tr('未能清理导入失败的空章节，请在目录中检查'))
    respond?.(true)
    return true
  }

  return { openBook, openChapters, close, confirmBook, confirmChapters }
}
