const MAX_TEST_FILES = 20
const MAX_TEST_CASES = 200

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
