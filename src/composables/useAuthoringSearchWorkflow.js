import { computed, nextTick, ref, shallowRef } from 'vue'
import {
  applyAuthoringReplacePlan,
  buildAuthoringPositionIndex,
  createAuthoringReplacePlan,
  reconcileAuthoringSearchFinding,
  searchAuthoringPositionIndex
} from '../services/authoring/authoringProjectSearch.js'

const failureMessage = (reason) => ({
  'ambiguous-live-source': '同一文稿在两个窗口存在不同未保存版本，请先保存或关闭其中一个窗口。',
  'project-mismatch': '当前作品已经切换，请重新打开查找。',
  'current-chapter-missing': '当前章节已经不存在。',
  'live-source-document-invalid': '活动窗口的文稿结构尚未稳定，请稍后重试。',
  'live-source-schema-revision-mismatch': '活动窗口正在更新，请稍后重试。'
})[reason] || '无法建立当前作品的查找索引。'

// Owns the complete search/replace session. The page supplies editor and
// repository adapters; query state, source identity, navigation receipts and
// the replace transaction no longer live beside the Authoring template.
export function useAuthoringSearchWorkflow(host) {
  const openState = ref(false)
  const invocation = shallowRef(null)
  const index = shallowRef(null)
  const query = ref('')
  const scope = ref('current-chapter')
  const findings = ref([])
  const total = ref(0)
  const truncated = ref(false)
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const replacement = ref('')
  const replacePreview = shallowRef(null)
  const replaceBusy = ref(false)
  const activeFindingId = ref('')
  const hasNavigated = ref(false)
  let preparedSource = null
  let returnSurface = null
  let debounceTimer = null

  const currentChapterLabel = computed(() => {
    const chapterId = invocation.value?.chapterId || host.getSelectedChapterId()
    return host.getChapters().find((chapter) => String(chapter?.id || '') === String(chapterId || ''))?.title || '当前章'
  })
  const canReturn = computed(() => Boolean(hasNavigated.value && returnSurface))

  function freezeSource() {
    preparedSource = host.captureActiveSource() || host.captureMainSource()
    returnSurface = host.captureSurface()
  }

  function buildIndex({ live = true, book = host.getCurrentBook() } = {}) {
    const projectId = host.getSelectedBookId()
    if (!book || String(book.id || '') !== String(projectId || '')) return null
    const result = buildAuthoringPositionIndex({
      projectId,
      book,
      explorations: host.getExplorations(),
      worldbook: host.getWorldbook(),
      liveSources: live ? host.captureLiveSources() : []
    })
    if (!result?.ok) error.value = failureMessage(result?.reason)
    return result
  }

  function run(payload = {}) {
    const nextQuery = String(payload.query ?? query.value).trim()
    const nextScope = String(payload.scope || scope.value)
    if (!nextQuery) {
      findings.value = []
      total.value = 0
      truncated.value = false
      error.value = ''
      return false
    }
    busy.value = true
    error.value = ''
    notice.value = ''
    replacePreview.value = null
    try {
      const nextIndex = buildIndex()
      if (!nextIndex?.ok) return false
      const currentChapterId = invocation.value?.documentRole === 'manuscript'
        ? invocation.value.chapterId
        : host.getSelectedChapterId()
      const result = searchAuthoringPositionIndex(nextIndex, {
        query: nextQuery,
        scope: nextScope,
        currentChapterId,
        limit: 500
      })
      if (!result.ok) {
        error.value = failureMessage(result.reason)
        return false
      }
      index.value = nextIndex
      query.value = nextQuery
      scope.value = nextScope
      findings.value = [...result.findings]
      total.value = result.total
      truncated.value = result.truncated
      activeFindingId.value = ''
      return true
    } finally {
      busy.value = false
    }
  }

  function open() {
    const projectId = host.getSelectedBookId()
    if (!projectId) {
      host.notify('请先打开一本书稿')
      return false
    }
    const dualSource = host.getDualSource()
    const source = preparedSource || host.captureActiveSource() || host.captureMainSource()
    preparedSource = null
    host.beforeOpen()
    if (!returnSurface) returnSurface = host.captureSurface()
    invocation.value = source || {
      pane: 'main',
      projectId,
      documentRole: 'manuscript',
      documentId: host.getSelectedChapterId(),
      chapterId: host.getSelectedChapterId(),
      title: host.getCurrentChapterTitle()
    }
    if (dualSource?.kind === 'worldbook-entry') scope.value = 'worldbook'
    else if (dualSource?.kind === 'exploration' || source?.documentRole === 'exploration') scope.value = 'exploration'
    else scope.value = 'current-chapter'
    hasNavigated.value = false
    activeFindingId.value = ''
    error.value = ''
    notice.value = ''
    replacePreview.value = null
    openState.value = true
    if (query.value.trim()) nextTick(run)
    else index.value = buildIndex()
    return true
  }

  function updateQuery(value) {
    query.value = String(value || '')
    replacePreview.value = null
    error.value = ''
    if (debounceTimer) clearTimeout(debounceTimer)
    if (!query.value.trim()) {
      findings.value = []
      total.value = 0
      truncated.value = false
      return
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (openState.value) run()
    }, 220)
  }

  function updateScope(value) {
    scope.value = String(value || 'current-chapter')
    replacePreview.value = null
  }

  function updateReplacement(value) {
    replacement.value = String(value ?? '')
    replacePreview.value = null
  }

  async function openFinding(finding) {
    const freshIndex = buildIndex()
    if (!freshIndex?.ok) return false
    const freshness = reconcileAuthoringSearchFinding(freshIndex, finding)
    if (!freshness.fresh) {
      findings.value = findings.value.map((item) => (
        item.id === finding.id ? { ...item, status: freshness.reason === 'source-missing' ? 'detached' : 'stale' } : item
      ))
      notice.value = '这个结果对应的来源已经变化，请重新查找。'
      return false
    }
    activeFindingId.value = finding.id
    hasNavigated.value = true
    if (finding.target?.sourceKind === 'worldbook-entry') {
      host.openWorldbookEntry(finding.target.entryId)
      return true
    }
    return host.selectTarget(finding)
  }

  async function returnToOrigin() {
    if (!returnSurface) return false
    const restored = await host.restoreSurface(returnSurface)
    if (restored) {
      hasNavigated.value = false
      activeFindingId.value = ''
    }
    return restored
  }

  function close({ restore = true } = {}) {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = null
    const shouldRestore = restore && !hasNavigated.value
    const surface = returnSurface
    const navigatedToEditor = hasNavigated.value && surface && surface.pane !== 'dual'
    openState.value = false
    replacePreview.value = null
    preparedSource = null
    returnSurface = null
    if (navigatedToEditor) nextTick(host.restoreSelectionActions)
    if (shouldRestore && surface) nextTick(() => host.restoreSurface(surface))
  }

  function prepareReplacePlan({ findings: selectedFindings = null, scope: selectedScope = scope.value, expectedTotal = null } = {}) {
    if (!host.persistEditorsBeforeReplace(setError)) return null
    const nextIndex = buildIndex({ live: false })
    if (!nextIndex?.ok) return null
    const result = createAuthoringReplacePlan({
      index: nextIndex,
      query: query.value,
      replacement: replacement.value,
      scope: selectedScope,
      currentChapterId: invocation.value?.chapterId || host.getSelectedChapterId(),
      findings: selectedFindings,
      expectedTotal
    })
    if (!result.ok) {
      error.value = result.reason === 'replace-no-change'
        ? '替换文字与原文相同。'
        : result.reason.includes('stale')
          ? '正文已经变化，请重新查找后再替换。'
          : '无法建立完整替换预览，正文没有变化。'
      return null
    }
    index.value = nextIndex
    return result.plan
  }

  function setError(message) { error.value = String(message || '') }

  function commitReplacePlan(plan) {
    if (!plan || replaceBusy.value || !host.persistEditorsBeforeReplace(setError)) return false
    replaceBusy.value = true
    error.value = ''
    try {
      const latestBooks = host.loadBooks()
      const latestBook = latestBooks.find((book) => String(book?.id || '') === String(plan.projectId || ''))
      if (!latestBook) { error.value = '当前作品已经不存在，替换没有执行。'; return false }
      const latestIndex = buildAuthoringPositionIndex({ projectId: plan.projectId, book: latestBook })
      const applied = applyAuthoringReplacePlan({ book: latestBook, index: latestIndex, plan })
      if (!applied.ok) {
        error.value = '预览后正文又有变化，全部章节均未替换。'
        replacePreview.value = null
        return false
      }
      if (!host.createProtectionSnapshots(plan, latestBook, latestIndex)) {
        error.value = '无法保存替换前版本，全部章节均未替换。'
        return false
      }
      const nextBooks = latestBooks.map((book) => String(book.id) === String(plan.projectId) ? applied.nextBook : book)
      if (!host.saveBooks(nextBooks)) { error.value = '作品保存失败，全部章节均未替换。'; return false }
      host.afterReplace({ plan, applied, latestBook, nextBooks })
      replacePreview.value = null
      returnSurface = null
      hasNavigated.value = false
      activeFindingId.value = ''
      run()
      notice.value = `已替换 ${applied.receipt.chapterCount} 章 ${applied.receipt.matchCount} 处；每章均保留替换前版本。`
      return true
    } finally {
      replaceBusy.value = false
    }
  }

  function replaceOne({ finding, replacement: text } = {}) {
    if (!finding) return false
    replacement.value = String(text ?? replacement.value)
    const plan = prepareReplacePlan({ findings: [finding], scope: scope.value })
    return plan ? commitReplacePlan(plan) : false
  }
  function replaceAll(payload = {}) {
    replacement.value = String(payload.replacement ?? replacement.value)
    const plan = prepareReplacePlan({ scope: payload.scope || scope.value, expectedTotal: payload.expectedTotal ?? total.value })
    return plan ? commitReplacePlan(plan) : false
  }
  function previewReplaceAll(payload = {}) {
    replacement.value = String(payload.replacement ?? replacement.value)
    const plan = prepareReplacePlan({ scope: 'manuscript', expectedTotal: payload.expectedTotal ?? total.value })
    if (!plan) return false
    replacePreview.value = plan
    notice.value = `请确认：将修改 ${plan.chapterCount} 章 ${plan.matchCount} 处。`
    return true
  }
  function confirmReplaceAll(preview) {
    const plan = replacePreview.value
    return Boolean(plan && String(preview?.id || '') === String(plan.id || '') && commitReplacePlan(plan))
  }
  function cancelReplacePreview() { replacePreview.value = null; notice.value = '' }

  return {
    open: openState, invocation, index, query, scope, findings, total, truncated, busy, error, notice,
    replacement, replacePreview, replaceBusy, activeFindingId, currentChapterLabel, canReturn,
    freezeSource, buildIndex, show: open, close, run, updateQuery, updateScope, updateReplacement, openFinding,
    returnToOrigin, replaceOne, replaceAll, previewReplaceAll, confirmReplaceAll, cancelReplacePreview
  }
}
