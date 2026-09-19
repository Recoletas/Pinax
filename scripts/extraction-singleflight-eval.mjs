/* eslint-disable no-console */
import { chromium } from 'playwright'

// G0（2026-09-18 夜间 A 线）：提取队列 drain 的单飞守卫验证。
// 守卫检查发生在任何 await 之前（同步），因此同一 tick 内并发发起的两个
// drain 确定性地只放行一个，另一个返回 typed skipped。脚本在真实浏览器
// 配置里加载真实模块验证；空队列，不触发任何模型调用。
const BASE_URL = process.env.PINAX_EXTRACTION_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const consoleErrors = []
  page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const result = await page.evaluate(async () => {
    const R = await import('/src/services/memory/extraction/extractionRunner.js')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const isSkip = r => r?.results?.length === 1 && r.results[0]?.skipped === 'drain-in-flight'

    // 空队列基线：单个 drain 持有守卫并正常完成（无任务、无结果）。
    const lone = await R.drainExtractionQueue({ max: 1, auto: false })
    check(Array.isArray(lone?.results) && lone.results.length === 0, '空队列单次 drain 应返回空结果而不是 skipped')

    // 同 tick 并发对：守卫检查先于 await，恰好一个 skip、一个放行。
    const pair = await Promise.all([
      R.drainExtractionQueue({ auto: false }),
      R.drainExtractionQueue({ auto: true })
    ])
    const skipped = pair.filter(isSkip)
    check(skipped.length === 1, `并发对里应恰好一个 skipped，实际 ${skipped.length}`)
    check(pair.filter(r => !isSkip(r)).length === 1, '并发对里应恰好一个真正执行')

    // 并发对结束后守卫必须释放：后续 drain 再次正常执行（无粘滞 skip）。
    const after = await R.drainExtractionQueue({ auto: false })
    check(!isSkip(after), 'drain 结束后守卫应已释放')
    check(Array.isArray(after.results) && after.results.length === 0, '释放后的空队列 drain 应返回空结果')

    return { pairSkipped: skipped.length, loneInterrupted: lone.interrupted }
  })
  console.log('[extraction-singleflight-eval] ok:', JSON.stringify(result))
  if (consoleErrors.length) {
    console.error('[extraction-singleflight-eval] page errors:', consoleErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
