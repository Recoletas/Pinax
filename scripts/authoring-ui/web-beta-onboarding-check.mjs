import { chromium } from 'playwright'

const baseUrl = process.env.PINAX_BASE_URL || 'http://127.0.0.1:5207'
const screenshots = []
const errors = []
const browser = await chromium.launch()

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /从一句话开始/ }).waitFor()
  await page.getByText('一条最短创作回路', { exact: true }).waitFor()
  await page.getByText('放入人物', { exact: true }).waitFor()
  await page.getByText('试一条岔路', { exact: true }).waitFor()
  if (await page.getByText(/UTF-8 的 TXT/).count()) throw new Error('outdated UTF-8-only onboarding copy remains')
  if (await page.getByText('开始冒险', { exact: true }).count()) throw new Error('legacy adventure entry remains')
  screenshots.push('/tmp/pinax-web-beta-welcome-1440.png')
  await page.screenshot({ path: screenshots.at(-1), fullPage: true })

  await page.getByRole('button', { name: '备份', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置' })
  await settings.getByText('内测遇到问题？').waitFor()
  screenshots.push('/tmp/pinax-web-beta-support-1440.png')
  await page.screenshot({ path: screenshots.at(-1), fullPage: true })
  const downloadPromise = page.waitForEvent('download')
  await settings.locator('[data-test="beta-diagnostic-export"]').click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const diagnostic = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (diagnostic.privacy?.includesManuscriptText !== false || diagnostic.privacy?.includesApiKeys !== false) {
    throw new Error('diagnostic privacy contract mismatch')
  }
  await settings.getByRole('button', { name: '关闭' }).click()

  await page.locator('[data-test="welcome-import-manuscript"]').click()
  const dialog = page.getByRole('dialog', { name: '导入 TXT / Markdown' })
  await dialog.waitFor({ timeout: 30_000 })
  await dialog.locator('input[type=file]').setInputFiles({
    name: '潮汐档案.txt',
    mimeType: 'text/plain',
    // GB18030 bytes keep this browser gate independent of Node-only codec packages.
    buffer: Buffer.from('2320b3b1cfabb5b5b0b80a0a232320b5dad2bbd5c220caa7b5c60a0ab8dbbfdacfa8b5c6a1a30a0a232320b5dab6fed5c220bbd8c9f90a0ad6d3c9f9b4d3cbaecfc2b4abc0b4a1a3', 'hex')
  })
  // 编码工具改为常驻折叠层,选项文本常驻 DOM;断言目标是摘要行的识别编码,需收窄定位。
  await dialog.locator('.manuscript-import__summary').getByText(/GB18030/).waitFor()
  await dialog.getByLabel('书名').fill('潮汐档案·内测稿')
  if (await dialog.locator('.manuscript-import__chapters li').count() !== 2) throw new Error('expected two detected chapters')
  await dialog.getByLabel('第 1 章标题').fill('第一章 雨港失灯')
  screenshots.push('/tmp/pinax-web-beta-import-1440.png')
  await page.screenshot({ path: screenshots.at(-1), fullPage: true })
  await dialog.locator('[data-test="manuscript-import-confirm"]').click()
  await page.locator('.ProseMirror').waitFor({ timeout: 30_000 })

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books') || '[]'))
  if (stored.length !== 1 || stored[0].chapters.length !== 2) throw new Error('import did not persist book and chapters')
  if (stored[0].chapters[0].content !== '港口熄灯。') throw new Error('chapter body mismatch')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.ProseMirror').waitFor({ timeout: 30_000 })
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books') || '[]')[0]?.title)
  if (persisted !== '潮汐档案·内测稿') throw new Error('import did not survive reload')

  // 内测数据闭环：用真实 UI 导出，清空浏览器数据，再用同一文件预览并恢复。
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '备份', exact: true }).click()
  const backupSettings = page.getByRole('dialog', { name: '设置' })
  const backupDownloadPromise = page.waitForEvent('download')
  await backupSettings.getByRole('button', { name: '导出本地作品备份' }).click()
  const backupDownload = await backupDownloadPromise
  const backupPath = await backupDownload.path()
  await backupSettings.getByRole('button', { name: '关闭' }).click()
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '备份', exact: true }).click()
  const restoreSettings = page.getByRole('dialog', { name: '设置' })
  await restoreSettings.locator('[data-test="backup-import-input"]').setInputFiles(backupPath)
  await restoreSettings.locator('[data-test="backup-review"]').waitFor()
  await restoreSettings.locator('[data-test="backup-restore-confirm"]').click()
  // C04:恢复成功反馈改为作者语言,单本书备份给出直达书稿回程。
  await restoreSettings.getByText(/备份已恢复/).waitFor()
  await restoreSettings.getByRole('link', { name: /继续《潮汐档案·内测稿》/ }).waitFor()
  await restoreSettings.getByRole('button', { name: '关闭' }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('writing_books') || '[]')[0])
  if (restored?.title !== '潮汐档案·内测稿' || restored?.chapters?.[0]?.content !== '港口熄灯。') {
    throw new Error('backup UI round-trip did not restore manuscript')
  }

  const blankContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const blankPage = await blankContext.newPage()
  blankPage.on('console', (message) => { if (message.type() === 'error') errors.push(`blank: ${message.text()}`) })
  blankPage.on('pageerror', (error) => errors.push(`blank: ${error.message}`))
  await blankPage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await blankPage.getByRole('heading', { name: /从一句话开始/ }).waitFor()
  await blankPage.locator('[data-test="welcome-start-authoring"]').click()
  const newBookDialog = blankPage.getByRole('dialog', { name: '新建书稿' })
  await newBookDialog.waitFor()
  if (await newBookDialog.getByLabel('简介').isVisible()) throw new Error('optional new-book fields expanded by default')
  await blankPage.waitForTimeout(250)
  screenshots.push('/tmp/pinax-web-beta-new-book-1440.png')
  await blankPage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await newBookDialog.getByPlaceholder('输入书籍名称').fill('纸上灯塔')
  await newBookDialog.locator('[data-test="new-book-confirm"]').click()
  await newBookDialog.waitFor({ state: 'hidden' })
  const blankEditor = blankPage.locator('.ProseMirror')
  await blankEditor.waitFor()
  const firstRunPath = blankPage.locator('[data-test="authoring-first-run-path"]')
  await firstRunPath.getByText('先写下眼前发生的一件事', { exact: true }).waitFor()
  screenshots.push('/tmp/pinax-first-run-path-1440-write.png')
  await blankPage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await blankPage.waitForFunction(() => document.querySelector('.ProseMirror')?.contains(document.activeElement))
  await blankEditor.fill('雨停以后，灯塔第一次照向内陆。')
  await firstRunPath.getByRole('button', { name: /打开角色/ }).waitFor()
  screenshots.push('/tmp/pinax-first-run-path-1440-character.png')
  await blankPage.screenshot({ path: screenshots.at(-1), fullPage: true })
  // 不等待 1s 自动保存：刷新必须由 page-exit flush 同步保住刚输入的正文。
  await blankPage.reload({ waitUntil: 'domcontentloaded' })
  await blankPage.locator('.ProseMirror').waitFor()
  const blankStored = await blankPage.evaluate(() => JSON.parse(localStorage.getItem('writing_books') || '[]'))
  if (blankStored.length !== 1 || blankStored[0].chapters?.[0]?.title !== '第一章') {
    throw new Error('blank start did not create one ready-to-write chapter')
  }
  if (!(await blankPage.locator('.ProseMirror').innerText()).includes('灯塔第一次照向内陆')) {
    throw new Error('blank-start manuscript did not survive immediate reload')
  }
  await firstRunPath.getByRole('button', { name: /打开角色/ }).click()
  const characterWorkbench = blankPage.locator('[data-authoring-inspector="characters"]')
  await characterWorkbench.getByText('从第一个人物开始').waitFor()
  await characterWorkbench.getByRole('button', { name: '新建人物', exact: true }).click()
  const characterName = characterWorkbench.getByLabel('角色名称')
  await characterName.waitFor()
  await characterName.fill('守塔人岑禾')
  await characterName.blur()
  await blankPage.waitForTimeout(700)
  const blankWorldbook = await blankPage.evaluate(() => {
    const book = JSON.parse(localStorage.getItem('writing_books') || '[]')[0]
    const worldbook = book?.worldbookId
      ? JSON.parse(localStorage.getItem(`worldbook_${book.worldbookId}`) || 'null')
      : null
    return { bookWorldbookId: book?.worldbookId || '', worldbook }
  })
  if (!blankWorldbook.bookWorldbookId || blankWorldbook.worldbook?.entries?.[0]?.name !== '守塔人岑禾') {
    throw new Error('first character did not provision, bind and persist the book data library')
  }
  await characterWorkbench.locator('button[title="关闭角色工作台"]').click()
  await firstRunPath.getByRole('button', { name: /安排当前场/ }).waitFor()
  screenshots.push('/tmp/pinax-first-run-path-1440-scene.png')
  await blankPage.screenshot({ path: screenshots.at(-1), fullPage: true })
  screenshots.push('/tmp/pinax-web-beta-first-character-1440.png')
  await blankPage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await firstRunPath.getByRole('button', { name: /安排当前场/ }).click()
  const sceneCuration = blankPage.getByRole('region', { name: '现场调整表单' })
  await sceneCuration.locator('[data-test="curation-people-query"]').waitFor()
  await sceneCuration.locator('.scene-curation__person-toggle').first().click()
  await sceneCuration.getByRole('button', { name: '加入当前场', exact: true }).click()
  await sceneCuration.locator('[data-test="curation-save"]').click()
  await firstRunPath.getByRole('button', { name: /打开推演/ }).waitFor()
  screenshots.push('/tmp/pinax-first-run-path-1440-rehearsal.png')
  await blankPage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await firstRunPath.getByRole('button', { name: /打开推演/ }).click()
  await blankPage.locator('[data-test="rehearsal-panel"]').waitFor()
  await blankContext.close()

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mobilePage = await mobile.newPage()
  mobilePage.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile: ${message.text()}`) })
  mobilePage.on('pageerror', (error) => errors.push(`mobile: ${error.message}`))
  await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await mobilePage.evaluate(() => localStorage.clear())
  await mobilePage.reload({ waitUntil: 'domcontentloaded' })
  await mobilePage.getByRole('heading', { name: /从一句话开始/ }).waitFor()
  screenshots.push('/tmp/pinax-web-beta-welcome-390.png')
  await mobilePage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await mobilePage.getByRole('button', { name: '备份', exact: true }).click()
  const mobileSettings = mobilePage.getByRole('dialog', { name: '设置' })
  await mobileSettings.getByText('内测遇到问题？').waitFor()
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('mobile settings horizontal overflow')
  }
  screenshots.push('/tmp/pinax-web-beta-support-390.png')
  await mobilePage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await mobileSettings.getByRole('button', { name: '关闭' }).click()
  await mobilePage.locator('[data-test="welcome-start-authoring"]').click()
  const mobileNewBook = mobilePage.getByRole('dialog', { name: '新建书稿' })
  await mobileNewBook.waitFor()
  await mobilePage.waitForTimeout(250)
  screenshots.push('/tmp/pinax-web-beta-new-book-390.png')
  await mobilePage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await mobileNewBook.getByPlaceholder('输入书籍名称').fill('掌上潮声')
  await mobileNewBook.locator('[data-test="new-book-confirm"]').click()
  await mobileNewBook.waitFor({ state: 'hidden' })
  await mobilePage.locator('.ProseMirror').waitFor()
  const mobileFirstRunPath = mobilePage.locator('[data-test="authoring-first-run-path"]')
  await mobileFirstRunPath.getByText('先写下眼前发生的一件事', { exact: true }).waitFor()
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('mobile first-run guide horizontal overflow')
  }
  screenshots.push('/tmp/pinax-first-run-path-390-write.png')
  await mobilePage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await mobilePage.locator('[data-authoring-tool="characters"]').click()
  const mobileCharacter = mobilePage.locator('[data-authoring-inspector="characters"]')
  await mobileCharacter.getByText('从第一个人物开始').waitFor()
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('mobile first-character flow horizontal overflow')
  }
  screenshots.push('/tmp/pinax-web-beta-first-character-390.png')
  await mobilePage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await mobilePage.evaluate(() => localStorage.clear())
  await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await mobilePage.getByRole('heading', { name: /从一句话开始/ }).waitFor()
  await mobilePage.locator('[data-test="welcome-import-manuscript"]').click()
  await mobilePage.getByRole('dialog', { name: '导入 TXT / Markdown' }).waitFor({ timeout: 30_000 })
  const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  if (mobileOverflow) throw new Error('mobile horizontal overflow')
  screenshots.push('/tmp/pinax-web-beta-import-390.png')
  await mobilePage.screenshot({ path: screenshots.at(-1), fullPage: true })
  await mobile.close()

  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`)
  console.log(JSON.stringify({
    ok: true,
    desktopImport: stored[0].chapters.map((chapter) => chapter.title),
    reload: persisted,
    backupRoundTrip: restored.title,
    blankStart: {
      bookTitle: blankStored[0].title,
      chapterTitle: blankStored[0].chapters[0].title,
      firstCharacter: blankWorldbook.worldbook.entries[0].name
    },
    diagnosticPrivacy: diagnostic.privacy,
    mobileOverflow,
    screenshots
  }, null, 2))
} finally {
  await browser.close()
}
