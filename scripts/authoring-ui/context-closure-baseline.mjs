/* global process */
/* eslint-disable no-console */
// C1-0：真实 Authoring 页面基线 + 交互断链探针。
// 前置：先运行 context-closure-fixture.mjs。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-context-closure')
const SHOT_DIR = path.join(OUT_DIR, 'baseline')
fs.mkdirSync(SHOT_DIR, { recursive: true })
const state = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'fixture-localstorage.json'), 'utf8'))

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await context.addInitScript((snapshot) => {
  for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
}, storage)
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.ProseMirror', { timeout: 30000 })
await page.waitForTimeout(1800)

const target = page.locator(`section[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
await target.locator('p').first().click({ position: { x: 60, y: 12 } })
await page.waitForTimeout(350)
const before = await page.evaluate(() => {
  const scroll = document.querySelector('.wall__dossier-scroll')
  const selection = getSelection()
  const selectionUnit = selection?.anchorNode?.parentElement?.closest?.('[data-unit-id]')
  return {
    scrollTop: scroll?.scrollTop || 0,
    selectionText: selection?.toString() || '',
    selectionUnitId: selectionUnit?.dataset?.unitId || '',
    anchorOffset: selection?.anchorOffset ?? null,
    focusOffset: selection?.focusOffset ?? null,
    activeTag: document.activeElement?.tagName || '',
    activeUnitId: document.activeElement?.closest?.('[data-unit-id]')?.dataset?.unitId || ''
  }
})
await page.screenshot({ path: path.join(SHOT_DIR, 'c1-0-current-page-1440.png') })

await page.locator('[data-test="scene-edit"]').click()
await page.waitForSelector('.scene-curation', { timeout: 10000 })
await page.waitForTimeout(350)
const curation = await page.evaluate(() => {
  const actions = [...document.querySelectorAll('.scene-curation__actions button')].map((button) => button.textContent.trim())
  const scroll = document.querySelector('.wall__dossier-scroll')
  const selection = getSelection()
  const selectionUnit = selection?.anchorNode?.parentElement?.closest?.('[data-unit-id]')
  const people = [...document.querySelectorAll('.scene-curation__people [role="option"]')].map((item) => ({ label: item.textContent.trim(), selected: item.getAttribute('aria-selected') }))
  const locations = [...document.querySelectorAll('.scene-curation__options [role="option"]')].map((item) => ({ label: item.textContent.trim(), selected: item.getAttribute('aria-selected') }))
  return {
    actions,
    hasThreeIntentChoices: ['纠正当前', '安排下一段', '仅供本次参考'].every((label) => document.body.innerText.includes(label)),
    hasContextPicker: Boolean(document.querySelector('.authoring-context-picker, [aria-label="本次参考选择"]')),
    hasContextPreflight: Boolean(document.querySelector('.authoring-context-summary, [aria-label="生成前上下文预检"]')),
    people,
    locations,
    scrollTop: scroll?.scrollTop || 0,
    selectionText: selection?.toString() || '',
    selectionUnitId: selectionUnit?.dataset?.unitId || '',
    anchorOffset: selection?.anchorOffset ?? null,
    focusOffset: selection?.focusOffset ?? null,
    activeTag: document.activeElement?.tagName || ''
  }
})
await page.screenshot({ path: path.join(SHOT_DIR, 'c1-0-scene-curation-1440.png') })

await page.locator('[data-authoring-tool="ai"]').click()
await page.waitForTimeout(350)
const aiPanel = await page.evaluate(() => {
  const panel = document.querySelector('[data-authoring-inspector="ai"]')
  const text = (panel?.innerText || '').slice(0, 1200)
  const authorGroups = ['当前正文', '章节上下文', '当前场', '世界设定', '作者参考', '相关记忆']
  return {
    text,
    hasReferenceSummary: Boolean(document.querySelector('.authoring-ai-reference')),
    hasAuthorReadablePreflight: Boolean(document.querySelector('.authoring-context-summary, [aria-label="生成前上下文预检"]'))
      || authorGroups.some((label) => text.includes(label)),
    hasRunReferencePicker: Boolean(document.querySelector('.authoring-context-picker, [aria-label="本次参考选择"]')),
    hasEditableLongGhost: Boolean(document.querySelector('[contenteditable="true"].authoring-block-draft__editor'))
  }
})
await page.screenshot({ path: path.join(SHOT_DIR, 'c1-0-ai-before-run-1440.png') })

const report = {
  generatedAt: new Date().toISOString(),
  baseCommit: state.baseCommit || '',
  state,
  errors,
  before,
  curation,
  aiPanel,
  breaks: [
    { id: 'B1', present: !curation.hasThreeIntentChoices, description: '现场调整只有“保存现场/保存并推演”，没有纠正当前、安排下一段、仅供本次参考三种明确语义。' },
    { id: 'B2', present: !curation.hasContextPicker, description: '当前场和推演区都没有最多三条的“本次参考”选择器。' },
    { id: 'B3', present: !curation.hasContextPreflight, description: '生成前没有作者语言的冻结上下文预检摘要。' },
    { id: 'B4', present: !aiPanel.hasAuthorReadablePreflight, description: '现有“本次参考 1 项 / 等待生成”只是旧 ledger 占位，不列名称、来源和加入原因，也不是冻结 run session 的可检查“将参考”。' },
    { id: 'B5', present: !aiPanel.hasRunReferencePicker, description: '叙事素材和探索稿已有底层 reader，但没有 run-only 显式选择入口。' },
    { id: 'B6', present: true, description: '现有上下文详情仍显示 profile、字符预算、candidateId 等开发术语，不符合作者可读预检合同。' },
    { id: 'B7', present: true, description: 'V4 已有“推演下一段”可编辑 Ghost；“重写当前 writingUnit”尚未形成同一冻结 run session 的可编辑 Ghost 路径。' },
    {
      id: 'B8',
      present: curation.scrollTop !== before.scrollTop
        || curation.selectionUnitId !== before.selectionUnitId
        || curation.anchorOffset !== before.anchorOffset
        || curation.focusOffset !== before.focusOffset,
      description: '打开当前场详情必须保持正文 scrollTop、光标和选区；本探针记录打开前后的真实位置用于后续 C1-2 Gate。'
    }
  ]
}
fs.writeFileSync(path.join(OUT_DIR, 'baseline-report.json'), JSON.stringify(report, null, 2))
console.log('[c1-baseline]', JSON.stringify(report, null, 2))
await browser.close()
if (errors.length) process.exitCode = 2
