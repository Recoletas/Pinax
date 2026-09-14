/* eslint-disable no-console */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const COLOR = process.env.COLOR || 'light'
const fixtureDir = path.resolve('tmp/authoring-rollout')
const outputDir = path.resolve('/tmp/pinax-f2-catalog-workbench')
const state = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'fixture-localstorage.json'), 'utf8'))
fs.mkdirSync(outputDir, { recursive: true })

function check(results, label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function openPage(browser, width) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } })
  await context.addInitScript(({ snapshot, color }) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme', color)
    localStorage.setItem('app_ui_zoom', '1')
  }, { snapshot: storage, color: COLOR })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.wall__dossier .ProseMirror').waitFor({ timeout: 30000 })
  await page.waitForTimeout(500)
  return { context, page, errors }
}

const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1440, 390]) {
    const { context, page, errors } = await openPage(browser, width)
    await page.locator('[data-authoring-tool="characters"]').click()
    await page.locator('.authoring-character-workbench').waitFor()
    const characterGeometry = await page.locator('.authoring-character-workbench').evaluate((element) => {
      const sheet = element.querySelector('.character-sheet').getBoundingClientRect()
      const directory = element.querySelector('.character-directory').getBoundingClientRect()
      const root = element.getBoundingClientRect()
      return { rootWidth: root.width, rootHeight: root.height, sheetWidth: sheet.width, directoryWidth: directory.width, overflow: element.scrollWidth > element.clientWidth }
    })
    check(results, `${width} 角色工作台可见`, characterGeometry.rootWidth > (width < 600 ? 300 : 410), JSON.stringify(characterGeometry))
    if (width === 1440) check(results, '角色工作台按参考图保持约 62:38', characterGeometry.sheetWidth / characterGeometry.rootWidth >= 0.60 && characterGeometry.sheetWidth / characterGeometry.rootWidth <= 0.64, JSON.stringify(characterGeometry))
    check(results, `${width} 角色搜索/新建/提取`, await page.locator('.character-directory').getByText('新建', { exact: true }).isVisible() && await page.locator('.character-directory').getByText('提取', { exact: true }).isVisible())
    const characterLabels = await page.locator('.character-profile-field>span').allTextContents()
    check(results, `${width} 角色资料字段`, ['背景', '性格', '外貌', '其他'].every((label) => characterLabels.includes(label)), characterLabels.join('/'))
    const directoryFolders = await page.locator('.character-directory__group h3 button>span:last-child').allTextContents()
    const directoryFiles = await page.locator('.character-directory__group>button').allTextContents()
    check(results, `${width} 角色目录使用世界书文件夹和人物姓名`, directoryFolders.includes('角色') && directoryFiles.includes('莉娜') && directoryFiles.includes('艾德加') && !directoryFolders.some((name) => ['主要角色', '次要角色'].includes(name)), JSON.stringify({ directoryFolders, directoryFiles }))
    const characterFolder = page.locator('.character-directory__group').first()
    const characterFolderToggle = characterFolder.locator('h3 button')
    const characterFileCount = await characterFolder.locator(':scope>button').count()
    await characterFolderToggle.click()
    check(results, `${width} 角色文件夹可收起`, await characterFolderToggle.getAttribute('aria-expanded') === 'false' && await characterFolder.locator(':scope>button').count() === 0)
    await characterFolderToggle.click()
    check(results, `${width} 角色文件夹可展开`, await characterFolderToggle.getAttribute('aria-expanded') === 'true' && await characterFolder.locator(':scope>button').count() === characterFileCount)
    check(results, `${width} 角色默认直接编辑`, await page.locator('.character-profile-field textarea').count() === 4 && await page.getByText('编辑', { exact: true }).count() === 0)
    if (width === 1440) {
      const typography = await page.evaluate(() => Object.fromEntries(Object.entries({ title: '.character-name-input', tab: '.character-sheet__tabs button', search: '.character-directory .catalog-search input', action: '.character-directory .catalog-actions button', folder: '.character-directory__group h3 button', entry: '.character-directory__group>button', label: '.character-profile-field>span', body: '.character-profile-field textarea' }).map(([key, selector]) => [key, getComputedStyle(document.querySelector(selector)).fontSize])))
      check(results, '角色使用统一侧栏排版标尺', JSON.stringify(typography) === JSON.stringify({ title: '17px', tab: '14px', search: '14px', action: '14px', folder: '13px', entry: '13px', label: '12px', body: '14px' }), JSON.stringify(typography))
    }
    const fieldBehavior = await page.locator('.character-profile-field textarea').first().evaluate((element) => ({ resize: getComputedStyle(element).resize, overflowY: getComputedStyle(element).overflowY }))
    check(results, `${width} 角色字段不显示拖拽把手或内部滚动`, fieldBehavior.resize === 'none' && fieldBehavior.overflowY === 'hidden', JSON.stringify(fieldBehavior))
    check(results, `${width} 角色无横向溢出`, !characterGeometry.overflow)
    await page.screenshot({ path: path.join(outputDir, `characters-${width}-${COLOR}.png`), fullPage: true })

    if (width === 1440) {
      const portrait = page.locator('.character-portrait')
      const portraitActions = portrait.locator('.character-portrait__buttons')
      check(results, '角色图片区默认合并为单一生图/上传入口', await portraitActions.evaluate((element) => getComputedStyle(element).opacity) === '0')
      await portrait.hover()
      check(results, '角色图片区悬停后原位展开双动作', await portraitActions.evaluate((element) => getComputedStyle(element).opacity) === '1' && await portrait.getByRole('button', { name: '生成角色图' }).isVisible() && await portrait.getByRole('button', { name: '上传角色图' }).isVisible())
      const uploadButton = portrait.getByRole('button', { name: '上传角色图' })
      await uploadButton.hover()
      const uploadTooltip = page.getByRole('tooltip')
      const uploadTooltipText = await uploadTooltip.textContent()
      check(results, '上传动作按截图提示格式与 5MB 限制', await uploadTooltip.isVisible() && uploadTooltipText.includes('jpg') && uploadTooltipText.includes('5MB'), uploadTooltipText)
      await page.screenshot({ path: path.join(outputDir, `characters-portrait-hover-${COLOR}.png`), fullPage: true })
      await page.mouse.move(300, 100)

      const backgroundField = page.locator('.character-profile-field textarea').first()
      const personalityField = page.locator('.character-profile-field').nth(1)
      const originalBackground = await backgroundField.inputValue()
      const beforeGrowth = { height: await backgroundField.evaluate((element) => element.getBoundingClientRect().height), nextTop: await personalityField.evaluate((element) => element.getBoundingClientRect().top) }
      await backgroundField.fill(Array.from({ length: 9 }, (_, index) => `第 ${index + 1} 行人物背景会把后续字段向下推移`).join('\n'))
      const afterGrowth = { height: await backgroundField.evaluate((element) => element.getBoundingClientRect().height), nextTop: await personalityField.evaluate((element) => element.getBoundingClientRect().top) }
      check(results, '角色长字段随内容增高并下推后续字段', afterGrowth.height > beforeGrowth.height + 60 && afterGrowth.nextTop > beforeGrowth.nextTop + 60, JSON.stringify({ beforeGrowth, afterGrowth }))
      await page.screenshot({ path: path.join(outputDir, `characters-autogrow-${COLOR}.png`), fullPage: true })
      await backgroundField.fill(Array.from({ length: 24 }, (_, index) => `第 ${index + 1} 行用于验证焦点与自动保存不改变滚动位置`).join('\n'))
      const personalityInput = page.locator('.character-profile-field textarea').nth(1)
      await personalityInput.click()
      const focusedScrollTop = await page.locator('.character-sheet__scroll').evaluate((element) => element.scrollTop)
      await personalityInput.fill('焦点保持测试')
      await page.waitForTimeout(850)
      const savedScrollTop = await page.locator('.character-sheet__scroll').evaluate((element) => element.scrollTop)
      check(results, '角色字段聚焦与自动保存不跳回顶部', focusedScrollTop > 100 && Math.abs(savedScrollTop - focusedScrollTop) < 8, JSON.stringify({ focusedScrollTop, savedScrollTop }))
      await backgroundField.fill(originalBackground)

      await page.locator('[data-authoring-tool="history"]').click()
      await page.locator('[data-authoring-inspector="history"]').waitFor()
      await page.locator('[data-authoring-tool="characters"]').click()
      await page.locator('.authoring-character-workbench').waitFor()
      check(results, '历史后切角色不串页', await page.locator('[data-authoring-inspector="history"]').count() === 0)

      const toolWidths = {}
      for (const tool of ['characters', 'outline', 'ai', 'scene', 'worldbook', 'history']) {
        await page.locator(`[data-authoring-tool="${tool}"]`).click()
        await page.waitForTimeout(80)
        toolWidths[tool] = Math.round(await page.locator('.writing-inspector').evaluate((element) => element.getBoundingClientRect().width))
      }
      check(results, '全部右侧工具使用统一外宽', new Set(Object.values(toolWidths)).size === 1 && toolWidths.characters >= 420 && toolWidths.characters <= 440, JSON.stringify(toolWidths))

      await page.locator('[data-authoring-tool="characters"]').click()
      await page.locator('.character-profile-field textarea').nth(1).fill('冷静，谨慎')
      await page.locator('.character-profile-field textarea').nth(2).fill('银发蓝眼')
      await page.locator('.character-portrait input[type="file"]').setInputFiles({
        name: 'character-reference.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
      })
      const editedCharacterFields = await page.locator('.character-profile-field textarea').evaluateAll((elements) => elements.map((element) => element.value))
      check(results, '角色字段编辑不互相覆盖', editedCharacterFields[1] === '冷静，谨慎' && editedCharacterFields[2] === '银发蓝眼', JSON.stringify(editedCharacterFields))
      await page.waitForTimeout(850)
      const storedCharacter = await page.evaluate(({ worldbookId }) => {
        const worldbook = JSON.parse(localStorage.getItem(`worldbook_${worldbookId}`) || 'null')
        return worldbook?.entries?.find((entry) => entry.name === '莉娜') || null
      }, { worldbookId: state.worldbookId })
      check(results, '角色字段写回绑定世界书同一姓名条目', storedCharacter?.metadata?.characterProfile?.personality === '冷静，谨慎' && storedCharacter?.content?.includes('性格：冷静，谨慎'), JSON.stringify(storedCharacter?.metadata?.characterProfile || null))
      await page.locator('.character-portrait').hover()
      await page.getByRole('button', { name: '生成角色图' }).click()
      await page.locator('[data-test="authoring-illustrator-layer"] .image-gen-prompt-input').first().waitFor()
      const painterPrompt = await page.locator('[data-test="authoring-illustrator-layer"] .image-gen-prompt-input').first().inputValue()
      check(results, '角色完整资料带入画师', ['角色：', '背景：', '性格：冷静，谨慎', '外貌：银发蓝眼'].every((part) => painterPrompt.includes(part)), painterPrompt)
      check(results, '角色参考图带入并默认选中', await page.locator('[data-test="authoring-illustrator-layer"] .image-gen-reference-thumb.active').count() === 1)
      await page.getByRole('button', { name: '关闭画师' }).click()
    }

    await page.locator('[data-authoring-tool="worldbook"]').click()
    await page.locator('.authoring-setting-workbench').waitFor()
    const settingGeometry = await page.locator('.authoring-setting-workbench').evaluate((element) => {
      const sheet = element.querySelector('.setting-sheet').getBoundingClientRect()
      const directory = element.querySelector('.setting-directory').getBoundingClientRect()
      const root = element.getBoundingClientRect()
      return { rootWidth: root.width, sheetWidth: sheet.width, directoryWidth: directory.width, overflow: element.scrollWidth > element.clientWidth }
    })
    check(results, `${width} 设定工作台与角色同构`, settingGeometry.rootWidth > (width < 600 ? 300 : 410) && !settingGeometry.overflow, JSON.stringify(settingGeometry))
    if (width === 1440) check(results, '设定工作台按参考图保持约 62:38', settingGeometry.sheetWidth / settingGeometry.rootWidth >= 0.60 && settingGeometry.sheetWidth / settingGeometry.rootWidth <= 0.64, JSON.stringify(settingGeometry))
    check(results, `${width} 设定新建入口位于搜索框同行`, await page.locator('.setting-directory__search-row .catalog-search').isVisible() && await page.locator('.setting-directory__search-row .setting-create').isVisible())
    check(results, `${width} 设定目录不重复放角色按钮`, await page.locator('.setting-directory .catalog-actions').count() === 0 && await page.locator('.setting-directory').getByRole('button', { name: /^角色/ }).count() === 0)
    check(results, `${width} 设定默认当前落笔处`, await page.locator('.setting-directory__modes').getByRole('button', { name: '当前落笔处', exact: true }).getAttribute('class').then((value) => value.includes('active')))
    await page.locator('.setting-directory__modes').getByRole('button', { name: '全部', exact: true }).click()
    check(results, `${width} 设定可切完整目录`, await page.locator('.setting-directory__group>button').count() > 0)
    check(results, `${width} 设定不混入角色文件`, !(await page.locator('.setting-directory__group>button').allTextContents()).some((label) => ['莉娜', '艾德加'].includes(label.trim())))
    check(results, `${width} 设定目录以内容摘要而非类型解释文件`, await page.locator('.setting-directory__group>button small').count() > 0 && !(await page.locator('.setting-directory__group>button small').allTextContents()).some((label) => ['规则', '文风', '背景', '地点'].includes(label.trim())))
    if (width === 1440) {
      const typography = await page.evaluate(() => Object.fromEntries(Object.entries({ title: '.setting-sheet__head input', search: '.setting-directory .catalog-search input', folder: '.setting-directory__group h3 button', entry: '.setting-directory__group>button', label: '.setting-sheet__scroll label>span', body: '.setting-sheet__scroll textarea' }).map(([key, selector]) => [key, getComputedStyle(document.querySelector(selector)).fontSize])))
      check(results, '设定使用统一侧栏排版标尺', JSON.stringify(typography) === JSON.stringify({ title: '17px', search: '14px', folder: '13px', entry: '13px', label: '12px', body: '14px' }), JSON.stringify(typography))
    }
    const settingFolder = page.locator('.setting-directory__group').first()
    const settingFolderToggle = settingFolder.locator('h3 button')
    const settingFileCount = await settingFolder.locator(':scope>button').count()
    await settingFolderToggle.click()
    check(results, `${width} 设定文件夹可收起`, await settingFolderToggle.getAttribute('aria-expanded') === 'false' && await settingFolder.locator(':scope>button').count() === 0)
    await settingFolderToggle.click()
    check(results, `${width} 设定文件夹可展开`, await settingFolderToggle.getAttribute('aria-expanded') === 'true' && await settingFolder.locator(':scope>button').count() === settingFileCount)
    if (width === 1440) {
      const content = page.locator('.setting-content textarea')
      const previous = await content.inputValue()
      await content.fill(`${previous}\n右侧设定工作台保存验证`)
      await page.waitForTimeout(850)
      const selectedName = await page.locator('.setting-sheet__head input').inputValue()
      const storedSetting = await page.evaluate(({ worldbookId, selectedName }) => {
        const worldbook = JSON.parse(localStorage.getItem(`worldbook_${worldbookId}`) || 'null')
        return worldbook?.entries?.find((entry) => entry.name === selectedName) || null
      }, { worldbookId: state.worldbookId, selectedName })
      check(results, '设定编辑直写同一世界书条目', storedSetting?.content?.includes('右侧设定工作台保存验证'), storedSetting?.content || '')
    }
    await page.screenshot({ path: path.join(outputDir, `settings-${width}-${COLOR}.png`), fullPage: true })

    await page.locator('[data-authoring-tool="outline"]').click()
    await page.locator('.outline-workbench').waitFor()
    const outlineGeometry = await page.locator('.outline-workbench').evaluate((element) => {
      const editor = element.querySelector('.outline-editor').getBoundingClientRect()
      const directory = element.querySelector('.outline-directory').getBoundingClientRect()
      const root = element.getBoundingClientRect()
      return { rootWidth: root.width, rootHeight: root.height, editorWidth: editor.width, directoryWidth: directory.width, overflow: element.scrollWidth > element.clientWidth }
    })
    check(results, `${width} 大纲工作台可见`, outlineGeometry.rootWidth > (width < 600 ? 300 : 410), JSON.stringify(outlineGeometry))
    if (width === 1440) check(results, '大纲工作台按参考图保持约 62:38', outlineGeometry.editorWidth / outlineGeometry.rootWidth >= 0.60 && outlineGeometry.editorWidth / outlineGeometry.rootWidth <= 0.64, JSON.stringify(outlineGeometry))
    check(results, `${width} 大纲目录分组`, await page.locator('.outline-directory').getByText('总纲', { exact: true }).isVisible() && await page.locator('.outline-directory').getByText('章纲', { exact: true }).isVisible())
    check(results, `${width} 大纲目录同行提示文件内容`, await page.locator('.outline-directory__group>button small').count() > 0)
    if (width === 1440) {
      const typography = await page.evaluate(() => Object.fromEntries(Object.entries({ title: '.outline-editor__head h2', mode: '.outline-mode', search: '.outline-directory .outline-search input', action: '.outline-directory .outline-actions button', folder: '.outline-directory__group h3 button', entry: '.outline-directory__group>button strong', body: '.outline-prose' }).map(([key, selector]) => [key, getComputedStyle(document.querySelector(selector)).fontSize])))
      check(results, '大纲使用统一侧栏排版标尺', JSON.stringify(typography) === JSON.stringify({ title: '17px', mode: '14px', search: '14px', action: '14px', folder: '13px', entry: '13px', body: '14px' }), JSON.stringify(typography))
    }
    const outlineGroup = page.locator('.outline-directory__group').first()
    const outlineGroupToggle = outlineGroup.locator('h3 button')
    const outlineRowCount = await outlineGroup.locator(':scope>button').count()
    await outlineGroupToggle.click()
    check(results, `${width} 大纲文件夹可收起`, await outlineGroupToggle.getAttribute('aria-expanded') === 'false' && await outlineGroup.locator(':scope>button').count() === 0)
    await outlineGroupToggle.click()
    check(results, `${width} 大纲文件夹可展开`, await outlineGroupToggle.getAttribute('aria-expanded') === 'true' && await outlineGroup.locator(':scope>button').count() === outlineRowCount)
    check(results, `${width} 大纲模式/历史`, await page.getByText('文本模式⌄', { exact: true }).isVisible() && await page.getByTitle('历史版本').isVisible())
    check(results, `${width} 大纲无横向溢出`, !outlineGeometry.overflow)
    check(results, `${width} 零控制台错误`, errors.length === 0, errors.join(' | '))
    await page.screenshot({ path: path.join(outputDir, `outline-${width}-${COLOR}.png`), fullPage: true })

    if (width === 1440) {
      await page.locator('[data-authoring-tool="characters"]').click()
      await page.locator('.authoring-character-workbench').waitFor()
      const selectedCharacterName = (await page.locator('.character-name-input').inputValue()).trim()
      await page.getByRole('button', { name: '世界书', exact: true }).click()
      await page.waitForURL(/\/settings\/worldbook\/advanced\?entryId=/)
      const activeWorldbookEntry = (await page.locator('.entry-item.active .entry-title').textContent())?.trim()
      const advancedContent = await page.locator('.entry-editor textarea.text-area').first().inputValue()
      check(results, '角色入口直达世界书中的同一人物条目', activeWorldbookEntry === selectedCharacterName && advancedContent.includes('性格：冷静，谨慎'), JSON.stringify({ selectedCharacterName, activeWorldbookEntry }))
    }
    await context.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) process.exitCode = 1
