/* eslint-disable no-console */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
import { installDeterministicProviderMock, MOCK_BLOCK_INSTRUCTION } from './provider-mock.mjs'

// Reuse the repository's synthetic authoring fixture and provider; no live model.
const BASE = process.env.BASE || 'http://127.0.0.1:5268'
const state = JSON.parse(fs.readFileSync('tmp/authoring-context-closure/fixture-state.json', 'utf8'))
const storage = JSON.parse(fs.readFileSync('tmp/authoring-context-closure/fixture-localstorage.json', 'utf8'))
const output = '/tmp/pinax-rehearsal-interaction-20260919'
fs.mkdirSync(output, { recursive: true })
const sample = Array.from({ length: 30 }, (_, index) => `第${index + 1}段：守卫循着潮声走上石阶，仔细查看门边留下的痕迹。`).join('\n\n')
const browser = await chromium.launch()
let checks = 0
function check(value, message) { assert.ok(value, message); checks += 1 }

async function liveEditor(page, operation, arg) {
  return page.locator('.writing-notebook-editor').first().evaluate((element, { operation, arg }) => {
    let instance = element.__vueParentComponent
    while (instance && !instance.exposed?.editor) instance = instance.parent
    const exposed = instance?.exposed
    const editor = exposed?.editor?.value || exposed?.editor
    if (!editor) throw new Error('Notebook editor unavailable')
    if (operation === 'select') {
      const nodes = []
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock) nodes.push({ nodeId: node.attrs.nodeId, pos: pos + 1 })
      })
      const target = nodes[arg]
      editor.commands.setTextSelection(target.pos)
      editor.commands.focus(undefined, { scrollIntoView: false })
      return target.nodeId
    }
    if (operation === 'empty') {
      editor.commands.setTextSelection(editor.state.doc.content.size - 2)
      editor.commands.focus(undefined, { scrollIntoView: false })
      editor.commands.splitBlock()
      editor.commands.insertContent('　 ')
    }
    if (operation === 'target') {
      let owner = instance
      while (owner && !owner.setupState?.blockComposer) owner = owner.parent
      return JSON.parse(JSON.stringify(owner.setupState.blockComposer.target))
    }
  }, { operation, arg })
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript((snapshot) => {
      if (localStorage.getItem('interaction-fixture-seeded')) return
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('interaction-fixture-seeded', '1')
    }, storage)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const provider = await installDeterministicProviderMock(page, {
      passiveInline: false, blockText: sample, narrativeDelayMs: { prose: 1800 }
    })
    await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`)
    await page.locator('.ProseMirror').first().waitFor()
    const first = await liveEditor(page, 'select', 0)
    await page.locator('.writing-unit-gap__action.is-primary').click()
    const composer = page.locator('[data-test="block-composer"]')
    await composer.waitFor({ state: 'visible' })
    check((await liveEditor(page, 'target')).nodeId === first, 'Initial target follows actual paragraph')
    await composer.getByRole('textbox', { name: '推演要求' }).fill(MOCK_BLOCK_INSTRUCTION)
    const second = await liveEditor(page, 'select', 1)
    await page.waitForTimeout(150)
    check((await liveEditor(page, 'target')).nodeId === second, 'Idle composer follows moved caret')
    check(await composer.getByRole('textbox', { name: '推演要求' }).inputValue() === MOCK_BLOCK_INSTRUCTION, 'Retarget preserves instruction')
    await composer.locator('[data-test="block-primary"]').click()
    await composer.locator('.authoring-generation-status').waitFor()
    check((await composer.locator('[role="status"]').innerText()).includes('正在生成'), 'Real in-flight status visible')
    await liveEditor(page, 'select', 0)
    check((await liveEditor(page, 'target')).nodeId === second, 'In-flight target stays frozen')
    await page.screenshot({ path: `${output}/waiting-${width}.png` })
    const draft = page.locator('[data-test="block-draft"]')
    await draft.waitFor({ state: 'visible', timeout: 30000 })
    const reading = await draft.locator('textarea').evaluate((input) => ({
      caret: input.selectionStart, scroll: input.scrollTop, overflowing: input.scrollHeight > input.clientHeight,
      top: input.getBoundingClientRect().top
    }))
    check(reading.overflowing && reading.caret === 0 && reading.scroll === 0, 'Long draft opens at beginning')
    check(reading.top >= 0 && reading.top < 900, 'Draft beginning visible without manual scroll')
    await page.screenshot({ path: `${output}/draft-${width}.png` })
    const calls = provider.summary().narrativeCount
    await draft.getByRole('button', { name: '采用编辑稿' }).click()
    await draft.waitFor({ state: 'detached', timeout: 15000 })
    check(await page.getByRole('button', { name: '再次保存', exact: true }).count() === 0, 'Successful adoption clears pending save')
    check(provider.summary().narrativeCount === calls, 'Adoption never regenerates')
    await liveEditor(page, 'select', 0)
    await page.locator('.writing-unit-gap__action.is-primary').click()
    await composer.waitFor({ state: 'visible' })
    check((await liveEditor(page, 'target')).nodeId === first, 'Next run returns to new caret, not old anchor')
    await composer.getByRole('button', { name: '收起推演' }).click()
    await liveEditor(page, 'empty')
    for (const key of ['Space', '/']) {
      await page.keyboard.press(key)
      await page.getByRole('menu', { name: '插入写作内容' }).waitFor({ state: 'visible' })
      check(true, `Whitespace-only paragraph opens command menu: ${key}`)
      await page.keyboard.press('Escape')
    }
    await page.screenshot({ path: `${output}/adopted-${width}.png` })
    check(errors.length === 0, `No uncaught browser errors: ${errors.join('; ')}`)
    await context.close()
  }
  console.log(`rehearsal-interaction: ${checks} checks passed; screenshots ${output}`)
} finally {
  await browser.close()
}
