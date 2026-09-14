/* U45–U47 IF browser journey: verify characterIf contract helpers work in
 * the real browser runtime by dynamic-importing the production modules.
 * This proves the IF contract layer is properly integrated into the build
 * pipeline and functional in the browser environment.
 *
 * Full UI click-through journey (select direction → expand IF → fill belief
 * → start → A/B display → select branch → write prose → source modify →
 * stale) requires the complete scene fixture + direction planning mock,
 * which is a follow-up scripting target.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5198'
const state = JSON.parse(fs.readFileSync('tmp/authoring-rollout/fixture-state.json', 'utf8'))
const baseStorage = JSON.parse(fs.readFileSync('tmp/authoring-rollout/fixture-localstorage.json', 'utf8'))

const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 200) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript((snapshot) => {
  localStorage.clear()
  for (const [k, v] of Object.entries(snapshot)) localStorage.setItem(k, v)
  localStorage.setItem('app_ui_zoom', '1')
}, baseStorage)
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)))

try {
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })

  // 1) characterIf contract browser import + functionality
  const ifChecks = await page.evaluate(async () => {
    const mod = await import('/src/services/project/characterIf/contract.js')
    const { createIfExperiment, validateIfSemanticIdentity, advanceIfBranchGeneration, staleIfExperiment } = mod

    // 基本创建
    const exp = createIfExperiment({
      experimentId: 'browser-if-test', projectId: 'test-book',
      targetRef: { chapterId: 'ch1' },
      baselineFacts: [{ ref: 'f1', text: '钥匙由艾德加保管。' }],
      sourceRevisions: { chapter: 'r1' },
      actorRef: 'char:edgar', beliefA: '忠于城主', beliefB: '暗中背叛',
      modelConfig: { model: 'test' }
    })
    if (!exp.ok) return { step: 'create', ok: false }

    // A/B 仅 belief 不同
    const identity = validateIfSemanticIdentity(exp.experiment)
    if (!identity.ok) return { step: 'identity', ok: false }

    // 代次推进
    const adv = advanceIfBranchGeneration(exp.experiment, 'B', '背叛且已离城')
    if (!adv.ok) return { step: 'advance', ok: false }
    if (adv.experiment.branches.B.generation !== 2) return { step: 'generation', ok: false }
    if (adv.experiment.branches.A.generation !== 1) return { step: 'A-gen', ok: false }

    // 双支 stale
    const staled = staleIfExperiment(exp.experiment, 'test-stale')
    if (staled.branches.A.lifecycle !== 'stale' || staled.branches.B.lifecycle !== 'stale') {
      return { step: 'stale', ok: false }
    }

    return { ok: true, create: true, identity: true, advance: true, stale: true }
  })

  check('IF 合同浏览器创建 Experiment', ifChecks.ok === true, JSON.stringify(ifChecks))
  check('IF A/B 仅 belief 语义不同', ifChecks.identity === true)
  check('IF B 代次推进 A 不变', ifChecks.advance === true)
  check('IF 双支 stale 正确', ifChecks.stale === true)

  // 2) knowledgeReadModel 合同也可用
  const krm = await page.evaluate(async () => {
    const mod = await import('/src/services/project/knowledgeReadModel/index.js')
    return {
      hasQuery: typeof mod.queryKnowledge === 'function',
      hasFreeze: typeof mod.freezeKnowledgeSnapshot === 'function',
      schemaVersion: mod.KNOWLEDGE_READ_MODEL_SCHEMA_VERSION
    }
  })
  check('knowledgeReadModel 模块浏览器可用', krm.hasQuery === true && krm.hasFreeze === true)
  check('schema version', krm.schemaVersion === 1)

  // 3) 无页面错误
  check('浏览器 IF 旅程无页面错误', errors.length === 0, errors.join('; '))

} catch (e) {
  check('IF journey 异常', false, String(e).slice(0, 200))
}

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\nIF browser journey: ${results.length - failed.length}/${results.length}`)
if (failed.length) process.exitCode = 1
