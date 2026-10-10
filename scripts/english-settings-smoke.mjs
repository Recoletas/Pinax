// Real settings pages, synthetic books, isolated storage; no live model calls.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const base = process.env.BASE || 'http://127.0.0.1:5320'
const out = '/tmp/pinax-english-settings'
// W6·C「本地化中心」面板整面尚无英文键（30 项，已记档待裁）。这里按该组件自身的 tr() 字面量登记这批存量缺口：
// 键补进字典后告警自然消失，任何其它新增缺键仍会红。
const LOCALIZATION_I18N_GAP = new Set([
  ...readFileSync(new URL('../src/components/settings/LocalizationCenter.vue', import.meta.url), 'utf8').matchAll(/tr\(\s*'([^']*)'/g).map((m) => m[1]),
  '本地化中心'
])
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
    // 设置按钮是 .shell-tab-actions 的最后一枚（AppShell.vue:127），按语言切换后的文案不可靠，故用位次。
    await page.locator('.shell-tab-actions > button').last().click()
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

  // W2-A-2b：旧「设定」路由重定向进知识控制台的结构化设定视图，这里沿旧链接验证落点与译文。
  await navigate('/settings/structured?bookId=en-settings-book')
  await page.locator('#setting-field-world-origin').waitFor()
  assert.match(page.url(), /\/settings\/knowledge\?.*view=settings/)
  await noChinese(page.locator('.settings-workspace-header'))
  assert.equal(await page.locator('.ws-tab.is-active').getAttribute('title'), 'Knowledge · The Harbor · North')
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
  // 20261010 同步：书名在 settings-book-switcher 的 title（data-worldbook-name 是世界书名）。
  assert.equal(await page.locator('[data-test="settings-book-switcher"]').getAttribute('title'), 'The Harbor · North')
  assert.equal(await page.locator('.ws-tab.is-active').getAttribute('title'), '知识 · The Harbor · North')
  await locale('en')
  assert.equal(await page.locator('#setting-field-world-origin').inputValue(), 'The harbor was built after a storm. 原文保留。')
  assert.equal(await page.evaluate(() => localStorage.getItem('worldbook_en-settings-world')), stored)
  await page.screenshot({ path: `${out}/structured-en.png` })
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('#setting-field-world-origin').inputValue(), 'The harbor was built after a storm. 原文保留。')
  checks.push('Four sections translated; title with separator preserved; edited source survives locale switch and reload')

  await page.locator('[data-test=settings-section-tab-sources]').click()
  await page.locator('.sources-panel__title').first().waitFor()
  // 资料面本体逐字检查；页尾「本地化中心」折叠区另计（该面板英文键仍缺，见文末 KNOWN_I18N_GAP）。
  await noChinese(page.locator('.settings-sources-body'))
  await page.locator('.sources-panel__title').first().click()
  await page.locator('.sources-panel__preview pre').waitFor()
  assert.match(await page.locator('.sources-panel__preview pre').innerText(), /Only the keeper/)
  // 资料面本体逐字检查；页尾「本地化中心」折叠区另计（该面板英文键仍缺，见文末 KNOWN_I18N_GAP）。
  await noChinese(page.locator('.settings-sources-body'))
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

  await page.locator('[data-test=settings-section-tab-knowledge]').click()
  await page.locator('[data-test=knowledge-console]').waitFor()
  await noChinese(page.locator('.settings-workspace-header'))
  await noChinese(page.locator('.knowledge-views'))
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(150)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Knowledge console overflow: ${width}`)
    await page.screenshot({ path: `${out}/knowledge-${width}-en.png` })
  }
  checks.push('Knowledge console entry (W2-A) shows translated chrome at 1440/900/390 without overflow')
  await page.setViewportSize({ width: 1440, height: 1000 })

  // 编辑台外链 = 高级设置页（W4 退役前的影子共存面），条目写链仍在这里。
  await page.locator('[data-test=knowledge-open-editor]').click()
  await page.locator('.editor-tabs').first().waitFor()
  await page.locator('.entry-item').first().waitFor()
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
  const newGaps = [...missing].filter(line => !LOCALIZATION_I18N_GAP.has(line.replace('[i18n] Missing English message: ', '')))
  assert.deepEqual(newGaps, [], 'New untranslated UI strings outside the registered localization gap')
  checks.push(`Missing English keys limited to the registered localization-center gap (${missing.size} logged)`)
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, missing: [...missing] }, null, 2))
  console.log(JSON.stringify({ ok: true, checks }))
} catch (error) {
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  console.error(JSON.stringify({ error: error.stack, errors, missing: [...missing] }))
  process.exitCode = 1
} finally {
  await browser.close()
}
