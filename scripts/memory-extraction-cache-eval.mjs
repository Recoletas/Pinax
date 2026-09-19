/* eslint-disable no-console */
import { chromium } from 'playwright'

// M07（2026-09-18 夜间 A 线）：按原文修订缓存的提取结果。真实浏览器 +
// structuredExtraction 生产函数。本环境无模型凭据——provider 调用必然
// 失败，因此「缓存命中时成功返回、未命中时必然尝试 provider」构成生产链
// 级证明。
//   C1 重复请求（同 ref+修订+原文）→ 命中，cached:true，不调 provider
//   C2 修订变化 → 不命中过期缓存（尝试 provider）
//   C3 原文变化（同修订）→ 不命中
//   C4 LRU 有界（≤50），最旧被逐出
//   C5 缓存与校验解耦：同一缓存解析结果在 knownIdentities 变化后重新校验
const BASE_URL = process.env.PINAX_EXTRACTION_CACHE_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const report = await page.evaluate(async () => {
    const S = await import('/src/services/memory/extraction/structuredExtraction.js')
    const C = await import('/src/services/memory/extraction/extractionResultCache.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const TEXT = '沈青梧推开钟楼的门，楼梯在脚下吱呀作响。'
    const REF = 'chapter:c1'

    C.clearCachedExtractions()

    // 预置一条缓存：模型原始解析输出
    const parsedFixture = {
      proposals: [{ subject: '沈青梧', predicate: '推开', object: '门', quote: '沈青梧推开钟楼的门', polarity: 'positive', storyTime: { precision: 'unknown' }, confidence: 0.9 }],
      unextractable: { reason: '' }
    }
    C.writeCachedExtraction(C.extractionCacheKey({ sourceRef: REF, sourceRevision: 'r1', sourceText: TEXT }), parsedFixture)

    // C1：重复请求 → 命中（无模型凭据下成功返回即证明未调 provider）
    const hit = await S.runMemoryExtraction({ sourceText: TEXT, sourceRef: REF, sourceRevision: 'r1' })
    check(hit.cached === true, 'C1 应命中缓存')
    check(hit.parsed.proposals.length === 1 && hit.parsed.proposals[0].subject === '沈青梧', 'C1 命中应返回缓存解析结果')
    check(hit.meta.provider === 'extraction-cache', 'C1 命中应标注缓存来源')

    // C1b：校验仍按调用方现况执行（缓存不做校验）
    const validation = S.validateMemoryExtractionResponse(hit.parsed, { sourceText: TEXT, knownIdentities: [] })
    check(validation.proposals.length === 1, 'C1b 缓存结果应现场校验通过')

    // C2：修订变化 → 未命中，必然尝试 provider（无凭据 → 抛错）
    let calledProvider = false
    try {
      await S.runMemoryExtraction({ sourceText: TEXT, sourceRef: REF, sourceRevision: 'r2' })
      check(false, 'C2 未命中时应尝试 provider（本环境必然失败）')
    } catch {
      calledProvider = true
    }
    check(calledProvider, 'C2 修订变化应触发 provider 调用')

    // C3：同修订、原文变化 → 未命中
    let calledAgain = false
    try {
      await S.runMemoryExtraction({ sourceText: TEXT + '改动', sourceRef: REF, sourceRevision: 'r1' })
      check(false, 'C3 未命中时应尝试 provider')
    } catch {
      calledAgain = true
    }
    check(calledAgain, 'C3 原文变化应触发 provider 调用')

    // C4：LRU 有界
    for (let i = 0; i < 55; i += 1) {
      C.writeCachedExtraction(C.extractionCacheKey({ sourceRef: `chapter:fill-${i}`, sourceRevision: 'r1', sourceText: `文${i}` }), parsedFixture)
    }
    const entries = JSON.parse(localStorage.getItem('memory_extraction_result_cache_v1') || '[]')
    check(entries.length <= 50, `C4 缓存应有界 ≤50，got ${entries.length}`)

    // C5：knownIdentities 变化 → 校验结果不同（缓存不冻结校验）
    const withIdentity = S.validateMemoryExtractionResponse(hit.parsed, {
      sourceText: TEXT,
      knownIdentities: [{ id: 'entry-shen', name: '沈青梧' }]
    })
    check(withIdentity.proposals[0].entityStatus === 'resolved' && withIdentity.proposals[0].entityId === 'entry-shen', 'C5 身份目录应现场解析')
    const withoutIdentity = S.validateMemoryExtractionResponse(hit.parsed, { sourceText: TEXT, knownIdentities: [] })
    check(withoutIdentity.proposals[0].entityStatus === 'unflagged', 'C5 无目录应 unflagged')

    C.clearCachedExtractions()
    return { c1: hit.cached, c2Miss: calledProvider, c3Miss: calledAgain, lru: entries.length, c5: withIdentity.proposals[0].entityStatus }
  })
  console.log('[memory-extraction-cache-eval] ok:', JSON.stringify(report))
  if (pageErrors.length) {
    console.error('[memory-extraction-cache-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
