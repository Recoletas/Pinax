import assert from 'node:assert/strict'

// Called from the isolated English author journey; uses its synthetic manuscript.
export async function verifyEnglishToolPanels(page, out) {
  const setLocale = locale => page.evaluate(async locale => {
    const { setLanguagePreferences } = await import('/src/i18n/index.js')
    setLanguagePreferences(locale)
  }, locale)
  const noChinese = async locator => {
    const text = await locator.innerText()
    assert(!/\p{Script=Han}/u.test(text), `Untranslated tool text: ${text}`)
    for (const text of await locator.locator('[aria-label], [placeholder], [title]').evaluateAll(nodes => nodes.flatMap(n => ['aria-label', 'placeholder', 'title'].map(k => n.getAttribute(k) || '')))) {
      assert(!/\p{Script=Han}/u.test(text), `Untranslated accessible label: ${text}`)
    }
  }
  await page.getByRole('button', { name: 'AI assist', exact: true }).click()
  const character = page.locator('.character-ai-review')
  await character.waitFor()
  await character.locator('textarea').fill('Keep her cautious and observant.')
  await noChinese(character)
  await setLocale('zh-CN')
  assert.equal(await character.locator('textarea').inputValue(), 'Keep her cautious and observant.')
  await setLocale('en')
  await character.getByRole('button', { name: 'Close AI character details' }).click()

  await page.locator('.writing-unit-gap__action.is-primary').first().click()
  const composer = page.locator('[data-test="block-composer"]:visible')
  await composer.getByRole('textbox', { name: 'Instructions' }).fill('Let her notice the open window.')
  await composer.locator('details > summary').click()
  await noChinese(composer)
  await setLocale('zh-CN')
  await setLocale('en')
  assert.equal(await composer.getByRole('textbox', { name: 'Instructions' }).inputValue(), 'Let her notice the open window.')
  await page.screenshot({ path: `${out}/exploration-en.png` })
  await composer.getByRole('button', { name: 'Close exploration' }).click()

  await page.locator('[data-test="authoring-illustrator-trigger"]').click()
  const image = page.locator('.authoring-illustrator')
  await image.waitFor()
  const prompt = image.locator('.image-gen-prompt-input').first()
  await prompt.fill('A quiet harbor at dawn, soft blue light.')
  await noChinese(image)
  assert.equal(await image.locator('.image-gen-style-option > span').first().evaluate(el => getComputedStyle(el).backgroundPositionY), '20%')
  for (const label of await image.locator('.image-gen-style-option strong').all()) {
    assert(await label.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), 'Clipped English style label')
  }
  await page.screenshot({ path: `${out}/image-workspace-en.png` })
  await image.locator('.image-model-picker__trigger').click()
  const models = page.getByRole('dialog', { name: 'Choose an image model' })
  await noChinese(models)
  await models.getByRole('button', { name: 'Add model', exact: true }).click()
  const config = page.getByRole('dialog', { name: 'Image model settings' })
  await noChinese(config)
  await page.keyboard.press('Escape')
  await setLocale('zh-CN')
  await setLocale('en')
  assert.equal(await prompt.inputValue(), 'A quiet harbor at dawn, soft blue light.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(150)
  const bounds = await image.boundingBox()
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'Image dialog exceeds phone viewport')
  await image.getByRole('radio', { name: 'Results & history', exact: true }).click()
  await page.screenshot({ path: `${out}/image-mobile-en.png` })
  await image.getByRole('radio', { name: 'Prompt & settings', exact: true }).click()
  assert.equal(await prompt.inputValue(), 'A quiet harbor at dawn, soft blue light.')
  await image.getByRole('button', { name: 'Close image workspace' }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
}

export async function verifyEnglishSidebarLayout(page, out) {
  const locale = value => page.evaluate(async value => {
    const { setLanguagePreferences } = await import('/src/i18n/index.js')
    setLanguagePreferences(value)
  }, value)
  const snapshot = () => page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.ProseMirror'))
    return { font: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight, books: localStorage.getItem('writing_books') }
  })
  const before = await snapshot()
  await locale('zh-CN')
  assert.deepEqual(await snapshot(), before, 'UI locale changed manuscript typography or stored content')
  await page.screenshot({ path: `${out}/layout-zh.png` })
  await locale('en')
  assert.deepEqual(await snapshot(), before)
  await page.locator('[data-authoring-tool=outline]').click()
  const outline = page.locator('.outline-workbench')
  await outline.waitFor()
  assert(!/\p{Script=Han}/u.test(await outline.innerText()), 'Untranslated outline UI')
  await outline.getByRole('button', { name: 'New', exact: true }).click()
  await outline.getByRole('textbox', { name: 'Outline title', exact: true }).fill('A longer English outline title')
  const draft = outline.locator('textarea')
  await draft.fill('Mae returns to the harbor. Do not translate this draft. 中文原文保留。')
  await locale('zh-CN')
  await locale('en')
  assert.equal(await draft.inputValue(), 'Mae returns to the harbor. Do not translate this draft. 中文原文保留。')
  await page.screenshot({ path: `${out}/outline-en.png` })
  await page.locator('[data-authoring-tool=rehearsal]').click()
  const rehearsal = page.locator('[data-test=rehearsal-panel]')
  await rehearsal.waitFor()
  assert(!/\p{Script=Han}/u.test(await rehearsal.innerText()), 'Untranslated rehearsal UI')
  await page.screenshot({ path: `${out}/rehearsal-en.png` })
  await page.locator('[data-authoring-tool=history]').click()
  const memory = page.locator('.memory-workspace')
  await memory.waitFor()
  for (const tab of await memory.locator('.memory-workspace__views button').all()) {
    await tab.click()
    assert(!/\p{Script=Han}/u.test(await memory.innerText()), 'Untranslated memory UI')
  }
  await page.screenshot({ path: `${out}/memory-en.png` })
  await page.locator('[data-test=settings-tab-writing]').click()
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(150)
    const dialog = page.locator('.settings-modal')
    const bounds = await dialog.boundingBox()
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Settings exceeds viewport')
    assert(await page.locator('.writing-preferences').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Writing settings overflows horizontally')
    await page.screenshot({ path: `${out}/settings-${width}-en.png` })
  }
  await page.locator('[data-test=settings-tab-appearance]').click()
  assert.equal(await page.locator('.appearance-preferences label').first().evaluate(el => getComputedStyle(el).alignItems), 'stretch')
  assert(await page.locator('.appearance-preferences').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Language settings overflows horizontally')
  await page.screenshot({ path: `${out}/appearance-mobile-en.png` })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 1000 })
  // Test the user's 100% option as well as the app's unchanged 85% default.
  await page.evaluate(async () => { const { useThemeStore } = await import('/src/stores/themeStore.js'); useThemeStore().setUiZoom(1) })
  for (const width of [900, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const button of await page.locator('.authoring-chapter-create button:visible').all()) {
      assert(await button.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Chapter action label is clipped')
    }
  }
  await page.screenshot({ path: `${out}/layout-100-en.png` })
  await page.locator('[data-test=authoring-illustrator-trigger]').click()
  const prompt = page.locator('.image-gen-prompt-input').first()
  assert((await prompt.evaluate(el => getComputedStyle(el).fontFamily)).startsWith('system-ui'), 'English image prompt must use UI font')
  await page.screenshot({ path: `${out}/image-100-en.png` })
  await page.getByRole('button', { name: 'Close image workspace' }).click()
  await page.evaluate(async () => { const { useThemeStore } = await import('/src/stores/themeStore.js'); useThemeStore().setUiZoom(0.85) })
}
