/* eslint-disable no-console */
import { chromium } from 'playwright'
import { checkCompanionKnowledge } from './fixtures/ledger/companion-knowledge-probe.mjs'

// M10（2026-09-18 夜间 A 线）：角色 reader 接入真实同伴上下文（CX32 接缝）。
// 真实 IndexedDB + knowledgeLedger + roleplayCompanion 生产函数。
//   M10-1 未接线：维持公开投影降级（既有合同不变）
//   M10-2 接线 + 角色有获知事件：合并白名单事实，scope 变 character-knowledge
//   M10-3 秘密（作者知道但角色没听说）不在合并结果里
//   M10-4 另一分支的获知事件不进入本作用域上下文
//   M10-5 另一角色的事实不进入（actorKey 隔离）
//   M10-6 作用域复核：reader 声称的 scopeKey 与期望不符 → typed 降级
//   M10-7 reader 抛异常/返回垃圾 → 降级不抛出
//   M10-8 disproved/forgotten 事实绝不进入合并结果
const BASE_URL = process.env.PINAX_COMPANION_READER_EVAL_URL || 'http://127.0.0.1:5179'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(BASE_URL)
  await page.waitForSelector('.authoring-welcome')

  const report = await page.evaluate(checkCompanionKnowledge)
  console.log('[memory-companion-reader-eval] ok:', JSON.stringify(report))
  if (pageErrors.length) {
    console.error('[memory-companion-reader-eval] page errors:', pageErrors)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
