/* eslint-disable no-console */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const BASE = process.env.BASE || 'http://127.0.0.1:5219'
const out = '/tmp/pinax-continuation-journeys'
fs.mkdirSync(out, { recursive: true })
const snapshot = JSON.parse(fs.readFileSync('tmp/authoring-rollout/fixture-localstorage.json', 'utf8'))
const state = JSON.parse(fs.readFileSync('tmp/authoring-rollout/fixture-state.json', 'utf8'))
const browser = await chromium.launch()
let checks = 0
try {
  for (const width of [1440, 900, 390]) {
    const method = { 1440: 'motivation-causality', 900: 'setup-payoff', 390: 'pacing-redundancy' }[width]
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(({ snapshot, width }) => {
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('app_ui_zoom', '1')
      localStorage.setItem('app_theme', width === 900 ? 'dark' : 'light')
    }, { snapshot, width })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let reviewCalls = 0
    let rejectMethod = true
    await page.route('**/api/advisor/task', async (route) => {
      const payload = route.request().postDataJSON()
      const skill = payload.options?.writingSkill
      let result
      if (skill) {
        assert.equal(skill.skillId, method)
        reviewCalls += 1
        const block = payload.options.reviewBlocks[0]
        result = { task: payload.taskType, mode: 'review', findings: [{ kind: 'proofing', issueType: 'grammar', reason: '这里的动作缺少可辨认的起因，可补充具体变化。', start: { nodeId: block.nodeId, offset: 0 }, end: { nodeId: block.nodeId, offset: 6 }, exact: block.text.slice(0, 6) }] }
      } else {
        result = { task: payload.taskType, candidates: [{ text: `缓缓浮起的雾`, rationale: '明确变化' }] }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ taskType: payload.taskType, advice: '测试回应', result, meta: skill ? { writingSkill: { schemaVersion: 1, skillId: skill.skillId, skillVersion: 1, outputSchema: 'writing-skill-findings.v1', enforcement: rejectMethod ? 'validated-only' : 'applied' } } : {} }) })
    })
    await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=fogch-1`)
    const editor = page.locator('.wall__dossier .ProseMirror')
    await editor.waitFor()
    await editor.locator('p').first().click()
    const readProse = async () => (await editor.locator('p').allTextContents()).join('\n')
    const original = await readProse()
    const marker = await page.locator('.is-current-writing-unit').first().evaluate((node) => {
      const style = getComputedStyle(node, '::before')
      return { bottom: style.bottom, top: style.top, opacity: style.opacity }
    })
    assert.equal(marker.bottom, '0px'); assert.equal(marker.top, '0px'); assert.ok(Number(marker.opacity) > 0); checks += 3
    const blockMenu = page.getByRole('button', { name: '当前文本块操作' })
    await blockMenu.focus()
    const menuBounds = await blockMenu.boundingBox()
    assert.ok(menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= width); checks += 1
    assert.equal(await blockMenu.evaluate((node) => getComputedStyle(node).position), 'absolute'); checks += 1
    await blockMenu.click()
    await page.getByRole('menuitem', { name: '审阅此块', exact: true }).click()
    await page.getByRole('combobox', { name: '审稿方法' }).selectOption(method)
    await page.getByRole('textbox', { name: '审稿目标' }).fill('检查行为的起因')
    await page.getByRole('button', { name: '开始审稿', exact: true }).click()
    await page.getByRole('button', { name: '继续未完成批次' }).waitFor()
    assert.match(await page.locator('.authoring-review-panel__notice').textContent(), /尚未执行/); checks += 1
    rejectMethod = false
    await page.getByRole('button', { name: '继续未完成批次' }).click()
    await page.getByRole('button', { name: '按此意见改写' }).first().waitFor()
    assert.equal(reviewCalls, 2); checks += 1
    await page.screenshot({ path: path.join(out, `review-${width}.png`) })
    await page.getByRole('button', { name: '按此意见改写' }).first().click()
    await page.getByRole('button', { name: '采用这版' }).first().waitFor({ timeout: 15000 })
    await page.screenshot({ path: path.join(out, `rewrite-${width}.png`) })
    await page.getByRole('button', { name: '采用这版' }).first().click()
    await page.waitForTimeout(300)
    assert.match(await readProse(), /缓缓浮起的雾/); checks += 1
    await page.getByRole('button', { name: '撤销采用', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(await readProse(), original); checks += 1
    assert.deepEqual(errors, []); checks += 1
    console.log(`PASS ${width}/${method}: boundary, fail-closed method, retry, finding → rewrite → adopt → undo`)
    await context.close()
  }
} finally {
  await browser.close()
}
console.log(`${checks} assertions passed; screenshots: ${out}`)
