/* eslint-disable no-console */
// P2 真实模型小样本：三场场景 × 两路 × 两步 = 12 次真实推演请求（可选 +3 次真实试稿）。
// 行动全部写明行动者与对象；另含一条歧义输入检查（UI 拦截，不自动猜对象）。
// 不建设评测平台；原始输出原样保存供人工判读。前置：本地后端 3001 已注入
// MINIMAX_API_KEY，前端 5198；脚本不打印、不保存密钥（客户端仅用哨兵 key）。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../..')
const BASE = process.env.BASE || 'http://127.0.0.1:5198'
const OUT_DIR = path.resolve(process.env.OUT_DIR || '/tmp/pinax-rehearsal-polish/p2')
const FIXTURE_DIR = path.resolve(process.env.FIXTURE_DIR || 'tmp/authoring-context-closure')
const WITH_DRAFT = process.env.REAL_DRAFT === '1'
fs.mkdirSync(OUT_DIR, { recursive: true })
const state = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-state.json'), 'utf8'))
const sourceStorage = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'fixture-localstorage.json'), 'utf8'))

const MODEL = process.env.REAL_MODEL || 'MiniMax-Text-01'
const BASEURL = process.env.REAL_BASEURL || 'https://api.minimaxi.com/anthropic'
const results = []
function note(line) {
  results.push(line)
  console.log(line)
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

// 三类场景（P2-4）：所有行动写清行动者与对象。
const SCENARIOS = [
  {
    id: 'conceal', label: '隐瞒或坦白：关系代价',
    routeA: ['莉娜把缺页的事先瞒下来，独自去查暗格', '莉娜对艾德加坚持说自己在对账'],
    routeB: ['莉娜把缺页直接摊在艾德加面前', '莉娜向艾德加坦白自己昨夜独自下过档案室']
  },
  {
    id: 'cooperate', label: '合作或拒绝：利益冲突',
    routeA: ['莉娜请艾德加一起守夜，共享线索', '莉娜把黄铜钥匙交给艾德加保管一夜'],
    routeB: ['莉娜谢绝艾德加的帮忙，自己守住暗格', '莉娜请艾德加离开档案室，只守住门口']
  },
  {
    id: 'probe', label: '追问或离开：信息取舍（含歧义输入检查）',
    routeA: ['莉娜追问艾德加对总册知道多少', 'AMBIGIOUS:追问他昨夜为何不在档案室外'],
    routeB: ['莉娜不再追问，转身回楼上避开风头', '莉娜留下钥匙和字条，暂时离开税务所']
  }
]
// 凭空人物启发检查：这些角色词出现在回应里即标记（fixture 世界无这些在场人物）。
const INVENTED_ROLE_WORDS = /抄表员|水手|船长|老板|侍者|职员|陌生人|年轻人|老者|卫兵|店员/

const browser = await chromium.launch()
const raw = []
const problems = []
try {
  for (const scenario of SCENARIOS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await context.addInitScript(({ snapshot, model, baseUrl }) => {
      localStorage.clear()
      for (const [key, value] of Object.entries(snapshot)) localStorage.setItem(key, value)
      localStorage.setItem('app_theme_variant', 'legacy')
      localStorage.setItem('app_theme', 'light')
      localStorage.setItem('app_ui_zoom', '1')
      localStorage.setItem('text_model_configs', JSON.stringify([{
        id: 'p2-real-provider',
        name: 'P2 real sample (MiniMax)',
        providerId: 'MiniMax',
        provider: 'MiniMax',
        baseUrl,
        apiKey: 'minimax-server-key',
        model
      }]))
      localStorage.setItem('text_model_selected', 'p2-real-provider')
      localStorage.setItem('pinax_agent_runtime_policy_v1', JSON.stringify({ enabled: true, passiveHints: { 'writing-inline': false }, minIntervalsMs: { 'writing-inline': 0 } }))
    }, { snapshot: SNAPSHOT, model: MODEL, baseUrl: BASEURL })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)))
    const stepQuestions = []
    await page.route('**/api/advisor/task', async (route) => {
      const payload = route.request().postDataJSON?.() || {}
      if (payload.taskType === 'authoring.rehearsal.step') stepQuestions.push(payload.question)
      return route.continue()
    })
    await page.goto(`${BASE}/authoring?bookId=${state.bookId}&chapterId=${state.targetChapterId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ProseMirror', { timeout: 30000 })
    const unit = page.locator(`[data-writing-unit][data-unit-id="${state.targetUnitId}"]`)
    await unit.waitFor({ state: 'visible' })
    await unit.locator('p').first().click({ position: { x: 80, y: 10 } })
    await page.waitForTimeout(300)
    // 现场加入艾德加并保存：投影携带在场人物（P2-2 白名单来源）。
    await page.locator('.wall__shelf-scene [data-test="scene-edit"]').dispatchEvent('click')
    const inspector = page.locator('.writing-inspector.is-open')
    await inspector.locator('.scene-curation').waitFor({ state: 'visible' })
    const edgarLi = inspector.locator('.scene-curation__people li').filter({ hasText: '艾德加' }).first()
    await edgarLi.locator('.scene-curation__person-toggle').click()
    await edgarLi.getByRole('button', { name: '加入当前场' }).click()
    await inspector.locator('[data-test="curation-save"]').click()
    await page.waitForTimeout(1000)
    await page.locator('[data-authoring-tool="rehearsal"]').click()
    const panel = page.locator('[data-test="rehearsal-panel"]')
    await panel.getByRole('button', { name: '从当前段落开始', exact: true }).click()
    await panel.getByLabel('试演行动').waitFor({ timeout: 60000 })

    async function submit(action) {
      await panel.getByLabel('试演行动').fill(action)
      await panel.getByRole('button', { name: '试演', exact: true }).click()
    }
    async function readStep(index) {
      await panel.locator('.rehearsal-steps li').nth(index).waitFor({ timeout: 120000 })
      await page.waitForTimeout(400)
      await panel.locator('.rehearsal-consequence').evaluateAll((nodes) => {
        nodes.forEach((node) => { node.open = true })
      })
      await page.waitForTimeout(150)
      return page.evaluate((i) => {
        const item = document.querySelectorAll('.rehearsal-steps li')[i]
        return {
          action: item.querySelector('.rehearsal-step-action')?.innerText?.trim(),
          response: item.querySelector('.rehearsal-response')?.innerText?.trim(),
          change: item.querySelector('.rehearsal-consequence p')?.innerText?.trim(),
          choices: [...item.closest('.rehearsal-flow').querySelectorAll('.rehearsal-options button span')].map((node) => node.textContent.trim())
        }
      }, index)
    }

    const entry = { id: scenario.id, label: scenario.label, routes: {}, ambiguiltyCheck: null, errors }
    let questionIndex = 0
    for (const route of ['A', 'B']) {
      if (route === 'B') {
        // 路 B 必须从起点另试：归档路 A，回起点后重新两步。
        const backToRoot = panel.locator('[data-route-root]')
        await backToRoot.waitFor({ timeout: 15000 })
        await backToRoot.click()
        await page.waitForTimeout(400)
      }
      entry.routes[route] = []
      for (const [stepIndex, rawAction] of scenario[`route${route}`].entries()) {
        const isAmbiguous = rawAction.startsWith('AMBIGIOUS:')
        const action = isAmbiguous ? rawAction.slice('AMBIGIOUS:'.length) : rawAction
        await panel.getByLabel('试演行动').fill(action)
        await page.waitForTimeout(200)
        if (isAmbiguous) {
          // P2-4 歧义输入检查：代词指向不明时必须被拦下，点名后才可提交。
          const guard = await page.evaluate(() => ({
            hint: document.querySelector('.rehearsal-ambiguous')?.textContent.trim() || '',
            submitDisabled: [...document.querySelectorAll('.rehearsal-dock-actions button')].find((node) => node.textContent.includes('试演'))?.disabled
          }))
          entry.ambiguiltyCheck = { action, ...guard }
          if (!guard.submitDisabled) problems.push(`${scenario.id}/${route}/step${stepIndex + 1}: 歧义行动未被拦截，可能自动猜了对象`)
          await panel.locator('[aria-label="动作对象"] .rehearsal-cast-person').first().click()
          await page.waitForTimeout(200)
        }
        const declaredActor = (await page.evaluate(() => [...document.querySelectorAll('.rehearsal-cast [aria-pressed="true"]')].map((node) => node.textContent.trim())))[0] || ''
        await panel.getByRole('button', { name: '试演', exact: true }).click()
        const step = await readStep(entry.routes[route].length)
        step.declaredActor = declaredActor
        const question = stepQuestions[questionIndex]
        questionIndex += 1
        step.requestCast = question?.match(/在场人物（[^）]*）：(.+)\n/)?.[1] || ''
        entry.routes[route].push(step)
      }
    }
    entry.currentRouteId = await panel.evaluate((el) => el.dataset.currentRoute)
    await page.screenshot({ path: path.join(OUT_DIR, `p2-${scenario.id}.png`) })
    raw.push(entry)

    // P2-5 真实试稿（每场一条，当前路）：只在显式开启时执行。
    if (WITH_DRAFT) {
      await panel.getByRole('button', { name: '写成试稿', exact: true }).click()
      const draft = page.locator('[data-test="block-draft"]')
      // 真实 narrative 链是两段流式（规划+正文），实测约 30–60s；流式偶发停滞，
      // 超时后丢弃一次并重试。
      let draftDone = true
      try {
        await draft.waitFor({ timeout: 300000 })
      } catch {
        draftDone = false
      }
      if (!draftDone) {
        const discard = page.getByRole('button', { name: '丢弃' })
        if (await discard.count()) await discard.click()
        await page.waitForTimeout(500)
        await panel.getByRole('button', { name: '写成试稿', exact: true }).click()
        try {
          await draft.waitFor({ timeout: 300000 })
        } catch {
          entry.draft = { error: (await panel.innerText()).slice(-200) }
          problems.push(`${scenario.id}: 真实试稿重试后仍未返回——${entry.draft.error.slice(0, 80)}`)
          await context.close()
          continue
        }
      }
      await page.waitForTimeout(800)
      const draftText = await draft.locator('textarea').inputValue()
      entry.draft = { text: draftText }
      if (/局面变化|第 \d 步|假想/.test(draftText)) problems.push(`${scenario.id}: 试稿混入了步骤说明或局面变化标签`)
      await page.screenshot({ path: path.join(OUT_DIR, `p2-${scenario.id}-draft.png`) })
    }
    await context.close()
  }

  note(`rehearsal requests total: ${raw.reduce((sum, item) => sum + item.routes.A.length + item.routes.B.length, 0)}`)

  // —— 结构化初检（启发式；语义判断仍需人工）——
  const WHITELIST = ['莉娜', '艾德加']
  for (const scenario of raw) {
    for (const route of ['A', 'B']) {
      scenario.routes[route].forEach((step, index) => {
        const tag = `${scenario.id}/${route}/step${index + 1}`
        if (INVENTED_ROLE_WORDS.test(step.response || '')) problems.push(`${tag}: 回应出现疑似凭空人物（角色词命中）`)
        if (INVENTED_ROLE_WORDS.test(step.change || '')) problems.push(`${tag}: 变化出现疑似凭空人物（角色词命中）`)
        for (const choice of step.choices || []) {
          if (choice.includes('可试的具体行动')) problems.push(`${tag}: 建议带格式前缀——“${choice.slice(0, 24)}”`)
          if (!WHITELIST.some((name) => choice.startsWith(name))) problems.push(`${tag}: 建议未写明执行者——“${choice.slice(0, 24)}”`)
        }
        if (index === 1 && step.change && !/钥匙|门口|暗格|总册|楼梯|门|字条|知道|看见|拿|交给|留在|答应|拒绝|离开|站|收下|放回/.test(step.change)) {
          problems.push(`${tag}: 变化疑似态度总结而非可观察事实——“${step.change.slice(0, 40)}”`)
        }
      })
    }
    const ambiguity = scenario.ambiguiltyCheck
    if (ambiguity && !/(指向谁|交给谁回应)/.test(ambiguity.hint)) problems.push(`${scenario.id}: 歧义提示缺失`)
  }
  fs.writeFileSync(path.join(OUT_DIR, 'raw.json'), JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, baseUrl: BASEURL, withDraft: WITH_DRAFT, scenarios: raw, problems }, null, 2))
  const md = ['# P2 真实模型推演小样本 · 原始输出', '', `模型：${MODEL}（${BASEURL}）`, '', '> 行动者/对象已写入请求；歧义输入检查见 probe 场；在场人物白名单已随请求归档。', '']
  for (const scenario of raw) {
    md.push(`## ${scenario.label}（${scenario.id}）`, '')
    if (scenario.ambiguiltyCheck) {
      md.push(`**歧义输入检查**：输入「${scenario.ambiguiltyCheck.action}」→ ${scenario.ambiguiltyCheck.submitDisabled ? '已被拦截（提交禁用）' : '未被拦截！'}，提示：${scenario.ambiguiltyCheck.hint}`, '')
    }
    for (const route of ['A', 'B']) {
      md.push(`### 路 ${route}`, '')
      scenario.routes[route].forEach((step, index) => {
        md.push(`**第 ${index + 1} 步 · 行动者 ${step.declaredActor}**：${step.action}`, '', `**人物回应**：`, '', step.response, '', `**局面变化**：${step.change || '（无）'}`, '', `**建议**：${(step.choices || []).join(' / ') || '（无）'}`, '', '---', '')
      })
    }
    if (scenario.draft) {
      md.push(`### 真实试稿（当前路）`, '', scenario.draft.text, '', '---', '')
    }
  }
  md.push('## 结构化初检（启发式）', '', problems.length ? problems.map((item) => `- ${item}`).join('\n') : '（启发式无命中；行动者归属/承接/人物能动性仍需人工判读）')
  fs.writeFileSync(path.join(OUT_DIR, 'p2-report.md'), md.join('\n'))
  note(`structural pre-check problems: ${problems.length}`)
  for (const problem of problems) note(`  - ${problem}`)
  note(`raw outputs: ${OUT_DIR}/raw.json + p2-report.md`)
} finally {
  await browser.close()
}
