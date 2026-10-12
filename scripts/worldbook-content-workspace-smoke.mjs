import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
const base = process.env.PINAX_PREVIEW_URL || 'http://127.0.0.1:5173'
const captures = '/tmp/pinax-worldbook-content-captures'
fs.mkdirSync(captures, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checks = 0
try {
  for (const [label, width, dark] of [['desktop-light', 1440, false], ['desktop-dark', 1440, true], ['mobile-dark', 390, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, hasTouch: width === 390 })
    await context.addInitScript(({ dark }) => {
      if (localStorage.getItem('worldbook-content-fixture')) return
      localStorage.setItem('worldbook-content-fixture', '1')
      const entries = [
        { id: 'person-a', name: '林昭', type: 'character', keys: ['林昭'], content: '【背景】灯塔守望者\n\n【性格】谨慎\n\n他只在涨潮时进入灯塔。', links: ['person-b'], relations: [{ to: 'person-b', type: '朋友' }] },
        { id: 'person-b', name: '许遥', type: 'character', keys: ['许遥'], content: '【背景】港口领航员\n\n【性格】果断' },
        { id: 'place-a', name: '灯塔', type: 'location', keys: ['灯塔'], content: '【背景】位于北岸，夜间点亮蓝色信号。' }
      ]
      localStorage.setItem('writing_books', JSON.stringify([{ id: 'content-book', title: '北岸来信', worldbookId: 'content-world', chapters: [{ id: 'content-chapter', title: '第一章 港口', content: '林昭在港口遇见许遥。' }] }, { id: 'other-book', title: '另一作品', worldbookId: 'other-world', chapters: [] }]))
      localStorage.setItem('worldbook_content-world', JSON.stringify({ id: 'content-world', name: '北岸设定', entries }))
      localStorage.setItem('worldbook_other-world', JSON.stringify({ id: 'other-world', name: '另一世界', entries: [{ id: 'other-person', name: '周珂', type: 'character', keys: ['周珂'], content: '另一作品的人物。' }] }))
      localStorage.setItem('worldbooks_index', JSON.stringify([{ id: 'content-world', name: '北岸设定' }, { id: 'other-world', name: '另一世界' }]))
      localStorage.setItem('app_theme', dark ? 'dark' : 'light')
      localStorage.setItem('pinax-device-language', JSON.stringify({ uiLocale: 'zh-CN', assistantLanguage: '' }))
    }, { dark })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: { ok: true, localFiles: false, projects: [], tasks: [], data: [] } }))
    await page.goto(`${base}/settings/structured?bookId=content-book`, { waitUntil: 'networkidle' })
    const workspace = page.locator('[data-test="worldbook-content-workspace"]:visible')
    const content = workspace.getByLabel('设定正文', { exact: true })
    await content.waitFor()
    assert.equal(await workspace.getByLabel('设定名称', { exact: true }).inputValue(), '林昭'); checks++
    await content.fill('【背景】林昭守着北岸灯塔。\n\n【性格】谨慎但守诺。\n\n涨潮之后他才动身。')
    await workspace.getByRole('button', { name: '详情', exact: true }).click()
    await page.waitForFunction(() => localStorage.getItem('worldbook_content-world').includes('涨潮之后他才动身')); checks++
    await workspace.locator('.setting-entry-list').getByRole('button', { name: '许遥', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-name"]')?.value === '许遥').catch(async error => { console.log(await workspace.innerText()); console.log(errors); throw error })
    await content.fill('许遥指挥船只靠岸。')
    await workspace.locator('.setting-content-directory').getByRole('button', { name: /^地点/ }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-name"]')?.value === '灯塔')
    assert.equal(await workspace.getByLabel('设定名称', { exact: true }).inputValue(), '灯塔'); checks++
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('worldbook_content-world')).entries.find(entry => entry.id === 'person-b').content), '许遥指挥船只靠岸。'); checks++
    await workspace.locator('.setting-content-directory').getByRole('button', { name: /^人物/ }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-name"]')?.value === '林昭')
    await workspace.getByLabel('关联设定', { exact: true }).selectOption('place-a')
    await workspace.getByRole('button', { name: '关联', exact: true }).click()
    await workspace.getByRole('button', { name: '添加关联', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldbook_content-world')).entries.find(entry => entry.id === 'person-a').links?.includes('place-a')); checks++
    await page.screenshot({ path: `${captures}/${label}-detail.png`, animations: 'disabled' })
    await workspace.getByRole('button', { name: '表格', exact: true }).click()
    const row = workspace.locator('[data-entry-id="person-a"]')
    await row.waitFor()
    assert.equal(await workspace.locator('.edt-template:visible').count(), 0); checks++
    assert.equal(await workspace.locator('[data-entry-id="place-a"]:visible').count(), 0); checks++
    await row.locator('[data-test="edt-cell-person-a-0"] button').click()
    const cell = row.locator('[data-test="edt-editor"]')
    await cell.waitFor()
    await cell.fill('巡夜人，熟悉潮汐。')
    await cell.press('Control+Enter')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldbook_content-world')).entries.find(entry => entry.id === 'person-a').content.includes('巡夜人')); checks++
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('worldbook_content-world')).entries.find(entry => entry.id === 'person-a').content.includes('涨潮之后他才动身')), true); checks++
    await page.screenshot({ path: `${captures}/${label}-table.png`, animations: 'disabled' })
    await row.getByRole('button', { name: '展开', exact: true }).click()
    await content.waitFor()
    assert.match(await content.inputValue(), /巡夜人/); checks++
    await workspace.getByRole('button', { name: '关系图', exact: true }).click()
    await workspace.locator('canvas').waitFor()
    assert.equal(await workspace.locator('.setting-graph-selection strong').innerText(), '林昭'); checks++
    await page.screenshot({ path: `${captures}/${label}-graph.png`, animations: 'disabled' })
    await workspace.getByRole('button', { name: '编辑设定', exact: true }).click()
    await workspace.locator('.setting-content-directory').getByRole('button', { name: '伏笔', exact: true }).click()
    await workspace.getByRole('button', { name: '建立伏笔台账', exact: true }).click()
    await workspace.getByRole('button', { name: '＋ 登记一条伏笔', exact: true }).click()
    await workspace.locator('[data-test="flt-draft-fid"]').fill('F01')
    await workspace.locator('[data-test="flt-draft-content"]').fill('灯塔的蓝色信号')
    await workspace.locator('[data-test="flt-draft-save"]').click()
    await workspace.locator('[data-fid="F01"]').waitFor(); checks++
    await workspace.locator('.setting-content-directory').getByRole('button', { name: '创作基调', exact: true }).click()
    await workspace.locator('[data-setting-field-card] textarea').first().waitFor(); checks++
    await workspace.locator('.setting-content-directory').getByRole('button', { name: /^人物/ }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-name"]')?.value === '林昭')
    await workspace.getByRole('button', { name: '新建', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-name"]')?.value === '新人物')
    await workspace.getByLabel('设定名称', { exact: true }).fill('黎遥')
    await content.fill('【背景】新加入港口的信使。')
    await workspace.getByRole('button', { name: '详情', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('worldbook_content-world')).entries.some(entry => entry.name === '黎遥' && entry.type === 'character' && entry.content.includes('信使'))); checks++
    await workspace.locator('.setting-entry-list').getByRole('button', { name: '林昭', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-name"]')?.value === '林昭')
    await workspace.getByRole('button', { name: '表格', exact: true }).click()
    const failedRow = workspace.locator('[data-entry-id="person-a"]')
    await failedRow.locator('[data-test="edt-cell-person-a-0"] button').click()
    await failedRow.locator('[data-test="edt-editor"]').fill('字段草案仍要保留。')
    await page.evaluate(() => {
      const world = JSON.parse(localStorage.getItem('worldbook_content-world'))
      world.entries.find(entry => entry.id === 'person-a').content = '外部保存的表格新版本。'
      localStorage.setItem('worldbook_content-world', JSON.stringify(world))
    })
    await failedRow.locator('[data-test="edt-editor"]').press('Control+Enter')
    await workspace.locator('.edt-unsaved').waitFor()
    assert.match(await workspace.locator('.edt-unsaved').innerText(), /字段草案仍要保留/); checks++
    page.once('dialog', dialog => dialog.accept())
    await workspace.getByRole('button', { name: '放弃本次修改', exact: true }).click()
    await workspace.getByRole('button', { name: '详情', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-content"]')?.value === '外部保存的表格新版本。'); checks++
    await content.fill('尚未保存的作者输入。')
    await page.evaluate(() => {
      const world = JSON.parse(localStorage.getItem('worldbook_content-world'))
      world.entries.find(entry => entry.id === 'person-a').content = '另一个编辑器已经保存的内容。'
      localStorage.setItem('worldbook_content-world', JSON.stringify(world))
    })
    await workspace.getByRole('button', { name: '表格', exact: true }).click()
    await workspace.locator('.setting-save-notice').waitFor()
    assert.equal(await content.inputValue(), '尚未保存的作者输入。'); checks++
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('worldbook_content-world')).entries.find(entry => entry.id === 'person-a').content), '另一个编辑器已经保存的内容。'); checks++
    page.once('dialog', dialog => dialog.accept())
    await workspace.getByRole('button', { name: '载入最新', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-test="setting-entry-content"]')?.value === '另一个编辑器已经保存的内容。'); checks++
    await page.reload({ waitUntil: 'networkidle' })
    await page.goto(`${base}/settings/structured?bookId=other-book`, { waitUntil: 'networkidle' })
    assert.equal(await page.getByLabel('设定名称', { exact: true }).inputValue(), '周珂'); checks++
    assert.equal(await page.locator('.setting-entry-list').getByText('林昭', { exact: true }).count(), 0); checks++
    await page.goto(`${base}/authoring?bookId=content-book&chapterId=content-chapter`, { waitUntil: 'networkidle' })
    await page.locator('.workspace-primary-group .ProseMirror').waitFor()
    await page.getByLabel('打开内容', { exact: true }).click()
    const picker = page.locator('.workspace-reference-menu-body')
    await picker.getByRole('button', { name: '主区', exact: true }).click()
    await picker.getByRole('searchbox').fill('本书设定')
    await picker.locator('.workspace-resource-item').getByText('本书设定', { exact: true }).click()
    const hosted = page.locator('[data-test="workspace-settings-view"]:visible')
    await hosted.getByLabel('设定正文', { exact: true }).waitFor()
    await hosted.evaluate(element => { window.__settingContentOwner = element })
    await hosted.getByLabel('设定正文', { exact: true }).fill('宿主中的设定编辑。')
    await page.getByRole('button', { name: '放回旁边', exact: true }).click()
    await page.waitForFunction(() => localStorage.getItem('worldbook_content-world')?.includes('宿主中的设定编辑')); checks++
    if (width > 900) {
      assert.equal(await hosted.getByRole('button', { name: '表格', exact: true }).count(), 0); checks++
      assert.equal(await page.locator('.workspace-primary-group .ProseMirror').isVisible(), true); checks++
    }
    await page.screenshot({ path: `${captures}/${label}-hosted.png`, animations: 'disabled' })
    await page.getByRole('button', { name: '移到主区', exact: true }).click()
    await hosted.getByRole('button', { name: '表格', exact: true }).waitFor()
    assert.equal(await hosted.evaluate(element => element === window.__settingContentOwner), true); checks++
    assert.equal(await hosted.getByLabel('设定正文', { exact: true }).inputValue(), '宿主中的设定编辑。'); checks++
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-test="workspace-settings-view"]:visible').getByLabel('设定正文', { exact: true }).waitFor()
    assert.equal(await page.locator('[data-test="workspace-settings-view"]:visible').getByLabel('设定正文', { exact: true }).inputValue(), '宿主中的设定编辑。'); checks++
    assert.deepEqual(errors, []); checks++
    await context.close()
  }
  console.log(`Worldbook content workspace: ${checks} assertions passed; screenshots ${captures}; mocked API, no model calls`)
} finally { await browser.close() }
