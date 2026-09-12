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
    name: '潮汐档案.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 潮汐档案\n\n## 第一章 失灯\n\n港口熄灯。\n\n## 第二章 回声\n\n钟声从水下传来。')
  })
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
  const blankEditor = blankPage.locator('.ProseMirror')
  await blankEditor.waitFor()
  await blankPage.waitForFunction(() => document.querySelector('.ProseMirror')?.contains(document.activeElement))
  await blankEditor.fill('雨停以后，灯塔第一次照向内陆。')
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
  await mobileNewBook.getByRole('button', { name: '关闭新建书稿' }).click()
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
    blankStart: {
      bookTitle: blankStored[0].title,
      chapterTitle: blankStored[0].chapters[0].title
    },
    diagnosticPrivacy: diagnostic.privacy,
    mobileOverflow,
    screenshots
  }, null, 2))
} finally {
  await browser.close()
}
