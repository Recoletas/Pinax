import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as r0Samples from './fixtures/experience-r0-samples.js'
import { createWritingSnapshot } from '../shared/writingSnapshotContract.js'
import { createWritingBlockHistoryEntry } from '../shared/writingBlockHistoryContract.js'

const baseUrl = process.env.UI_AUDIT_BASE_URL || `http://127.0.0.1:${process.env.PORT || '5173'}`
const outputDir = resolve(process.env.UI_AUDIT_OUTPUT || '/tmp/pinax-ui-audit')
const requestedWidths = String(process.env.UI_AUDIT_WIDTHS || '1440,1280,980,760,390')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter(Number.isFinite)
const requestedStates = String(process.env.UI_AUDIT_STATES || 'empty')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => ['empty', 'regular', 'long', 'loading', 'partial', 'error', 'stale', 'cancelled', 'writing-unit', 'scene-board'].includes(value))
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
  {
    id: 'writing',
    path: '/writing',
    surfaces: ['.writing-page', '.manuscript-body'],
    keyboardTargets: ['.wall__cork button', '.wall__dossier-body button', '.writing-notebook-editor__surface .ProseMirror']
  },
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

function createPdfFixtureBuffer(text = 'Pinax PDF fixture') {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let output = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(output)
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(output)
}

function makeSceneBoardFixture() {
  const now = 1_788_883_200_000
  const kinds = ['event', 'character-fact', 'draft-prose', 'worldbook-draft', 'storyboard-seed', 'inspiration', 'reference-image', 'event']
  const titles = ['潮门开启', '守灯人的判断', '仓库回声', '旧港航道', '逆光镜头', '潮汐刻度', '灯塔构图', '归航信号']
  const assets = titles.map((title, index) => ({
    id: `scene-asset-${index + 1}`,
    schemaVersion: 1,
    projectId: 'scene-project',
    source: { type: 'chapter', id: 'scene-chapter-1', chapterId: 'scene-chapter-1' },
    sourceRefs: [{
      refType: 'chapter',
      refId: 'scene-chapter-1',
      projectId: 'scene-project',
      version: 'scene-v1',
      excerpt: `第 ${index + 1} 条来源片段`
    }],
    contentHash: `scene-hash-${index + 1}`,
    kind: kinds[index],
    title,
    content: `${title}。雾港的潮声把线索推向下一个场景节拍。`,
    status: index === 4 ? 'archived' : 'accepted',
    image: null,
    embeddedImagePresentations: {},
    createdAt: now + index,
    updatedAt: now + index
  }))
  const cards = Array.from({ length: 6 }, (_, index) => ({
    id: `scene-card-${index + 1}`,
    assetId: index === 5 ? 'scene-asset-missing' : assets[index].id,
    content: index === 5 ? '未找到来源的旧航道便签' : assets[index].content,
    emotion: 'calm',
    wordCount: 20 + index,
    createdAt: new Date(now + index * 1000).toISOString(),
    updatedAt: new Date(now + index * 1000).toISOString(),
    pileId: null,
    zone: index < 5 ? 'editing' : 'material',
    x: 72 + (index % 3) * 280,
    y: 72 + Math.floor(index / 3) * 210,
    extraFields: {
      shotType: index % 2 ? 'close_up' : 'wide',
      cameraMovement: index % 2 ? 'dolly' : 'static',
      duration: 3 + index
    }
  }))

  return {
    narrative_assets_v1: assets,
    prose_cards_v1: cards,
    prose_edges_v1: [
      { id: 'scene-edge-1', sourceId: 'scene-card-1', targetId: 'scene-card-2', type: 'continuation' },
      { id: 'scene-edge-2', sourceId: 'scene-card-3', targetId: 'scene-card-5', type: 'contrast' }
    ],
    prose_outline_v1: cards.slice(0, 5).map((card, index) => ({
      cardId: card.id,
      preview: card.content,
      order: index
    })),
    prose_timeline_v1: []
  }
}

function makeFixture(state) {
  if (state === 'empty') return {}
  if (state === 'scene-board') return makeSceneBoardFixture()
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
  if (state === 'writing-unit') {
    const originRefA = {
      type: 'experience-turn', sessionId: 'audit-session', branchId: 'main', turnId: 'audit-turn-1',
      messageId: 'audit-a1', worldbookId: 'audit-worldbook', sourceRevision: 1
    }
    const originRefB = {
      type: 'experience-turn', sessionId: 'audit-session', branchId: 'main', turnId: 'audit-turn-2',
      messageId: 'audit-a2', worldbookId: 'audit-worldbook', sourceRevision: 1
    }
    const passageNodes = Array.from({ length: 12 }, (_, index) => ({
      type: 'paragraph',
      attrs: {
        nodeId: `audit-node-${index + 1}`,
        nodeRevision: 0,
        kind: 'prose',
        rawMarkdown: null,
        leadingMarkdown: index ? '\n' : '',
        originalText: null
      },
      content: [{ type: 'text', text: `第 ${index + 1} 段沿着雾港旧航道推进，潮声把远处的信号送回仓库。` }]
    }))
    const sourceNode = {
      type: 'paragraph',
      attrs: { nodeId: 'audit-source-node', nodeRevision: 0, kind: 'prose', rawMarkdown: null, leadingMarkdown: '\n', originalText: null },
      content: [{ type: 'text', text: '她抬起头，确认灯塔的回波来自另一条已经封闭的航道。' }]
    }
    const editorDocument = {
      schemaVersion: 3,
      revision: 4,
      content: [
        {
          type: 'writingUnit',
          attrs: { unitId: 'audit-unit-passage', unitRevision: 2, kind: 'passage', sceneId: null, originRefs: [originRefA] },
          content: passageNodes
        },
        {
          type: 'writingUnit',
          attrs: {
            unitId: 'audit-unit-source',
            unitRevision: 0,
            kind: 'passage',
            sceneId: null,
            originRefs: [originRefA, originRefB]
          },
          content: [sourceNode]
        }
      ],
      meta: { sourceHash: 'audit-writing-unit', trailingMarkdown: '', importedAt: new Date(now).toISOString() },
      updatedAt: new Date(now).toISOString()
    }
    const chapter = fixture.writing_books[0].chapters[0]
    chapter.editorDocument = editorDocument
    chapter.editorDocumentSchemaVersion = 3
    chapter.content = [...passageNodes, sourceNode].map((node) => node.content[0].text).join('\n\n')
    chapter.wordCount = chapter.content.replace(/\s/g, '').length
    chapter.annotations = [{
      schemaVersion: 3,
      id: 'audit-annotation',
      chapterId: chapter.id,
      target: { unitId: 'audit-unit-passage', unitRevision: 2, nodeId: 'audit-node-7', nodeRevision: 0, start: 0, end: 3 },
      selector: { start: 0, end: 3, exact: '第 7', prefix: '', suffix: ' 段沿着' },
      body: '确认这里与体验来源的衔接。',
      kind: 'comment',
      status: 'open',
      createdBy: 'user',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString()
    }]
    chapter.auditCandidate = {
      schemaVersion: 3,
      patches: [{ unitId: 'audit-unit-passage', unitRevision: 2, nodeId: 'audit-node-7', nodeRevision: 0, baseText: passageNodes[6].content[0].text, replacement: '候选改写。' }]
    }
    const snapshotDocument = structuredClone(editorDocument)
    snapshotDocument.revision = 3
    snapshotDocument.content[0].attrs.unitRevision = 1
    snapshotDocument.content[0].content[0].content = [{ type: 'text', text: '命名快照中的旧正文。' }]
    const snapshotMarkdown = snapshotDocument.content
      .flatMap((unit) => unit.content || [])
      .map((node) => node.content?.map((item) => item.text || '').join('') || '')
      .join('\n\n')
    fixture.writing_snapshots_v1 = [createWritingSnapshot({
      id: 'audit-named-snapshot',
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      label: '审计命名快照',
      reason: 'manual',
      document: snapshotDocument,
      markdown: snapshotMarkdown,
      annotations: chapter.annotations,
      createdAt: new Date(now - 2000).toISOString()
    })]
    fixture.writing_block_history_v1 = [createWritingBlockHistoryEntry({
      id: 'audit-fragment-history',
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      unitId: 'audit-unit-passage',
      unitKind: 'passage',
      nodeId: 'audit-node-1',
      nodeKind: 'prose',
      previousText: '片段历史中的旧正文。',
      currentText: passageNodes[0].content[0].text,
      fromDocumentRevision: 2,
      toDocumentRevision: 4,
      fromUnitRevision: 1,
      toUnitRevision: 2,
      fromNodeRevision: 0,
      toNodeRevision: 0,
      source: 'manual-save',
      createdAt: new Date(now - 1000).toISOString()
    })]
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
      'writing_snapshots_v1',
      'writing_block_history_v1',
      'writing_recovery_drafts_v1',
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
  if (state === 'scene-board') return route.id === 'prose-essay'
  if (['partial', 'stale', 'cancelled'].includes(state)) {
    return state === 'partial'
      ? ['settings-worldbook-create', 'settings-structured'].includes(route.id)
      : route.id === 'settings-structured'
  }
  return !['loading', 'error'].includes(state)
    || ['prose-essay', 'settings-worldbook-create', 'settings-structured'].includes(route.id)
}

async function installActionScenario(page, state) {
  if (state === 'writing-unit') {
    await page.route('**/api/advisor/task', async (requestRoute) => {
      const taskType = requestRoute.request().postDataJSON()?.taskType || 'writing.chapter.health'
      await requestRoute.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          taskType,
          advice: '审计固定回复',
          result: { task: taskType, mode: 'review', summary: '审计固定回复' }
        })
      })
    })
  }
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
  if (route.id === 'writing' && state === 'writing-unit') {
    const waitForWritingEditor = async () => {
      await page.locator('.writing-notebook-editor__surface .ProseMirror').waitFor({ state: 'visible', timeout: 10_000 })
    }
    const reloadWritingFixture = async () => {
      await page.reload({ waitUntil: 'commit', timeout: 30_000 })
      await waitForWritingEditor()
    }
    const readUnitState = () => page.locator('.writing-notebook-editor__surface .ProseMirror').evaluate((root) => (
      Array.from(root.querySelectorAll(':scope > section[data-writing-unit]')).map((unit) => ({
        unitId: unit.getAttribute('data-unit-id'),
        unitRevision: Number(unit.getAttribute('data-unit-revision') || 0),
        nodes: Array.from(unit.children).map((node) => ({
          nodeId: node.getAttribute('nodeid') || node.getAttribute('node-id') || node.getAttribute('data-node-id'),
          text: node.textContent || ''
        }))
      }))
    ))
    const runUnitContextAction = async (target, label) => {
      await target.dispatchEvent('contextmenu', { clientX: 160, clientY: 180, bubbles: true })
      const action = page.getByRole('button', { name: label, exact: true })
      await action.waitFor({ state: 'visible', timeout: 2_000 })
      await action.click()
    }

    await waitForWritingEditor()
    const firstUnit = page.locator('[data-writing-unit]').first()
    const initialNodeCount = await firstUnit.locator('p').count()
    const initialUnitCount = await page.locator('[data-writing-unit]').count()
    const lastInitialNode = firstUnit.locator('p').last()
    await lastInitialNode.click()
    await page.keyboard.press('End')
    for (let index = initialNodeCount; index < 20; index += 1) {
      await page.keyboard.press('Enter')
    }
    const enterNodeCount = await firstUnit.locator('p').count()
    const enterUnitCount = await page.locator('[data-writing-unit]').count()
    await page.keyboard.press('Shift+Enter')
    const softBreakNodeCount = await firstUnit.locator('p').count()
    await page.keyboard.press('Control+z')
    for (let index = initialNodeCount; index < 20; index += 1) {
      await page.keyboard.press('Control+z')
    }
    const restoredNodeCount = await firstUnit.locator('p').count()

    await reloadWritingFixture()
    const compositionUnit = page.locator('[data-writing-unit]').first()
    const compositionInitialNodeCount = await compositionUnit.locator('p').count()
    const compositionStartNode = compositionUnit.locator('p').last()
    await compositionStartNode.evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      range.collapse(false)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      node.closest('.ProseMirror')?.focus()
    })
    await page.keyboard.press('Enter')
    await page.waitForFunction((expectedCount) => (
      document.querySelectorAll('[data-writing-unit]:first-of-type p').length === expectedCount
    ), compositionInitialNodeCount + 1)
    const compositionNodeCount = await compositionUnit.locator('p').count()
    const compositionTarget = compositionUnit.locator('p').last()
    await compositionTarget.dispatchEvent('compositionstart', { data: '' })
    await page.keyboard.press('Space')
    const commandMenuDuringComposition = await page.locator('.writing-command-menu-shell').count()
    await page.keyboard.insertText('中文输入')
    await compositionTarget.dispatchEvent('compositionend', { data: '中文输入' })
    const compositionText = await compositionTarget.textContent()
    const compositionPassed = compositionNodeCount === compositionInitialNodeCount + 1
      && commandMenuDuringComposition === 0
      && String(compositionText || '').includes('中文输入')

    await reloadWritingFixture()
    const splitInitial = await readUnitState()
    const splitTarget = page.locator('[data-writing-unit]').first().locator('p').first()
    await splitTarget.evaluate((node) => {
      const textNode = node.firstChild
      const range = document.createRange()
      range.setStart(textNode, Math.min(10, textNode?.textContent?.length || 0))
      range.collapse(true)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      node.closest('.ProseMirror')?.focus()
    })
    await runUnitContextAction(splitTarget, '从此处分开')
    const splitState = await readUnitState()
    await page.keyboard.press('Control+z')
    const splitUndoState = await readUnitState()
    const splitPassed = splitState.length === splitInitial.length + 1
      && splitState[0]?.unitId === splitInitial[0]?.unitId
      && splitState[0]?.nodes[0]?.nodeId === splitInitial[0]?.nodes[0]?.nodeId
      && splitState[1]?.unitId !== splitInitial[0]?.unitId
      && splitState[1]?.nodes[0]?.nodeId !== splitInitial[0]?.nodes[0]?.nodeId
      && JSON.stringify(splitUndoState) === JSON.stringify(splitInitial)

    await reloadWritingFixture()
    const moveInitial = await readUnitState()
    const moveTarget = page.locator('[data-writing-unit]').nth(1).locator('p').first()
    await moveTarget.click()
    await runUnitContextAction(moveTarget, '上移当前单元')
    const moveState = await readUnitState()
    await page.keyboard.press('Control+z')
    const moveUndoState = await readUnitState()
    const movePassed = moveState.map((unit) => unit.unitId).join('|') === [...moveInitial].reverse().map((unit) => unit.unitId).join('|')
      && moveState.every((unit) => unit.unitRevision === moveInitial.find((initial) => initial.unitId === unit.unitId)?.unitRevision)
      && JSON.stringify(moveUndoState) === JSON.stringify(moveInitial)

    await reloadWritingFixture()
    const mergeInitial = await readUnitState()
    const mergeTarget = page.locator('[data-writing-unit]').nth(1).locator('p').first()
    await mergeTarget.click()
    await runUnitContextAction(mergeTarget, '与上一单元合并')
    const mergeState = await readUnitState()
    await page.waitForTimeout(1_500)
    const mergedStoredState = await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem('writing_books') || '[]')
      const editorDocument = books[0]?.chapters?.[0]?.editorDocument
      return {
        unitCount: editorDocument?.content?.length ?? null,
        originRefs: editorDocument?.content?.[0]?.attrs?.originRefs || [],
        saveChip: document.querySelector('.wall__save-chip-state')?.textContent || null
      }
    })
    const mergedOriginRefs = mergedStoredState.originRefs
    await page.keyboard.press('Control+z')
    const mergeUndoState = await readUnitState()
    const mergePassed = mergeState.length === 1
      && mergeState[0]?.unitId === mergeInitial[0]?.unitId
      && mergeState[0]?.nodes.length === mergeInitial.flatMap((unit) => unit.nodes).length
      && mergedOriginRefs.length === 2
      && mergedStoredState.unitCount === 1
      && new Set(mergedOriginRefs.map((ref) => `${ref.turnId}:${ref.messageId}`)).size === 2
      && JSON.stringify(mergeUndoState) === JSON.stringify(mergeInitial)

    await reloadWritingFixture()
    const versionTab = page.getByRole('button', { name: '版本', exact: true })
    if (!await versionTab.isVisible()) {
      await page.locator('.writing-inspector__reopen[title="打开检查器"]').click()
    }
    await versionTab.click()
    const snapshotEntry = page.locator('.writing-version-entry').filter({ hasText: '审计命名快照' })
    await snapshotEntry.waitFor({ state: 'visible', timeout: 2_000 })
    page.once('dialog', (dialog) => dialog.accept())
    await snapshotEntry.getByRole('button', { name: '恢复到这里' }).click()
    await page.getByText(/已恢复「审计命名快照」/).waitFor({ state: 'visible', timeout: 3_000 })
    const snapshotRestoredText = await page.locator('[data-writing-unit]').first().locator('p').first().textContent()
    const historyEntry = page.locator('.writing-block-history__entry').filter({ hasText: '片段历史中的旧正文' })
    await historyEntry.waitFor({ state: 'visible', timeout: 2_000 })
    await historyEntry.getByRole('button', { name: '恢复此片段' }).click()
    await page.getByText(/已恢复片段历史/).waitFor({ state: 'visible', timeout: 3_000 })
    const historyRestoredText = await page.locator('[data-writing-unit]').first().locator('p').first().textContent()
    const recoveryLayersPassed = snapshotRestoredText === '命名快照中的旧正文。'
      && historyRestoredText === '片段历史中的旧正文。'

    await reloadWritingFixture()
    const middleTarget = page.locator('[data-writing-unit] p').nth(6)
    await middleTarget.scrollIntoViewIfNeeded()
    await middleTarget.click()
    const sourceTarget = page.locator('[data-writing-unit]').nth(1).locator('p')
    await sourceTarget.scrollIntoViewIfNeeded()
    await sourceTarget.click()
    const sourceAction = page.getByRole('button', { name: '来自体验' })
    await sourceAction.waitFor({ state: 'visible', timeout: 2_000 })
    const currentUnitCount = await page.locator('[data-writing-unit].is-current-writing-unit').count()
    const sourceActionVisible = await sourceAction.isVisible()
    await sourceAction.click()
    await page.waitForURL((url) => (
      url.pathname === '/experience'
      && url.searchParams.get('sessionId') === 'audit-session'
      && url.searchParams.get('messageId') === 'audit-a1'
    ), { timeout: 3_000 })
    const sourceRoutePassed = page.url().includes('sessionId=audit-session') && page.url().includes('messageId=audit-a1')
    await page.goto(`${baseUrl}/writing`, { waitUntil: 'commit', timeout: 30_000 })
    await waitForWritingEditor()
    return {
      assertion: 'writing unit fixture focuses source provenance without cell chrome',
      passed: initialNodeCount === 12
        && enterNodeCount === 20
        && softBreakNodeCount === 20
        && initialUnitCount === enterUnitCount
        && restoredNodeCount === initialNodeCount
        && compositionPassed
        && splitPassed
        && movePassed
        && mergePassed
        && recoveryLayersPassed
        && currentUnitCount === 1
        && sourceActionVisible
        && sourceRoutePassed,
      details: {
        initialNodeCount,
        enterNodeCount,
        softBreakNodeCount,
        initialUnitCount,
        enterUnitCount,
        restoredNodeCount,
        compositionPassed,
        compositionInitialNodeCount,
        compositionNodeCount,
        commandMenuDuringComposition,
        compositionText,
        splitPassed,
        movePassed,
        mergePassed,
        mergedStoredUnitCount: mergedStoredState.unitCount,
        recoveryLayersPassed,
        currentUnitCount,
        sourceActionVisible,
        sourceRoutePassed
      }
    }
  }
  if (route.id !== 'settings-worldbook-create' || !['regular', 'partial'].includes(state)) return null
  if (state === 'partial') {
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { name: 'audit-source.txt', mimeType: 'text/plain', buffer: Buffer.from('潮汐港的旧灯塔记录着一段可用资料。\n') },
      { name: 'audit-source.pdf', mimeType: 'application/pdf', buffer: createPdfFixtureBuffer() },
      { name: 'audit-unsupported.png', mimeType: 'image/png', buffer: Buffer.from('not-an-image') }
    ])
    await page.locator('.creation-state.is-partial').waitFor({ state: 'visible', timeout: 10_000 })
    return {
      assertion: 'mixed file selection preserves successful source and exposes partial state',
      passed: await page.locator('.source-row .source-status.is-ready').count() >= 2
        && await page.locator('.source-row .source-status.is-error').count() === 1
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
          if (message.type() === 'error') {
            const location = message.location()?.url
            consoleErrors.push(location ? `${message.text()} @ ${location}` : message.text())
          }
        })
        page.on('pageerror', (error) => consoleErrors.push(error.message))
        await installThemeFixture(page, state)
        await installActionScenario(page, state)
        const routePath = route.id === 'prose-essay' && state === 'scene-board'
          ? '/prose-essay?assetId=scene-asset-1'
          : route.path
        const response = await page.goto(`${baseUrl}${routePath}`, { waitUntil: 'commit', timeout: 30_000 })
        await page.locator(route.surfaces[0]).waitFor({ state: 'attached', timeout: 30_000 })
        if (route.id === 'prose-essay' && state === 'scene-board') {
          await page.locator('[data-scene-material-board]').waitFor({ state: 'visible', timeout: 30_000 })
        }
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
          path: routePath,
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
  const scenarioFailureCount = report.entries.filter((entry) => entry.routeScenario?.passed === false).length
  const gateFailed = errorCount > 0 || a11yFailureCount > 0 || scenarioFailureCount > 0
  process.stdout.write(`UI audit: ${report.entries.length} captures, ${errorCount} console errors, ${a11yFailureCount} a11y failures, ${scenarioFailureCount} scenario failures -> ${outputDir}\n`)
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
      const hiddenByInteraction = element.closest('[aria-hidden="true"], [inert], details:not([open])')
      if (hiddenByInteraction || style.display === 'none' || style.visibility === 'hidden') return false
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
