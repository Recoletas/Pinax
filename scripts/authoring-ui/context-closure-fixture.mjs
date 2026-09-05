/* global process */
/* eslint-disable no-console */
// C1-0：落笔处上下文闭环专用 fixture。
// 用法：BASE=http://127.0.0.1:5173 node scripts/authoring-ui/context-closure-fixture.mjs
// 产物只写 tmp/authoring-context-closure/，不会改用户浏览器 localStorage。
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:5173'
const OUT_DIR = path.resolve('tmp/authoring-context-closure')
fs.mkdirSync(OUT_DIR, { recursive: true })
const BASE_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const BASE_BRANCH = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const WORKTREE_STATUS = execFileSync('git', ['status', '--short', '--untracked-files=all'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)

const chapterOne = [
  '雾从旧港税务所的石阶上漫下来，莉娜把抄表册护在怀里。',
  '钟楼敲过第七响，最后一声比前六声慢了半拍。',
  '她在门槛内侧发现一串潮湿脚印，只有去路，没有来路。'
].join('\n\n')

// 九个自然段会按正式 schema 每三段组成一个 writingUnit，稳定得到至少三个语义单元。
const chapterTwo = [
  '莉娜把油灯放到第三排书架前。灯焰向左偏，像被一口看不见的气息牵住。',
  '她没有立刻翻找总册，而是先数墙上的水痕：一道、两道、三道。',
  '最上面那道水痕旁，多了一个昨夜还不存在的名字。',
  '黄铜钥匙在她掌心发热。税务所后门仍锁着，门缝里却漏进海潮退去后的腥味。',
  '艾德加本应守在档案室外，此刻走廊里只有他的旧呢帽。',
  '莉娜想起速记里的那句话：第七响拖长时，不要回答任何人喊出的真名。',
  '书架深处传来纸页翻动声。每翻一页，穹顶的星图便亮起一颗。',
  '她停在第三排第七格前，没有伸手。总册缺失的位置积着一层新鲜盐霜。',
  '走廊尽头有人咳了一声。那是艾德加惯有的提醒，却比平时离她更近。'
].join('\n\n')

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const consoleErrors = []
const pageErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => pageErrors.push(error.message))

let state = null
let storageVerification = null

try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)

  state = await page.evaluate(async ({ chapterOne, chapterTwo }) => {
  const booksRepo = await import('/src/services/writing/writingBooksRepository.js')
  const schema = await import('/src/services/writing/writingDocumentSchema.js')
  const docRepo = await import('/src/services/writing/authoringDocumentRepository.js')
  const anchors = await import('/src/services/agents/authoring/authoringSceneAnchors.js')
  const assets = await import('/src/services/narrativeAssets.js')
  const memories = await import('/src/services/memoryCandidates.js')
  const { useWorldStore } = await import('/src/stores/worldStore.js')

  const worldStore = useWorldStore()
  const worldbook = await worldStore.createWorldbook({ name: '雾港纪事·P1 验收设定' })
  const lina = await worldStore.addEntry(worldbook.id, {
    name: '莉娜', type: 'character', keys: ['莉娜', '抄表员'],
    content: '旧港抄表员。遇到异常时先数数，再采取行动；随身携带黄铜钥匙。'
  })
  const edgar = await worldStore.addEntry(worldbook.id, {
    name: '艾德加', type: 'character', keys: ['艾德加', '老文书'],
    content: '旧港税务所老文书，知道嘉禾十七年总册失窃的真相，习惯用咳嗽提醒莉娜。'
  })
  const taxOffice = await worldStore.addEntry(worldbook.id, {
    name: '旧港税务所', type: 'location', keys: ['税务所', '档案室'],
    content: '临海的三层石砌建筑。第三排第七格原本存放嘉禾十七年船税总册。'
  })

  const book = booksRepo.createWritingBookRecord({ title: '雾港纪事·P1', worldbookId: worldbook.id })
  const now = new Date().toISOString()
  const chapters = [
    { id: 'p1-chapter-1', title: '迟到的钟声', markdown: chapterOne },
    { id: 'p1-chapter-2', title: '第三排第七格', markdown: chapterTwo }
  ].map((item) => ({
    id: item.id,
    title: item.title,
    content: item.markdown,
    contentFormat: 'md',
    outlineItems: [],
    wordCount: item.markdown.replace(/\s/g, '').length,
    createdAt: now,
    updatedAt: now,
    annotations: [],
    sceneAnchors: [],
    editorDocument: schema.createWritingDocument(item.markdown),
    editorDocumentSchemaVersion: 3
  }))
  const targetChapter = chapters[1]
  const targetUnit = targetChapter.editorDocument.content[1]
  targetChapter.sceneAnchors = anchors.normalizeSceneAnchors([{
    unitId: targetUnit.attrs.unitId,
    worldbookId: worldbook.id,
    castMode: 'manual',
    presentCharacterIds: [lina.id],
    locationId: taxOffice.id,
    viewpointCharacterId: lina.id,
    time: { label: '第七响之后', period: '深夜' },
    source: 'c1-fixture'
  }])
  book.chapters = chapters
  if (!booksRepo.saveWritingBooks([book])) throw new Error('C1 fixture failed to persist writing book')

  const exploration = await docRepo.createExplorationDocument(book.id, {
    title: '第七响之后',
    content: '艾德加先不要解释总册。他只提醒莉娜不要回应雾里喊出的真名，并把旧呢帽留作入场信号。'
  })
  if (!exploration?.ok || !exploration.document) throw new Error('C1 fixture failed to persist exploration document')
  const asset = assets.addNarrativeAsset({
    id: 'p1-asset-tide-ledger',
    projectId: book.id,
    title: '潮水退账的意象',
    kind: 'inspiration',
    status: 'accepted',
    content: '潮水不是带走物品，而是擦掉名字存在过的证据；纸页上的盐霜像一层尚未结清的账。',
    source: { type: 'manual', id: 'p1-fixture' },
    sourceRefs: [{ refType: 'chapter', refId: targetChapter.id, projectId: book.id, version: 1 }]
  })
  const activeMemoryResult = memories.queueMemoryCandidate({
    id: 'p1-memory-active',
    scope: 'project', scopeId: book.id, kind: 'character-state', status: 'active',
    authority: 'accepted', derivedBy: 'explicit', confidence: 0.92,
    content: '莉娜面对异常时会先数数，不会立刻触碰可疑物。',
    sourceRefs: ['author-note:p1-fixture'], sourceRevision: 'note-r1'
  })
  if (!activeMemoryResult?.success || !activeMemoryResult.candidate) throw new Error('C1 fixture failed to persist active memory')
  const activeMemory = activeMemoryResult.candidate
  const staleMemoryResult = memories.queueMemoryCandidate({
    id: 'p1-memory-stale',
    scope: 'project', scopeId: book.id, kind: 'plot-event', status: 'stale',
    authority: 'derived', derivedBy: 'prose-commit', confidence: 0.8,
    content: '艾德加已经离开旧港，不会在税务所再次出现。',
    sourceRefs: [`chapter:${targetChapter.id}`], sourceRevision: 'doc-r0',
    metadata: { staleReason: 'source-revision-changed', expectedRevision: 'doc-r1' }
  })
  if (!staleMemoryResult?.success || !staleMemoryResult.candidate) throw new Error('C1 fixture failed to persist stale memory')
  const staleMemory = staleMemoryResult.candidate

  localStorage.setItem('workspace_tabs_v1', JSON.stringify({
    version: 1,
    tabs: [{ id: 'wt-p1-context', key: `project:${book.id}:authoring`, scope: 'project', surface: 'authoring', projectId: book.id, worldbookId: worldbook.id, title: book.title, route: { name: 'authoring', query: { bookId: book.id } }, pinned: false, dirty: false, lastActiveAt: Date.now(), restoreState: {} }],
    activeTabId: 'wt-p1-context'
  }))
  localStorage.removeItem('writing_typography')

  return {
    bookId: book.id,
    worldbookId: worldbook.id,
    chapterIds: chapters.map((chapter) => chapter.id),
    targetChapterId: targetChapter.id,
    targetUnitId: targetUnit.attrs.unitId,
    targetUnitCount: targetChapter.editorDocument.content.length,
    characterEntryIds: [lina.id, edgar.id],
    locationEntryId: taxOffice.id,
    explorationId: exploration.document.id,
    explorationRevision: Number(exploration.document.revision || 0),
    assetId: asset.id,
    assetContentHash: asset.contentHash,
    worldbookEntryRevisions: Object.fromEntries([lina, edgar, taxOffice].map((entry) => [
      entry.id,
      String(entry.metadata?.updatedAt || '')
    ])),
    activeMemoryId: activeMemory.id,
    staleMemoryId: staleMemory.id
  }
  }, { chapterOne, chapterTwo })
  state.baseCommit = BASE_COMMIT
  state.branch = BASE_BRANCH
  state.worktreeStatus = WORKTREE_STATUS

  storageVerification = await page.evaluate((expected) => {
    const readJson = (key, fallback) => {
      try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
    }
    const books = readJson('writing_books', [])
    const book = books.find((item) => String(item?.id || '') === String(expected.bookId || '')) || null
    const targetChapter = book?.chapters?.find((item) => String(item?.id || '') === String(expected.targetChapterId || '')) || null
    const worldbook = readJson(`worldbook_${expected.worldbookId}`, null)
    const worldbookEntries = Array.isArray(worldbook?.entries)
      ? worldbook.entries
      : Object.values(worldbook?.entriesMap || {})
    const explorations = Array.isArray(book?.explorationDocuments) ? book.explorationDocuments : []
    const assets = readJson('narrative_assets_v1', [])
    const memories = readJson('memory_candidates_v1', [])
    const exploration = explorations.find((item) => item?.id === expected.explorationId) || null
    const asset = assets.find((item) => item?.id === expected.assetId) || null
    const activeMemory = memories.find((item) => item?.id === expected.activeMemoryId) || null
    const staleMemory = memories.find((item) => item?.id === expected.staleMemoryId) || null
    return {
      bookCount: books.length,
      chapterCount: book?.chapters?.length || 0,
      targetUnitCount: targetChapter?.editorDocument?.content?.length || 0,
      worldbookEntryIds: worldbookEntries.map((entry) => entry?.id).filter(Boolean),
      worldbookEntryRevisions: Object.fromEntries(worldbookEntries.map((entry) => [
        entry?.id,
        String(entry?.metadata?.updatedAt || '')
      ]).filter(([id]) => id)),
      exploration: exploration && { id: exploration.id, revision: Number(exploration.revision || 0) },
      asset: asset && { id: asset.id, projectId: asset.projectId, status: asset.status, contentHash: asset.contentHash },
      activeMemory: activeMemory && { id: activeMemory.id, scopeId: activeMemory.scopeId, status: activeMemory.status },
      staleMemory: staleMemory && {
        id: staleMemory.id,
        scopeId: staleMemory.scopeId,
        status: staleMemory.status,
        staleReason: staleMemory.metadata?.staleReason || ''
      }
    }
  }, state)

  const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  fs.writeFileSync(path.join(OUT_DIR, 'fixture-state.json'), JSON.stringify(state, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'fixture-localstorage.json'), JSON.stringify(storage, null, 2))

  await page.goto(`${BASE}/authoring?bookId=${state.bookId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.ProseMirror', { timeout: 30000 })
  await page.evaluate((chapterId) => {
    const row = document.querySelector(`[data-chapter-id="${chapterId}"]`)
      || [...document.querySelectorAll('.authoring-chapter-row')].find((item) => (item.textContent || '').includes('第三排第七格'))
    row?.click()
  }, state.targetChapterId)
  await page.waitForTimeout(1600)

  const targetUnit = page.locator(`.ProseMirror section[data-writing-unit][data-unit-id="${state.targetUnitId}"]`).first()
  await targetUnit.waitFor({ state: 'visible', timeout: 10000 })
  await targetUnit.locator('p, h1, h2, h3, blockquote').first().click()
  await page.waitForTimeout(600)

  const pageVerification = await page.evaluate((expected) => {
    const unit = document.querySelector(`.ProseMirror section[data-writing-unit][data-unit-id="${expected.targetUnitId}"]`)
    const sceneRail = document.querySelector('.wall__shelf-scene')
    return {
      chapterRows: [...document.querySelectorAll('.authoring-chapter-row')].filter((row) => row.offsetParent).length,
      writingUnits: document.querySelectorAll('.ProseMirror section[data-writing-unit][data-unit-id]').length,
      targetUnitPresent: Boolean(unit),
      targetUnitFocused: Boolean(unit?.classList.contains('is-current-writing-unit')),
      hasSceneRail: Boolean(sceneRail),
      sceneStatus: sceneRail?.querySelector('[data-scene-status]')?.getAttribute('data-scene-status') || '',
      sceneText: String(sceneRail?.innerText || '').replace(/\s+/g, ' ').trim(),
      title: document.querySelector('.wall__dossier-title')?.value || document.querySelector('.wall__dossier-title')?.textContent || ''
    }
  }, state)

  const expectedEntryIds = [...state.characterEntryIds, state.locationEntryId]
  const gates = {
    oneBookTwoChapters: storageVerification.bookCount === 1 && storageVerification.chapterCount === 2,
    semanticWritingUnits: state.targetUnitCount >= 3
      && storageVerification.targetUnitCount === state.targetUnitCount
      && pageVerification.writingUnits === state.targetUnitCount,
    worldbookEntriesPersisted: expectedEntryIds.every((id) => storageVerification.worldbookEntryIds.includes(id)),
    worldbookEntryRevisionsPresent: expectedEntryIds.every((id) => (
      Boolean(state.worldbookEntryRevisions[id])
      && storageVerification.worldbookEntryRevisions[id] === state.worldbookEntryRevisions[id]
    )),
    explorationPersisted: storageVerification.exploration?.id === state.explorationId
      && storageVerification.exploration?.revision === state.explorationRevision
      && state.explorationRevision > 0,
    narrativeAssetPersisted: storageVerification.asset?.id === state.assetId
      && storageVerification.asset?.projectId === state.bookId
      && storageVerification.asset?.status === 'accepted'
      && storageVerification.asset?.contentHash === state.assetContentHash
      && Boolean(state.assetContentHash),
    memoryFixturesPersisted: storageVerification.activeMemory?.id === state.activeMemoryId
      && storageVerification.activeMemory?.scopeId === state.bookId
      && storageVerification.activeMemory?.status === 'active'
      && storageVerification.staleMemory?.id === state.staleMemoryId
      && storageVerification.staleMemory?.scopeId === state.bookId
      && storageVerification.staleMemory?.status === 'stale'
      && storageVerification.staleMemory?.staleReason === 'source-revision-changed',
    targetUnitFocused: pageVerification.targetUnitPresent && pageVerification.targetUnitFocused,
    sceneCharacterVisible: pageVerification.sceneText.includes('莉娜'),
    sceneLocationVisible: pageVerification.sceneText.includes('旧港税务所'),
    sceneTimeVisible: pageVerification.sceneText.includes('第七响之后'),
    noPageErrors: pageErrors.length === 0,
    noConsoleErrors: consoleErrors.length === 0
  }
  const failedGates = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name)
  const verification = {
    schemaVersion: 1,
    state,
    storage: storageVerification,
    page: pageVerification,
    errors: { page: pageErrors, console: consoleErrors },
    gates,
    passed: Object.values(gates).filter(Boolean).length,
    failed: failedGates.length,
    failedGates
  }
  fs.writeFileSync(path.join(OUT_DIR, 'fixture-verification.json'), JSON.stringify(verification, null, 2))
  console.log('[c1-fixture]', JSON.stringify(verification, null, 2))
  if (failedGates.length) {
    process.exitCode = 2
    console.error(`[c1-fixture] failed gates: ${failedGates.join(', ')}`)
  }
} catch (error) {
  process.exitCode = 2
  const failure = {
    schemaVersion: 1,
    state,
    storage: storageVerification,
    errors: {
      fatal: String(error?.stack || error?.message || error),
      page: pageErrors,
      console: consoleErrors
    },
    failed: 1,
    failedGates: ['fixture-runtime']
  }
  fs.writeFileSync(path.join(OUT_DIR, 'fixture-verification.json'), JSON.stringify(failure, null, 2))
  console.error('[c1-fixture] runtime failure:', error)
} finally {
  await browser.close()
}
