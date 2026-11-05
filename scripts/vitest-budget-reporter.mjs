// 旧应用基线是 20 文件 / 200 用例；共享业务内核首个纵切片新增
// packages/core/test/chapterService.test.js 与 src/services/writing/chapterCoreStore.test.js
// （2 文件 / 15 用例，含 useChapterCore 创建、保存、删除接入）。把保存语义上提成
// Core 的 applyChapterPatch 新增 packages/core/test/chapterPatch.test.js（1 文件 / 6 用例）；
// 作品(book)域切片新增 packages/core/test/bookService.test.js（1 文件 / 10 用例）；
// 世界书条目切片新增 packages/core/test/worldbookEntryService.test.js（1 文件 / 11 用例）；
// 大纲节点切片新增 packages/core/test/outlineNodeService.test.js（1 文件 / 11 用例）；
// 大纲边切片新增 packages/core/test/outlineEdgeService.test.js（1 文件 / 8 用例）；
// 大纲换父级/重排（环检测）新增 packages/core/test/outlineMove.test.js（1 文件 / 7 用例）；
// 笔记(note)域切片新增 packages/core/test/noteService.test.js（1 文件 / 11 用例）；
// 资料(material)域切片新增 packages/core/test/materialService.test.js（1 文件 / 11 用例）。
// 这里是显式抬高总预算，不是关闭或降低检查。
const MAX_TEST_FILES = 30
const MAX_TEST_CASES = 290

function countTests(tasks = []) {
  return tasks.reduce((total, task) => {
    if (task?.type === 'test') return total + 1
    return total + countTests(task?.tasks)
  }, 0)
}

export default class VitestBudgetReporter {
  onFinished(files = []) {
    const fileCount = files.length
    const testCount = files.reduce((total, file) => total + countTests(file.tasks), 0)
    const summary = `${fileCount}/${MAX_TEST_FILES} files, ${testCount}/${MAX_TEST_CASES} tests`

    if (fileCount > MAX_TEST_FILES || testCount > MAX_TEST_CASES) {
      console.error(`\n[test-budget] exceeded: ${summary}`)
      process.exitCode = 1
      return
    }

    console.log(`\n[test-budget] ok: ${summary}`)
  }
}
