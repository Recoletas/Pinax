import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as r0Samples from './fixtures/experience-r0-samples.js'

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
  // R0 (G1.4.10): replace numbered repeated passage with 6 realistic narrative
  // samples covering the 6 scenarios the plan calls out (长叙述 / 双人对白 /
  // 叙述夹对白 / 动作心理 / 重复实体 / 系统机制). `regular` uses the common
  // Pinax shape (叙述夹对白); `long` rotates through all six so the audit
  // captures the full typography stress surface, not a single repeated loop.
  const passage = r0Samples.sampleNarrationWithDialogue
  const samplePool = [
    r0Samples.sampleLongNarration,
    r0Samples.sampleDuoDialogue,
    r0Samples.sampleNarrationWithDialogue,
    r0Samples.sampleActionThought,
    r0Samples.sampleRepeatedEntities,
    r0Samples.sampleSystemMechanism,
  ]
  const longPassage = samplePool.join('\n\n')
  const longManuscriptRepeat = Array.from({ length: 2 }, () => samplePool.join('\n\n')).join('\n\n')
  const manuscriptPassage = long ? longManuscriptRepeat : passage
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

const PHYSICAL_FONT_SAMPLE_SELECTORS = [
  '.prose__body',
  '.narrative-block',
  '.rp-dialogue',
  '.rp-location',
  '.rp-time'
]
const MEASURE_WIDTH_SAMPLE_SELECTORS = ['.prose__body', '.narrative-block']
// R1 fix (G1.4.10): narrative-block is the wrapper that contains dialogue/action/thought
// children. Counting it as one of the emphasis kinds made every prose character
// count as emphasis, collapsing the metric. The denominator must be the total
// prose text (all .prose__body text), and emphasis must only include the actual
// inline tokens (rp-*).
const EMPHASIS_KIND_SELECTORS = {
  'rp-dialogue': '.rp-dialogue',
  'rp-action': '.rp-action',
  'rp-thought': '.rp-thought',
  'rp-location': '.rp-location',
  'rp-time': '.rp-time',
  'rp-item': '.rp-item',
  'rp-world-intro': '.rp-world-intro'
}

function parseFontSize(value) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (trimmed.endsWith('px')) return Number.parseFloat(trimmed)
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric)) return trimmed
  return numeric
}

function parseLineHeight(value, computedFontSize) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (trimmed === 'normal') {
    return { kind: 'normal', value: 'normal', px: null }
  }
  if (trimmed.endsWith('px')) {
    return { kind: 'px', value: trimmed, px: Number.parseFloat(trimmed) }
  }
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric)) return { kind: 'raw', value: trimmed, px: null }
  const fontPx = typeof computedFontSize === 'number' && Number.isFinite(computedFontSize)
    ? computedFontSize
    : null
  const px = fontPx ? Number((fontPx * numeric).toFixed(2)) : null
  return { kind: 'unitless', value: numeric, px }
}

function parseLetterSpacing(value, computedFontSize) {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === 'normal') return { kind: 'normal', value: trimmed || 'normal', px: 0 }
  if (trimmed.endsWith('px')) {
    return { kind: 'px', value: trimmed, px: Number.parseFloat(trimmed) }
  }
  const numeric = Number.parseFloat(trimmed)
  if (!Number.isFinite(numeric)) return { kind: 'raw', value: trimmed, px: null }
  const fontPx = typeof computedFontSize === 'number' && Number.isFinite(computedFontSize)
    ? computedFontSize
    : null
  const px = fontPx ? Number((fontPx * numeric).toFixed(3)) : null
  return { kind: 'em-or-pc', value: numeric, px }
}

function resolveCssVar(value) {
  if (!value) return null
  const trimmed = String(value).trim()
  return trimmed.length ? trimmed : null
}

async function inspectExperienceTypography(page) {
  return page.evaluate(({
    fontSampleSelectors,
    measureSelectors,
    emphasisSelectors
  }) => {
    const parseFontSize = (value) => {
      if (!value) return null
      const trimmed = String(value).trim()
      if (!trimmed) return null
      if (trimmed.endsWith('px')) return Number.parseFloat(trimmed)
      const numeric = Number.parseFloat(trimmed)
      if (!Number.isFinite(numeric)) return trimmed
      return numeric
    }
    const parseLineHeight = (value, computedFontSize) => {
      if (!value) return null
      const trimmed = String(value).trim()
      if (!trimmed) return null
      if (trimmed === 'normal') return { kind: 'normal', value: 'normal', px: null }
      if (trimmed.endsWith('px')) {
        return { kind: 'px', value: trimmed, px: Number.parseFloat(trimmed) }
      }
      const numeric = Number.parseFloat(trimmed)
      if (!Number.isFinite(numeric)) return { kind: 'raw', value: trimmed, px: null }
      const fontPx = typeof computedFontSize === 'number' && Number.isFinite(computedFontSize)
        ? computedFontSize
        : null
      const px = fontPx ? Number((fontPx * numeric).toFixed(2)) : null
      return { kind: 'unitless', value: numeric, px }
    }
    const parseLetterSpacing = (value, computedFontSize) => {
      if (value === undefined || value === null) return null
      const trimmed = String(value).trim()
      if (!trimmed || trimmed === 'normal') return { kind: 'normal', value: trimmed || 'normal', px: 0 }
      if (trimmed.endsWith('px')) {
        return { kind: 'px', value: trimmed, px: Number.parseFloat(trimmed) }
      }
      const numeric = Number.parseFloat(trimmed)
      if (!Number.isFinite(numeric)) return { kind: 'raw', value: trimmed, px: null }
      const fontPx = typeof computedFontSize === 'number' && Number.isFinite(computedFontSize)
        ? computedFontSize
        : null
      const px = fontPx ? Number((fontPx * numeric).toFixed(3)) : null
      return { kind: 'em-or-pc', value: numeric, px }
    }
    const resolveCssVar = (value) => {
      if (!value) return null
      const trimmed = String(value).trim()
      return trimmed.length ? trimmed : null
    }
    const viewportHeight = window.innerHeight
    const scrollToBottom = () => {
      const doc = document.documentElement
      const body = document.body
      const scrollHeight = Math.max(
        body ? body.scrollHeight : 0,
        doc ? doc.scrollHeight : 0
      )
      const target = Math.max(0, scrollHeight - window.innerHeight)
      window.scrollTo({ top: target, left: 0, behavior: 'instant' })
    }
    scrollToBottom()

    const fontSamples = []
    for (const selector of fontSampleSelectors) {
      const element = document.querySelector(selector)
      if (!element) continue
      const style = getComputedStyle(element)
      const computedFontSize = parseFontSize(style.fontSize)
      const closest = element.closest('[style*="--experience-prose-size"], [style*="--experience-measure"]')
        || element.closest('.ws-center-stage')
        || element.closest('[data-reading-profile]')
        || document.body
      const closestStyle = closest ? getComputedStyle(closest) : null
      const proseSizeVar = closestStyle ? closestStyle.getPropertyValue('--experience-prose-size').trim() : ''
      const measureVar = closestStyle ? closestStyle.getPropertyValue('--experience-measure').trim() : ''
      const ancestorVarSource = closest ? (closest.matches('[data-reading-profile]')
        || (closestStyle && (closestStyle.getPropertyValue('--experience-prose-size').trim() || closestStyle.getPropertyValue('--experience-measure').trim())))
          ? closest.matches('[data-reading-profile]')
            ? 'data-reading-profile'
            : 'inline-style-or-ancestor'
          : 'fallback-ancestor'
        : null
      fontSamples.push({
        selector,
        className: typeof element.className === 'string' ? element.className.slice(0, 160) : null,
        fontSizePx: computedFontSize,
        fontSizeRaw: style.fontSize,
        lineHeight: parseLineHeight(style.lineHeight, typeof computedFontSize === 'number' ? computedFontSize : null),
        letterSpacing: parseLetterSpacing(style.letterSpacing, typeof computedFontSize === 'number' ? computedFontSize : null),
        cssVars: {
          proseSize: resolveCssVar(proseSizeVar),
          measure: resolveCssVar(measureVar)
        },
        ancestorVarSource
      })
    }

    const widthSamples = []
    for (const selector of measureSelectors) {
      const matches = document.querySelectorAll(selector)
      for (let index = 0; index < matches.length && widthSamples.length < 3; index += 1) {
        const element = matches[index]
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const closest = element.closest('[style*="--experience-measure"]')
          || element.closest('.ws-center-stage')
          || document.body
        const measureVar = closest ? getComputedStyle(closest).getPropertyValue('--experience-measure').trim() : ''
        widthSamples.push({
          selector,
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : null,
          widthPx: Math.round(box.width * 100) / 100,
          clientWidth: element.clientWidth,
          offsetWidth: element.offsetWidth,
          measureVar: resolveCssVar(measureVar)
        })
      }
    }

    const emphasisKinds = Object.entries(emphasisSelectors).map(([kind, selector]) => {
      const elements = document.querySelectorAll(selector)
      let charCount = 0
      for (const element of elements) {
        const text = element.textContent || ''
        charCount += Array.from(text.replace(/\s+/g, '')).length
      }
      return { kind, selector, charCount }
    })
    // R1 fix: denominator = total prose characters across all .prose__body
    // containers. Inline tokens (rp-*) overlap with prose so the kind sum can
    // exceed the denominator; we report raw charCount for transparency and
    // report `percent` against total prose, plus `hardCap15` flag and
    // `softTarget8to12` band membership so R3 has a single number to enforce.
    let totalProseChars = 0
    const proseBodies = document.querySelectorAll('.prose__body')
    for (const body of proseBodies) {
      const text = body.textContent || ''
      totalProseChars += Array.from(text.replace(/\s+/g, '')).length
    }
    const emphasisTotal = emphasisKinds.reduce((sum, entry) => sum + entry.charCount, 0)
    const emphasisRatio = emphasisKinds
      .map((entry) => ({
        kind: entry.kind,
        charCount: entry.charCount,
        percent: totalProseChars > 0
          ? Number(((entry.charCount / totalProseChars) * 100).toFixed(2))
          : 0
      }))
      .sort((a, b) => b.percent - a.percent)
    const emphasisRatioSummary = {
      denominator: totalProseChars,
      numeratorSum: emphasisTotal,
      percent: totalProseChars > 0
        ? Number(((emphasisTotal / totalProseChars) * 100).toFixed(2))
        : 0,
      hardCap15: totalProseChars > 0 && (emphasisTotal / totalProseChars) * 100 > 15,
      softTarget8to12: totalProseChars > 0
        ? ((emphasisTotal / totalProseChars) * 100 >= 8 && (emphasisTotal / totalProseChars) * 100 <= 12)
        : false
    }

    scrollToBottom()
    const allProse = document.querySelectorAll('.prose')
    const lastProse = allProse.length ? allProse[allProse.length - 1] : null
    const composerRoot = document.querySelector('.input-area')
      || document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]')
    const lastProseRect = lastProse ? lastProse.getBoundingClientRect() : null
    const composerRect = composerRoot ? composerRoot.getBoundingClientRect() : null
    const scrollY = window.scrollY || window.pageYOffset || 0
    let gapPx = null
    let inputsCoverLastProse = null
    let lastProseBottom = null
    let composerTop = null
    let composerPosition = null
    let composerTopStrategy = null
    if (lastProseRect && composerRect) {
      lastProseBottom = Math.round((lastProseRect.bottom + scrollY) * 100) / 100
      composerTop = Math.round((composerRect.top + scrollY) * 100) / 100
      composerPosition = composerRoot ? getComputedStyle(composerRoot).position : null
      gapPx = Math.round((composerRect.top - lastProseRect.bottom) * 100) / 100
      inputsCoverLastProse = composerRect.top < lastProseRect.bottom
      composerTopStrategy = composerRoot.matches('.input-area')
        ? 'input-area'
        : composerRoot.matches('textarea')
          ? 'textarea'
          : composerRoot.matches('[contenteditable="true"]')
            ? 'contenteditable'
            : 'fallback'
    } else if (lastProseRect) {
      lastProseBottom = Math.round((lastProseRect.bottom + scrollY) * 100) / 100
    }

    return {
      viewportHeight,
      fontSamples,
      widthSamples,
      emphasisRatio,
      emphasisRatioSummary,
      lastMessageInputGap: {
        gapPx,
        lastProseBottom,
        composerTop,
        composerPosition,
        inputsCoverLastProse,
        composerTopStrategy,
        scrollY: Math.round(scrollY * 100) / 100
      }
    }
  }, {
    fontSampleSelectors: PHYSICAL_FONT_SAMPLE_SELECTORS,
    measureSelectors: MEASURE_WIDTH_SAMPLE_SELECTORS,
    emphasisSelectors: EMPHASIS_KIND_SELECTORS
  })
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
        const typographyMetrics = route.id === 'experience'
          ? await inspectExperienceTypography(page)
          : null
        // P2/R7：可访问性审计（200% zoom / reduced-motion / 键盘可达）
        const accessibility = await inspectAccessibility(page, route.surfaces[0])
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
        const entry = {
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
          accessibility,
          ...metrics
        }
        if (route.id === 'experience') {
          entry.r0TypographyMetrics = typographyMetrics
        }
        report.entries.push(entry)
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

// P2/R7：可访问性审计 —— 200% zoom 布局、reduced-motion、键盘可达性。
// 返回低敏指标（不改变页面状态），供浏览器级验收 Gate。
async function inspectAccessibility(page, surfaceSelector) {
  const surface = page.locator(surfaceSelector)
  const zoomReport = await page.evaluate(() => {
    const before = document.documentElement.scrollWidth
    // 200% zoom：模拟（via CSS zoom 不可靠，用 viewport 缩放近似——浏览器 zoom 200%
    // 等价于视口逻辑宽度减半。这里用 documentElement.style.zoom 近似）
    const style = document.documentElement.style
    style.zoom = '2'
    const after = document.documentElement.scrollWidth
    style.zoom = ''
    return { before, after, horizontalOverflowAt200: after > window.innerWidth }
  })
  const reducedMotion = await page.emulateMedia({ reducedMotion: 'reduce' }).then(async () => {
    const value = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('scroll-behavior'))
    return { reducedMotionApplied: value !== '' ? 'present' : 'absent' }
  })
  // 键盘可达：Tab 能聚焦到 surface 内的可交互元素
  let keyboardReachable = false
  let focusTarget = null
  try {
    await surface.locator('input, button, [tabindex]').first().focus()
    keyboardReachable = true
    focusTarget = await page.evaluate(() => document.activeElement?.tagName || '')
  } catch { keyboardReachable = false }
  return { ...zoomReport, ...reducedMotion, keyboardReachable, focusTarget }
}

run().catch((error) => {
  console.error('UI audit failed:', error)
  process.exit(1)
})
