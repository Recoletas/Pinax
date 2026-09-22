// Real settings pages, synthetic books, isolated storage; no live model calls.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.BASE || 'http://127.0.0.1:5320'
const out = '/tmp/pinax-english-settings'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const errors = []
const missing = new Set()
const checks = []
let page
try {
  page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', msg => { if (msg.text().startsWith('[i18n]')) missing.add(msg.text()) })
  await page.route('**/*', route => {
    const url = route.request().url()
    if (/^https?:/.test(url) && !url.startsWith(base)) return route.abort()
    if (url.includes('/api/advisor')) return route.fulfill({ status: 503, json: { error: 'Model disabled in UI test' } })
    return route.continue()
  })
  await page.addInitScript(() => {
    if (localStorage.getItem('english-settings-seeded')) return
    localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'en', assistantLanguage: '' }))
    localStorage.setItem('app_ui_zoom', '1')
    localStorage.setItem('writing_books', JSON.stringify([
      { id: 'en-settings-book', title: 'The Harbor · North', worldbookId: 'en-settings-world', manuscriptLanguage: 'en', chapters: [{ id: 'en-chapter', title: 'The crossing', content: 'Mae watched the last boat leave. The harbor closed at dusk.' }] },
      { id: 'en-empty-book', title: 'Another book', chapters: [] }
    ]))
    localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'en-settings-world', name: 'Harbor notes', entryCount: 1 }]))
    localStorage.setItem('worldbook_en-settings-world', JSON.stringify({
      id: 'en-settings-world', name: 'Harbor notes',
      entries: [{ id: 'en-location', name: 'North lighthouse', type: 'location', content: 'A lighthouse above the harbor. Its keeper lights the lamp at dusk.', keys: ['lighthouse'], injection: { mode: 'selective', group: 'Harbor' }, metadata: {} }],
      sourceDocuments: [{ id: 'en-source', title: 'Harbor archive', kind: 'pasted-text', content: 'The port closes at dusk. Only the keeper holds the gate key.', contentPreview: 'The port closes at dusk. Only the keeper holds the gate key.' }]
    }))
    localStorage.setItem('english-settings-seeded', '1')
  })
  const locale = async value => {
    await page.locator('.shell-tab-actions button').nth(1).click()
    await page.locator('[data-test=settings-tab-appearance]').click()
    await page.locator('[data-test=ui-language]').selectOption(value)
    await page.keyboard.press('Escape')
    await page.locator('.settings-modal').waitFor({ state: 'hidden' })
  }
  const noChinese = async locator => {
    assert(!/\p{Script=Han}/u.test(await locator.innerText()), `Untranslated UI: ${(await locator.innerText()).slice(0, 2200)}`)
    const labels = await locator.locator('[aria-label], [title], [placeholder]').evaluateAll(nodes => nodes.flatMap(n => ['aria-label', 'title', 'placeholder'].map(k => n.getAttribute(k) || '')))
    for (const label of labels) assert(!/\p{Script=Han}/u.test(label), `Untranslated label: ${label}`)
  }
  const navigate = path => page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  await navigate('/')
  assert.equal(await page.locator('.library-kicker').count(), 0)
  assert.equal(await page.locator('.library-heading p').count(), 0)
  await noChinese(page.locator('.library-main'))
  await page.screenshot({ path: `${out}/library-en.png` })

  await navigate('/settings/structured?bookId=en-settings-book')
  await page.locator('#setting-field-world-origin').waitFor()
  await noChinese(page.locator('.settings-workspace-header'))
  assert.equal(await page.locator('.ws-tab.is-active').getAttribute('title'), 'Story Bible · The Harbor · North')
  await noChinese(page.locator('.ws-tabs'))
  for (let i = 0; i < 4; i++) {
    await page.locator('.section-tabs button').nth(i).click()
    await noChinese(page.locator('.structured-settings-panel'))
  }
  await page.locator('.section-tabs button').first().click()
  await page.locator('#setting-field-world-origin').fill('The harbor was built after a storm. 原文保留。')
  await page.locator('#setting-field-world-origin').blur()
  await page.waitForFunction(() => localStorage.getItem('worldbook_en-settings-world')?.includes('原文保留'))
  const stored = await page.evaluate(() => localStorage.getItem('worldbook_en-settings-world'))
  await locale('zh-CN')
  assert.equal(await page.locator('.context-project-name').innerText(), 'The Harbor · North')
  assert.equal(await page.locator('.ws-tab.is-active').getAttribute('title'), '设定 · The Harbor · North')
  await locale('en')
  assert.equal(await page.locator('#setting-field-world-origin').inputValue(), 'The harbor was built after a storm. 原文保留。')
  assert.equal(await page.evaluate(() => localStorage.getItem('worldbook_en-settings-world')), stored)
  await page.screenshot({ path: `${out}/structured-en.png` })
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('#setting-field-world-origin').inputValue(), 'The harbor was built after a storm. 原文保留。')
  checks.push('Four sections translated; title with separator preserved; edited source survives locale switch and reload')

  await page.locator('[data-test=settings-section-tab-sources]').click()
  await page.locator('.sources-panel__title').first().waitFor()
  await noChinese(page.locator('[data-test=settings-sources]'))
  await page.locator('.sources-panel__title').first().click()
  await page.locator('.sources-panel__preview pre').waitFor()
  assert.match(await page.locator('.sources-panel__preview pre').innerText(), /Only the keeper/)
  await noChinese(page.locator('[data-test=settings-sources]'))
  await page.screenshot({ path: `${out}/sources-en.png` })
  await page.locator('[data-test=sources-add]').click()
  await page.waitForURL(/action=add/)
  await page.locator('input[type=file]').first().waitFor({ state: 'attached' })
  await page.getByLabel('Import reference files', { exact: true }).setInputFiles({ name: 'Tide log.txt', mimeType: 'text/plain', buffer: Buffer.from('The tide rose at dawn. Boats returned through the north channel.') })
  await page.locator('.source-row .source-status.is-ready').first().waitFor()
  await noChinese(page.locator('.creation-page'))
  await page.screenshot({ path: `${out}/source-import-en.png` })
  await page.locator('[data-test=append-sources-confirm]').click()
  await page.waitForURL(/settings\/sources\?bookId=en-settings-book$/)
  await page.locator('.sources-panel__title').filter({ hasText: 'Tide log' }).waitFor()
  checks.push('Sources list, archive preview, real TXT upload and durable append work in English')

  await page.locator('[data-test=settings-section-tab-advanced]').click()
  await page.locator('.entry-item').first().waitFor()
  await noChinese(page.locator('.settings-workspace-header'))
  // Author text is deliberately bilingual; only chrome is subject to translation.
  await noChinese(page.locator('.editor-tabs'))
  const entryTools = page.locator('.entry-tools').first()
  await noChinese(entryTools.locator('select').nth(0))
  await noChinese(entryTools.locator('select').nth(1))
  for (const button of await entryTools.locator('button').all()) await noChinese(button)
  await page.screenshot({ path: `${out}/entries-en.png` })
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(150)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflow: ${width}`)
    assert(await page.locator('.editor-tabs').evaluate(el => el.clientHeight >= el.querySelector('button').offsetHeight - 1), `Entry navigation clipped: ${width}`)
    await page.screenshot({ path: `${out}/entries-${width}-en.png` })
  }
  checks.push('Entries and shared header at 1440/900/390 without document overflow')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.shell-tab-actions button').first().click()
  await page.locator('.editor-tabs').scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}/entries-dark-en.png` })
  await page.locator('[data-test=settings-return-authoring]').click()
  await page.locator('.ProseMirror').first().waitFor()
  await page.locator('[data-authoring-tool=worldbook]').click()
  const inspector = page.locator('.authoring-setting-workbench')
  await inspector.waitFor()
  await noChinese(inspector.locator('.setting-directory'))
  await page.screenshot({ path: `${out}/inspector-en.png` })
  checks.push('Return to same book and open localized story bible inspector')
  assert.deepEqual(errors, [])
  assert.deepEqual([...missing], [])
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, missing: [...missing] }, null, 2))
  console.log(JSON.stringify({ ok: true, checks }))
} catch (error) {
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  console.error(JSON.stringify({ error: error.stack, errors, missing: [...missing] }))
  process.exitCode = 1
} finally {
  await browser.close()
}
