// 单会话全流程 v2：建书 → 正文 → localStorage 构造世界书（双层关系+[[id]]）→ 六界面截图
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const outDir = resolve(process.argv[2] || 'docs/screenshots/worldbook-showcase-20261008')
mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5175'

function buildWorldbook() {
  const E = (id, name, type, keys, group, content, extra = {}) => ({
    id: 'wb_showcase_' + id, name, type, keys, keysSecondary: [], group, content,
    injection: { mode: extra.constant ? 'constant' : 'selective', probability: 100 },
    relations: { locations: extra.loc ? [extra.loc] : [], characters: [] },
    links: extra.linkTo ? [{ to: extra.linkTo, type: extra.linkType || '相关', stance: '正', covert: false, weight: 2, src: 'declared' }] : [],
    metadata: {}, sourceDocuments: []
  })
  return {
    id: 'wb_showcase', name: '雾海孤灯世界书', description: '灯塔题材演示世界',
    entries: [
      E('shen', '沈砚宁', 'character', ['沈砚宁', '守灯人'], '角色',
        '【身份】雾岩岛灯塔守灯人\n【性格】沉默、固执、记性极好\n【背景】十年前接替失踪的父亲守塔，随身带着半页残页\n【当前状态】左肩在雾夜救人时拉伤\n【关系】守着 [[雾岩岛灯塔]]，恐惧 [[第七盏油灯]] 再灭',
        { loc: 'wb_showcase_tower', linkTo: 'wb_showcase_tower', linkType: '地点归属' }),
      E('tower', '雾岩岛灯塔', 'location', ['灯塔', '雾岩岛'], '地点',
        '【概述】岛北悬崖上的石造灯塔，七层\n【规则】雾季每夜点灯，唯独第七盏只在极雾时点亮\n【秘密】第七盏的灯罩内壁刻着航海禁语'),
      E('lamp', '第七盏油灯', 'lore', ['第七盏', '油灯'], '设定',
        '【事实】第七盏油灯熄灭意味着「引渡」开始\n【禁忌】不得在无船夜重新点亮第七盏'),
      E('bottle', '消息瓶', 'item', ['消息瓶', '瓶子'], '物品',
        '【外观】绿色玻璃瓶，蜡封完好\n【内容】半页海水洇纸，可辨「别点第七盏」四字'),
      E('oath', '守灯人誓言', 'rule', ['誓言'], '规则',
        '守灯人不得离塔超过一夜；灯灭先修灯，后救人。', { constant: true }),
      E('fog', '雾季', 'event', ['雾季'], '事件',
        '每年四十天浓雾，海路断绝；上一个雾季失踪三名渔民。'),
      E('taboo', '别点第七盏', 'forbidden', ['别点第七盏'], '禁忌',
        '在无船夜点亮第七盏会引来「引渡人」。写作禁忌：不得让任何角色在无船夜主动点亮第七盏。', { constant: true })
    ],
    createdAt: Date.now(), updatedAt: Date.now()
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const shot = async (n, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: resolve(outDir, `${n}.png`) }); console.log('shot:', n) }

// 1) 建书（路径留空 → Documents\Pinax\雾海孤灯，项目绑定自动建）
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: '新建作品' }).first().click()
await page.waitForTimeout(700)
const dlg = page.getByRole('dialog', { name: '项目资料' })
await dlg.getByRole('textbox', { name: '书名' }).fill('雾海孤灯')
await dlg.getByRole('textbox', { name: '简介（可选）' }).fill('灯塔守望者在雾季发现的消息瓶')
await dlg.getByRole('button', { name: '创建并开始写作' }).click()
await page.waitForTimeout(2500)
const bookId = new URL(page.url()).searchParams.get('bookId')
console.log('bookId =', bookId)

// 2) 正文
const editorBox = page.getByRole('region', { name: '实时 Markdown 写作编辑器' }).getByRole('textbox')
await editorBox.fill('雾从海面升起来的时候，守灯人沈砚宁照例点亮了塔顶的灯。\n\n第七盏油灯昨夜熄了。他在日志簿上记下这一笔，笔尖顿了顿——灯油是满的，灯芯是新的，风从北面来，不该灭。\n\n漂来的消息瓶卡在礁石缝里，瓶口的蜡封完好。里面有半页被海水洇过的纸，只认得出四个字：别点第七盏。')
await page.waitForTimeout(1200)

// 3) localStorage 构造世界书 + 绑定
await page.evaluate((wb) => {
  localStorage.setItem('worldbook_' + wb.id, JSON.stringify(wb))
  const rawIdx = JSON.parse(localStorage.getItem('worldbooks_index') || '{"worldbooks":[]}')
  const list = Array.isArray(rawIdx) ? rawIdx : (rawIdx.worldbooks || [])
  if (!list.find((x) => x.id === wb.id)) list.push({ id: wb.id, name: wb.name, entryCount: wb.entries.length, updatedAt: wb.updatedAt })
  localStorage.setItem('worldbooks_index', JSON.stringify(Array.isArray(rawIdx) ? list : { ...rawIdx, worldbooks: list }))
  const raw = JSON.parse(localStorage.getItem('writing_books') || 'null')
  const books = Array.isArray(raw) ? raw : (raw.books || [])
  const book = books.find((b) => String(b.id) === String(new URLSearchParams(window.location.search).get('bookId')))
  if (book) book.worldbookId = wb.id
  localStorage.setItem('writing_books', JSON.stringify(raw))
}, buildWorldbook())
await page.reload()
await page.waitForTimeout(1500)

// 4) 高级编辑器：总览
await page.goto(`${BASE}/settings/worldbook/advanced?bookId=${bookId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
await shot('04-overview-tree-cards')
const graphToggle = page.getByText('图谱', { exact: true }).first()
if (await graphToggle.count()) { await graphToggle.click(); await page.waitForTimeout(2500); await shot('05-overview-graph') }
const search = page.getByRole('searchbox').first()
if (await search.count()) { await search.fill('灯塔'); await page.waitForTimeout(900); await shot('06-overview-search') }

// 5) 条目管理：沈砚宁编辑面
await page.getByRole('button', { name: '条目管理' }).first().click()
await page.waitForTimeout(900)
await page.getByText('沈砚宁', { exact: false }).first().click()
await page.waitForTimeout(1100)
await shot('07-entry-edit-top')
await page.mouse.wheel(0, 1100)
await shot('07b-entry-edit-mid', 500)
await page.mouse.wheel(0, 1800)
await shot('07c-entry-edit-links', 500)
// 6.5) 真实编辑保存：触发 A3 双写落盘（文件真源）
await page.mouse.wheel(0, -4000)
await page.waitForTimeout(600)
const mdBox = page.getByPlaceholder('输入条目内容（Markdown）')
if (await mdBox.count()) {
  await mdBox.fill((await mdBox.inputValue()) + '\n【备注】结算演示：本章确认第七盏异常。')
  for (const label of ['保存条目', '保存修改', '保存']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count()) { await b.first().click(); console.log('saved via', label); break }
  }
  await page.waitForTimeout(3200)
}

// 6) 章回结算
await page.getByRole('button', { name: '章回结算' }).first().click()
await page.waitForTimeout(1200)
await shot('08-settlement-tab')

// 7) 设置-资料页底部：本地化中心（折叠节，点击展开）
await page.goto(`${BASE}/settings/sources?bookId=${bookId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const locCenter = page.getByText('本地化中心', { exact: false }).first()
await locCenter.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
await locCenter.click()
await page.waitForTimeout(1200)
await shot('09-localization-center')

// 会话存档（供补拍复用）
await page.context().storageState({ path: resolve(outDir, 'tmp-showcase-state.json') })

console.log('full capture complete, bookId =', bookId)
await browser.close()
