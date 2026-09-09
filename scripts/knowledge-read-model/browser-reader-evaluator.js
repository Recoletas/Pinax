/**
 * K36 browser-side evaluator for the formal-reader benchmark.
 *
 * This file is NEVER executed in Node: the bench script reads its source
 * verbatim (readFileSync) and hands it to page.evaluate, so the dynamic
 * imports below execute inside the BROWSER against the app's dev server.
 * Kept as a real file (instead of an inline string) so it stays lintable.
 */
export async function browserReaderEvaluator(input) {
  const { entries, chapters, repeats, seamEnabled } = input
  const performance0 = performance.now()
  const sessionModule = await import('/src/services/agents/authoring/authoringKnowledgeQuerySession.js')
  const storageModule = await import('/src/services/storage/browserStorageRepository.js')
  const moduleLoadMs = performance.now() - performance0

  const storage = storageModule.createBrowserStorageRepository()
  const entryList = []
  for (let index = 0; index < entries; index += 1) {
    entryList.push({
      id: 'bench_entry_' + index,
      name: '合成设定' + index,
      type: index % 2 === 0 ? 'location' : 'character',
      content: '合成设定条目' + index + '：用于浏览器正式读取基准的有界正文，长度约一百字，覆盖名称与内容字段。',
      keys: ['合成' + index],
      metadata: { createdAt: 1700000000000 + index, updatedAt: 1700000100000 + index }
    })
  }
  const chapterList = []
  for (let index = 0; index < chapters; index += 1) {
    chapterList.push({
      id: 'bench_chapter_' + index,
      title: '第 ' + (index + 1) + ' 章',
      content: '## 合成章节' + index + '\n\n艾德加在旧港档案室翻找蓝铜钥匙的下落线索，记号递增 ' + index + '。'
    })
  }
  storage.setText('writing_books', JSON.stringify([{
    id: 'bench-browser-book', title: '浏览器基准书', worldbookId: 'bench-browser-worldbook',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    chapters: chapterList
  }]))
  storage.setText('worldbook_bench-browser-worldbook', JSON.stringify({
    id: 'bench-browser-worldbook', name: '基准世界', entries: entryList, updatedAt: 1700000123456
  }))
  const indexList = JSON.parse(storage.getText('worldbooks_index') || '[]')
  if (!indexList.includes('bench-browser-worldbook')) {
    indexList.push('bench-browser-worldbook')
    storage.setText('worldbooks_index', JSON.stringify(indexList))
  }

  const { createAuthoringKnowledgeQuerySession } = sessionModule
  const session = createAuthoringKnowledgeQuerySession({ maxEvidence: 12 })
  const request = {
    projectId: 'bench-browser-book', queryIntent: 'whole-book', question: '蓝铜钥匙有什么设定？'
  }
  const abortController = new AbortController()
  abortController.abort()

  const coldStart = performance.now()
  const cold = await session.prepare({ ...request, now: 1000 })
  if (!cold.ok) throw new Error('cold prepare failed: ' + (cold.reason ?? ''))
  const coldMs = performance.now() - coldStart

  const hotSamples = []
  const seamSamples = []
  let envelopeChars = 0
  for (let index = 0; index < repeats; index += 1) {
    const start = performance.now()
    const prepared = await session.prepare({ ...request, now: 2000 + index })
    if (!prepared.ok) throw new Error('hot prepare failed')
    envelopeChars = JSON.stringify(prepared.session.evidenceEnvelope).length
    hotSamples.push(performance.now() - start)
  }
  if (seamEnabled) {
    for (let index = 0; index < repeats; index += 1) {
      const start = performance.now()
      const prepared = await session.prepare({
        ...request, now: 5000 + index,
        knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:bench_entry_0'] }
      })
      if (!prepared.ok) throw new Error('seam prepare failed')
      seamSamples.push(performance.now() - start)
    }
  }
  const cancelledStart = performance.now()
  const cancelled = await session.prepare({
    ...request, now: 9000,
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:bench_entry_0'], signal: abortController.signal }
  })
  const cancelledMs = performance.now() - cancelledStart

  hotSamples.sort((a, b) => a - b)
  seamSamples.sort((a, b) => a - b)
  const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
  return {
    moduleLoadMs: Number(moduleLoadMs.toFixed(2)),
    coldMs: Number(coldMs.toFixed(2)),
    hotP50Ms: Number(percentile(hotSamples, 50).toFixed(3)),
    hotP95Ms: Number(percentile(hotSamples, 95).toFixed(3)),
    seamOnP50Ms: seamSamples.length ? Number(percentile(seamSamples, 50).toFixed(3)) : null,
    seamOnP95Ms: seamSamples.length ? Number(percentile(seamSamples, 95).toFixed(3)) : null,
    cancelledMs: Number(cancelledMs.toFixed(3)),
    cancelledTypedFailure: cancelled.ok === false,
    envelopeChars,
    repeats,
    note: 'localStorage 正式 reader 层；非 IndexedDB/SQLite 口径'
  }
}
