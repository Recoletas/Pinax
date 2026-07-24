import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.UI_AUDIT_BASE_URL || `http://127.0.0.1:${process.env.PORT || '5173'}`
const outputDir = resolve(process.env.UI_AUDIT_OUTPUT || '/tmp/pinax-ui-audit')
const requestedWidths = String(process.env.UI_AUDIT_WIDTHS || '1440,1280,980,760,390')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter(Number.isFinite)
const requestedStates = String(process.env.UI_AUDIT_STATES || 'empty')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => ['empty', 'regular', 'long', 'loading', 'error'].includes(value))
const requestedRoutes = new Set(String(process.env.UI_AUDIT_ROUTES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean))

const routes = [
  { id: 'experience', path: '/experience', surfaces: ['.ws-layout', '.ws-center-stage', '.ws-right-rail'] },
  { id: 'writing', path: '/writing', surfaces: ['.writing-page', '.manuscript-body'] },
  { id: 'materials', path: '/materials', surfaces: ['.notes-content-area', '.material-drawer', '.reading-deck', '.notes-sidekick'] },
  { id: 'prose-essay', path: '/prose-essay', surfaces: ['.prose-essay-page', '.pe-main', '.card-wall', '.left-panel'] },
  { id: 'comics', path: '/comics', surfaces: ['.comic-studio__workspace', '.comic-studio__canvas', '.comic-studio__inspector'] },
  { id: 'settings-worldbook', path: '/settings/worldbook', surfaces: ['main', '.worldbook-page'] },
  { id: 'settings-structured', path: '/settings/structured', surfaces: ['main', '.structured-settings'] },
  { id: 'settings-world-map', path: '/settings/world-map', surfaces: ['main', '.world-map-page'] }
]

const activeRoutes = requestedRoutes.size
  ? routes.filter((route) => requestedRoutes.has(route.id))
  : routes

function makeFixture(state) {
  if (state === 'empty') return {}
  const long = state === 'long'
  const repeat = long ? 16 : 2
  const passage = '雾港的潮声穿过旧仓库，陆晨曦在褪色航海图上标出信号出现的位置。'
  const longPassage = Array.from({ length: repeat }, (_, index) => `${index + 1}. ${passage}`).join('\n\n')
  const manuscriptPassage = Array.from({ length: long ? 84 : 8 }, (_, index) => (
    `第 ${index + 1} 段　${passage}她沿着潮痕继续核对航道编号，直到远处灯塔的轮廓从雾中显现。`
  )).join('\n\n')
  const now = 1_788_883_200_000
  const assets = [
    ['asset-event', 'event', '雾港信号', longPassage],
    ['asset-character', 'character-fact', '陆晨曦的判断', `陆晨曦确认信号并非自然回波。\n\n${long ? longPassage : passage}`],
    ['asset-prose', 'draft-prose', '仓库中的回声', `“灯塔已经熄灭十七年了。”\n\n${longPassage}`],
    ['asset-world', 'worldbook-draft', '旧港航道', `旧港由三条废弃航道相连。\n\n${long ? longPassage : passage}`]
  ].map(([id, kind, title, content], index) => ({
    id,
    schemaVersion: 1,
    projectId: 'audit-project',
    source: { type: 'ui-audit', id: state },
    sourceRefs: [],
    contentHash: `audit-${id}`,
    kind,
    title,
    content,
    status: 'accepted',
    image: null,
    embeddedImagePresentations: {},
    createdAt: now - index * 1000,
    updatedAt: now - index * 1000
  }))
  const cards = assets.slice(0, long ? 4 : 2).map((asset, index) => ({
    id: `card-${index + 1}`,
    assetId: asset.id,
    projectId: 'audit-project',
    content: asset.content,
    label: asset.title,
    emotion: index % 2 ? 'tense' : 'calm',
    x: 72 + (index % 2) * 300,
    y: 72 + Math.floor(index / 2) * 220,
    createdAt: now - index * 1000,
    updatedAt: now - index * 1000,
    extraFields: {
      shotType: index % 2 ? 'close_up' : 'wide',
      cameraMovement: index % 2 ? 'push_in' : 'fixed',
      duration: 4 + index,
      dialogue: index === 1 ? '灯塔已经熄灭十七年了。' : ''
    }
  }))
  const messages = [
    { id: 'audit-a1', role: 'assistant', content: `:::narration\n${passage}\n:::dialogue|陆晨曦\n“信号又出现了。”` },
    { id: 'audit-u1', role: 'user', content: '检查航海图上的旧航道。' },
    { id: 'audit-a2', role: 'assistant', content: `:::action|陆晨曦\n她把航海图推到灯下。\n:::dialogue|陆晨曦\n“它正沿着废弃航道移动。”\n:::thought|陆晨曦\n也许有人仍在使用那座灯塔。` }
  ]
  if (long) {
    for (let index = 0; index < 10; index += 1) {
      messages.push({
        id: `audit-long-${index}`,
        role: index % 2 ? 'user' : 'assistant',
        content: index % 2 ? `继续追查第 ${index + 1} 条航道记录。` : `:::narration\n${longPassage}\n:::dialogue|陆晨曦\n“第 ${index + 1} 条记录与潮汐时间吻合。”`
      })
    }
  }
  const session = {
    id: 'audit-session',
    schemaVersion: 1,
    title: long ? '雾港信号 · 长会话' : '雾港信号',
    createdAt: now,
    updatedAt: now,
    worldId: '',
    worldbookId: '',
    messages,
    chatHistory: [],
    runtimeState: {
      messages,
      chatHistory: [],
      playerCharacter: { name: 'REco' },
      aiCharacter: { name: '陆晨曦' },
      encounteredCharacters: [{ id: 'lu-chenxi', name: '陆晨曦', role: '引力波工程师' }],
      worldMapState: { currentCountry: '北海联邦', currentCity: '雾港', currentScene: '旧仓库' },
      writingTime: { era: '危机纪元', year: 227, month: 9, day: 15, period: '深夜' }
    }
  }
  const fixture = {
    narrative_assets_v1: assets,
    prose_cards_v1: cards,
    prose_edges_v1: cards.length > 1 ? [{ id: 'edge-1', sourceId: cards[0].id, targetId: cards[1].id, type: 'continuation' }] : [],
    prose_outline_v1: cards.map((card, index) => ({ cardId: card.id, order: index })),
    prose_timeline_v1: cards.map((card, index) => ({ cardId: card.id, order: index, duration: card.extraFields.duration })),
    writing_sessions: [session],
    writing_books: [{
      id: 'audit-book',
      title: '雾港航道档案',
      chapters: [
        {
          id: 'audit-chapter-1',
          title: '潮声中的信号',
          content: manuscriptPassage,
          contentFormat: 'md',
          wordCount: manuscriptPassage.replace(/\s/g, '').length,
          outlineItems: [],
          updatedAt: new Date(now).toISOString()
        },
        {
          id: 'audit-chapter-2',
          title: '熄灭的灯塔',
          content: passage,
          contentFormat: 'md',
          wordCount: passage.replace(/\s/g, '').length,
          outlineItems: [],
          updatedAt: new Date(now - 1000).toISOString()
        }
      ]
    }]
  }
  if (state === 'loading' || state === 'error') {
    fixture.apiSettings = {
      provider: 'openai',
      baseUrl: 'https://audit.invalid/v1',
      apiKey: 'audit-key',
      model: 'audit-model'
    }
  }
  return fixture
}

function rectangle(box) {
  if (!box) return null
  return Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']
    .map((key) => [key, Math.round(box[key] * 100) / 100]))
}

async function installThemeFixture(page, state) {
  await page.addInitScript(({ fixture, fixtureState }) => {
    const fixtureKeys = [
      'narrative_assets_v1',
      'prose_cards_v1',
      'prose_edges_v1',
      'prose_outline_v1',
      'prose_timeline_v1',
      'writing_sessions',
      'writing_books',
      'apiSettings'
    ]
    fixtureKeys.forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', 'light')
    localStorage.setItem('pinax_ui_audit_state', fixtureState)
    Object.entries(fixture).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)))
  }, { fixture: makeFixture(state), fixtureState: state })
}

function supportsActionState(route, state) {
  return !['loading', 'error'].includes(state) || route.id === 'prose-essay'
}

async function installActionScenario(page, state) {
  if (!['loading', 'error'].includes(state)) return
  await page.route('**/api/generate', async (requestRoute) => {
    if (state === 'loading') {
      await new Promise(() => {})
      return
    }
    await requestRoute.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '审计模拟：生成服务暂时不可用' })
    })
  })
}

async function triggerActionScenario(page, state) {
  if (!['loading', 'error'].includes(state)) return null
  await page.locator('.prose-top__input').fill('雾港信号沿废弃航道回荡')
  await page.locator('.prose-top__chip--generate').click()
  if (state === 'loading') {
    await page.locator('.prose-top__chip--generate:disabled').waitFor({ state: 'visible' })
    return { assertion: 'generate button disabled while request is pending', passed: true }
  }
  await page.locator('[role="alert"] .prose-generation-feedback__mark').waitFor({ state: 'visible' })
  return { assertion: 'visible alert after failed generation request', passed: true }
}

async function inspectPage(page, surfaceSelectors) {
  return page.evaluate((selectors) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const visible = (element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && box.width > 0 && box.height > 0
    }
    const summarize = (element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: typeof element.className === 'string' ? element.className.slice(0, 160) : null,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        box: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left
        }
      }
    }

    const surfaces = Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector)
      return [selector, element ? summarize(element) : null]
    }))
    const clipped = [...document.querySelectorAll('main, aside, section, nav, button, input, textarea, [role="button"]')]
      .filter(visible)
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.right > viewport.width + 1 || box.left < -1 || box.bottom > viewport.height + 1 || box.top < -1
      })
      .slice(0, 80)
      .map(summarize)
    const edgeLayers = [...document.querySelectorAll('*')]
      .filter(visible)
      .filter((element) => ['fixed', 'sticky'].includes(getComputedStyle(element).position))
      .slice(0, 50)
      .map(summarize)
    const edgeOverlaps = []
    for (let index = 0; index < edgeLayers.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < edgeLayers.length; nextIndex += 1) {
        const first = edgeLayers[index]
        const second = edgeLayers[nextIndex]
        const overlaps = first.box.left < second.box.right
          && first.box.right > second.box.left
          && first.box.top < second.box.bottom
          && first.box.bottom > second.box.top
        if (overlaps) edgeOverlaps.push({ first, second })
        if (edgeOverlaps.length >= 30) break
      }
      if (edgeOverlaps.length >= 30) break
    }

    return {
      viewport,
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight
      },
      surfaces,
      clipped,
      edgeLayers,
      edgeOverlaps
    }
  }, surfaceSelectors)
}

async function run() {
  await mkdir(outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    theme: { variant: 'legacy', colorScheme: 'light' },
    states: requestedStates,
    entries: []
  }

  try {
    for (const state of requestedStates) {
      for (const width of requestedWidths) {
        const context = await browser.newContext({ viewport: { width, height: width <= 760 ? 844 : 900 } })
        for (const route of activeRoutes) {
        if (!supportsActionState(route, state)) continue
        const page = await context.newPage()
        const consoleErrors = []
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text())
        })
        page.on('pageerror', (error) => consoleErrors.push(error.message))
        await installThemeFixture(page, state)
        await installActionScenario(page, state)
        const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'commit', timeout: 30_000 })
        await page.locator(route.surfaces[0]).waitFor({ state: 'attached', timeout: 30_000 })
        await page.waitForTimeout(700)
        const actionScenario = await triggerActionScenario(page, state)
        const metrics = await inspectPage(page, route.surfaces)
        const screenshot = `${route.id}-${state}-${width}.png`
        const screenshotWarnings = []
        try {
          await page.screenshot({ path: resolve(outputDir, screenshot), fullPage: false, timeout: 12_000 })
        } catch (error) {
          if (error?.name !== 'TimeoutError') throw error
          screenshotWarnings.push('Font loading exceeded 12s; captured with system font fallback.')
          await page.evaluate(() => {
            if (document.fonts) {
              for (const face of [...document.fonts]) document.fonts.delete(face)
            }
            const fallback = document.createElement('style')
            fallback.dataset.uiAuditFontFallback = 'true'
            fallback.textContent = '* { font-family: system-ui, sans-serif !important; }'
            document.head.appendChild(fallback)
          })
          const cdp = await context.newCDPSession(page)
          const capture = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false
          })
          await writeFile(resolve(outputDir, screenshot), Buffer.from(capture.data, 'base64'))
          await cdp.detach()
        }
        report.entries.push({
          route: route.id,
          path: route.path,
          state,
          width,
          status: response?.status() ?? null,
          screenshot,
          consoleErrors,
          expectedConsoleErrors: state === 'error',
          actionScenario,
          screenshotWarnings,
          ...metrics
        })
        await page.close()
        }
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  const normalized = JSON.parse(JSON.stringify(report), (_key, value) => {
    if (value && typeof value === 'object' && 'x' in value && 'width' in value) return rectangle(value)
    return value
  })
  await writeFile(resolve(outputDir, 'report.json'), `${JSON.stringify(normalized, null, 2)}\n`)
  const errorCount = report.entries.reduce((sum, entry) => (
    entry.expectedConsoleErrors ? sum : sum + entry.consoleErrors.length
  ), 0)
  process.stdout.write(`UI audit: ${report.entries.length} captures, ${errorCount} unexpected console errors -> ${outputDir}\n`)
  if (errorCount > 0) process.exitCode = 1
}

run().catch((error) => {
  console.error('UI audit failed:', error)
  process.exit(1)
})
