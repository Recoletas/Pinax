// F2-2 Gate：作家助手桌面实机对齐的右 rail 双栏与移动 sheet。
// 只在隔离 Playwright context 重放 fixture，不读写用户浏览器数据。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const FIXTURE_DIR = path.resolve('tmp/authoring-rollout')
const OUT_DIR = path.resolve('/tmp/pinax-f2-dual')
const FINAL_DIR = path.resolve('/tmp/pinax-f2-final')
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const storage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const fixtureBooks = JSON.parse(storage.writing_books || '[]')
for (const book of fixtureBooks) {
  for (const doc of book.explorationDocuments || []) {
    if (doc.title === '未编排速记') doc.title = '钟楼与灯塔'
  }
}
storage.writing_books = JSON.stringify(fixtureBooks)
// 仅扩展隔离浏览器快照：两个同前缀角色用于验证数字选择与 session LRU，
// 不回写仓库 fixture，也不接触用户浏览器数据。
const fixtureWorldbookKey = Object.keys(storage).find((key) => key.startsWith('worldbook_') && key !== 'worldbooks_index')
if (fixtureWorldbookKey) {
  const fixtureWorldbook = JSON.parse(storage[fixtureWorldbookKey])
  if (!(fixtureWorldbook.entries || []).some((entry) => entry.id === 'gate-quick-lina-captain')) {
    fixtureWorldbook.entries.push({
      id: 'gate-quick-lina-captain',
      name: '莉娜队长',
      type: 'character',
      keys: ['莉娜队长'],
      keysSecondary: [],
      content: '快捷词活动窗验收条目。',
      injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1 },
      relations: { tags: [], locations: [], characters: [], events: [] },
      metadata: { createdAt: 1, updatedAt: 1, importSource: 'gate', basis: 'creative', reviewState: 'ready' }
    })
    fixtureWorldbook.updatedAt = Number(fixtureWorldbook.updatedAt || 0) + 1
    storage[fixtureWorldbookKey] = JSON.stringify(fixtureWorldbook)
  }
}
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(FINAL_DIR, { recursive: true })

function check(results, label, pass, detail = '') {
  const result = { label, pass: Boolean(pass), detail: String(detail).slice(0, 600) }
  results.push(result)
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.label}${result.detail ? ` — ${result.detail}` : ''}`)
}

async function createPage(browser, viewport, snapshot = storage) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript((snapshot) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_ui_zoom', '1')
  }, snapshot)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`) })
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.writing-tool-rail').waitFor({ timeout: 30000 })
  await page.locator('.ProseMirror').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(900)
  return { context, page, errors }
}

const browser = await chromium.launch()
const results = []

const desktop = await createPage(browser, { width: 1440, height: 900 })
const firstIdeaMenu = desktop.page.locator('.authoring-idea-row__menu').first()
await firstIdeaMenu.locator('summary').click({ force: true })
await firstIdeaMenu.getByRole('button', { name: /带入推演/ }).click()
await desktop.page.locator('[data-test="authoring-run-tray"]').waitFor({ state: 'visible' })
check(results, '非空推演夹只在构思区显示一行入口', await desktop.page.locator('[data-test="authoring-run-tray"]').innerText().then((value) => /推演夹\s*1\/3/.test(value)))
check(results, '构思区不显示未编排层级或参考范围', !/未编排\s*\d|参考范围|将参考/.test(await desktop.page.locator('.wall__shelf').innerText()))
await desktop.page.screenshot({ path: path.join(FINAL_DIR, '01-ideas-run-tray-1440.png'), fullPage: false })
const desktopQuickButton = desktop.page.locator('.editor-toolbar').getByRole('button', { name: '快捷词', exact: true })
await desktopQuickButton.click()
const desktopQuickWords = desktop.page.locator('.authoring-quick-words')
await desktopQuickWords.waitFor({ state: 'visible' })
check(results, '桌面顶部工具栏提供快捷词入口', await desktopQuickWords.isVisible())
check(results, '快捷词按角色、设定、智能提取三类管理', await desktopQuickWords.locator('nav button').count() === 3)
await desktop.page.screenshot({ path: path.join(OUT_DIR, 'quick-words-1440.png') })
const linaRow = desktopQuickWords.locator('.authoring-quick-words__list > button:has(strong:text-is("莉娜"))')
const captainRow = desktopQuickWords.locator('.authoring-quick-words__list > button:has(strong:text-is("莉娜队长"))')
if (await linaRow.count() && await captainRow.count()) {
  await linaRow.click()
  await captainRow.click()
  await desktopQuickWords.getByRole('button', { name: '关闭快捷词' }).click()
  const mainEditor = desktop.page.locator('.wall__dossier .ProseMirror')
  await mainEditor.locator('p').last().click()
  await desktop.page.keyboard.press('End')
  await desktop.page.keyboard.press('Enter')
  await desktop.page.keyboard.insertText('莉')
  const mainStrip = desktop.page.locator('.wall__dossier .authoring-quick-word-strip:not(.is-dual)')
  await mainStrip.waitFor({ state: 'visible' })
  check(results, '快捷词候选公开 1..6 数字选择', await mainStrip.getByRole('option').nth(1).getAttribute('aria-keyshortcuts') === '2')
  await desktop.page.screenshot({ path: path.join(OUT_DIR, 'quick-word-strip-1440.png') })
  await desktop.page.keyboard.press('2')
  check(results, '数字键只补齐剩余文字', (await mainEditor.innerText()).includes('莉娜队长'))
  await desktop.page.keyboard.press('Enter')
  await desktop.page.keyboard.insertText('莉')
  await mainStrip.waitFor({ state: 'visible' })
  check(results, '成功使用后同书会话最近词优先', (await mainStrip.getByRole('option').first().innerText()).includes('莉娜队长'))
  await desktop.page.keyboard.press('1')
} else {
  check(results, '快捷词 fixture 包含两个同前缀角色', false, await desktopQuickWords.innerText())
}
const desktopNameButton = desktop.page.locator('.editor-toolbar').getByRole('button', { name: '取名', exact: true })
await desktopNameButton.click()
const desktopNameWorkbench = desktop.page.locator('.quick-name-workbench')
await desktopNameWorkbench.waitFor({ state: 'visible' })
check(results, '取名提供人物、地点、组织、功法能力、道具五类', await desktopNameWorkbench.getByRole('group', { name: '名称类型' }).locator('button').count() === 5)
await desktopNameWorkbench.getByRole('button', { name: '地点', exact: true }).click()
check(results, '切换非人物类型后不保留无关的人物筛选', await desktopNameWorkbench.getByRole('group', { name: '名字性别' }).count() === 0 && await desktopNameWorkbench.locator('.quick-name-result').count() === 12)
await desktop.page.screenshot({ path: path.join(OUT_DIR, 'quick-name-1440.png') })
const locationName = (await desktopNameWorkbench.locator('.quick-name-results strong').first().innerText()).trim()
const worldbookCountBeforeInsert = await desktop.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').entries?.length || 0, fixtureWorldbookKey)
await desktopNameWorkbench.locator('.quick-name-result__insert').first().click()
const worldbookCountAfterInsert = await desktop.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').entries?.length || 0, fixtureWorldbookKey)
check(results, '取名候选只插入当前活动光标且零世界书写入', (await desktop.page.locator('.wall__dossier .ProseMirror').innerText()).includes(locationName) && worldbookCountAfterInsert === worldbookCountBeforeInsert)

await desktopNameButton.click()
await desktopNameWorkbench.waitFor({ state: 'visible' })
await desktopNameWorkbench.getByRole('button', { name: '地点', exact: true }).click()
const createRow = desktopNameWorkbench.locator('.quick-name-result').first()
const createdLocationName = (await createRow.locator('strong').innerText()).trim()
const editorBeforeCreate = await desktop.page.locator('.wall__dossier .ProseMirror').innerText()
await createRow.locator('.quick-name-result__more').click()
await desktop.page.screenshot({ path: path.join(OUT_DIR, 'quick-name-create-menu-1440.png') })
await createRow.getByRole('menuitem', { name: '建为地点条目' }).click()
await desktopNameWorkbench.locator('.quick-name-notice.is-success').waitFor({ state: 'visible' })
const createdEntryState = await desktop.page.evaluate(({ key, name }) => {
  const entries = JSON.parse(localStorage.getItem(key) || '{}').entries || []
  const matches = entries.filter((entry) => entry.name === name && entry.metadata?.authoringEntityKind === 'place')
  return { count: entries.length, matches: matches.length, id: matches[0]?.id || '' }
}, { key: fixtureWorldbookKey, name: createdLocationName })
check(results, '显式建条目不改正文并只写当前绑定世界书一次', await desktop.page.locator('.wall__dossier .ProseMirror').innerText() === editorBeforeCreate && createdEntryState.count === worldbookCountBeforeInsert + 1 && createdEntryState.matches === 1, JSON.stringify(createdEntryState))
await createRow.locator('.quick-name-result__more').click()
await createRow.getByRole('menuitem', { name: '建为地点条目' }).click()
await desktopNameWorkbench.locator('.quick-name-conflict').waitFor({ state: 'visible' })
await desktop.page.screenshot({ path: path.join(OUT_DIR, 'quick-name-conflict-1440.png') })
const worldbookCountAtConflict = await desktop.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').entries?.length || 0, fixtureWorldbookKey)
check(results, '同名条目要求查看已有或明确仍然新建', worldbookCountAtConflict === createdEntryState.count && await desktopNameWorkbench.getByRole('button', { name: '仍然新建' }).isVisible())
await desktopNameWorkbench.getByRole('button', { name: '取消', exact: true }).click()
await desktopNameWorkbench.getByRole('button', { name: '关闭快速取名' }).click()
await desktop.page.locator('[data-authoring-tool="dual"]').click()
const pane = desktop.page.locator('[data-test="authoring-dual-pane"]')
await pane.waitFor({ state: 'visible' })
await desktop.page.waitForTimeout(500)
const desktopGeometry = await desktop.page.evaluate(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector)
    if (!node) return null
    const box = node.getBoundingClientRect()
    return { x: box.x, right: box.right, width: box.width, top: box.top, bottom: box.bottom }
  }
  const ids = [...document.querySelectorAll('[id]')].map((node) => node.id)
  return {
    pane: rect('[data-test="authoring-dual-pane"]'),
    rail: rect('.writing-tool-rail'),
    main: rect('.wall__dossier'),
    editor: rect('.authoring-dual-pane__editor'),
    directory: rect('[data-test="authoring-dual-directory"]'),
    editorCount: document.querySelectorAll('.ProseMirror').length,
    duplicateGapIds: ids.filter((id, index) => id.includes('authoring-') && ids.indexOf(id) !== index),
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    topbarHasMultiWindow: [...document.querySelectorAll('.wall__cork button')].some((button) => button.textContent?.trim() === '多窗')
  }
})
check(results, '桌面双栏由右 rail 打开', await desktop.page.locator('[data-authoring-tool="dual"][aria-pressed="true"]').count() === 1)
check(results, '第二编辑面与独立目录同时存在', desktopGeometry.editorCount === 2 && Boolean(desktopGeometry.directory), JSON.stringify(desktopGeometry))
check(results, '双栏按参考图宽度与正文目录比例展开', desktopGeometry.pane?.width >= 420 && desktopGeometry.pane?.width <= 440 && desktopGeometry.directory?.width / desktopGeometry.pane?.width >= 0.36 && desktopGeometry.directory?.width / desktopGeometry.pane?.width <= 0.40 && desktopGeometry.editor?.width > desktopGeometry.directory?.width, JSON.stringify(desktopGeometry))
check(results, 'rail 位于双栏最右侧', desktopGeometry.rail?.x >= desktopGeometry.pane?.right - 1, JSON.stringify(desktopGeometry))
check(results, '顶栏没有伪造多窗入口', !desktopGeometry.topbarHasMultiWindow)
check(results, '两个编辑器没有固定 gap id 冲突', desktopGeometry.duplicateGapIds.length === 0, desktopGeometry.duplicateGapIds.join(','))
check(results, '1440 无页面级横向溢出', desktopGeometry.horizontalOverflow === 0, desktopGeometry.horizontalOverflow)
check(results, '副栏未接 owner 前不展示失效 Ghost 入口', await pane.getByText(/推演下一段/).count() === 0)
await desktop.page.screenshot({ path: path.join(OUT_DIR, 'dual-pane-chapter-1440.png') })

const sameChapterDualEditor = pane.locator('.ProseMirror')
await sameChapterDualEditor.locator('p').last().click()
await desktop.page.keyboard.press('End')
await desktop.page.keyboard.press('Enter')
await desktop.page.keyboard.insertText('莉')
const dualQuickStrip = pane.locator('.authoring-quick-word-strip.is-dual')
const dualQuickVisible = await dualQuickStrip.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
const dualQuickDebug = dualQuickVisible ? '' : await desktop.page.evaluate(() => ({
  activePane: document.querySelector('[data-test="authoring-dual-pane"]')?.getAttribute('data-active-pane'),
  activeElement: document.activeElement?.className || document.activeElement?.tagName,
  dualTextTail: document.querySelector('[data-test="authoring-dual-pane"] .ProseMirror')?.textContent?.slice(-30),
  strips: [...document.querySelectorAll('.authoring-quick-word-strip')].map((node) => ({ text: node.textContent, parent: node.parentElement?.className }))
}))
check(results, '快捷词条跟随活动副栏而非留在主栏', dualQuickVisible && await desktop.page.locator('.wall__dossier .authoring-quick-word-strip:not(.is-dual)').count() === 0, JSON.stringify(dualQuickDebug))
if (dualQuickVisible) {
  await desktop.page.screenshot({ path: path.join(OUT_DIR, 'quick-word-dual-1440.png') })
  const teamMentionsBeforeDualCompletion = ((await sameChapterDualEditor.innerText()).match(/莉娜队长/g) || []).length
  await desktop.page.keyboard.press('1')
  const teamMentionsAfterDualCompletion = ((await sameChapterDualEditor.innerText()).match(/莉娜队长/g) || []).length
  check(results, '副栏数字补全经唯一活动窗只插入一次', teamMentionsAfterDualCompletion === teamMentionsBeforeDualCompletion + 1, `${teamMentionsBeforeDualCompletion}->${teamMentionsAfterDualCompletion}`)
} else {
  check(results, '副栏数字补全经唯一活动窗只插入一次', false, '副栏未出现候选')
}
await sameChapterDualEditor.locator('p').first().click()
await desktop.page.keyboard.press('End')
await desktop.page.keyboard.insertText('同章同步')
await desktop.page.waitForTimeout(1000)
check(results, '同章双视图共享正文而非生成两份副本', (await desktop.page.locator('.wall__dossier .ProseMirror').innerText()).includes('同章同步'))
await pane.getByRole('button', { name: '撤销副窗修改' }).click()
await desktop.page.waitForTimeout(1000)
check(results, '同章副栏撤销同步正文但不调用主栏撤销栈', !(await desktop.page.locator('.wall__dossier .ProseMirror').innerText()).includes('同章同步'))
await pane.getByRole('button', { name: '重做副窗修改' }).click()
await desktop.page.waitForTimeout(1000)
check(results, '同章副栏重做恢复共享正文', (await desktop.page.locator('.wall__dossier .ProseMirror').innerText()).includes('同章同步'))
await desktop.page.locator('.editor-toolbar').getByRole('button', { name: '取名', exact: true }).click()
const dualNameWorkbench = desktop.page.locator('.quick-name-workbench')
await dualNameWorkbench.waitFor({ state: 'visible' })
await dualNameWorkbench.getByRole('button', { name: '道具', exact: true }).click()
const dualInsertedName = (await dualNameWorkbench.locator('.quick-name-results strong').first().innerText()).trim()
await dualNameWorkbench.locator('.quick-name-result__insert').first().click()
await desktop.page.waitForFunction((name) => (
  [...document.querySelectorAll('.ProseMirror')].filter((node) => node.textContent?.includes(name)).length >= 2
), dualInsertedName)
const nameOwnerCount = await desktop.page.locator('.ProseMirror').filter({ hasText: dualInsertedName }).count()
check(results, '取名跟随最后聚焦的副栏插入', nameOwnerCount >= 2, `${dualInsertedName}:${nameOwnerCount}`)

const chapterButtons = pane.locator('.authoring-dual-pane__chapter')
check(results, '副章目录可独立切换多章', await chapterButtons.count() >= 2, await pane.innerText())
check(results, '副章目录不重复显示字数和主窗章节标签', await pane.locator('.authoring-dual-pane__chapter em, .authoring-dual-pane__chapter > small').count() === 0 && !/\d+\s*字|主窗/.test(await pane.locator('[data-test="authoring-dual-directory"]').innerText()))
if (await chapterButtons.count() >= 2) {
  const mainTitle = await desktop.page.locator('.wall__dossier-title').inputValue()
  await chapterButtons.nth(1).click()
  await desktop.page.waitForTimeout(300)
  check(results, '切换副章不改变主章', await desktop.page.locator('.wall__dossier-title').inputValue() === mainTitle)
  const editedChapterId = await chapterButtons.nth(1).getAttribute('data-chapter-id')
  const dualEditor = pane.locator('.ProseMirror')
  await dualEditor.locator('p').first().click()
  await desktop.page.keyboard.press('End')
  await desktop.page.keyboard.insertText('《副栏专词》')
  await desktop.page.waitForTimeout(200)
  const dualQuickButton = desktop.page.locator('.editor-toolbar').getByRole('button', { name: '快捷词', exact: true })
  if (await dualQuickButton.getAttribute('aria-expanded') === 'true') await dualQuickButton.click()
  await dualQuickButton.click()
  const dualQuickWords = desktop.page.locator('.authoring-quick-words')
  await dualQuickWords.waitFor({ state: 'visible' })
  await dualQuickWords.getByRole('button', { name: /^智能提取/ }).click()
  check(results, '副栏异章智能提取读取副栏自己的正文', await dualQuickWords.locator('.authoring-quick-words__list').getByText('副栏专词', { exact: true }).count() === 1)
  await dualQuickWords.getByRole('button', { name: '关闭快捷词' }).click()
  await dualEditor.locator('p').first().click()
  await desktop.page.keyboard.press('End')
  await desktop.page.keyboard.insertText('双栏验收')
  await desktop.page.waitForTimeout(1000)
  const persisted = await desktop.page.evaluate(({ bookId, chapterId }) => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const book = books.find((item) => String(item.id) === String(bookId))
    return book?.chapters?.find((item) => String(item.id) === String(chapterId))?.content || ''
  }, { bookId: state.bookId, chapterId: editedChapterId })
  check(results, '副栏正文可编辑并经唯一页面保存 owner 落盘', persisted.includes('双栏验收'))
  const mainBeforeDualUndo = await desktop.page.locator('.wall__dossier .ProseMirror').innerText()
  await desktop.page.locator('.editor-toolbar').getByRole('button', { name: '撤销', exact: true }).click()
  await desktop.page.waitForTimeout(1000)
  const persistedAfterUndo = await desktop.page.evaluate(({ bookId, chapterId }) => {
    const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
    const book = books.find((item) => String(item.id) === String(bookId))
    return book?.chapters?.find((item) => String(item.id) === String(chapterId))?.content || ''
  }, { bookId: state.bookId, chapterId: editedChapterId })
  check(results, '全局撤销按活动窗只影响异章副栏', !persistedAfterUndo.includes('双栏验收') && await desktop.page.locator('.wall__dossier .ProseMirror').innerText() === mainBeforeDualUndo)
  await desktop.page.locator('.editor-toolbar').getByRole('button', { name: '重做', exact: true }).click()
  await desktop.page.waitForTimeout(1000)
  const previousMainTitle = mainTitle
  const previousDualTitle = await pane.locator('.authoring-dual-pane__title strong').innerText()
  await pane.getByRole('button', { name: '交换主副章' }).click()
  await desktop.page.waitForTimeout(700)
  check(results, '交换主副章后两边内容身份对调', await desktop.page.locator('.wall__dossier-title').inputValue() === previousDualTitle && await pane.locator('.authoring-dual-pane__title strong').innerText() === previousMainTitle)

  await desktop.page.locator('[data-authoring-tool="dual"]').click()
  check(results, 'rail 可关闭双栏', await pane.count() === 0)
  await desktop.page.locator('[data-authoring-tool="dual"]').click()
  await pane.waitFor({ state: 'visible' })
  check(results, '快速重开保留 session 内副章身份', await pane.locator('.authoring-dual-pane__title strong').innerText() === previousMainTitle)
  await pane.locator('.ProseMirror').evaluate((node) => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '拼' })))
  await desktop.page.locator('[data-authoring-tool="dual"]').click()
  check(results, 'IME composition 期间拒绝关闭并保留草稿 owner', await pane.isVisible())
  await pane.locator('.ProseMirror').evaluate((node) => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼' })))
  await desktop.page.waitForTimeout(120)
  await desktop.page.locator('[data-authoring-tool="dual"]').click()
  check(results, 'IME 结束后可正常关闭', await pane.count() === 0)
  await desktop.page.locator('[data-authoring-tool="dual"]').click()
  await pane.waitFor({ state: 'visible' })
}

const firstIdea = desktop.page.locator('.authoring-idea-row').first()
const ideaTitle = (await firstIdea.locator('.authoring-idea-row__open span').innerText()).trim()
const ideaId = await firstIdea.getAttribute('data-wt3-doc')
await firstIdea.hover()
await firstIdea.locator('summary').click()
await firstIdea.getByRole('button', { name: '在双栏打开' }).click()
await pane.waitFor({ state: 'visible' })
await desktop.page.waitForTimeout(300)
check(results, '速记菜单可直接在双栏打开', await pane.locator('.authoring-dual-pane__title strong').innerText() === ideaTitle && await pane.locator('[data-document-role="dual-exploration"]').count() === 1)
check(results, '副栏五类来源收进单一紧凑选择器', await pane.getByRole('combobox', { name: '副窗内容类型' }).locator('option').count() === 5)
const mainTitleBeforeIdea = await desktop.page.locator('.wall__dossier-title').inputValue()
await pane.locator('.ProseMirror p').first().click()
await desktop.page.keyboard.press('End')
await desktop.page.keyboard.insertText('速记双栏验收')
await desktop.page.waitForTimeout(1000)
const persistedIdea = await desktop.page.evaluate(({ bookId, documentId }) => {
  const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
  const book = books.find((item) => String(item.id) === String(bookId))
  return book?.explorationDocuments?.find((item) => String(item.id) === String(documentId))?.content || ''
}, { bookId: state.bookId, documentId: ideaId })
check(results, '副栏速记可编辑并独立保存', persistedIdea.includes('速记双栏验收') && await desktop.page.locator('.wall__dossier-title').inputValue() === mainTitleBeforeIdea)

await pane.getByRole('combobox', { name: '副窗内容类型' }).selectOption('outline')
const outlineButton = pane.locator('[data-outline-node-id]').first()
check(results, '副栏目录提供项目大纲来源', await outlineButton.count() === 1)
if (await outlineButton.count()) {
  const outlineTitle = (await outlineButton.locator('strong').innerText()).trim()
  await outlineButton.click()
  await desktop.page.waitForTimeout(250)
  check(results, '大纲以资料权限打开而非伪装正文编辑器', await pane.locator('[data-document-role="dual-outline"]').count() === 1 && await pane.locator('.ProseMirror').count() === 0 && (await pane.locator('.authoring-dual-pane__title strong').innerText()).trim() === outlineTitle)
  await desktop.page.screenshot({ path: path.join(OUT_DIR, 'dual-pane-1440.png') })
  await desktop.page.screenshot({ path: path.join(FINAL_DIR, '02-main-outline-1440.png'), fullPage: false })
}

await pane.getByRole('combobox', { name: '副窗内容类型' }).selectOption('setting')
const worldbookButton = pane.locator('[data-worldbook-entry-id]').first()
check(results, '副栏目录提供绑定世界书条目', await worldbookButton.count() === 1)
if (await worldbookButton.count()) {
  const entryTitle = (await worldbookButton.locator('strong').innerText()).trim()
  await worldbookButton.click()
  await desktop.page.waitForTimeout(250)
  check(results, '世界设定沿用资料详情权限并保留完整页面入口', await pane.locator('[data-document-role="dual-worldbook-entry"]').count() === 1 && await pane.locator('.ProseMirror').count() === 0 && (await pane.locator('.authoring-dual-pane__title strong').innerText()).trim() === entryTitle && await pane.getByRole('button', { name: '完整设定' }).count() === 1)
  check(results, '资料副窗成为活动窗时全局编辑命令禁用', await desktop.page.locator('.editor-toolbar').getByRole('button', { name: '撤销', exact: true }).isDisabled() && await desktop.page.locator('.editor-toolbar').getByRole('button', { name: '重做', exact: true }).isDisabled())
}
check(results, '桌面无 page/console error', desktop.errors.length === 0, desktop.errors.join(' | '))
await desktop.context.close()

const unboundStorage = { ...storage }
const unboundBooks = JSON.parse(unboundStorage.writing_books || '[]').map((book) => (
  String(book.id) === String(state.bookId) ? { ...book, worldbookId: '' } : book
))
unboundStorage.writing_books = JSON.stringify(unboundBooks)
const unbound = await createPage(browser, { width: 1024, height: 768 }, unboundStorage)
const unboundCountBefore = await unbound.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').entries?.length || 0, fixtureWorldbookKey)
await unbound.page.locator('.editor-toolbar').getByRole('button', { name: '取名', exact: true }).click()
const unboundNameWorkbench = unbound.page.locator('.quick-name-workbench')
await unboundNameWorkbench.getByRole('button', { name: '地点', exact: true }).click()
const unboundFirstRow = unboundNameWorkbench.locator('.quick-name-result').first()
await unboundFirstRow.locator('.quick-name-result__more').click()
await unboundFirstRow.getByRole('menuitem', { name: '建为地点条目' }).click()
await unboundNameWorkbench.locator('.quick-name-notice.is-needs-binding').waitFor({ state: 'visible' })
const unboundCountAfter = await unbound.page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}').entries?.length || 0, fixtureWorldbookKey)
check(results, '未关联世界书时建条目零写入并明确引导关联', unboundCountAfter === unboundCountBefore && await unboundNameWorkbench.getByRole('button', { name: '去关联' }).isVisible())
await unbound.page.screenshot({ path: path.join(OUT_DIR, 'quick-name-unbound-1024.png') })
await unboundNameWorkbench.getByRole('button', { name: '去关联' }).click()
check(results, '关联引导回到当前书的绑定选择器', await unbound.page.locator('.wall__binding-select').isVisible())
check(results, '未绑定旅程无 page/console error', unbound.errors.length === 0, unbound.errors.join(' | '))
await unbound.context.close()

const tablet = await createPage(browser, { width: 1024, height: 768 })
await tablet.page.locator('[data-authoring-tool="dual"]').click()
const tabletPane = tablet.page.locator('[data-test="authoring-dual-pane"]')
await tabletPane.waitFor({ state: 'visible' })
const tabletGeometry = await tablet.page.evaluate(() => {
  const node = document.querySelector('[data-test="authoring-dual-pane"]')
  const rail = document.querySelector('.writing-tool-rail')
  const box = node?.getBoundingClientRect()
  const railBox = rail?.getBoundingClientRect()
  return {
    pane: box ? { x: box.x, right: box.right, width: box.width } : null,
    rail: railBox ? { x: railBox.x, right: railBox.right } : null,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }
})
check(results, '1024 双栏保持统一窄面覆盖在 rail 左侧', tabletGeometry.pane?.width >= 420 && tabletGeometry.pane?.width <= 440 && tabletGeometry.pane?.right <= tabletGeometry.rail?.x + 1 && tabletGeometry.horizontalOverflow === 0, JSON.stringify(tabletGeometry))
check(results, '1024 无 page/console error', tablet.errors.length === 0, tablet.errors.join(' | '))
await tablet.page.screenshot({ path: path.join(OUT_DIR, 'dual-pane-1024.png') })
await tablet.context.close()

const mobile = await createPage(browser, { width: 390, height: 844 })
async function openMobileWritingTool(label) {
  await mobile.page.getByRole('button', { name: '更多写作操作' }).click()
  const menu = mobile.page.locator('.wall__more-menu[aria-label="更多写作操作"]')
  await menu.waitFor({ state: 'visible' })
  await menu.getByRole('menuitem', { name: label, exact: true }).click()
}

await openMobileWritingTool('快捷词')
const mobileQuickWords = mobile.page.locator('.authoring-quick-words')
await mobileQuickWords.waitFor({ state: 'visible' })
const mobileQuickGeometry = await mobileQuickWords.evaluate((node) => {
  const box = node.getBoundingClientRect()
  return { left: box.left, right: box.right, width: box.width }
})
check(results, '390 快捷词降级为全宽 sheet', mobileQuickGeometry.left >= 0 && mobileQuickGeometry.right <= 390 && mobileQuickGeometry.width >= 380, JSON.stringify(mobileQuickGeometry))
check(results, '390 快捷词提供移动端标点行', await mobileQuickWords.locator('footer div button').count() === 8)
const mobileLinaRow = mobileQuickWords.locator('.authoring-quick-words__list > button:has(strong:text-is("莉娜"))')
if (await mobileLinaRow.count()) await mobileLinaRow.click()
await mobile.page.screenshot({ path: path.join(OUT_DIR, 'quick-words-390.png') })
await mobileQuickWords.getByRole('button', { name: '关闭快捷词' }).click()
await openMobileWritingTool('取名')
const mobileNameWorkbench = mobile.page.locator('.quick-name-workbench')
await mobileNameWorkbench.waitFor({ state: 'visible' })
await mobileNameWorkbench.getByRole('button', { name: '功法/能力', exact: true }).click()
const mobileNameGeometry = await mobileNameWorkbench.evaluate((node) => {
  const box = node.getBoundingClientRect()
  return { left: box.left, right: box.right, bottom: box.bottom, width: box.width }
})
check(results, '390 取名以底部工作 sheet 呈现', mobileNameGeometry.left >= 0 && mobileNameGeometry.right <= 390 && mobileNameGeometry.bottom <= 844 && mobileNameGeometry.width >= 380, JSON.stringify(mobileNameGeometry))
check(results, '390 非人物取名仍显示十二个轻量候选', await mobileNameWorkbench.locator('.quick-name-result').count() === 12)
await mobileNameWorkbench.locator('.quick-name-result__more').first().click()
const mobileNameActionHeight = await mobileNameWorkbench.locator('.quick-name-result__menu button').evaluate((node) => node.getBoundingClientRect().height)
check(results, '390 建条目动作保持触控命中区', mobileNameActionHeight >= 44, mobileNameActionHeight)
await mobile.page.screenshot({ path: path.join(OUT_DIR, 'quick-name-390.png') })
await mobileNameWorkbench.getByRole('button', { name: '关闭快速取名' }).click()
await mobile.page.locator('[data-authoring-tool="dual"]').click({ force: true })
const mobilePane = mobile.page.locator('[data-test="authoring-dual-pane"]')
await mobilePane.waitFor({ state: 'visible' })
await mobile.page.waitForTimeout(300)
const mobileGeometry = await mobile.page.evaluate(() => {
  const node = document.querySelector('[data-test="authoring-dual-pane"]')
  const box = node?.getBoundingClientRect()
  return {
    x: box?.x,
    right: box?.right,
    top: box?.top,
    bottom: box?.bottom,
    width: box?.width,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    style: node ? Object.fromEntries(['position', 'insetInlineStart', 'insetInlineEnd', 'width', 'gridColumn', 'display'].map((key) => [key, getComputedStyle(node)[key]])) : null,
    viewport: { innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth }
  }
})
check(results, '390 双栏降级为视口内 sheet', mobileGeometry.width >= 300 && mobileGeometry.x >= 0 && mobileGeometry.right <= 390 && mobileGeometry.bottom <= 844, JSON.stringify(mobileGeometry))
check(results, '390 默认先显示可编辑正文而非目录遮罩', await mobilePane.locator('.ProseMirror').isVisible() && await mobilePane.locator('[data-test="authoring-dual-directory"]').count() === 0)
await mobilePane.locator('.ProseMirror p').last().click()
await mobile.page.keyboard.press('End')
await mobile.page.keyboard.press('Enter')
await mobile.page.keyboard.insertText('莉')
const mobileDualStrip = mobilePane.locator('.authoring-quick-word-strip')
await mobileDualStrip.waitFor({ state: 'visible' })
check(results, '390 快捷词条跟随悬浮编辑窗', await mobileDualStrip.getByRole('option').count() >= 1)
await mobile.page.screenshot({ path: path.join(FINAL_DIR, '05-mobile-dual-quick-words-390.png'), fullPage: false })
await mobile.page.keyboard.press('Escape')
await mobile.page.screenshot({ path: path.join(OUT_DIR, 'dual-pane-editor-390.png') })
await mobilePane.getByRole('button', { name: '切换副窗内容' }).click()
check(results, '390 可从标题栏调出快捷切换', await mobilePane.locator('[data-test="authoring-dual-directory"]').isVisible())
check(results, '390 快捷切换以单一选择器呈现五类来源', await mobilePane.getByRole('combobox', { name: '副窗内容类型' }).locator('option').count() === 5)
check(results, '390 无页面级横向溢出', mobileGeometry.horizontalOverflow === 0, mobileGeometry.horizontalOverflow)
check(results, '390 无 page/console error', mobile.errors.length === 0, mobile.errors.join(' | '))
await mobile.page.screenshot({ path: path.join(OUT_DIR, 'dual-pane-directory-390.png') })
await mobile.context.close()

await browser.close()
const report = { generatedAt: new Date().toISOString(), base: BASE, results }
fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
if (results.some((item) => !item.pass)) process.exitCode = 1
