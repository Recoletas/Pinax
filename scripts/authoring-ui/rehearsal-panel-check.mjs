/* eslint-disable no-console */
// 推演右栏打磨 Gate（R1–R8 + P0/P2 回归）。真实组件 + 真实页面 + 确定性 provider
// fixture：只断言结构、几何、阅读与隔离，不调用真实模型，也不评价模型文采。
// 用法：BASE=http://127.0.0.1:5198 node scripts/authoring-ui/rehearsal-panel-check.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installDeterministicProviderMock } from './provider-mock.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE || 'http://127.0.0.1:5198'
const WIDTHS = (process.env.REHEARSAL_WIDTHS || '1440,1280,1024,900,720,390').split(',').map(Number)
const OUT_DIR = path.resolve(process.env.OUT_DIR || '/tmp/pinax-rehearsal-polish/final')
const FIXTURE_DIR = path.resolve(process.env.FIXTURE_DIR || 'tmp/authoring-context-closure')
fs.mkdirSync(OUT_DIR, { recursive: true })

const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const sourceStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))
const results = []
function check(label, pass, detail = '') {
  results.push({ label, pass: Boolean(pass), detail: String(detail).slice(0, 600) })
  if (!pass) console.log(`FAIL ${label} — ${String(detail).slice(0, 300)}`)
}
function buildStorage() {
  const snapshot = { ...sourceStorage }
  const key = `worldbook_${state.worldbookId}`
  const worldbook = JSON.parse(snapshot[key])
  worldbook.entries = (worldbook.entries || []).map((entry) => (String(entry.id) !== String(state.locationEntryId) ? entry : {
    ...entry,
    mapBinding: { status: 'confirmed', placeId: `place:${state.worldbookId}:mist-map:tax-office`, mapAssetId: 'mist-map', mapName: '雾港地图', markerId: 'f1-tax-office', x: 480, y: 320 },
    parentRef: { targetName: '北海联邦 · 旧港' },
    placeRelations: [{ type: 'adjacent', targetName: '钟楼广场' }],
    metadata: { ...(entry.metadata || {}), place: { ...(entry.metadata?.place || {}), parentRef: { targetName: '北海联邦 · 旧港' }, relations: [{ type: 'adjacent', targetName: '钟楼广场' }] } }
  }))
  snapshot[key] = JSON.stringify(worldbook)
  return snapshot
}
const SNAPSHOT = buildStorage()

const DIRECTIONS = {
  pressure: { statement: '艾德加被带入本次推演后，莉娜必须决定是否让他接触失踪总册的秘密。', evidenceRefs: [] },
  directions: [
    { id: 'conceal', title: '先隐瞒异象', action: '让艾德加离开档案架，独自检查暗格。', immediateGain: '保住调查主动权', cost: '他会察觉她刻意回避', evidenceRefs: [], entityRefs: [] },
    { id: 'verify', title: '共同验证装订线', action: '当面指出缺页，请他辨认装订痕迹。', immediateGain: '更快确认失窃线索', cost: '秘密与判断权交到他手里', evidenceRefs: [], entityRefs: [] },
    { id: 'probe', title: '借异象试探他', action: '故意说错暗格编号，观察艾德加是否纠正。', immediateGain: '判断他知道多少', cost: '误判会暴露自己的怀疑', evidenceRefs: [], entityRefs: [] }
  ]
}
const PARAGRAPHS = [
  '艾德加没有立刻伸手去碰那页纸。他先看向莉娜，像是在确认她到底想让谁知道这件事。',
  '“你先说，你是怎么发现的。”他把油灯往两人之间推了推，光落在缺页的边缘。',
  '“昨天夜里我数过水痕。”莉娜说，“今天多了一道，而且是在最上面。”',
  '他沉默了一会儿，把椅子从桌边挪开半步，让出通往暗格的那条狭窄过道。',
  '“你要是打算一个人下去，我不会拦你。”他说，“但我会站在楼梯口。”',
  '窗外传来钟楼的第七响，比前六声都慢。两人都没有再说话。'
]
const CHANGE = '他把守夜变成了条件，而不是让步；莉娜从此知道他会等一个交代。'
const REPLIES = [
  { response: PARAGRAPHS.slice(0, 6).join('\n\n'), change: CHANGE, choices: ['先说明缺页的来路', '反问他在档案室外站了多久'], evidenceRefs: [] },
  { response: PARAGRAPHS.slice(1).join('\n\n'), change: CHANGE, choices: ['让他先说守夜的条件'], evidenceRefs: [] },
  { response: PARAGRAPHS.slice(0, 5).join('\n\n'), change: CHANGE, choices: ['告诉他缺页上少了谁'], evidenceRefs: [] }
]
const PROSE = [':::action', '莉娜把缺页摊在窗下，让艾德加辨认装订线上的新伤。'].join('\n')

async function seed(browser, viewport, { dark = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(({ snapshot, colorScheme }) => {
    localStorage.clear()
    for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', colorScheme)
    localStorage.setItem('app_ui_zoom', '1')
  }, { snapshot: SNAPSHOT, colorScheme: dark ? 'dark' : 'light' })
  return context
}

async function openRehearsal(page) {
  const advisory = []
  const hold = { armed: false, gate: null, release: null }
  await page.route('**/api/advisor/task', async (route) => {
    const payload = route.request().postDataJSON?.() || {}
    if (payload.taskType === 'authoring.scene.directions') {
      // 与 F1 相同：方向必须引用压力投影里的真实凭据，否则 grounding 门禁会拒绝。
      const pressureBlock = payload.envelope?.blocks?.find((block) => block.kind === 'scene')
      const pressure = JSON.parse(pressureBlock?.content || '{}')
      const evidenceRef = pressure.allowedEvidenceRefs?.find(Boolean) || ''
      const entityRef = pressure.allowedEntityRefs?.find((ref) => String(ref).includes(state.edgarEntryId || '')) || pressure.allowedEntityRefs?.find(Boolean) || ''
      const resolved = {
        ...DIRECTIONS,
        pressure: { ...DIRECTIONS.pressure, evidenceRefs: [evidenceRef] },
        directions: DIRECTIONS.directions.map((direction) => ({ ...direction, evidenceRefs: [evidenceRef], entityRefs: entityRef ? [entityRef] : [] }))
      }
      return route.fulfill({ json: { taskType: payload.taskType, advice: JSON.stringify(resolved), result: { task: payload.taskType, sceneDirections: resolved } } })
    }
    if (payload.taskType === 'authoring.rehearsal.step') {
      if (hold.armed) await hold.gate
      const reply = REPLIES[Math.min(advisory.length, REPLIES.length - 1)]
      advisory.push(payload)
      return route.fulfill({ json: { taskType: payload.taskType, advice: JSON.stringify(reply), result: { task: payload.taskType, rehearsal: reply } } })
    }
    return route.continue()
  })
  await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  const unit = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
  await unit.waitFor({ state: 'visible' })
  await unit.locator('p').first().click({ position: { x: 80, y: 10 } })
  await page.waitForTimeout(250)
  // 现场人物入场后再进推演：冻结 run 需要携带在场人物（P2-2 白名单）。
  // 与 F1 相同的路径：现场编辑 → 艾德加加入当前场 → 仅带入本次推演。
  await page.locator('.wall__shelf-scene [data-test="scene-edit"]').dispatchEvent('click')
  const inspector = page.locator('.writing-inspector.is-open')
  await inspector.locator('.scene-curation').waitFor({ state: 'visible' })
  const edgar = inspector.locator('.scene-curation__people li').filter({ hasText: '艾德加' }).first()
  await edgar.waitFor({ state: 'visible' })
  // person-toggle 展开操作菜单；「加入当前场」才是入队。之后以本次推演冻结带人物的现场。
  await edgar.locator('.scene-curation__person-toggle').click()
  await edgar.getByRole('button', { name: '加入当前场' }).click()
  // 加入当前场走受控草稿：保存后投影才携带 presentCharacters（P2-2 白名单来源）。
  await inspector.locator('[data-test="curation-save"]').click()
  await page.waitForTimeout(1000)
  // 现场已有人物：走推演工具的常规起点冻结 run。
  await page.locator('[data-authoring-tool="rehearsal"]').click()
  const panel = page.locator('[data-test="rehearsal-panel"]')
  await panel.getByRole('button', { name: '从当前段落开始', exact: true }).click()
  await panel.getByLabel('试演行动').waitFor({ timeout: 30000 })
  return { panel, advisory, hold }
}

// sticky 输入条与固定工具带会盖住滚动区底部：像作者一样滚到能点到的位置再点。
async function clickInView(locator, { attempts = 14 } = {}) {
  const page = locator.page()
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await locator.evaluate((node) => {
      const scroller = (() => {
        let parent = node.parentElement
        while (parent && parent !== document.body) {
          const overflow = getComputedStyle(parent).overflowY
          if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent
          parent = parent.parentElement
        }
        return null
      })()
      const box = node.getBoundingClientRect()
      const x = Math.round(box.left + Math.max(4, box.width / 2))
      const y = Math.round(box.top + Math.max(4, Math.min(box.height / 2, box.height - 4)))
      const outside = box.bottom < 0 || box.top > window.innerHeight || box.right < 0 || box.left > window.innerWidth
      if (outside) {
        node.scrollIntoView({ block: 'center' })
        return { covered: 'outside' }
      }
      const hit = document.elementFromPoint(x, y)
      if (hit && (hit === node || node.contains(hit))) return { x, y }
      if (scroller) scroller.scrollTop += 48
      else window.scrollBy(0, 48)
      return { covered: 'covered' }
    }).catch(() => null)
    if (result && result.x !== undefined) { await page.mouse.click(result.x, result.y); return }
    await page.waitForTimeout(120)
  }
  const label = await locator.evaluate((node) => (node.textContent || '').trim().slice(0, 30))
  throw new Error(`clickInView could not reach ${label}`)
}

// 走法可能在直接位，也可能收在“更多走法”里；按 id 找，不按位置猜。
async function clickRoute(page, panel, id) {
  const direct = panel.locator(`.rehearsal-routes > [data-route="${id}"]`)
  if (await direct.count()) return clickInView(direct.first())
  await ensureRouteMenu(panel)
  const nested = panel.locator(`.rehearsal-routes-more [data-route="${id}"]`)
  if (await nested.count()) return clickInView(nested.first())
  throw new Error(`route ${id} is not reachable in the route bar`)
}

async function ensureRouteMenu(panel) {
  const details = panel.locator('.rehearsal-routes-more')
  if (!await details.count()) return false
  if (!await details.evaluate((element) => element.open)) {
    // sticky 头/输入条可能盖住 summary：走命中测试点击，不许盲点。
    await clickInView(details.locator('summary'))
  }
  return true
}

async function submit(panel, action) {
  await panel.getByLabel('试演行动').fill(action)
  await panel.getByRole('button', { name: '试演', exact: true }).click()
}

// 提交后把阅读位置留在故事顶部：模拟作者回读旧步骤时的新结果。
async function submitWhileReadingBack(page, panel, action) {
  await panel.getByLabel('试演行动').fill(action)
  await page.evaluate(() => {
    document.activeElement?.blur?.()
    const flow = document.querySelector('.rehearsal-flow')
    if (flow && getComputedStyle(flow).overflowY === 'auto' && flow.scrollHeight > flow.clientHeight) { flow.scrollTop = 0; return }
    let node = flow?.parentElement || null
    while (node && node !== document.body) {
      const overflowY = getComputedStyle(node).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) { node.scrollTop = 0; return }
      node = node.parentElement
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(200)
  const distance = await page.evaluate(() => {
    const flow = document.querySelector('.rehearsal-flow')
    if (flow && getComputedStyle(flow).overflowY === 'auto' && flow.scrollHeight > flow.clientHeight) {
      window.__readingDiag = { source: 'flow', sh: flow.scrollHeight, ch: flow.clientHeight, st: flow.scrollTop }
      return flow.scrollHeight - flow.scrollTop - flow.clientHeight
    }
    let node = flow?.parentElement || null
    while (node && node !== document.body) {
      const overflowY = getComputedStyle(node).overflowY
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        window.__readingDiag = { source: node.className, sh: node.scrollHeight, ch: node.clientHeight, st: node.scrollTop }
        return node.scrollHeight - node.scrollTop - node.clientHeight
      }
      node = node.parentElement
    }
    window.__readingDiag = { source: 'window', flow: Boolean(flow), sh: document.documentElement.scrollHeight }
    return document.documentElement.scrollHeight - window.scrollY - window.innerHeight
  })
  await panel.getByRole('button', { name: '试演', exact: true }).click()
  return distance
}

// 待处理试稿是覆盖在稿面上的预览，不属于已写正文；比较时要排除。
async function manuscriptLength(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('.writing-notebook-editor__surface .ProseMirror') || document.querySelector('.wall__dossier')
    if (!surface) return 0
    const clone = surface.cloneNode(true)
    clone.querySelectorAll('[data-test="block-draft"], .writing-ghost, .block-draft').forEach((node) => node.remove())
    return (clone.innerText || '').length
  })
}

async function reading(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('.rehearsal-steps li')]
    const style = (selector, property) => { const element = document.querySelector(selector); return element ? getComputedStyle(element)[property] : null }
    const scroller = (() => {
      const flow = document.querySelector('.rehearsal-flow')
      if (flow && getComputedStyle(flow).overflowY === 'auto' && flow.scrollHeight > flow.clientHeight) return flow
      let node = flow?.parentElement || null
      while (node && node !== document.body) {
        const overflow = getComputedStyle(node).overflowY
        if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
        node = node.parentElement
      }
      return null
    })()
    return {
      count: items.length,
      visibleBodies: items.filter((item) => item.querySelector('.rehearsal-step-body')?.offsetParent).length,
      firstBodyChars: items[0]?.querySelector('.rehearsal-response')?.innerText?.length || 0,
      latestBodyChars: items.at(-1)?.querySelector('.rehearsal-response')?.innerText?.length || 0,
      foldControls: items.filter((item) => item.querySelector('.rehearsal-step-head[aria-expanded]')).length,
      suggestionCount: document.querySelectorAll('.rehearsal-options button').length,
      storyFont: style('.rehearsal-response', 'fontSize'),
      storyLineHeight: style('.rehearsal-response', 'lineHeight'),
      toolFont: style('.rehearsal-step-tools', 'fontSize'),
      scrollHeight: scroller ? scroller.scrollHeight : document.documentElement.scrollHeight,
      clientHeight: scroller ? scroller.clientHeight : window.innerHeight,
      scrollTop: scroller ? scroller.scrollTop : window.scrollY,
      chip: document.querySelectorAll('.rehearsal-new').length
    }
  })
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { w: Math.round(box.width), h: Math.round(box.height), top: Math.round(box.top), left: Math.round(box.left), right: Math.round(box.right), bottom: Math.round(box.bottom) }
    }
    const style = (selector, property) => { const element = document.querySelector(selector); return element ? getComputedStyle(element)[property] : null }
    const scrollSample = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      return { w: element.clientWidth, sw: element.scrollWidth }
    }
    return {
      inspector: rect('.writing-inspector.is-rehearsal'),
      dossier: rect('.wall__dossier'),
      prose: rect('.ProseMirror'),
      footer: rect('.rehearsal-footer'),
      compose: rect('.rehearsal-compose'),
      title: rect('.wall__dossier-title'),
      inspectorPosition: style('.writing-inspector.is-rehearsal', 'position'),
      panelBox: scrollSample('[data-test="rehearsal-panel"]'),
      doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      controls: [...document.querySelectorAll('.rehearsal-panel button, .rehearsal-panel summary, .rehearsal-panel textarea')].map((element) => {
        const box = element.getBoundingClientRect()
        return { h: Math.round(box.height), kind: element.tagName.toLowerCase(), label: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 20) }
      })
    }
  })
}

const browser = await chromium.launch()
try {
  for (const width of WIDTHS) {
    const height = width === 720 ? 450 : width <= 390 ? 844 : 900
    const context = await seed(browser, { width, height }, { dark: width === 900 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)))
    await installDeterministicProviderMock(page, { passiveInline: false, blockText: PROSE })
    const { panel, advisory, hold } = await openRehearsal(page)
    const tag = String(width)
    const manuscriptBefore = await manuscriptLength(page)

    // R1/R6：开面板后正文仍在文档流，章名未被挤掉，无横向溢出。
    const shell = await geometry(page)
    check(`R6 ${tag} 面板打开后正文仍在文档流`, (shell.prose?.w || 0) > 240, JSON.stringify({ prose: shell.prose?.w }))
    check(`R6 ${tag} 章名未被挤掉`, (shell.title?.w || 0) > 0 && (shell.title?.h || 0) > 0, JSON.stringify(shell.title))
    check(`R6 ${tag} 无横向溢出`, shell.doc.sw <= shell.doc.cw + 1 && (shell.panelBox?.sw || 0) <= (shell.panelBox?.w || 0) + 1,
      JSON.stringify({ doc: shell.doc, panel: shell.panelBox }))
    if (width > 1180) {
      check(`R1 ${tag} 检查器栏宽 420–460`, shell.inspector.w >= 420 && shell.inspector.w <= 460, shell.inspector.w)
      check(`R6 ${tag} 宽屏并排不覆盖稿面`, shell.inspector.left >= shell.dossier.right - 2,
        JSON.stringify({ inspectorLeft: shell.inspector.left, dossierRight: shell.dossier.right }))
    } else {
      check(`R6 ${tag} 窄屏顺序展开而非覆盖层`, shell.inspectorPosition === 'static', shell.inspectorPosition)
      check(`R6 ${tag} 顺序展开不与稿面重叠`, shell.inspector.top >= shell.dossier.bottom - 2,
        JSON.stringify({ inspectorTop: shell.inspector.top, dossierBottom: shell.dossier.bottom }))
    }

    // R2/R3：连续阅读、建议上限、折叠身份。
    await submit(panel, '莉娜先隐瞒缺页')
    await panel.locator('.rehearsal-steps li').first().waitFor({ timeout: 30000 }).catch(async (error) => {
      console.log('rehearsal diagnostic', JSON.stringify({ text: (await panel.innerText()).slice(0, 400), requests: advisory.length, errors }))
      throw error
    })
    await submit(panel, '继续追问钥匙')
    await panel.locator('.rehearsal-steps li').nth(1).waitFor({ timeout: 30000 })
    await page.waitForTimeout(400)
    const two = await reading(page)
    check(`R2 ${tag} 旧步默认连续可读`, two.count === 2 && two.visibleBodies === 2 && two.firstBodyChars > 40 && two.latestBodyChars > 40, JSON.stringify(two))
    check(`R2 ${tag} 折叠控件带可访问状态`, two.foldControls === 2, two.foldControls)
    check(`R3 ${tag} 建议不超过三条`, two.suggestionCount <= 3, two.suggestionCount)
    check(`R1 ${tag} 故事正文 16–17px 且行高≥1.85`, parseFloat(two.storyFont) >= 16 && parseFloat(two.storyFont) <= 17.5
      && parseFloat(two.storyLineHeight) / parseFloat(two.storyFont) >= 1.85, JSON.stringify({ font: two.storyFont, line: two.storyLineHeight }))
    check(`R1 ${tag} 次要操作文字不高于 13px`, parseFloat(two.toolFont) <= 13, two.toolFont)
    const wide = await geometry(page)
    check(`R6 ${tag} 底部输入条在视口内可见`, !wide.compose || (wide.compose.top >= 0 && wide.compose.bottom <= height + 1),
      JSON.stringify({ compose: wide.compose, height }))
    if (width <= 720) {
      const small = (wide.controls || []).filter((item) => item.kind !== 'textarea' && item.h > 0 && item.h < 44)
      const input = (wide.controls || []).find((item) => item.kind === 'textarea')
      check(`R6 ${tag} 触控目标≥44px`, small.length === 0, JSON.stringify(small))
      check(`R6 ${tag} 矮屏输入框仍可点`, !input || input.h >= 40, JSON.stringify(input))
    }

    // P2-1：行动者默认视角人物；代词且现场多人时不自动猜，先要作者点名。
    const cast = await page.evaluate(() => {
      const bar = document.querySelector('.rehearsal-cast')
      return {
        bar: Boolean(bar),
        label: bar?.querySelector('.rehearsal-cast-label')?.textContent.trim(),
        people: bar ? [...bar.querySelectorAll('.rehearsal-cast-person')].map((node) => node.textContent.trim()) : [],
        pressed: bar ? [...bar.querySelectorAll('[aria-pressed="true"]')].map((node) => node.textContent.trim()) : []
      }
    })
    check(`P2 ${tag} 行动者选择条存在且默认视角人物`, cast.bar && cast.label === '行动者' && cast.people.length >= 2 && cast.pressed.length === 1, JSON.stringify(cast))
    const expectedActor = cast.pressed[0]
    const ambiguousText = '追问他昨夜为什么不在档案室外'
    await panel.getByLabel('试演行动').fill(ambiguousText)
    await page.waitForTimeout(200)
    const blocked = await page.evaluate(() => ({
      hint: document.querySelector('.rehearsal-ambiguous')?.textContent.trim() || '',
      targets: [...document.querySelectorAll('[aria-label="动作对象"] .rehearsal-cast-person')].map((node) => node.textContent.trim()),
      submitDisabled: [...document.querySelectorAll('.rehearsal-dock-actions button')].find((node) => node.textContent.includes('试演'))?.disabled
    }))
    check(`P2 ${tag} 歧义行动先要点名对象`, blocked.hint.includes('不自动猜') && blocked.targets.length >= 1 && blocked.submitDisabled === true, JSON.stringify(blocked))
    await panel.locator('[aria-label="动作对象"] .rehearsal-cast-person').first().click()
    await page.waitForTimeout(200)
    const alternateActor = cast.people.find((name) => name !== expectedActor)
    await panel.locator('.rehearsal-cast:not(.is-target) .rehearsal-cast-person', { hasText: alternateActor }).click()
    const targetAfterActorChange = await page.evaluate(() => document.querySelector('[aria-label="动作对象"] [aria-pressed="true"]')?.textContent.trim() || '')
    check(`P2 ${tag} 切换行动者会清除旧对象`, targetAfterActorChange === '', targetAfterActorChange)
    await panel.locator('.rehearsal-cast:not(.is-target) .rehearsal-cast-person', { hasText: expectedActor }).click()
    await panel.locator('[aria-label="动作对象"] .rehearsal-cast-person', { hasText: blocked.targets[0] }).click()
    await page.waitForTimeout(200)
    const unblocked = await page.evaluate(() => [...document.querySelectorAll('.rehearsal-dock-actions button')].find((node) => node.textContent.includes('试演'))?.disabled)
    check(`P2 ${tag} 点名对象后可以提交`, unblocked === false, unblocked)
    const expectedTarget = blocked.targets[0]
    await panel.getByRole('button', { name: '试演', exact: true }).click()
    await panel.locator('.rehearsal-steps li').nth(2).waitFor({ timeout: 30000 })
    await page.waitForTimeout(300)
    const intentSeen = advisory.at(-1)
    const stepShowsActor = await page.evaluate(() => document.querySelectorAll('.rehearsal-steps li')[2]?.querySelector('.rehearsal-step-action')?.textContent.trim() || '')
    check(`P2 ${tag} 请求声明行动者与对象`, typeof intentSeen?.question === 'string'
      && intentSeen.question.includes(`行动者：${expectedActor}`) && intentSeen.question.includes(`动作对象：${expectedTarget}`)
      && intentSeen.question.includes('在场人物'), JSON.stringify({ actor: expectedActor, target: expectedTarget, head: intentSeen?.question?.slice(0, 150) }))
    check(`P2 ${tag} 动作对象也是优先且合法的回应者`, intentSeen.question.includes(`允许回应者（也允许环境）：${expectedTarget}`)
      && intentSeen.question.includes(`优先回应者（动作对象）：${expectedTarget}`)
      && !intentSeen.question.includes('本场没有其他在场人物'), intentSeen.question.slice(0, 300))
    check(`P2 ${tag} 步骤行显示行动者`, stepShowsActor.startsWith(`${expectedActor}：`), stepShowsActor)
    check(`P2 ${tag} 在场名单进入请求并限制台词归属`, /在场人物（仅限这些人物获得台词、名字或关键行动）：.+/.test(intentSeen.question)
      && intentSeen.question.includes('名单之外的人物不得出现台词、名字或关键行动'), intentSeen.question.slice(0, 220))
    // 恢复两步状态：从第三步（最新）换路，归档三步旧路，当前路保留前两步。
    await clickInView(panel.locator('.rehearsal-step').nth(2).getByRole('button', { name: '从这里换路' }))
    await panel.locator('.rehearsal-steps li').nth(1).waitFor({ timeout: 10000 })
    await page.waitForTimeout(250)

    // R2：作者折叠不因追加重置。
    await clickInView(panel.locator('.rehearsal-step-head').first())
    const foldedOnce = await page.evaluate(() => !document.querySelector('.rehearsal-steps li .rehearsal-step-body')?.offsetParent)
    await submit(panel, '先说明缺页的来路')
    await panel.locator('.rehearsal-steps li').nth(2).waitFor({ timeout: 30000 })
    await page.waitForTimeout(400)
    const appended = await reading(page)
    const foldedState = await page.evaluate(() => document.querySelector('.rehearsal-steps li .rehearsal-step-head')?.getAttribute('aria-expanded'))
    check(`R2 ${tag} 追加结果不重置作者折叠`, foldedOnce && foldedState === 'false' && appended.visibleBodies === 2,
      JSON.stringify({ foldedOnce, foldedState, visibleBodies: appended.visibleBodies }))
    await clickInView(panel.locator('.rehearsal-step-head').first())

    // R2：回读时新结果不抢滚动，只给轻量入口。
    check(`R2 ${tag} 故事超出视口时可独立滚动`, two.scrollHeight > two.clientHeight, JSON.stringify({ scrollHeight: two.scrollHeight, clientHeight: two.clientHeight }))
    hold.armed = true
    hold.gate = new Promise((resolve) => { hold.release = resolve })
    const readingDistance = await submitWhileReadingBack(page, panel, '再看看那道水痕')
    check(`R2 ${tag} 回读位置远离故事底部`, readingDistance > 200, readingDistance)
    const waiting = await reading(page)
    hold.armed = false
    hold.release()
    await panel.locator('.rehearsal-steps li').nth(3).waitFor({ timeout: 30000 })
    await page.waitForTimeout(500)
    const landed = await reading(page)
    check(`R2 ${tag} 回读时新结果不抢滚动`, landed.scrollTop - waiting.scrollTop <= 8,
      JSON.stringify({ waiting: waiting.scrollTop, landed: landed.scrollTop }))
    check(`R2 ${tag} 回读时有轻量新回应入口`, landed.chip === 1, JSON.stringify({ chip: landed.chip }))
    await page.screenshot({ path: path.join(OUT_DIR, `rehearsal-${tag}-steps.png`) })
    // 入口本身一滚到就消失，直接点，不再预滚动。
    await panel.getByRole('button', { name: '有新回应' }).click()
    await page.waitForTimeout(300)
    const followed = await reading(page)
    check(`R2 ${tag} 点击入口回到最新回应`, followed.scrollTop > 0 && followed.chip === 0, JSON.stringify({ scrollTop: followed.scrollTop, chip: followed.chip }))

    // R3：四步后保留换路与试稿出口。
    const limitState = await page.evaluate(() => ({
      input: document.querySelectorAll('.rehearsal-compose textarea').length,
      limitNote: (document.querySelector('.rehearsal-limit')?.textContent || '').includes('四步'),
      exits: [...document.querySelectorAll('.rehearsal-export, [data-route-root]')].map((node) => node.textContent.trim().slice(0, 12))
    }))
    check(`R3 ${tag} 四步后保留换路与试稿出口`, limitState.input === 0 && limitState.limitNote === true && limitState.exits.length >= 2,
      JSON.stringify(limitState))

    // R4：从第一步另试。走法身份是会话内稳定 id，测试按 id 定位。
    const longRouteId = await panel.evaluate((el) => el.dataset.currentRoute)
    const callsBeforeRoute = advisory.length
    await clickInView(panel.locator('.rehearsal-step').first().getByRole('button', { name: '从这里换路' }))
    await panel.locator('.rehearsal-routes').waitFor({ timeout: 10000 })
    const shortRouteId = await panel.evaluate((el) => el.dataset.currentRoute)
    const routes = await page.evaluate(() => {
      const bar = document.querySelector('.rehearsal-routes')
      return {
        names: [...bar.querySelectorAll('[data-route] span')].map((item) => item.textContent.trim()),
        steps: document.querySelectorAll('.rehearsal-steps li').length,
        compare: bar.querySelectorAll('.rehearsal-compare').length
      }
    })
    check(`R4 ${tag} 换路退回分歧点且保留旧路`, routes.steps === 0 && routes.names.length >= 1 && routes.compare === 1, JSON.stringify(routes))
    check(`R4 ${tag} 走法名取具体行动而非序号`, routes.names.every((name) => name.length > 1 && !/^第|分支|走法 ?\d/.test(name)), JSON.stringify(routes.names))
    check(`R4 ${tag} 换路不重跑模型`, advisory.length === callsBeforeRoute, `${advisory.length} vs ${callsBeforeRoute}`)
    check(`R4 ${tag} 换路产生新身份而不是共用一条`, shortRouteId !== '' && longRouteId !== '' && shortRouteId !== longRouteId,
      JSON.stringify({ longRouteId, shortRouteId }))

    await submit(panel, '直接摊牌，不再隐瞒')
    await panel.locator('.rehearsal-steps li').first().waitFor({ timeout: 30000 })
    await panel.getByLabel('试演行动').fill('从这一步换成直接摊牌')
    await page.waitForTimeout(200)
    await clickRoute(page, panel, longRouteId)
    await page.waitForTimeout(300)
    const onLong = await page.evaluate(() => ({
      id: document.querySelector('[data-test="rehearsal-panel"]').dataset.currentRoute,
      steps: document.querySelectorAll('.rehearsal-steps li').length,
      input: document.querySelector('.rehearsal-compose textarea')?.value || ''
    }))
    check(`R4 ${tag} 换到旧路带回该路状态`, onLong.id === longRouteId && onLong.steps === 4 && onLong.input === '', JSON.stringify(onLong))
    await clickRoute(page, panel, shortRouteId)
    await page.waitForTimeout(300)
    const onShort = await page.evaluate(() => ({
      id: document.querySelector('[data-test="rehearsal-panel"]').dataset.currentRoute,
      steps: document.querySelectorAll('.rehearsal-steps li').length,
      input: document.querySelector('.rehearsal-compose textarea')?.value || ''
    }))
    check(`R4 ${tag} 切回原路恢复未提交输入`, onShort.id === shortRouteId && onShort.steps === 1 && onShort.input === '从这一步换成直接摊牌', JSON.stringify(onShort))

    // 验收复现：在某条路打字 → 回到起点走另一条 → 恢复原来那条，字必须还在。
    const reproRouteId = await panel.evaluate((el) => el.dataset.currentRoute)
    await panel.getByLabel('试演行动').fill('回起点前打的字')
    await clickInView(panel.getByRole('button', { name: /回到起点/ }))
    await page.waitForTimeout(300)
    const rootRouteId = await panel.evaluate((el) => el.dataset.currentRoute)
    await submit(panel, '从起点再试一步')
    await panel.locator('.rehearsal-steps li').first().waitFor({ timeout: 30000 })
    await clickRoute(page, panel, reproRouteId)
    await page.waitForTimeout(300)
    const reproBack = await page.evaluate(() => ({
      id: document.querySelector('[data-test="rehearsal-panel"]').dataset.currentRoute,
      input: document.querySelector('.rehearsal-compose textarea')?.value || ''
    }))
    check(`R4 ${tag} 换路不丢未提交输入（验收复现）`,
      rootRouteId !== reproRouteId && reproBack.id === reproRouteId && reproBack.input === '回起点前打的字',
      JSON.stringify({ reproRouteId, rootRouteId, reproBack }))

    // R4：就地对照。候选必须排除当前路，并允许显式选择另一条。
    await panel.locator('.rehearsal-routes').waitFor({ timeout: 10000 })
    const callsBeforeCompare = advisory.length
    await clickInView(panel.locator('.rehearsal-compare > summary'))
    await page.waitForTimeout(250)
    const pick = await page.evaluate(() => {
      const nav = document.querySelector('.rehearsal-compare-pick')
      const panelEl = document.querySelector('[data-test="rehearsal-panel"]')
      return {
        current: panelEl.dataset.currentRoute,
        ids: nav ? [...nav.querySelectorAll('[data-route]')].map((node) => node.dataset.route) : [],
        pressed: nav ? [...nav.querySelectorAll('[aria-pressed="true"]')].map((node) => node.dataset.route) : [],
        headers: [...document.querySelectorAll('.rehearsal-compare-side h4')].map((node) => node.textContent.trim())
      }
    })
    check(`R4 ${tag} 对照候选排除当前路`,
      pick.ids.length >= 1 && !pick.ids.includes(pick.current) && !pick.pressed.includes(pick.current) && pick.headers.length === 2,
      JSON.stringify(pick))
    await clickInView(panel.locator(`.rehearsal-compare-pick [data-route="${longRouteId}"]`))
    await page.waitForTimeout(300)
    const compare = await page.evaluate(() => {
      const sides = [...document.querySelectorAll('.rehearsal-compare-side')]
      return {
        sides: sides.length,
        headers: sides.map((side) => side.querySelector('h4')?.textContent.trim()),
        common: sides.map((side) => side.querySelector('.rehearsal-compare-common')?.textContent.trim()).filter(Boolean),
        actions: sides.map((side) => side.querySelector('.rehearsal-compare-action')?.textContent.trim())
      }
    })
    check(`R4 ${tag} 显式选另一条路后对照两侧不等长`, compare.sides === 2
      && compare.headers.some((header) => /第 4 步/.test(header)) && compare.headers.some((header) => /第 1 步/.test(header)), JSON.stringify(compare))
    check(`R4 ${tag} 对照说明共同前缀或立即分歧`, compare.common.length === 2, JSON.stringify(compare.common))
    check(`R4 ${tag} 对照只呈现已生成结果`, compare.actions.every((action) => action && action.length > 0), JSON.stringify(compare.actions))
    check(`R4 ${tag} 对照不额外请求模型`, advisory.length === callsBeforeCompare, `${advisory.length} vs ${callsBeforeCompare}`)
    check(`R4 ${tag} 两条路内容确实不同`, compare.actions[0] !== compare.actions[1], JSON.stringify(compare.actions))
    const compareView = await page.evaluate(() => {
      const section = document.querySelector('.rehearsal-compare')
      const side = document.querySelector('.rehearsal-compare-side')
      if (!section || !side) return null
      const scroller = (() => {
        const flow = document.querySelector('.rehearsal-flow')
        if (flow && getComputedStyle(flow).overflowY === 'auto' && flow.scrollHeight > flow.clientHeight) return flow
        let node = flow?.parentElement || null
        while (node && node !== document.body) {
          const overflowY = getComputedStyle(node).overflowY
          if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
          node = node.parentElement
        }
        return null
      })()
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0
      const viewBottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight
      const box = section.getBoundingClientRect()
      const sideBox = side.getBoundingClientRect()
      return {
        viewTop: Math.round(viewTop), viewBottom: Math.round(viewBottom),
        sectionTop: Math.round(box.top), sectionBottom: Math.round(box.bottom),
        sideTop: Math.round(sideBox.top), sideBottom: Math.round(sideBox.bottom)
      }
    })
    check(`R4 ${tag} 展开的对照进入视野`, Boolean(compareView)
      && compareView.sectionTop >= compareView.viewTop - 2 && compareView.sideTop < compareView.viewBottom,
      JSON.stringify(compareView))
    await page.screenshot({ path: path.join(OUT_DIR, `rehearsal-${tag}-compare.png`) })
    // P0：回程入口常驻 sticky 标题栏。深度滚动状态直接断言在视口内，不预滚动。
    if (width <= 1180) {
      const btnBox = await page.evaluate(() => {
        const node = document.querySelector('.writing-inspector .writing-inspector__manuscript-btn')
        if (!node) return null
        const box = node.getBoundingClientRect()
        return { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), w: Math.round(box.width), h: Math.round(box.height) }
      })
      check(`R6 ${tag} 深度滚动时回正文按钮常驻视口`, Boolean(btnBox) && btnBox.top >= 0 && btnBox.bottom <= height && btnBox.w > 0,
        JSON.stringify(btnBox))
      const inputBox = await page.evaluate(() => {
        const element = document.querySelector('.rehearsal-compose textarea')
        if (!element) return null
        return { h: Math.round(element.getBoundingClientRect().height) }
      })
      check(`R6 ${tag} 对照态输入压成一行且可点`, Boolean(inputBox) && inputBox.h >= 36 && inputBox.h <= 52, JSON.stringify(inputBox))
      if (btnBox) {
        await page.locator('.writing-inspector .writing-inspector__manuscript-btn')
          .click({ timeout: 5000 }).catch(async () => {
            await page.evaluate(() => document.querySelector('.writing-inspector__manuscript-btn').click())
          })
      }
      await page.waitForTimeout(350)
      const returned = await page.evaluate(() => {
        const dossier = document.querySelector('.wall__dossier').getBoundingClientRect()
        return { top: Math.round(dossier.top), visible: dossier.top >= -2 && dossier.top < window.innerHeight, steps: document.querySelectorAll('.rehearsal-steps li').length }
      })
      check(`R6 ${tag} 一键回正文后稿面可见且会话保留`, returned.visible === true && returned.steps > 0, JSON.stringify(returned))
    }
    await clickInView(panel.locator('.rehearsal-compare > summary'))

    // R5：试稿归属与查看不生成。
    await clickInView(panel.getByRole('button', { name: '写成试稿', exact: true }))
    await page.locator('[data-test="block-draft"]').waitFor({ timeout: 45000 })
    await page.waitForTimeout(400)
    const callsBeforeDraftView = advisory.length
    const sameRoute = await panel.getByRole('button', { name: '查看试稿', exact: true }).count()
    check(`R5 ${tag} 本路稿显示查看试稿`, sameRoute === 1, sameRoute)
    await clickInView(panel.getByRole('button', { name: '查看试稿', exact: true }))
    await page.waitForTimeout(300)
    check(`R5 ${tag} 查看试稿零生成`, advisory.length === callsBeforeDraftView, `${advisory.length} vs ${callsBeforeDraftView}`)
    await ensureRouteMenu(panel)
    await clickInView(panel.locator('.rehearsal-routes-more [data-route]').first())
    await page.waitForTimeout(400)
    const crossRoute = await panel.getByRole('button', { name: /正文已有另一条走法的待处理试稿/ }).count()
    const stealthDraft = await panel.getByRole('button', { name: '写成试稿', exact: true }).count()
    check(`R5 ${tag} 切路后标注异源稿且不覆盖`, crossRoute === 1 && stealthDraft === 0, JSON.stringify({ crossRoute, stealthDraft }))
    await page.screenshot({ path: path.join(OUT_DIR, `rehearsal-${tag}-draft.png`) })

    // R7（1440）：第二路承接、不串路、回应整段可读、建议是具体动作。
    if (width === 1440) {
      const routeA = advisory.length
      await clickInView(panel.locator('[data-route-root]'))
      await page.waitForTimeout(250)
      await submit(panel, '把缺页直接摊给艾德加看')
      await panel.locator('.rehearsal-steps li').first().waitFor({ timeout: 30000 })
      await submit(panel, '请艾德加自己决定要不要看')
      await panel.locator('.rehearsal-steps li').nth(1).waitFor({ timeout: 30000 })
      await page.waitForTimeout(300)
      const routeBRequests = advisory.slice(routeA).map((item) => item.question)
      check('R7 1440 第二路两步各带前一步', routeBRequests.length === 2
        && routeBRequests[1].includes('把缺页直接摊给艾德加看'), JSON.stringify(routeBRequests.map((item) => item.slice(-60))))
      check('R7 1440 另一路不串入当前路内容', routeBRequests.every((item) => !item.includes('换成直接摊牌')), '')
      const story = await page.evaluate(() => {
        const responses = [...document.querySelectorAll('.rehearsal-response')]
        const options = [...document.querySelectorAll('.rehearsal-options button')].map((button) => button.textContent.trim())
        const first = responses[0]
        return {
          paragraphs: first ? first.querySelectorAll('p').length : 0,
          clamped: first ? getComputedStyle(first).webkitLineClamp : null,
          truncated: first ? first.scrollHeight > first.clientHeight + 2 : false,
          options,
          changeHidden: [...document.querySelectorAll('.rehearsal-consequence')].every((node) => !node.open)
        }
      })
      check('R7 1440 人物回应整段可读不被截断', story.paragraphs >= 2 && story.clamped === 'none' && story.truncated === false, JSON.stringify(story))
      check('R7 1440 行动是可改后提交的具体动作', story.options.length <= 3 && story.options.every((text) => text.length > 1), JSON.stringify(story.options))
      check('R7 1440 局面变化默认不抢注意力', story.changeHidden === true, JSON.stringify({ changeHidden: story.changeHidden }))
    }

    // R8：推演样式不外溢到其他工具，正文未被试演改写。
    const manuscriptAfter = await manuscriptLength(page)
    check(`R8 ${tag} 正文长度未被试演改写`, Math.abs(manuscriptAfter - manuscriptBefore) <= 40,
      JSON.stringify({ before: manuscriptBefore, after: manuscriptAfter }))
    await page.locator('[data-authoring-tool="characters"]').click()
    await page.waitForTimeout(500)
    const afterTool = await page.evaluate(() => {
      const main = document.querySelector('.wall__main')
      const inspector = document.querySelector('.writing-inspector')
      const panelEl = document.querySelector('[data-test="rehearsal-panel"]')
      return {
        sequential: main?.classList.contains('has-sequential-inspector'),
        inspectorPosition: inspector ? getComputedStyle(inspector).position : null,
        rehearsalPanel: Boolean(panelEl),
        catalogueVisible: Boolean(document.querySelector('.writing-inspector__body--catalog, [data-authoring-inspector]'))
      }
    })
    check(`R8 ${tag} 切换工具后推演布局不残留`, afterTool.sequential === false && afterTool.rehearsalPanel === false, JSON.stringify(afterTool))
    check(`R8 ${tag} 其他工具面板仍可用`, afterTool.catalogueVisible === true, JSON.stringify(afterTool))

    check(`R1 ${tag} 无页面错误`, errors.length === 0, errors.join(' | '))
    await context.close()
  }

  // L5：已冻结的试演不能在设定被其他页面改写后继续使用旧资料。
  // storage 事件模拟另一个浏览器标签页完成保存；提交应在请求模型前被
  // manifest revision 门禁拦住，旧路线只读保留。
  {
    const context = await seed(browser, { width: 1440, height: 900 })
    const page = await context.newPage()
    await installDeterministicProviderMock(page, { passiveInline: false, blockText: PROSE })
    const { panel, advisory } = await openRehearsal(page)
    const callsBefore = advisory.length
    const changedEntryId = state.characterEntryIds[0]
    await page.evaluate(({ worldbookId, entryId }) => {
      const key = `worldbook_${worldbookId}`
      const worldbook = JSON.parse(localStorage.getItem(key) || '{}')
      const entry = (worldbook.entries || []).find((item) => String(item.id) === String(entryId))
      if (!entry) throw new Error(`missing worldbook entry ${entryId}`)
      const revision = String(Date.now() + 10000)
      entry.content = `${String(entry.content || '')}\n外部标签页补充：此人拒绝在钟响后进入暗格。`
      entry.metadata = { ...(entry.metadata || {}), updatedAt: revision }
      entry.updatedAt = revision
      worldbook.updatedAt = revision
      const nextValue = JSON.stringify(worldbook)
      localStorage.setItem(key, nextValue)
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: nextValue }))
    }, { worldbookId: state.worldbookId, entryId: changedEntryId })
    await page.waitForTimeout(700)
    await panel.getByLabel('试演行动').fill('让莉娜继续追问艾德加')
    await panel.getByRole('button', { name: '试演', exact: true }).click()
    await panel.locator('.rehearsal-stale').waitFor({ state: 'visible', timeout: 10000 })
    const stale = await panel.locator('.rehearsal-stale').innerText()
    check('L5 1440 设定外部更新后冻结试演阻止续跑', stale.includes('正文或参考已变化') && advisory.length === callsBefore,
      JSON.stringify({ stale, callsBefore, callsAfter: advisory.length }))
    await context.close()
  }
} finally {
  await browser.close()
}

const failed = results.filter((item) => !item.pass)
console.log(`\n[rehearsal-panel] pass: ${results.length - failed.length}/${results.length}`)
fs.writeFileSync(path.join(OUT_DIR, 'rehearsal-panel-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results, failed: failed.map((item) => item.label) }, null, 2))
process.exit(failed.length ? 1 : 0)
