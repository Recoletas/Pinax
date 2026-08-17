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
  .filter((value) => ['empty', 'regular', 'long', 'loading', 'partial', 'error', 'stale', 'cancelled'].includes(value))
const requestedRoutes = new Set(String(process.env.UI_AUDIT_ROUTES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean))

const routes = [
  {
    id: 'experience',
    path: '/experience',
    surfaces: ['.ws-layout', '.ws-center-stage', '.ws-right-rail'],
    keyboardTargets: ['.input-area .input', '.input-area .send-btn', '.prose__actions-trigger']
  },
  { id: 'writing', path: '/writing', surfaces: ['.writing-page', '.manuscript-body'] },
  { id: 'materials', path: '/materials', surfaces: ['.notes-content-area', '.material-drawer', '.reading-deck', '.notes-sidekick'] },
  { id: 'prose-essay', path: '/prose-essay', surfaces: ['.prose-essay-page', '.pe-main', '.card-wall', '.left-panel'] },
  { id: 'comics', path: '/comics', surfaces: ['.comic-studio__workspace', '.comic-studio__canvas', '.comic-studio__inspector'] },
  { id: 'settings-worldbook', path: '/settings/worldbook', surfaces: ['main', '.worldbook-page'] },
  {
    id: 'settings-worldbook-create',
    path: '/settings/worldbook/create?mode=structured-import',
    surfaces: ['.creation-page', '.creation-main'],
    keyboardTargets: ['.creation-page input[type="text"]', '.creation-page textarea', '.creation-page button']
  },
  { id: 'settings-structured', path: '/settings/structured', surfaces: ['main', '.structured-settings'] },
  {
    id: 'settings-worldbook-advanced',
    path: '/settings/worldbook/advanced',
    surfaces: ['main', '.worldbook-page'],
    keyboardTargets: ['.worldbook-page input', '.worldbook-page textarea', '.worldbook-page button']
  },
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
  const structuredSettings = {
    world: {
      origin: '潮汐港建立在不断改道的海湾上，旧灯塔记录着三次迁港。',
      powerSystem: '',
      geography: '港城由外港、旧灯塔和北侧盐沼组成，潮汐会改变可通行航道。',
      history: '十七年前的风暴使旧灯塔停摆，港城随后改用人工巡灯。',
      factions: '',
      rules: ''
    },
    story: { logline: '', concept: '', theme: '', coreConflict: '', mainline: '', sublines: '' },
    characters: { protagonists: '', majorSupporting: '', npcs: '', relationshipSummary: '' },
    creativeRules: { writingStyle: '', perspective: '', tone: '', taboos: '', consistency: '', references: '' }
  }
  const auditWorldbook = {
    id: 'audit-worldbook',
    name: '雾港设定审计本',
    description: '用于结构化设定页 UI 审计',
    worldDescription: '一座被潮汐改写航道的港城。',
    writingStyle: '克制、清晰，保留悬念。',
    examples: '',
    forbidden: '',
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    settings: { scanDepth: 2, tokenBudget: 4096, recursiveScanning: true },
    entries: [],
    entriesMap: {},
    groups: [],
    sourceDocuments: [],
    structuredSettings
  }
  fixture.worldbooks_index = [{
    id: auditWorldbook.id,
    name: auditWorldbook.name,
    description: auditWorldbook.description,
    entryCount: 0,
    createdAt: now,
    updatedAt: now
  }]
  fixture[`worldbook_${auditWorldbook.id}`] = auditWorldbook
  fixture.active_worldbook_id = auditWorldbook.id
  if (['loading', 'error', 'partial', 'stale', 'cancelled'].includes(state)) {
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
      'worldbooks_index',
      'active_worldbook_id',
      'worldbook_audit-worldbook',
      'apiSettings',
      'text_model_configs',
      'text_model_selected'
    ]
    fixtureKeys.forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('app_theme_variant', 'legacy')
    localStorage.setItem('app_theme', 'light')
    localStorage.setItem('pinax_ui_audit_state', fixtureState)
    Object.entries(fixture).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)))
  }, { fixture: makeFixture(state), fixtureState: state })
}

function supportsActionState(route, state) {
  if (['partial', 'stale', 'cancelled'].includes(state)) {
    return state === 'partial'
      ? ['settings-worldbook-create', 'settings-structured'].includes(route.id)
      : route.id === 'settings-structured'
  }
  return !['loading', 'error'].includes(state)
    || ['prose-essay', 'settings-worldbook-create', 'settings-structured'].includes(route.id)
}

async function installActionScenario(page, state) {
  if (!['loading', 'error', 'partial', 'stale', 'cancelled'].includes(state)) return
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
  await page.route('**/api/generate/structured', async (requestRoute) => {
    if (state === 'loading' || state === 'cancelled') {
      await new Promise(() => {})
      return
    }
    if (state === 'stale') {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: {
            origin: '潮汐港建立在不断改道的海湾上，旧灯塔记录着三次迁港。',
            geography: '港城由外港、旧灯塔和北侧盐沼组成，潮汐会改变可通行航道。'
          },
          fieldErrors: {}
        })
      })
      return
    }
    if (state === 'partial') {
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: {
            origin: '潮汐港建立在不断改道的海湾上，旧灯塔记录着三次迁港。',
            geography: '港城由外港、旧灯塔和北侧盐沼组成，潮汐会改变可通行航道。'
          },
          fieldErrors: {
            powerSystem: '审计模拟：该项没有可用草稿。',
            history: '审计模拟：该项没有可用草稿。',
            factions: '审计模拟：该项没有可用草稿。',
            rules: '审计模拟：该项没有可用草稿。'
          }
        })
      })
      return
    }
    await requestRoute.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: '审计模拟：生成服务暂时不可用' })
    })
  })
}

async function triggerActionScenario(page, route, state) {
  if (!['loading', 'partial', 'error', 'stale', 'cancelled'].includes(state)) return null
  if (route.id === 'settings-worldbook-create') {
    await page.locator('.creation-foundation textarea').fill('一座被潮汐改写记忆的港城，创作者希望保持克制而有悬念的叙事。')
    await page.locator('.creation-foundation .primary-action').click()
    if (state === 'loading') {
      await page.locator('.creation-state.is-generating').waitFor({ state: 'visible' })
      return { assertion: 'creation workspace shows generating state while request is pending', passed: true }
    }
    await page.locator('.creation-state.is-error').waitFor({ state: 'visible', timeout: 10_000 })
    return { assertion: 'creation workspace shows recoverable error after failed generation', passed: true }
  }
  if (route.id === 'settings-structured') {
    await page.locator('.section-ai-btn').click()
    if (state === 'loading') {
      await page.locator('.generation-status.is-pending').waitFor({ state: 'visible' })
      return { assertion: 'structured settings shows pending state while request is pending', passed: true }
    }
    if (state === 'partial') {
      const partialStatus = page.locator('.generation-status.is-partial')
      await partialStatus.first().waitFor({ state: 'visible', timeout: 10_000 })
      return {
        assertion: 'structured settings preserves valid drafts and exposes failed fields',
        passed: await partialStatus.count() > 0
          && await page.locator('.generation-failed-fields').count() > 0
      }
    }
    if (state === 'cancelled') {
      await page.locator('.generation-status.is-pending').first().waitFor({ state: 'visible', timeout: 10_000 })
      await page.locator('.section-ai-btn').click()
      await page.locator('.generation-status.is-aborted').first().waitFor({ state: 'visible', timeout: 10_000 })
      return { assertion: 'structured settings shows an explicit cancelled state', passed: true }
    }
    if (state === 'stale') {
      await page.locator('.generation-status.is-pending').first().waitFor({ state: 'visible', timeout: 10_000 })
      const field = page.locator('.setting-field-card textarea').first()
      await field.fill(`${await field.inputValue()}\n审计期间修改，旧草稿不得覆盖。`)
      await page.locator('.generation-status.is-stale').first().waitFor({ state: 'visible', timeout: 10_000 })
      return { assertion: 'structured settings refuses a response made stale by an in-flight edit', passed: true }
    }
    await page.locator('.generation-status.is-error').first().waitFor({ state: 'visible', timeout: 10_000 })
    return { assertion: 'structured settings shows recoverable error after failed generation', passed: true }
  }
  await page.locator('.prose-top__input').fill('雾港信号沿废弃航道回荡')
  await page.locator('.prose-top__chip--generate').click()
  if (state === 'loading') {
    await page.locator('.prose-top__chip--generate:disabled').waitFor({ state: 'visible' })
    return { assertion: 'generate button disabled while request is pending', passed: true }
  }
  await page.locator('[role="alert"] .prose-generation-feedback__mark').waitFor({ state: 'visible' })
  return { assertion: 'visible alert after failed generation request', passed: true }
}

async function triggerRouteScenario(page, route, state, importFixturePath) {
  if (route.id !== 'settings-worldbook-create' || !['regular', 'partial'].includes(state)) return null
  if (state === 'partial') {
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: 'audit-source.txt', mimeType: 'text/plain', buffer: Buffer.from('潮汐港的旧灯塔记录着一段可用资料。\n') },
      { name: 'audit-unsupported.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image') }
    ])
    await page.locator('.creation-state.is-partial').waitFor({ state: 'visible', timeout: 10_000 })
    return {
      assertion: 'mixed file selection preserves successful source and exposes partial state',
      passed: await page.locator('.source-row .source-status.is-ready').count() > 0
        && await page.locator('.source-row .source-status.is-error').count() > 0
    }
  }
  const jsonInput = page.locator('input[type="file"][accept*="json"]')
  await jsonInput.setInputFiles(importFixturePath)
  await page.locator('.json-preview').waitFor({ state: 'visible', timeout: 10_000 })
  const entryCount = await page.locator('.json-preview__entries li').count()
  const confirmVisible = await page.locator('.json-preview__actions .primary-action').isVisible()
  return {
    assertion: 'real JSON file selection opens structured preview and confirmation action',
    passed: entryCount > 0 && confirmVisible
  }
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
      const hiddenByInteraction = element.closest('[aria-hidden="true"], [inert]')
      return !hiddenByInteraction
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && box.width > 0
        && box.height > 0
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
        const style = getComputedStyle(element)
        const horizontalOverflow = box.right > viewport.width + 1 || box.left < -1
        const fixedVerticalOverflow = ['fixed', 'sticky'].includes(style.position)
          && (box.bottom > viewport.height + 1 || box.top < -1)
        return horizontalOverflow || fixedVerticalOverflow
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
  const importFixturePath = resolve(outputDir, 'worldbook-preview.json')
  await writeFile(importFixturePath, `${JSON.stringify({
    name: 'UI 审计世界书',
    groups: ['历史', '地点'],
    entries: [
      { name: '旧灯塔', type: 'location', group: '地点', keys: ['灯塔', '北港'], content: '港口北侧的旧灯塔，停摆后改用人工巡灯。', injection: { mode: 'selective', depth: 4 } },
      { name: '停摆记录', type: 'event', group: '历史', keys: ['十七年前'], content: '十七年前，旧灯塔在一次风暴后停止工作。' }
    ]
  }, null, 2)}\n`)
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
        const routeScenario = await triggerRouteScenario(page, route, state, importFixturePath)
        const actionScenario = await triggerActionScenario(page, route, state)
        const metrics = await inspectPage(page, route.surfaces)
        const typographyMetrics = route.id === 'experience'
          ? await inspectExperienceTypography(page)
          : null
        // P2/R7：可访问性审计（200% zoom / reduced-motion / 键盘可达）
        const accessibility = await inspectAccessibility(page, route)
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
          expectedConsoleErrors: ['error', 'partial'].includes(state),
          routeScenario,
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
  // P0：可访问性失败（溢出/裁切/键盘不可达/reduced-motion 缺失）也计入门禁失败
  const a11yFailureCount = report.entries.reduce((sum, entry) => (
    sum + (entry.accessibility?.a11yFailures?.length || 0)
  ), 0)
  const gateFailed = errorCount > 0 || a11yFailureCount > 0
  process.stdout.write(`UI audit: ${report.entries.length} captures, ${errorCount} console errors, ${a11yFailureCount} a11y failures -> ${outputDir}\n`)
  if (gateFailed) process.exitCode = 1
}

// P0/R7：可访问性审计（发布门禁级）—— 真实 200% zoom、裁切检测、reduced-motion、
// 多步键盘导航。任一核心指标失败 → 计入审计失败（影响退出码）。
async function inspectAccessibility(page, route) {
  const failures = []
  const surfaceSelector = route.surfaces[0]
  const keyboardTargets = route.keyboardTargets || [
    `${surfaceSelector} input`,
    `${surfaceSelector} textarea`,
    `${surfaceSelector} button`,
    `${surfaceSelector} [tabindex]`,
  ]

  // 1. 200% 有效布局视口：保持设备像素比，将当前 CSS viewport 的宽高分别减半。
  // 浏览器页面缩放 200% 对响应式布局的关键影响就是可用 CSS viewport 减半。
  const cdp = await page.context().newCDPSession(page)
  const initialViewport = page.viewportSize()
  const deviceScaleFactor = await page.evaluate(() => window.devicePixelRatio || 1)
  let zoomEmulated = false
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: Math.max(1, Math.floor(initialViewport.width / 2)),
      height: Math.max(1, Math.floor(initialViewport.height / 2)),
      deviceScaleFactor,
      mobile: false,
    })
    zoomEmulated = true
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  } catch {
    failures.push('zoom-emulation-unavailable')
  }
  const zoomAt200 = await page.evaluate(({ surfaceSelector, keyboardTargets }) => {
    const measure = () => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
    })
    const normal = measure()
    const coreElements = [
      document.querySelector(surfaceSelector),
      ...keyboardTargets.flatMap((selector) => Array.from(document.querySelectorAll(selector))),
    ].filter(Boolean)
    const clippedCore = coreElements.filter((element) => {
      const box = element.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return false
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return false
      return box.right > normal.clientWidth + 1 || box.left < -1 || element.scrollWidth > element.clientWidth + 1
    }).map((element) => ({
      tag: element.tagName,
      className: typeof element.className === 'string' ? element.className : '',
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rect: {
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      },
      overflowChildren: Array.from(element.querySelectorAll('*')).filter((child) => {
        const parentBox = element.getBoundingClientRect()
        const childBox = child.getBoundingClientRect()
        return childBox.right > parentBox.right + 1 || childBox.left < parentBox.left - 1
      }).map((child) => ({
        tag: child.tagName,
        className: typeof child.className === 'string' ? child.className : '',
        left: Math.round(child.getBoundingClientRect().left),
        right: Math.round(child.getBoundingClientRect().right),
      })).slice(0, 8),
    }))
    return {
      normal,
      overflowNormal: normal.scrollWidth > normal.clientWidth + 1,
      clippedElements: clippedCore.length,
      clippedCore,
    }
  }, { surfaceSelector, keyboardTargets })
  try {
    await cdp.send('Emulation.clearDeviceMetricsOverride')
  } catch { /* 忽略清理失败 */ }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  const horizontalOverflowAt200 = zoomAt200.overflowNormal
  if (horizontalOverflowAt200) failures.push('horizontal-overflow')
  if (zoomAt200.clippedElements > 0) failures.push(`clipped:${zoomAt200.clippedElements}`)

  // 2. reduced-motion：检测页面 CSS 是否正确响应（transition 时长在 reduce 下应被页面
  //    自己的规则缩短 —— Chrome 不自动改，所以检测 matchMedia + 实际动画规则）
  const reducedMotion = await page.emulateMedia({ reducedMotion: 'reduce' }).then(async () => {
    return page.evaluate((surfaceSelector) => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const surface = document.querySelector(surfaceSelector)
      const animatedElements = surface
        ? Array.from(surface.querySelectorAll('*')).filter((element) => {
            const style = getComputedStyle(element)
            const durations = style.animationDuration.split(',').map((value) => Number.parseFloat(value) || 0)
            return style.animationName !== 'none' && durations.some((duration) => duration > 0.02)
          }).length
        : 0
      return { reducedMotionApplied: reduced ? 'present' : 'absent', animatedElements }
    }, surfaceSelector)
  })
  if (reducedMotion.reducedMotionApplied !== 'present') failures.push('reduced-motion-unavailable')
  if (reducedMotion.animatedElements > 0) failures.push(`reduced-motion-animations:${reducedMotion.animatedElements}`)

  // 3. 键盘可达：从页面起点真实 Tab，必须进入该路由的核心操作，而非任意按钮。
  let keyboardReachable = false
  let focusTarget = null
  let keyboardTabSteps = 0
  try {
    await page.evaluate(() => {
      document.activeElement?.blur?.()
      document.body.focus()
    })
    for (let index = 0; index < 80; index += 1) {
      await page.keyboard.press('Tab')
      keyboardTabSteps++
      const focused = await page.evaluate(({ surfaceSelector, keyboardTargets }) => {
        const active = document.activeElement
        if (!active || active === document.body) return null
        const inSurface = Boolean(active.closest(surfaceSelector))
        const isCore = keyboardTargets.some((selector) => active.matches(selector))
        return {
          inSurface,
          isCore,
          target: active.getAttribute('aria-label') || active.getAttribute('title') || active.className || active.tagName,
        }
      }, { surfaceSelector, keyboardTargets })
      if (focused?.inSurface && focused?.isCore) {
        keyboardReachable = true
        focusTarget = String(focused.target)
        break
      }
    }
  } catch { keyboardReachable = false }
  if (!keyboardReachable) failures.push('keyboard-unreachable')

  return {
    initialViewport,
    zoomEmulated,
    ...zoomAt200,
    horizontalOverflowAt200,
    ...reducedMotion,
    keyboardReachable,
    focusTarget,
    keyboardTabSteps,
    a11yFailures: failures,
    a11yOk: failures.length === 0,
  }
}

run().catch((error) => {
  console.error('UI audit failed:', error)
  process.exit(1)
})
