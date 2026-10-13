import { describe, it, expect } from 'vitest'
import { createApp, effectScope, nextTick, reactive, ref } from 'vue'
import { readProseCanvasWorkspace, saveProseCanvasWorkspace, PROSE_CANVAS_KEYS } from '../services/canvas/proseCanvasRepository.js'
import { useProseDirectorExport } from '../composables/useProseDirectorExport.js'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { trapFocusWithin } from '../composables/useTransientLayer'
import { validateWritingLockedSegments, normalizeWritingCandidates } from '../../shared/writingCandidateContract.js'
import { normalizeWritingTypography } from '../stores/writingTypographyStore.js'
import { useAuthoringFirstRun } from '../composables/useAuthoringFirstRun.js'
import { normalizeWorkspaceLayout, normalizeWorkspaceResource, workspaceResourceKey } from '../services/workspace/workspaceViewContract.js'
import { writingChapterRowLabel } from '../services/writing/writingChapterLabels.js'
import { createDirectory, readDirectory, directoryRows, directoryResourceKey, DEFAULT_FOLDERS, DIRECTORY_PREFIX } from '../services/workspace/projectDirectory.js'
import { sourceChunkLocator } from '../services/workspace/sourceChunkLocator.js'
import { provideComposableWorkspace } from '../composables/useWorkspaceHost.js'
import { generateWritingNames } from '../services/writing/writingNameGenerator.js'
import { selectRecentWorkspaceBooks } from '../services/workspace/workspaceRecentHistory.js'
import { groupWorkspaceProjectTabs, resolveRouteIntent } from '../services/workspace/workspaceTabContract.js'
import {
  createWritingDocument,
  editorContentToWritingDocument,
  getWritingDocumentMarkdown,
  validateWritingDocument,
  writingDocumentToEditorContent
} from '../services/writing/writingDocumentSchema.js'
import { getAuthoringIllustrationSourceRefs } from '../services/agents/authoring/authoringIllustrationActions.js'
import {
  buildAuthoringEntityEntry,
  createAuthoringEntityEntryCommand,
  createAuthoringEntitySelection,
  createAuthoringEntitySelectionReceipt,
  findAuthoringEntitySelectionConflicts
} from '../services/authoring/authoringEntitySelection.js'

// U1：控件契约 —— workbench-controls.css 静态检查。
// 断言核心 class、:focus-visible、coarse pointer 命中区，并防止 transition: all 回潮。
const css = readFileSync(resolve(__dirname, '../../src/styles/workbench-controls.css'), 'utf8')
const mainEntry = readFileSync(resolve(__dirname, '../main.js'), 'utf8')
// R-X1 后 Experience 的接线面 = 页面 + 四个会话 owner（O 复核点：
// 断言从单文件改为实际模块接线的并集，行为断言不变）
const experience = [
  'Experience.vue',
  'useExperienceAutoAdvance.js',
  'useExperienceCodexWorkspace.js',
  'useExperienceSessionWorkflow.js',
  'useExperienceQuickCapture.js'
].map((file) => readFileSync(resolve(
  __dirname,
  file.startsWith('useExperience') ? `../composables/${file}` : `../pages/${file}`
), 'utf8')).join('\n')
const experienceSessionHeader = readFileSync(resolve(__dirname, '../components/experience/ExperienceSessionHeader.vue'), 'utf8')
const appShell = readFileSync(resolve(__dirname, '../layouts/AppShell.vue'), 'utf8')
const inputArea = readFileSync(resolve(__dirname, '../components/InputArea.vue'), 'utf8')
const uiAudit = readFileSync(resolve(__dirname, '../../scripts/ui-audit.mjs'), 'utf8')
const proseEssay = readFileSync(resolve(__dirname, '../pages/ProseEssay.vue'), 'utf8')
const proseEssayComponents = readFileSync(resolve(__dirname, '../components/canvas/proseEssayComponents.js'), 'utf8')
const notes = readFileSync(resolve(__dirname, '../pages/Notes.vue'), 'utf8')
// C1 后批量画布/送画布实现迁入 useNotesAssetCatalog；断言跟随真实模块接线
const notesCatalog = readFileSync(resolve(__dirname, '../composables/useNotesAssetCatalog.js'), 'utf8')
const writing = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
const authoringHistoryPanel = readFileSync(resolve(__dirname, '../components/authoring/AuthoringHistoryPanel.vue'), 'utf8')
const authoringHistoryWorkflow = readFileSync(resolve(__dirname, '../composables/useAuthoringHistoryWorkflow.js'), 'utf8')
const writingGlobalCss = readFileSync(resolve(__dirname, '../pages/Writing.global.css'), 'utf8')
const authoringBlockCss = readFileSync(resolve(__dirname, '../pages/Authoring.block-native.css'), 'utf8')
const notebookEditor = readFileSync(resolve(__dirname, '../components/writing/WritingNotebookEditor.vue'), 'utf8')
const authoringDualPane = readFileSync(resolve(__dirname, '../components/authoring/AuthoringDualPane.vue'), 'utf8')
const authoringIllustratorDrawer = readFileSync(resolve(__dirname, '../components/authoring/AuthoringIllustratorDrawer.vue'), 'utf8')
const authoringIllustratorComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringIllustrator.js'), 'utf8')
const authoringIllustrationActions = readFileSync(resolve(__dirname, '../services/agents/authoring/authoringIllustrationActions.js'), 'utf8')
const writingDocumentSchema = readFileSync(resolve(__dirname, '../services/writing/writingDocumentSchema.js'), 'utf8')
const authoringQuickWords = readFileSync(resolve(__dirname, '../components/authoring/AuthoringQuickWords.vue'), 'utf8')
const authoringKnowledgeAssistant = readFileSync(resolve(__dirname, '../components/authoring/AuthoringKnowledgeAssistant.vue'), 'utf8')
const authoringCharacterPanel = readFileSync(resolve(__dirname, '../components/authoring/AuthoringCharacterPanel.vue'), 'utf8')
const authoringCharacterAiReview = readFileSync(resolve(__dirname, '../components/authoring/AuthoringCharacterAiReview.vue'), 'utf8')
const authoringWorldbookPanel = readFileSync(resolve(__dirname, '../components/authoring/AuthoringWorldbookPanel.vue'), 'utf8')
const authoringOutlinePanel = readFileSync(resolve(__dirname, '../components/authoring/AuthoringOutlinePanel.vue'), 'utf8')
const authoringInterventionComposer = readFileSync(resolve(__dirname, '../components/authoring/AuthoringInterventionComposer.vue'), 'utf8')
const authoringInterventionGhost = readFileSync(resolve(__dirname, '../components/authoring/AuthoringInterventionGhost.vue'), 'utf8')
const authoringLivingStory = readFileSync(resolve(__dirname, '../components/authoring/AuthoringLivingStoryProjection.vue'), 'utf8')
const authoringKnowledgeComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringKnowledgeAssistant.js'), 'utf8')
const authoringInspectorComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringInspectorState.js'), 'utf8')
const authoringReviewComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringReviewWorkflow.js'), 'utf8')
const authoringSearchComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringSearchWorkflow.js'), 'utf8')
const authoringRewriteComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringRewriteWorkflow.js'), 'utf8')
const authoringAnnotationComposable = readFileSync(resolve(__dirname, '../composables/useAuthoringAnnotationSession.js'), 'utf8')
const authoringAnnotationSelection = readFileSync(resolve(__dirname, '../composables/useAuthoringAnnotationSelection.js'), 'utf8')
const authoringAnnotationLayout = readFileSync(resolve(__dirname, '../composables/useAuthoringAnnotationLayout.js'), 'utf8')
const authoringToolRail = readFileSync(resolve(__dirname, '../components/authoring/AuthoringWorkspaceToolRail.vue'), 'utf8')
const rehearsalPanelSource = readFileSync(resolve(__dirname, '../components/authoring/AuthoringRehearsalPanel.vue'), 'utf8')
const rehearsalReviewSurface = readFileSync(resolve(__dirname, '../components/collaboration/RehearsalReviewSurface.vue'), 'utf8')
const collaborationReview = readFileSync(resolve(__dirname, '../pages/CollaborationReview.vue'), 'utf8')
const gamePanel = readFileSync(resolve(__dirname, '../components/GamePanel.vue'), 'utf8')
const narrativeTurn = readFileSync(resolve(__dirname, '../components/experience/NarrativeTurn.vue'), 'utf8')
const imageWorkbench = readFileSync(resolve(__dirname, '../components/media/ImageGenerationWorkbench.vue'), 'utf8')
const sceneMaterialBoardPath = resolve(__dirname, '../components/canvas/SceneMaterialBoard.vue')
const sceneMaterialBoard = existsSync(sceneMaterialBoardPath)
  ? readFileSync(sceneMaterialBoardPath, 'utf8')
  : ''
const desktopProjectGatePath = resolve(__dirname, '../components/desktop/DesktopProjectGate.vue')
const desktopProjectGate = existsSync(desktopProjectGatePath)
  ? readFileSync(desktopProjectGatePath, 'utf8')
  : ''

describe('workbench control contract (U1)', () => {
  it('keeps first-run guidance truthful and bound to one book', () => {
    const welcome = readFileSync(resolve(__dirname, '../views/AuthoringWelcomeView.vue'), 'utf8')
    expect(welcome).toContain('v-for="book in visibleBooks"')
    expect(welcome).not.toContain('.slice(0, 3)')
    expect(welcome).toContain(':aria-label="tr(&quot;搜索书名&quot;)"')
    expect(welcome).toContain(':aria-label="tr(&quot;书稿排序&quot;)"')
    const actions = readFileSync(resolve(__dirname, '../components/authoring/LibraryQuickActions.vue'), 'utf8')
    // 20261008 同步：新建作品入口改道助手共创（start=new&view=assistant），
    // first-run 指引忠实挂在导入入口上；guide 不再随 start=new 出现。
    expect(actions).toContain('start=new&view=assistant')
    expect(actions).toContain('start=import&guide=first-run')
    expect(welcome).toContain('LibrarySidebar')
    const tabs = readFileSync(resolve(__dirname, '../components/workbench/WorkspaceTabs.vue'), 'utf8')
    expect(tabs).toContain("title: '首页'")
    expect(tabs).toContain('v-if="!tab.pinned"')
    // N-B（nightly-20260917）：标签重构为真实 button，原生 Enter/Space 激活。
    expect(tabs).toContain('@click="activateTab(tab.id)"')
    expect(tabs).toContain(':aria-current="tab.id === activeTabId ? \'true\' : undefined"')
    expect(appShell).not.toContain('<header class="shell-mast">')
    const authoringPage = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    expect(authoringPage).not.toContain('class="authoring-book-tabs"')
    expect(authoringPage).toContain("<span>{{ tr('章节目录') }}</span>")
    const settingsContext = readFileSync(resolve(__dirname, '../components/workbench/SettingsContextBar.vue'), 'utf8')
    expect(settingsContext).not.toContain('PROJECT · ')
    localStorage.clear()
    const bookId = ref('book-a')
    const artifacts = ref({
      hasManuscript: false, hasCharacters: false, hasPresentCast: false,
      rehearsalStarted: false, hasResponse: false, hasDraft: false
    })
    const guide = useAuthoringFirstRun({ bookId, artifacts })
    expect(guide.activate('book-a')).toBe(true)
    expect(guide.phase.value).toBe('write')
    expect(guide.stageIndex.value).toBe(1)

    artifacts.value = { ...artifacts.value, hasManuscript: true }
    expect(guide.stageIndex.value).toBe(2)
    artifacts.value = { ...artifacts.value, hasCharacters: true }
    expect(guide.stageIndex.value).toBe(3)
    artifacts.value = { ...artifacts.value, hasPresentCast: true }
    expect(guide.stageIndex.value).toBe(4)

    // 创建 run 不再冒充完成:阶段进入 response,提示按真实产物说话。
    artifacts.value = { ...artifacts.value, rehearsalStarted: true }
    expect(guide.phase.value).toBe('response')
    expect(guide.stripVisible.value).toBe(false)
    expect(guide.panelHint.value).toContain('回应会出现在这里')
    artifacts.value = { ...artifacts.value, hasResponse: true }
    expect(guide.panelHint.value).toContain('写成试稿')
    artifacts.value = { ...artifacts.value, hasDraft: true }
    expect(guide.panelHint.value).toContain('仍可修改')
    expect(guide.panelHint.value).toContain('由你决定')

    // 指引绑定当前书:切到另一本书不带 A 的进度。
    bookId.value = 'book-b'
    expect(guide.phase.value).toBe('')
    expect(guide.panelHint.value).toBe('')

    // 关闭按书持久化,已关闭的书不再被 query 激活;作者可显式重开。
    bookId.value = 'book-a'
    guide.dismiss()
    expect(JSON.parse(localStorage.getItem('authoring_first_run_v1')).closedBookIds).toContain('book-a')
    expect(guide.activate('book-a')).toBe(false)
    expect(guide.reopen()).toBe('active')

    // 没有打开的书时重开要求回作品选择,不伪续接。
    bookId.value = ''
    expect(guide.reopen()).toBe('need-book')

    // 采纳后完成:完成的书同样不被 query 复活。
    bookId.value = 'book-c'
    guide.activate('book-c')
    guide.complete()
    expect(JSON.parse(localStorage.getItem('authoring_first_run_v1')).completedBookIds).toContain('book-c')
    expect(guide.activate('book-c')).toBe(false)

    // 页面接线:run 创建不再触发结束;面板消费右栏提示;菜单提供显式重开。
    expect(writing).toContain('useAuthoringFirstRun(')
    expect(writing).toContain(':first-run-hint="firstRunPanelHint"')
    expect(writing).toContain('data-test="more-reopen-first-run"')
    expect(writing).not.toContain('if (started && firstRunGuideActive.value) dismissFirstRunGuide()')
    expect(rehearsalPanelSource).toContain('data-test="rehearsal-first-run-hint"')
  })

  it("keeps the authoring shell structural and one authoring destination（合并5例）", async () => {
    const canvasStorage = new Map()
    const storage = { getItem: key => canvasStorage.get(key) ?? null, setItem: (key, value) => canvasStorage.set(key, value), removeItem: key => canvasStorage.delete(key) }
    const legacyCanvas = { cards: [{ id: 'one', projectId: 'a', pileId: 'mixed' }, { id: 'two', projectId: 'b', pileId: 'mixed' }, { id: 'asset', assetId: 'owned-asset' }, { id: 'unowned' }], edges: [{ sourceId: 'one', targetId: 'two' }, { sourceId: 'one', targetId: 'asset' }], outline: [{ cardId: 'one' }, { cardId: 'two' }], piles: [{ pileId: 'mixed' }] }
    expect(saveProseCanvasWorkspace(legacyCanvas, { storage }).ok).toBe(true)
    const beforeLegacy = storage.getItem(PROSE_CANVAS_KEYS.cards)
    const bookCanvas = readProseCanvasWorkspace({ storage, projectId: 'a', assetProjectIds: { 'owned-asset': 'a' } })
    expect(bookCanvas.cards.map(card => card.id)).toEqual(['one', 'asset'])
    expect(bookCanvas.cards[0].pileId).toBeNull()
    expect(bookCanvas.edges).toEqual([{ sourceId: 'one', targetId: 'asset' }])
    expect(bookCanvas.outline).toEqual([{ cardId: 'one' }])
    bookCanvas.cards.push({ id: 'new', projectId: 'a' })
    expect(saveProseCanvasWorkspace(bookCanvas, { storage, projectId: 'a' }).ok).toBe(true)
    expect(readProseCanvasWorkspace({ storage, projectId: 'a' }).cards).toHaveLength(3)
    expect(saveProseCanvasWorkspace(bookCanvas, { storage, projectId: 'a', expectedRevision: 0 }).reason).toBe('canvas-conflict')
    expect(readProseCanvasWorkspace({ storage, projectId: 'b' }).cards.map(card => card.id)).toEqual(['two'])
    expect(storage.getItem(PROSE_CANVAS_KEYS.cards)).toBe(beforeLegacy)
    expect(saveProseCanvasWorkspace(bookCanvas, { storage: { ...storage, setItem() { throw Error('quota') } }, projectId: 'a' }).ok).toBe(false)
    expect(readProseCanvasWorkspace({ storage, projectId: 'a' }).cards).toHaveLength(3)
    expect(normalizeWorkspaceResource({ type: 'comic-editor', worldbookId: 'world' })).toBeNull()
    expect(normalizeWorkspaceResource({ type: 'map-editor', bookId: 'a', entryId: 'place-a' })).toMatchObject({ type: 'map-editor', entryId: 'place-a' })
    expect(workspaceResourceKey({ type: 'entries-editor', bookId: 'a', entryId: 'one' })).toBe(workspaceResourceKey({ type: 'entries-editor', bookId: 'a', entryId: 'two' }))
    expect(workspaceResourceKey({ type: 'comic-editor', bookId: 'a', worldbookId: 'old' })).toBe(workspaceResourceKey({ type: 'comic-editor', bookId: 'a', worldbookId: 'new' }))
    const recentBooks = selectRecentWorkspaceBooks([
      { key: 'a-removed', bookId: 'a', bookTitle: '甲', available: false, lastUsedAt: 30 },
      { key: 'a-assistant', bookId: 'a', available: true, lastUsedAt: 20, route: { name: 'authoring', query: { bookId: 'a', view: 'assistant' } } },
      { key: 'b-sources', bookId: 'b', bookTitle: '乙', available: true, lastUsedAt: 25 },
      { key: 'c-removed', bookId: 'c', available: false, unavailableReason: 'object-removed', lastUsedAt: 10 },
      { key: 'deleted', bookId: 'deleted', available: false, reason: 'book-removed', lastUsedAt: 40 }
    ])
    expect(recentBooks.map(entry => entry.bookId)).toEqual(['a', 'b', 'c'])
    expect(recentBooks[0]).toMatchObject({ key: 'a-assistant', bookTitle: '甲', lastUsedAt: 30 })
    expect(recentBooks[2].unavailableReason).toBeUndefined()
    expect(recentBooks[2]).toMatchObject({ available: true, route: { name: 'authoring', query: { bookId: 'c' } }, object: null })
    const grouped = groupWorkspaceProjectTabs([{ id: 'write', projectId: 'one-book', scope: 'project', lastActiveAt: 1 }, { id: 'comic', projectId: 'one-book', scope: 'project', lastActiveAt: 2, dirty: true }, { id: 'global', scope: 'global' }], 'write')
    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toMatchObject({ id: 'write', projectGrouped: true, dirty: true })
    expect(resolveRouteIntent({ name: 'experience', query: { bookId: 'one-book', worldbookId: 'one-world' } })).toMatchObject({ scope: 'project', surface: 'roleplay', projectId: 'one-book' })
    expect(resolveRouteIntent({ name: 'experience', query: { worldbookId: 'one-world' } })).toMatchObject({ scope: 'global' })
    // New host metadata never carries document content or another project's scope.
    const reference = normalizeWorkspaceResource({ type: 'source', bookId: 'book-a', id: 'source-a', start: 3, end: 9, content: 'private', grant: 'secret' })
    expect(reference).toEqual({ type: 'source', bookId: 'book-a', worldbookId: '', id: 'source-a', start: 3, end: 9 })
    expect(normalizeWorkspaceResource({ type: 'chapter', worldbookId: 'world-a', id: 'chapter' })).toBeNull()
    const restored = normalizeWorkspaceLayout({ version: 1, width: 900, views: [{ resource: reference }, { resource: reference }, { resource: { ...reference, bookId: 'other-book' } }], activeId: 'missing' }, { bookId: 'book-a' })
    expect(restored.views).toHaveLength(1)
    expect(restored.activeId).toBe(workspaceResourceKey(reference))
    expect(restored.width).toBe(680)
    expect(normalizeWorkspaceLayout({ version: 99, views: [] }, { bookId: 'book-a' })).toBeNull()
    // Default project navigation retires generated type buckets without losing authored folders or references.
    expect(createDirectory().folders).toEqual([])
    const chapterRef = { type: 'chapter', bookId: 'book-a', id: 'chapter-a' }
    const chapterKey = directoryResourceKey(chapterRef)
    const oldDirectory = { version: 1, revision: 4, folders: [
      ...DEFAULT_FOLDERS.map(folder => ({ ...folder, ...(folder.id === 'settings' ? { name: '我的设定' } : {}) })),
      { id: 'custom-folder', name: '第一部', parentId: 'manuscript', order: 6 }
    ], placements: [{ key: chapterKey, parentId: 'manuscript', order: 42 }], links: [] }
    const oldRaw = JSON.stringify(oldDirectory)
    localStorage.setItem(DIRECTORY_PREFIX + 'book-a', oldRaw)
    const migratedDirectory = readDirectory('book-a')
    expect(migratedDirectory.revision).toBe(4)
    expect(migratedDirectory.folders.map(folder => folder.name)).toEqual(['我的设定', '第一部'])
    expect(migratedDirectory.folders.find(folder => folder.id === 'custom-folder').parentId).toBe('')
    expect(migratedDirectory.placements).toEqual([{ key: chapterKey, parentId: '', order: 42 }])
    expect(directoryRows(migratedDirectory, [{ title: '开篇', folder: 'manuscript', resource: chapterRef }]).find(row => row.key === chapterKey)).toMatchObject({ parentId: '', order: 42, resource: chapterRef })
    expect(localStorage.getItem(DIRECTORY_PREFIX + 'book-a')).toBe(oldRaw)

    expect(workspaceResourceKey({ type: 'source', bookId: 'a|b', id: 'c' })).not.toBe(workspaceResourceKey({ type: 'source', bookId: 'a', id: 'b|c' }))
    const shared = { sourceId: 'source-a', locator: { start: 0, end: 5 }, sourceRefs: [{ sourceId: 'source-a', locator: { start: 0, end: 5 } }, { sourceId: 'source-b', locator: { start: 37, end: 42 } }] }
    expect(sourceChunkLocator(shared, 'source-b')).toEqual({ start: 37, end: 42 })
    expect(sourceChunkLocator(shared, 'source-c')).toBeNull()
    const workspaceRoute = reactive({ name: 'authoring', query: { bookId: 'guard-book' } })
    let host
    const root = document.createElement('div')
    const app = createApp({ setup() { host = provideComposableWorkspace(workspaceRoute); return () => null } })
    app.mount(root)
    try {
      expect(host.openResource({ type: 'comic-editor', bookId: 'guard-book', pageId: 'page-one', panelId: 'panel-one' })).toBe(true)
      expect(host.openResource({ type: 'comic-editor', bookId: 'guard-book' })).toBe(true)
      expect(host.activeView.value.resource.pageId).toBe('page-one')
      expect(host.activeView.value.resource.panelId).toBe('panel-one')
      host.move(true)
      const moduleId = host.state.mainModuleId
      expect(moduleId).toBe(host.state.activeId)
      host.openResource({ type: 'sources', bookId: 'guard-book' })
      host.move(false)
      expect(host.state.mainModuleId).toBe(moduleId)
      expect(normalizeWorkspaceLayout(JSON.parse(localStorage.getItem('pinax-workspace-views:v1:["guard-book",""]')), { bookId: 'guard-book' }).mainModuleId).toBe(moduleId)
      expect(await host.close(host.state.activeId)).toBe(true)
      expect(await host.close(moduleId)).toBe(true)
      expect(host.state.mainModuleId).toBe('')
      expect(host.openResource({ type: 'source', bookId: 'other-book', id: 'source' })).toBe(false)
      expect(host.openResource({ type: 'source', bookId: 'guard-book', id: 'source' })).toBe(true)
      const id = host.state.activeId
      host.state.primaryComposing = true
      expect(host.move(true)).toBe(false)
      host.state.primaryComposing = false
      host.state.composingViewId = id
      expect(await host.close(id)).toBe(false)
      host.state.composingViewId = ''
      let permit
      const release = host.registerGuard(id, () => new Promise(resolve => { permit = resolve }))
      const pendingClose = host.close(id)
      host.move(true)
      permit(true)
      expect(await pendingClose).toBe(false)
      expect(host.state.views).toHaveLength(1)
      release()
      const task = reactive({ active: true })
      const removeTask = host.registerTaskAdapter(id, { summary: () => task.active ? { id: 'frozen-task', label: 'running' } : null })
      expect(await host.close(id)).toBe(false)
      expect(host.taskSummaries.value).toHaveLength(1)
      removeTask()
      expect(host.taskSummaries.value).toHaveLength(0)
      expect(await host.close(id)).toBe(true)
      // Main and side groups select concrete resources independently.
      host.openResource({ type: 'source', bookId: 'guard-book', id: 'main-source' })
      host.move(true)
      const mainSource = host.state.mainModuleId
      host.openResource({ type: 'source', bookId: 'guard-book', id: 'side-source' })
      const sideSource = host.state.sideActiveId
      expect(host.state.mainModuleId).toBe(mainSource)
      host.activate(sideSource)
      expect(host.state.mainModuleId).toBe(mainSource)
      host.move(true)
      expect(host.state.views.filter(view => view.group === 'main')).toHaveLength(2)
      host.activate(mainSource)
      expect(host.state.mainModuleId).toBe(mainSource)
      expect(await host.reorderView(sideSource, mainSource, 'main')).toBe(true)
      const groupedLayout = normalizeWorkspaceLayout(JSON.parse(localStorage.getItem('pinax-workspace-views:v1:["guard-book",""]')), { bookId: 'guard-book' })
      expect(groupedLayout.views.map(view => view.id)).toEqual([sideSource, mainSource])
      expect(groupedLayout.mainModuleId).toBe(mainSource)
      expect(groupedLayout.sideActiveId).toBe('')
      host.move(false, sideSource)
      expect(host.state.mainModuleId).toBe(mainSource)
      expect(host.state.sideActiveId).toBe(sideSource)
      expect(await host.openAt({ type: 'source', bookId: 'guard-book', id: 'main-source' }, 'side')).toBe(true)
      expect(await host.openAt({ type: 'source', bookId: 'guard-book', id: 'side-source' }, 'main')).toBe(true)
      expect(await host.openAt({ type: 'source', bookId: 'guard-book', id: 'main-source' }, 'side')).toBe(true)
      expect(host.state.mainModuleId).toBe(sideSource)
      expect(host.state.sideActiveId).toBe(mainSource)
      await host.close(mainSource)
      await host.close(sideSource)
      host.openResource({ type: 'chapter', bookId: 'guard-book', id: 'chapter-test' })
      const chapterView = host.state.activeId
      const denyChapter = host.bindChapterNavigator(async () => false)
      expect(await host.move(true, chapterView)).toBe(false)
      expect(host.state.views[0].group).toBe('side')
      denyChapter()
      const allowChapter = host.bindChapterNavigator(async resource => { host.trackPrimaryChapter(resource, '测试章'); return true })
      expect(await host.move(true, chapterView)).toBe(true)
      expect(host.state.views[0].group).toBe('main')
      host.state.primaryComposing = true
      expect(await host.reorderView(chapterView, '', 'side')).toBe(false)
      host.state.primaryComposing = false
      allowChapter()
      await host.close(chapterView)
      expect(host.openResource({ type: 'game-editor', bookId: 'guard-book' })).toBe(false)
      expect(host.openResource({ type: 'game-editor', bookId: 'guard-book', worldbookId: 'guard-world' })).toBe(true)
      expect(host.openResource({ type: 'online-editor', bookId: 'guard-book' })).toBe(false)
      await host.close(host.state.activeId)
      // A request belongs to the shell session; editor leases are replaceable.
      let finishHealth
      const health = new Promise(resolve => { finishHealth = resolve })
      let writes = 0
      let authorizations = 0
      const requestEngine = {
        prepare: () => ({ bookId: 'guard-book', currentChapterId: 'chapter-a' }),
        destination: () => ({ bookId: 'guard-book', chapterId: 'chapter-a' }),
        healthz: () => health,
        authorize: async () => { authorizations++ },
        revokePermission: () => {},
        prepareProposal: async input => ({ id: 'background-proposal', bookId: 'guard-book', status: 'pending', changes: input.changes }),
        run: async ({ callbacks }) => {
          callbacks.onTask({ taskId: 'background-task', bookId: 'guard-book' })
          return { ok: true, finalContent: '后台建议', finalToolResults: [
            { toolName: 'submit_edit_proposals', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, changes: [{ kind: 'chapter', targetId: 'chapter-a', field: 'content', text: '新段落' }] }) }] } },
            { toolName: 'complete_assistant_task', result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, intent: 'edit', outcome: 'proposal', message: '后台建议' }) }] } }
          ] }
        },
        cancel: async () => true,
        applyProposal: async () => { writes++; return { ok: true } }
      }
      const editorScope = effectScope()
      const assistant = editorScope.run(() => host.attachAssistant({ projectId: ref('guard-book'), agentEngine: requestEngine }))
      expect(await assistant.setAgentPermission({ mode: 'auto' })).toBe(true)
      const pending = assistant.ask({ question: '修改原章' })
      expect(assistant.busy.value).toBe(true)
      expect(await host.prepareLeave({ name: 'comic-studio', query: { bookId: 'guard-book' } }, workspaceRoute)).toBe(true)
      expect(await host.prepareLeave({ name: 'welcome', query: {} }, workspaceRoute)).toBe(false)
      editorScope.stop()
      expect(host.assistantSummary.value.label).toBe('助手运行中')
      finishHealth({ ok: true, assistantProtocolVersion: 2 })
      expect(await pending).toBe(true)
      expect(writes).toBe(0)
      expect(assistant.messages.value.at(-1).proposal.bookId).toBe('guard-book')
      expect(host.assistantSummary.value.label).toBe('助手有新结果')
      expect(await assistant.applyAgentProposal()).toBe(false)
      const renewedScope = effectScope()
      const renewed = renewedScope.run(() => host.attachAssistant({ projectId: ref('guard-book'), agentEngine: { ...requestEngine, healthz: async () => ({ ok: true, assistantProtocolVersion: 2 }) } }))
      expect(renewed.messages.value.at(-1).text).toBe('后台建议')
      expect(renewed.reviewProposal(renewed.messages.value.at(-1).id)).toBe(true)
      expect(await renewed.applyAgentProposal()).toBe(true)
      expect(writes).toBe(1)
      expect(authorizations).toBeGreaterThan(2)
      renewedScope.stop()
      workspaceRoute.query.bookId = 'another-book'
      await nextTick()
      expect(host.state.views).toHaveLength(0)
    } finally { app.unmount(); localStorage.removeItem('pinax-workspace-views:v1:["guard-book",""]') }
    let shutdownHost
    let signalAtShutdown
    let cancelled = 0
    const shutdownApp = createApp({ setup() { shutdownHost = provideComposableWorkspace(reactive({ name: 'authoring', query: { bookId: 'shutdown-book' } })); return () => null } })
    shutdownApp.mount(document.createElement('div'))
    const shutdownEditor = effectScope()
    const shutdownAssistant = shutdownEditor.run(() => shutdownHost.attachAssistant({ projectId: 'shutdown-book', agentEngine: {
      prepare: () => ({ bookId: 'shutdown-book' }), destination: () => ({ chapterId: 'original-chapter' }),
      healthz: async () => ({ ok: true }), revokePermission: () => {},
      run: async ({ signal, callbacks }) => {
        signalAtShutdown = signal
        callbacks.onTask({ taskId: 'shutdown-task', bookId: 'shutdown-book' })
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      },
      cancel: async () => { cancelled++; return true }
    } }))
    const interrupted = shutdownAssistant.ask({ question: '等待后退出应用' })
    await nextTick()
    shutdownEditor.stop()
    expect(signalAtShutdown.aborted).toBe(false)
    shutdownApp.unmount()
    expect(signalAtShutdown.aborted).toBe(true)
    expect(await interrupted).toBe(false)
    expect(cancelled).toBe(1)
    const workspaceTabs = readFileSync(resolve(__dirname, '../components/workbench/WorkspaceTabs.vue'), 'utf8')
    expect(workspaceTabs).toContain('src="/pinax-icon-192.png"')
    expect(workspaceTabs).toContain('height: 36px;')
    expect(workspaceTabs).toContain('var(--hairline-soft)')
    // N-B：关闭钮为兄弟 button（消除交互嵌套），hover/聚焦/激活时可见。
    expect(workspaceTabs).toContain('.ws-tab-slot:is(:hover, :focus-within) .ws-tab__close')
    expect(workspaceTabs).toContain('.ws-tab.is-active + .ws-tab__close')
    expect(writing).toContain(':to="rehearsalComposerHostRef || \'#authoring-block-gap\'"')
    expect(writing).toContain('ref="rehearsalComposerHostRef" v-show=')
    // C11 / AT-00a：手动锚点按钮已移除，改为断言两段真实行为接线。
    // ① composer 由关转开即自动 reveal 推演面板。
    expect(writing).toContain('if ((blockOpen && !previous[0]) || (interventionOpen && !previous[1])) void revealRehearsalComposer()')
    // ② 关闭右栏保留正文推演输入和运行中请求。
    expect(writing).toContain("if (!wasOpen || previousTool !== 'rehearsal' || (open && tool === 'rehearsal')) return")
    // ②b 收起不得等同丢弃；批注独立保持原关闭规则。
    expect(writing).not.toContain('if (blockComposer.open && !blockPreview.value) abandonBlockComposer({ restoreSelection: false })')
    expect(writing).toContain("if (interventionComposer.open && interventionComposer.phase !== 'ghosts') {")
    // ③ 已移除的锚点按钮不得回潮。
    expect(writing).not.toContain('authoring-rehearsal-anchor')
    expect(authoringBlockCss).toContain('.writing-inspector__compose-host')
    const composeSurface = authoringBlockCss.match(/\.theme-legacy \.writing-page \.writing-inspector__compose-host \{([^}]+)\}/)?.[1]
    expect(composeSurface).toContain('background: var(--surface-workbench)')
    expect(composeSurface).not.toContain('var(--archive-paper-soft)')
    const routes = readFileSync(resolve(__dirname, '../router/index.js'), 'utf8')
    expect(routes.split('const routes =')[0]).toContain("path: 'docs/:chapterId?'")
    const textarea = readFileSync(resolve(__dirname, '../components/worldbook/fields/FieldTextarea.vue'), 'utf8')
    expect(textarea).toContain("import autosize from 'autosize'")
    expect(textarea).toContain('autosize.destroy(textarea.value)')
    expect(textarea).toContain("{ flush: 'post' }")
    const settingsPanel = readFileSync(resolve(__dirname, '../components/worldbook/StructuredSettingsPanel.vue'), 'utf8')
    expect(settingsPanel).toContain(':aria-label="tr(\'查找设定\')"')
    expect(settingsPanel).toContain('async function openDirectoryMatch(item)')
    expect(settingsPanel).toContain(':rows="2"')
    const fieldActions = readFileSync(resolve(__dirname, '../components/worldbook/SettingFieldActions.vue'), 'utf8')
    expect(fieldActions).not.toContain('transition: all')
    expect(appShell).not.toContain('mode="out-in"')
    expect(appShell).not.toContain('transitionDirection')
    expect(settingsPanel).toMatch(/\.settings-editor-layout \{[^}]*min-width: 0;[^}]*max-width: 880px;[^}]*margin-inline: auto;/)
    expect(settingsPanel).toContain('.settings-editor-layout.has-review { max-width: none;')
    {
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/)
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \.wall__cork \{[\s\S]*display: flex;[\s\S]*flex-wrap: nowrap;[\s\S]*overflow-x: auto;/)
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \.wall__main \{[\s\S]*display: grid;[\s\S]*grid-template-columns:/)
      expect(authoringBlockCss).toContain('.writing-annotation__edit')
      expect(authoringBlockCss).toMatch(/\.writing-annotation__edit \{[\s\S]*border: 1px solid var\(--authoring-hairline\);[\s\S]*box-shadow: none;/)
      expect(authoringBlockCss).toContain(':has(> .writing-inspector.is-catalog-workbench)')
      expect(authoringWorldbookPanel).toContain('class="catalog-actions"')
      expect(authoringWorldbookPanel).toContain('@click="startCreate"')
      expect(authoringWorldbookPanel).toContain("{{ tr('新建') }}")
      expect(imageWorkbench).toContain('class="image-gen-style-option"')
      expect(imageWorkbench).toContain('role="radiogroup"')
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \.wall__shelf \{[\s\S]*display: grid;/)
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \.wall__dossier \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
      const regularPhoneChrome = authoringBlockCss.slice(
        authoringBlockCss.indexOf('@media (max-width: 520px)'),
        authoringBlockCss.indexOf('@media (max-width: 240px)')
      )
      expect(regularPhoneChrome).not.toContain('flex: 1 0 100%')
      expect(authoringBlockCss).toContain('@media (max-width: 240px)')
    }
{
    // A1：临时工具返回副稿时恢复阅读状态，过期来源不能恢复旧状态。
    const { shallowMount } = await import('@vue/test-utils')
    const { defineComponent, nextTick } = await import('vue')
    const { default: DualPane } = await import('../components/authoring/AuthoringDualPane.vue')
    const editorStub = defineComponent({
      template: '<div />',
      setup(_, { expose }) {
        expose({ captureSelectionBookmark: () => null, hasEditorFocus: () => true, focus: () => {} })
      }
    })
    const props = {
      bookId: 'a1-book', mainChapterId: 'a1-chapter',
      chapters: [{ id: 'a1-chapter', title: '雾港', editorDocument: createWritingDocument('莉娜停在门前。') }],
      saveChapter: () => true, saveExploration: () => true
    }
    const mountPane = () => shallowMount(DualPane, { props, global: { stubs: { WritingNotebookEditor: editorStub } } })
    const first = mountPane()
    let returned
    try {
      await nextTick()
      expect(first.find('[data-document-role="dual-worldbook-entry"]').exists()).toBe(false)
      expect(first.get('.authoring-dual-pane__title strong').text()).toBe('雾港')
      expect(first.find('.authoring-dual-pane__save').exists()).toBe(false)
      expect(first.find('[aria-label="交换主副章"]').exists()).toBe(false)
      const toggle = first.get('[aria-label="切换副窗内容"]')
      if (toggle.attributes('aria-expanded') !== 'false') await toggle.trigger('click')
      const snapshot = first.vm.captureSurfaceState()
      expect(snapshot).toMatchObject({ directoryOpen: false, sourceId: 'a1-chapter' })
      returned = mountPane()
      await nextTick()
      const returnedToggle = returned.get('[aria-label="切换副窗内容"]')
      if (returnedToggle.attributes('aria-expanded') === 'false') await returnedToggle.trigger('click')
      expect(await returned.vm.restoreSurfaceState({ ...snapshot, documentRevision: 'stale' })).toBe(false)
      expect(returnedToggle.attributes('aria-expanded')).toBe('true')
      expect(await returned.vm.restoreSurfaceState(snapshot)).toBe(true)
      await nextTick()
      expect(returnedToggle.attributes('aria-expanded')).toBe('false')
      expect(returned.find('[data-test="authoring-dual-directory"]').exists()).toBe(false)
    } finally { first.unmount(); returned?.unmount() }
}
{
const routerSource = await readFile(resolve(__dirname, '../router/index.js'), 'utf8')
    const navSource = await readFile(resolve(__dirname, '../config/workbenchNav.js'), 'utf8')
    expect(routerSource).toContain("name: 'authoring'")
    expect(routerSource).toContain("path: 'authoring'")
    expect(routerSource).toMatch(/path: 'authoring',[\s\S]*?hideGlobalMemory: true,[\s\S]*?title: '创作'/)
    expect(routerSource).toContain("path: 'experience'")
    expect(routerSource).toContain("path: '/writing', redirect: { name: 'authoring' }")
    expect(routerSource).toContain("name: 'collaboration-review'")
    expect(routerSource).toContain("VITE_COLLABORATION_V2_ENABLED === 'true'")
    expect(navSource).toContain("key: 'authoring'")
    expect(navSource).not.toMatch(/key: 'experience'[\s\S]*key: 'writing'/)
}
{
const source = await readFile(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    expect(source.match(/<WritingNotebookEditor/g)).toHaveLength(1)
    for (const chapterNavClass of ['authoring-chapter-search', 'authoring-chapter-create', 'authoring-chapter-tree', 'authoring-chapter-row']) {
      expect(source).toContain(chapterNavClass)
    }
    expect(source).not.toContain('authoring-chapter-filter')
    expect(source).not.toContain('wt3-side-right')
    expect(source).not.toContain('wt3-right-tree')
    expect(source).toContain(':docs="wt3IdeaShelfDocs"')
    expect(await readFile(resolve(__dirname, '../services/writing/writingChapterLabels.js'), 'utf8')).toContain('function chineseChapterNumber(value)')
    expect(writingChapterRowLabel(0, '第一章 开篇')).toBe('第一章 开篇')
    expect(writingChapterRowLabel(1, '')).toBe('第二章')
    expect(writingChapterRowLabel(2, '旧标题')).toBe('第三章 旧标题')
    expect(source).toContain("tr('{value0} · 拖拽排序', { value0: chapterRowLabel(entry.index, entry.chapter.title) })")
    expect(source).toContain('v-for="entry in visibleChapterEntries"')
    expect(source).not.toContain('<template v-for="book in books"')
    expect(source).not.toContain('AuthoringCommandBar')
    expect(source).not.toMatch(/scene[- ]branch|场景分支|草稿分支/)
    expect(source).not.toMatch(/authoring-mode-tabs|体验模式|写作模式/)
    expect(source).toContain('class="writing-page wall wt3-prototype"')
    expect(source).not.toContain('const wt3Prototype')
    expect(source).toContain("文本工作台 v3 正式文档树")
    expect(source).toContain('<AuthoringIdeaShelf')
    expect(source).toContain('<AuthoringDualPane')
    expect(source).toContain('<AuthoringQuickWords')
    expect(source).toContain('<AuthoringAssistantWorkspace')
    const workspace = await readFile(resolve(__dirname, '../components/authoring/AuthoringAssistantWorkspace.vue'), 'utf8')
    expect(authoringKnowledgeAssistant).toContain('authoring-knowledge__question-row:hover .authoring-knowledge__edit-trigger')
    expect(authoringKnowledgeAssistant).toContain('authoring-knowledge__question-row:focus-within .authoring-knowledge__edit-trigger')
    expect(authoringKnowledgeAssistant).toContain('@media (hover: none), (pointer: coarse)')
    expect(workspace).toContain('<AuthoringKnowledgeAssistant')
    expect(workspace).toContain(':notice="notice"')
    // The real assistant component renders Markdown, streams updates and strips executable HTML.
    {
      const { mount } = await import('@vue/test-utils')
      const { default: KnowledgeAssistant } = await import('../components/authoring/AuthoringKnowledgeAssistant.vue')
      const answer = { id: 'markdown-answer', kind: 'agent', role: 'assistant', text: '\n\n**人物**\n\n---\n\n1. 第一项\n2. 第二项\n\n<script>window.injected = true</script><a href="javascript:alert(1)">坏链接</a>', thinking: '核对资料。', tools: [{ name: 'world_lookup' }] }
      const panel = mount(KnowledgeAssistant, { props: { messages: [answer] }, global: { stubs: { AuthoringAgentTools: true } } })
      try {
        expect(panel.find('.authoring-knowledge__markdown strong').text()).toBe('人物')
        expect(panel.findAll('.authoring-knowledge__markdown ol li')).toHaveLength(2)
        expect(panel.find('.authoring-knowledge__markdown hr').exists()).toBe(true)
        expect(panel.find('.authoring-knowledge__markdown script').exists()).toBe(false)
        expect(panel.find('.authoring-knowledge__markdown a').attributes('href')).toBeUndefined()
        expect(panel.findAll('.authoring-knowledge__process > details')).toHaveLength(2)
        expect(panel.find('.authoring-knowledge__process details').element.open).toBe(false)
        await panel.setProps({ messages: [{ ...answer, text: '**流式' }] })
        await panel.setProps({ messages: [{ ...answer, text: '**流式完成**' }] })
        expect(panel.find('.authoring-knowledge__markdown strong').text()).toBe('流式完成')
      } finally { panel.unmount() }
    }

    expect(source).toContain('<AuthoringInterventionComposer')
    expect(source).toContain('@open-intervention="openInterventionComposer"')
    expect(source).toContain(':intervention-enabled="!wt3ActiveDoc"')
    expect(source).toContain('createAuthoringInterventionSession')
    expect(notebookEditor).toContain("emit('open-intervention'")
    expect(authoringInterventionComposer).toContain('先看影响')
    expect(authoringInterventionComposer).toContain('不会修改正文')
    expect(authoringInterventionComposer).not.toMatch(/manifest|receipt|token|candidate ID/i)
    expect(authoringInterventionComposer).toContain('data-test="intervention-collaborate"')
    expect(source).toContain("activeInspectorTool === 'collaboration'")
    expect(source).toContain('queueAuthoringRehearsalAdoptionReceipt(1)')
    expect(source).toMatch(/markAuthoringInterventionAdoptionPersisted[\s\S]*queueAuthoringRehearsalAdoptionReceipt\(1\)/)
    expect(rehearsalReviewSurface).toContain('只读排演草稿')
    expect(rehearsalReviewSurface).toContain("mode === 'host'")
    expect(collaborationReview).toContain('scrubAuthoringRehearsalInviteFragment()')
    expect(collaborationReview).not.toMatch(/useWorldStore|loadWritingBooks|provider|Authoring\.vue/)
    expect(authoringInterventionGhost).toContain('data-test="intervention-adopt"')
    expect(authoringInterventionGhost).toContain('data-test="intervention-retry-persist"')
    expect(authoringInterventionGhost).toContain('data-test="intervention-adopt-all"')
    expect(source).toContain('<AuthoringLivingStoryProjection')
    expect(source).toContain('sceneInspectorMode === \'story\'')
    expect(source).toContain('@intervene="interveneFromLivingStory"')
    expect(authoringLivingStory).toContain('data-test="living-story-projection"')
    expect(authoringLivingStory).toContain('从正文、当前场和项目大纲即时派生')
    expect(authoringLivingStory).toContain('@media (max-width: 720px)')
    expect(authoringLivingStory).not.toMatch(/localStorage|saveWritingBooks|updateProjectOutline/)
    expect(authoringInterventionGhost).toContain('其他排演草稿不受影响')
    expect(source).toContain('prepareAuthoringInterventionAdoption')
    expect(source).toContain('persistPendingInterventionAdoption')
    expect(source).toContain('prepareAuthoringInterventionUmbrellaUndo')
    expect(authoringDualPane).toContain('applyInterventionAdoption')
    expect(authoringDualPane).toContain('persistInterventionAdoption')
    expect(source).toContain('<AuthoringIllustratorDrawer')
    expect(source).toContain('data-test="authoring-illustrator-trigger"')
    expect(source).toContain('@pointerdown="freezeIllustratorSource"')
    expect(source).toContain('captureCurrentIllustratorSource')
    expect(source).toContain('v-if="selectionActionsVisible && !illustratorBlocking && !reviewPanelOpen && !searchPanelOpen"')
    expect(source).toMatch(/function positionSelectionActions\(selection\) \{[\s\S]*?if \(illustratorBlocking\.value\) \{[\s\S]*?hideSelectionActions\(\)/)
    expect(authoringDualPane).toContain('captureVisualSource')
    expect(authoringDualPane).toContain('insertMediaReference')
    expect(authoringIllustratorDrawer).toContain('<ImageGenerationWorkbench')
    expect(authoringIllustratorDrawer).toContain('<Teleport to="body">')
    expect(authoringIllustratorDrawer).toContain('application.inert = true')
    expect(authoringIllustratorDrawer).toContain('<template #brief>')
    expect(authoringIllustratorDrawer).toContain(':action-guard="guardResultAction"')
    expect(authoringIllustratorDrawer).toContain('presentation="authoring"')
    expect(authoringIllustratorDrawer).toContain("emit('update:minimized', true)")
    expect(imageWorkbench).toContain('authoringStylePresets')
    expect(imageWorkbench).toContain('参考提示词')
    expect(imageWorkbench).toContain('removeGeneratedImageFromLibrary')
    expect(imageWorkbench).toContain('COMIC_IMAGE_NEGATIVE_PROMPT')
    expect(authoringIllustratorComposable).toContain('createAuthoringVisualBrief')
    expect(authoringIllustratorComposable).toContain('assessAuthoringVisualBriefFreshness')
    expect(authoringIllustratorComposable).not.toContain('localStorage')
    expect(authoringIllustrationActions).toContain('validateAuthoringIllustrationInsert')
    expect(authoringIllustrationActions).toContain('saveAuthoringIllustrationAsMaterial')
    expect(source).toContain('<AuthoringReviewPanel')
    expect(source).toContain('@pointerdown="freezeReviewSource"')
    expect(authoringReviewComposable).toContain('prepareAuthoringReviewTransaction')
    expect(source).toContain('<AuthoringSearchPanel')
    expect(source).toContain('@pointerdown="freezeSearchSource"')
    expect(authoringSearchComposable).toContain('createAuthoringReplacePlan')
    expect(authoringSearchComposable).toContain('applyAuthoringReplacePlan')
    expect(source).toContain('saveWritingBooksDurable(nextBooks).ok')
    expect(source).not.toContain('showFindReplace')
    expect(source).toContain('<AuthoringHistoryPanel')
    expect(authoringHistoryPanel).toContain(':checked="history.preferences.value.enabled"')
    expect(authoringHistoryWorkflow).toContain('planWritingMilestoneSnapshot')
    expect(authoringHistoryWorkflow).toContain('recordWritingProtectionSnapshot')
    expect(source).toContain(':before-destructive-edit="protectMainDestructiveEdit"')
    expect(source).toContain(':protect-destructive-edit="protectDualDestructiveEdit"')
    expect(source).toContain('dualPaneRef.value?.prepareClose?.() === false')
    expect(source).toContain('dualPaneRef.value?.reloadSearchSource?.({')
    expect(authoringHistoryWorkflow).toMatch(/document\.revision = Math\.max\([\s\S]*?Number\(document\.revision \|\| 0\)[\s\S]*?\) \+ 1/)
    expect(authoringHistoryWorkflow).toContain('historyRestoreEpoch: `restore-${Date.now().toString(36)}-')
    expect(source).toContain("historyRestoreEpoch: String(source?.meta?.historyRestoreEpoch || '')")
    expect(authoringDualPane).toContain("historyRestoreEpoch: String(documentState.value?.meta?.historyRestoreEpoch || '')")
    expect(source).not.toContain('<AuthoringAiReference')
    expect(authoringToolRail).toContain("id: 'ai'")
    expect(source).toContain('data-authoring-inspector="ai"')
    expect(source).toContain("'is-catalog-workbench': ['outline', 'characters', 'worldbook'].includes(activeInspectorTool)")
    expect(writing).toContain('<AuthoringCharacterPanel')
    for (const action of ['新建', '提取', '生图', '上传', '提及章节']) expect(authoringCharacterPanel).toContain(action)
    for (const field of ['背景', '性格', '外貌', '其他']) expect(authoringCharacterPanel).toContain(`'${field}'`)
    expect(authoringCharacterPanel).toContain("emit('remove', selectedCharacter.value.id)")
    expect(authoringCharacterPanel).toContain("watch(draft, scheduleSave")
    expect(authoringCharacterPanel).toContain("emit('generate', { entry: selectedCharacter.value, prompt, referenceImage: draft.avatar })")
    expect(authoringCharacterPanel).toContain('parseCharacterEntryProfile')
    expect(authoringCharacterPanel).toContain('serializeCharacterEntryProfile')
    expect(authoringCharacterPanel).toContain('characterFolders')
    expect(authoringCharacterPanel).toContain('collapsedFolders')
    expect(authoringCharacterPanel).toContain(':aria-expanded="(!collapsedFolders.has(group.name)).toString()"')
    expect(authoringCharacterPanel).not.toContain("label: '主要角色'")
    expect(authoringCharacterPanel).not.toContain("label: '次要角色'")
    expect(authoringCharacterPanel).toContain('preservedScroll')
    expect(source).toContain("openProjectSettingsSurface('settings', { entryId })")
    const contentWorkspace = readFileSync(resolve(__dirname, '../components/worldbook/WorldbookContentWorkspace.vue'), 'utf8')
    expect(contentWorkspace).toContain('expectedFingerprint: target.fingerprint')
    expect(contentWorkspace).toContain('defineExpose({ flushAll })')
    expect(contentWorkspace).toContain('saveEntryPanelDraft')
    expect(contentWorkspace).toContain('EntryDataTable')
    expect(contentWorkspace).toContain('GraphCanvas')
    expect(contentWorkspace).toContain('ForeshadowLedgerTable')
    expect(contentWorkspace).not.toContain('KnowledgeMethodPanel')
    expect(authoringCharacterPanel).toContain('@input="resizeProfileField($event.currentTarget)"')
    expect(authoringCharacterPanel).toContain('resize:none')
    expect(authoringCharacterPanel).toContain('overflow:hidden')
    expect(authoringCharacterPanel).not.toContain('rows="3"')
    expect(authoringCharacterPanel).toContain('生成角色图')
    expect(authoringCharacterPanel).toContain('上传角色图')
    expect(authoringCharacterPanel).toContain('单张不大于 5MB')
    expect(authoringCharacterPanel).toContain('新建时会自动为这本书建立资料库')
    expect(source).toContain('ensureBookWorldbookForAuthoring')
    expect(source).toContain("description: book.manuscriptLanguage === 'en' ? 'Characters and worldbuilding for this manuscript' : '随书稿建立的人物与设定资料库'")
    expect(authoringCharacterPanel).not.toContain('editing')
    expect(authoringCharacterPanel).not.toContain('人物出身、经历与当前处境')
    expect(authoringCharacterAiReview).toContain("dispatch('settings.character.complete'")
    expect(authoringCharacterAiReview).not.toContain('parseCharacterCards')
    expect(authoringWorldbookPanel).toContain("directoryMode = ref('contextual')")
    expect(authoringWorldbookPanel).toContain("entry?.type !== 'character'")
    expect(authoringWorldbookPanel).toContain('新建时会自动为这本书建立资料库')
    expect(authoringWorldbookPanel).toContain("emit('update', selectedEntry.value.id")
    expect(authoringWorldbookPanel).toContain('<AuthoringSettingAiReview')
    expect(authoringWorldbookPanel).toContain('class="catalog-search"')
    expect(authoringWorldbookPanel).toContain(':aria-label="tr(\'搜索设定\')"')
    expect(authoringWorldbookPanel).toContain('@click="startCreate"')
    expect(authoringWorldbookPanel).not.toContain("emit('open-character'")
    expect(authoringWorldbookPanel).toContain(':aria-expanded="(!collapsedFolders.has(group.name)).toString()"')
    expect(writing).toContain("activeInspectorTool === 'history' || (activeInspectorTool === 'annotations' && inspectorTab === 'version')")
    expect(writing).toContain(':focus-entry-id="inspectorCharacterEntryId"')
    expect(authoringIllustratorComposable).toContain('visualReferenceCandidates')
    expect(authoringIllustratorComposable).toContain('inlineCandidates')
    // 大纲与人物目录共用直接编辑稿面：可搜索、自动增高并保存，原操作与历史入口保留。
    for (const label of ['搜索大纲', '大纲标题', '大纲内容', '历史版本', '总纲', '章纲']) expect(authoringOutlinePanel).toContain(label)
    expect(authoringOutlinePanel).toContain('catalog-prose-field')
    expect(authoringOutlinePanel).toContain('@input="scheduleSave" @blur="flushSave"')
    expect(authoringOutlinePanel).toContain('resizeContent()')
    expect(authoringOutlinePanel).toContain("emit('update-project', item.id")
    expect(authoringOutlinePanel).toContain("emit('update', item.id")
    expect(authoringOutlinePanel).toContain("emit('history')")
    expect(authoringOutlinePanel).not.toContain('文本模式')
    expect(authoringOutlinePanel).toContain("emit('insert', selectedItem)")
    expect(authoringOutlinePanel).toContain("toggleGroup('project')")
    expect(authoringOutlinePanel).toContain("toggleGroup('chapter')")
    const knowledgeTemplate = authoringKnowledgeAssistant.split('<script setup>')[0]
    // 助手已收拢为讨论/查阅两种意图；写作起点与真实工具仍须可达。
    for (const task of ['讨论故事', '查阅资料', '检查文稿', '生成插图', '理清人物关系', '回顾前文', '讨论下一段', '构思人物', '展开情节', '想个开场']) {
      expect(authoringKnowledgeAssistant).toContain(task)
    }
    expect(knowledgeTemplate).toContain('AuthoringAssistantPermissions')
    expect(knowledgeTemplate).toContain("tr('助手权限')")
    expect(knowledgeTemplate).toContain('参考资料')
    expect(knowledgeTemplate).toContain('message.answer.calculations.length')
    expect(knowledgeTemplate).toContain('onEvidenceClick(evidence, $event.currentTarget)')
    expect(authoringKnowledgeAssistant).toContain('recordKnowledgeSeamFocus(evidence.sourceRef, evidence.projectId)')
    expect(knowledgeTemplate).toContain('资料已更新')
    expect(knowledgeTemplate).not.toMatch(/manifest|receipt|candidate ID|上下文数量/i)
    // 20261009 修订：用量展示按用户裁定上屏（正常 token 计量、中性「用量」标签），
    // 术语禁令收敛为「用户可见的 Token 字样标签」不允许；属性访问（totalTokens）属机器面不算文案。
    expect(knowledgeTemplate).not.toMatch(/[Tt]oken \{/i)
    expect(knowledgeTemplate).toContain('用量 {n}')
    expect(knowledgeTemplate).not.toContain('<q>')
    expect(authoringKnowledgeComposable).toContain('createAuthoringKnowledgeQuerySession')
    expect(authoringKnowledgeComposable).toContain('reconcileAuthoringKnowledgeAnswer')
    expect(authoringKnowledgeComposable).toContain('resolveLiveSource')
    expect(authoringKnowledgeComposable).toContain('AbortController')
    expect(authoringKnowledgeComposable).not.toContain('localStorage')
    expect(authoringInspectorComposable).toContain("normalizedTool === 'ai'")
    expect(authoringInspectorComposable).toContain('captureAssistantInvocation?.()')
    expect(authoringInspectorComposable).toContain('function openInspectorTool(tool, options = {})')
    expect(authoringInspectorComposable).toContain("activeInspectorTool.value === 'dual' && normalizedTool !== 'dual'")
    expect(source).toContain("openInspectorTool('rehearsal')")
    expect(source).toContain("openInspectorTool('worldbook')")
    expect(source).toContain('captureAssistantInvocation: captureKnowledgeAssistantInvocation')
    expect(source).toContain('if (wt3ActiveDoc.value) return null')
    expect(authoringDualPane).toContain('captureKnowledgeSource')
    expect(source).toContain(':aria-label="tr(&quot;快捷词建议&quot;)"')
    expect(source).toContain('writingCompositionActive.value || dualCompositionActive.value')
    expect(authoringQuickWords).toContain('角色')
    expect(authoringQuickWords).toContain('设定')
    expect(authoringQuickWords).toContain('智能提取')
    expect(authoringQuickWords).toContain("['，', '。', '！', '？', '：', '；', '“', '”']")
    expect(source).toContain('handleQuickWordDigitKey(event)')
    expect(source).toContain(':aria-keyshortcuts="String(index + 1)"')
    expect(source).toContain('@document-change="dualQuickWordDocument = $event"')
    expect(authoringDualPane).toContain(':aria-label="tr(&quot;副栏快捷词建议&quot;)"')
    expect(authoringDualPane).toContain("emit('document-change', value)")
    expect(source).toContain("activeInspectorTool === 'dual'")
    expect(source).toContain('在双栏打开')
    expect(source).not.toContain('>多窗<')
    expect(authoringDualPane).toContain('data-test="authoring-dual-pane"')
    expect(authoringDualPane).toContain('data-test="authoring-dual-directory"')
    expect(authoringDualPane).toContain(':aria-label="tr(&quot;副窗内容类型&quot;)"')
    expect(authoringDualPane).toContain("{ id: 'character', label: '角色' }")
    expect(authoringDualPane).toContain("{ id: 'exploration', label: '便签' }")
    expect(authoringDualPane).toContain('closeSwitchOnNarrow()')
    expect(authoringDualPane).toContain(':editable="true"')
    expect(authoringDualPane).toContain(':block-composer-enabled="interventionGhostOpen"')
    expect(authoringDualPane).toContain(':block-composer-target="interventionGhostTarget"')
    expect(authoringDualPane).toContain(':before-destructive-edit="requestDestructiveProtection"')
    expect(authoringDualPane).toContain('block-gap-id="authoring-dual-block-gap"')
    expect(authoringDualPane).toContain(':aria-label="tr(&quot;交换主副章&quot;)"')
    expect(authoringDualPane).toContain('captureRunTarget,')
    expect(authoringDualPane).toContain('readLiveRunTarget')
    expect(authoringDualPane).toContain("selectedKind === 'exploration'")
    expect(authoringDualPane).toContain("props.saveExploration")
    expect(authoringDualPane).toContain("selectedKind === 'outline'")
    expect(authoringDualPane).toContain("selectedKind === 'worldbook-entry'")
    expect(authoringDualPane).toContain('data-outline-node-id')
    expect(authoringDualPane).toContain('data-worldbook-entry-id')
    expect(authoringDualPane).toContain('设定已删除或解绑')
    expect(authoringDualPane).toContain('getSelectionSnapshot?.()')
    expect(authoringDualPane).toContain('props.resolveSceneProjection?.({')
    expect(writing).toContain('activeNotebookCommandAvailability')
    expect(writing).toContain("activeWritingPane.value === 'dual'")
    expect(writing).toContain("dualPaneRef.value?.runCommand?.('undo')")
    expect(writing).toContain('dualSharesMainDocument()')
    expect(writing).toContain(':resolve-scene-projection="resolveDualSceneProjection"')
    expect(writing).toContain('dualPaneRef.value?.readLiveRunTarget?.(expected)')
    expect(writing).toContain('@open-dual="openOutlineInDual"')
    expect(writing).toContain('@update="updateAuthoringSetting"')
    expect(notebookEditor).toContain("blockGapId: { type: String, default: 'authoring-block-gap' }")
    expect(notebookEditor).toContain('beforeDestructiveEdit: { type: Function, default: null }')
    expect(notebookEditor).toContain('blockComposerEnabled: { type: Boolean, default: true }')
    expect(source).toContain('@swap="swapDualChapter"')
    expect(source).toContain('@open-dual="openExplorationInDual"')
    expect(source).toContain(':save-exploration="saveDualExploration"')
    expect(authoringBlockCss).toMatch(/\.wall__main\.has-inspector[\s\S]*grid-template-columns:[^;]+52px/)
    expect(source).not.toContain("＋ 快速落笔")
    expect(source).not.toContain('未编排 {{')
    expect(source).not.toContain('<AuthoringContextPicker')
    expect(source).toContain(':legacy-note-count="wt3LegacyNoteCount"')
    expect(source).toContain(':chapters="chapters"')
    expect(source).toContain(':explorations="wt3ExplorationDocs"')
    expect(source).toContain('@open-project-chapter="selectChapter"')
    expect(source).toContain('@open-project-exploration="openExplorationDoc"')
    expect(source).toContain("const wt3MigratedBookIds = new Set()")
    expect(source).toContain("const wt3MigrationTasks = new Map()")
    expect(source).toContain("const bookId = String(selectedBookId.value || '')")
    expect(source).toContain("wt3RefreshDocs(bookId)")
    expect(source).toContain('const wt3IdeaShelfDocs = computed')
    expect(source).toContain("associationLabel: associationLabels.length ? tr('关联")
    expect(source).not.toMatch(/node\.chapterRef(?!s)/)
    expect(source).not.toContain('node.adoptedDocumentId')
    expect(source).not.toContain("includes('wt3=1')")
    expect(source).toContain("<span>{{ tr('事实') }}</span>")
    expect(notebookEditor).toContain('writing-cjk-quote')
    expect(notebookEditor).toContain("'data-worldbook-entry-ids'")
    expect(source).toContain(':candidate-entry-ids="inspectorWorldbookCandidateIds"')
    expect(notebookEditor).toContain('line-break: strict')
    const authoringTemplate = source.split('<script setup>')[0]
    for (const command of ['undoNotebookEdit', 'redoNotebookEdit', "toggleNotebookMark('bold')", "toggleNotebookMark('italic')", 'insertSeparator']) {
      expect(authoringTemplate).toContain(command)
    }
    expect(authoringTemplate).not.toContain('@click="autoFormat"')
    expect(authoringTemplate).toContain('openNameGenerator')
    expect(authoringTemplate).toContain('快速取名')
    for (const namingDimension of ['名称类型', '名字语言', '名字字数', '名字性别']) {
      expect(authoringTemplate).toContain(namingDimension)
    }
    for (const category of ['人物', '地点', '组织', '功法/能力', '道具']) expect(source).toContain(category)
    expect(authoringTemplate).toContain('@click="selectName(item)"')
    expect(authoringTemplate).toContain('data-test="create-name-entity"')
    expect(authoringTemplate).toContain('@click="requestNameEntityCreation(item)"')
    expect(authoringTemplate).toContain('仍然新建')
    const entityTypes = { person: 'character', place: 'location', organization: 'organization', ability: 'lore', item: 'item' }
    for (const [category, entryType] of Object.entries(entityTypes)) {
      const selection = createAuthoringEntitySelection({
        id: `selection-${category}`,
        text: `${category}-name`,
        category,
        projectId: 'book-1',
        rationale: '候选依据'
      })
      expect(Object.isFrozen(selection)).toBe(true)
      expect(buildAuthoringEntityEntry(selection)).toBe(null)
      const command = createAuthoringEntityEntryCommand(selection, { projectId: 'book-1', worldbookId: 'wb-real' })
      expect(buildAuthoringEntityEntry(command)).toMatchObject({
        type: entryType,
        metadata: { authoringEntityKind: category, authoringSelectionId: `selection-${category}` }
      })
      expect(createAuthoringEntitySelectionReceipt(command, { entry: { id: `entry-${category}` } })).toMatchObject({
        projectId: 'book-1',
        worldbookId: 'wb-real',
        sourceRef: `worldbook-entry:entry-${category}`
      })
    }
    expect(createAuthoringEntitySelection({ text: '无效分类', category: 'unknown' })).toBe(null)
    expect(createAuthoringEntityEntryCommand(
      createAuthoringEntitySelection({ text: '错书', category: 'person', projectId: 'book-1' }),
      { projectId: 'book-2', worldbookId: 'wb-2' }
    )).toBe(null)
    const conflictSelection = createAuthoringEntitySelection({ text: '阿昭', category: 'person', projectId: 'book-1' })
    expect(findAuthoringEntitySelectionConflicts(conflictSelection, {
      id: 'wb-real', entries: [{ id: 'char-lina', type: 'character', name: '林昭', keysSecondary: ['阿昭'] }]
    })).toMatchObject([{ entryId: 'char-lina', sourceRef: 'worldbook-entry:char-lina', sameType: true }])
    const firstBatch = generateWritingNames({ language: 'chinese', length: 'three', gender: 'neutral', count: 12, random: () => 0.5 })
    const secondBatch = generateWritingNames({ language: 'chinese', length: 'three', gender: 'neutral', count: 12, exclude: firstBatch, random: () => 0.5 })
    expect(new Set(firstBatch).size).toBe(12)
    expect(new Set(secondBatch).size).toBe(12)
    expect(secondBatch.some((name) => firstBatch.includes(name))).toBe(false)
    for (const category of ['person', 'place', 'organization', 'ability', 'item']) {
      const recent = []
      for (let batch = 0; batch < 10; batch += 1) {
        const values = generateWritingNames({ category, count: 12, exclude: recent.flat(), random: () => 0.5 })
        expect(values).toHaveLength(12)
        expect(values.some((name) => recent.flat().includes(name))).toBe(false)
        recent.push(values)
      }
      expect(new Set(recent.flat()).size).toBe(120)
    }
    for (const language of ['western', 'japanese']) {
      expect(generateWritingNames({ language, length: 'multi', gender: 'female', count: 12 }).length).toBe(12)
    }
    expect(generateWritingNames({ language: 'chinese', length: 'multi', gender: 'male', surname: '顾', count: 8 }).every((name) => name.startsWith('顾') && name.length >= 4)).toBe(true)
    expect(authoringTemplate).toContain('writingTypography.toggleFirstLineIndent()')
    expect(authoringTemplate).toContain('writingTypography.setParagraphGap')
}
{
expect(existsSync(desktopProjectGatePath)).toBe(true)
    for (const token of ['var(--bg-primary)', 'var(--bg-secondary)', 'var(--text-primary)', 'var(--text-secondary)', 'var(--accent)', 'var(--border)', 'var(--font-sans)']) {
      expect(desktopProjectGate).toContain(token)
    }
    expect(desktopProjectGate).toContain('@media (max-width: 768px)')
    expect(desktopProjectGate).toContain(':focus-visible')
    expect(desktopProjectGate).not.toMatch(/transition:\s*all/)
}
{
for (const cls of ['control-primary', 'control-secondary', 'control-quiet', 'control-icon', 'control-toggle', 'control-danger', 'control-group']) {
      expect(css).toContain(`.${cls}`)
    }
    // 共享基座：disabled / focus-visible / coarse pointer 命中区
    expect(css).toContain("[class*='control-']:focus-visible")
    expect(css).toContain("[class*='control-']:disabled")
    expect(css).toMatch(/@media[^{}]*\(pointer:\s*coarse\)/)
    expect(css.match(/min-height: 44px/g)?.length).toBeGreaterThanOrEqual(1)
    // 禁止 transition: all（只允许 color/background/opacity/transform）
    expect(css).not.toMatch(/transition:\s*all/)
    for (const transition of css.match(/transition:[^;]+;/g) || []) {
      expect(transition).toMatch(/color|background|opacity|transform|none/)
    }
    // toggle 激活态走 aria-pressed，不用框
    expect(css).toContain(".control-toggle[aria-pressed='true']")
    // 输入安全 token
    expect(css).toContain('--control-focus')
    expect(css).toContain('--control-danger')
    expect(css).toContain(":not([aria-disabled='true'])")
    expect(css).toContain(':where(button, a, summary, input)')
    const navigation = readFileSync(resolve(__dirname, '../styles/workspace-navigation.css'), 'utf8')
    for (const token of ['--workspace-sidebar-width: 256px', '--nav-focused', '--nav-selected', '.workspace-nav-item:focus-visible', 'prefers-reduced-motion']) expect(navigation).toContain(token)
    const mapTree = readFileSync(resolve(__dirname, '../components/geography/WorldTreeItem.vue'), 'utf8')
    expect(mapTree).toContain('<button v-else class="node-name workspace-nav-label"')
    expect(mapTree).toContain('.tree-row:focus-within .row-actions')
    expect(writing).toContain('@keydown.space.prevent="selectChapter(entry.chapter.id)"')
    // 单一产品主题在入口静态加载控件层，不再保留运行时主题分叉。
    expect(mainEntry).toContain("import './styles/workbench-controls.css'")
}
})

  it("closes the topmost experience overlay with Escape before the rail（合并4例）", async () => {
{
    const experienceHeader = readFileSync(resolve(__dirname, '../components/experience/ExperienceSessionHeader.vue'), 'utf8')
    expect(experienceHeader).toContain("emit('open-advisor')")
    expect(readFileSync(resolve(__dirname, '../pages/Experience.chrome.css'), 'utf8')).toContain(':deep(.gm-persona-dock) { display: none; }')
    const online = readFileSync(resolve(__dirname, '../pages/OnlineExperience.vue'), 'utf8')
    expect(online).toContain("if (import.meta.env.VITE_COLLABORATION_V2_ENABLED === 'true') {")
    expect(online).toContain('refreshShareInviteState()')
    expect(online).toContain("router.resolve({ name: 'online-experience', params: { roomSlug: sourceRoom } })")
    expect(online).toContain('await navigator.clipboard.writeText(url)')
    expect(online).toContain('aria-label="手动复制房间链接"')
    expect(online).toContain(':aria-expanded="roomPanelOpen"')
    expect(online).toContain('aria-controls="online-room-panel"')
    expect(online).toContain('const roomPanelOpen = ref(false)')
    expect(online).toContain('onBeforeRouteUpdate(')
    expect(online).toContain('defineExpose({ canCloseWorkspace')
    expect(normalizeWorkspaceResource({ type: 'online-editor', bookId: 'a', roomSlug: 'room-a', inviteSecret: 'never-persist' })).toEqual({ type: 'online-editor', bookId: 'a', worldbookId: '', id: '', roomSlug: 'room-a' })
    expect(online).toMatch(/@media \(max-width: 760px\)[\s\S]*?online-page__room-panel \{ display: none; position: static;/)
    expect(online).toContain('.is-room-panel-open .online-page__room-panel { display: block; }')
}

{
expect(experience).toContain('if (writingCollectOpen.value) {')
    expect(experience).toContain("id: 'experience-writing-collect'")
    expect(experience).toContain('initialFocus: () => writingCollectCloseRef.value')
    expect(experience).toContain('@keydown="trapWritingCollectFocus"')
    expect(experience).toContain('writingCollectOpen.value || quickNoteOpen.value')
    expect(experience).toContain("if (inlineDetail.value) {")
    expect(experience).toContain("if (codexDetailSection.value) {")
    expect(experience).toContain("if (isQuickNoteOpen()) {")
    expect(experience).toContain('closeCodexSheet()')

    const dialog = document.createElement('div')
    dialog.innerHTML = '<button type="button">first</button><button type="button">last</button>'
    document.body.appendChild(dialog)
    const [first, last] = dialog.querySelectorAll('button')
    first.focus()
    const backwards = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    expect(trapFocusWithin(backwards, dialog)).toBe(true)
    expect(document.activeElement).toBe(last)
    dialog.remove()
}
{
const shellTemplate = appShell.split('<style scoped>')[0]
    const experienceTemplate = experience.split('<script setup>')[0]

    expect(shellTemplate).not.toContain('shell-tabbar')
    expect(shellTemplate).not.toContain('shell-subnav')
    expect(shellTemplate).toContain('shell-drawer__utility')
    expect(shellTemplate).toContain('<WorkspaceProjectNavigation')
    expect(shellTemplate).toContain(':current="currentProjectSurface"')
    expect(shellTemplate).not.toContain('data-test="shell-storage-status"')
    expect(shellTemplate).toContain('备份与恢复')
    const backupSettings = readFileSync(resolve(__dirname, '../components/workbench/SettingsPopup.vue'), 'utf8')
    expect(backupSettings).not.toMatch(/StorageCleanup|useStorageHealth|storage-summary|storage-technical/)
    expect(backupSettings).toContain('data-test="backup-export-workspace-button"')
    expect(backupSettings).toContain('data-test="backup-export-button"')
    expect(backupSettings).toContain('data-test="backup-restore-confirm"')

    expect(experienceTemplate).not.toContain('ws-topstrip__settings-link')
    expect(experienceTemplate).not.toContain('ws-topstrip__session-chip')
    expect(experienceTemplate).toContain('<ExperienceSessionHeader')
    expect(experienceSessionHeader).toContain('ws-session-trigger')
    expect(experienceSessionHeader).toContain('ws-more-menu')
    expect(experienceSessionHeader).toContain('ws-topstrip__codex-toggle')
}
{
expect(inputArea).toContain('<textarea')
    // C 线跑团（nightly-20260916）：placeholder 改为动态绑定（轻规则模式提示检定入口），
    // 默认文案保持不变。共享测试最小补丁，O 复核点。
    expect(inputArea).toContain('写下行动或续写方向')
    expect(inputArea).toContain('aria-label="发送"')
    expect(inputArea).toContain('aria-label="停止生成"')
    expect(inputArea).toContain('composer-menu')
    expect(inputArea).toContain('dialogue-panel" role="dialog"')
    expect(inputArea).toContain('<span class="quick-btn__label">对话</span>')
    expect(inputArea).not.toContain('<span class="quick-btn__label">对话模式</span>')
    expect(inputArea).not.toContain('placeholder="输入你的行动... (Cmd+Enter 发送 · Esc 清空)"')
}
{
expect(uiAudit).toContain("element.closest('[aria-hidden=\"true\"], [inert]')")
    expect(uiAudit).toContain("const fixedVerticalOverflow = ['fixed', 'sticky'].includes(style.position)")
}
})

  it("keeps image generation in materials and removes the retired canvas drawer（合并4例）", async () => {
    const composition = readFileSync(resolve(__dirname, '../components/media/ComicCompositionCanvas.vue'), 'utf8')
    expect(composition).toContain('aria-label="画布视图"')
    expect(composition).toContain(':aria-pressed="viewMode === \'page\'"')
    expect(composition).toContain('aria-label="放大画布"')
    expect(composition).toContain('stageObserver?.disconnect()')
    expect(composition).toContain('watch(() => [props.page.id, props.page.format]')
{
const proseTemplate = proseEssay.split('<script setup>')[0]
    expect(proseEssay).toContain('buildDirectorSourceRefs()')
    expect(proseTemplate).not.toContain('image-gen-rail')
    expect(proseTemplate).not.toContain('aria-label="生图功能"')
    expect(imageWorkbench).not.toContain('image-gen-rail')
    expect(imageWorkbench).not.toContain('imageDrawerOpen')
    expect(imageWorkbench).not.toContain("presentation !== 'inline'")
    expect(notes).toContain('<ImageGenerationWorkbench')
    expect(writing).not.toContain('MediaGenerationDrawer')
    expect(existsSync(resolve(__dirname, '../components/media/MediaGenerationDrawer.vue'))).toBe(false)
    expect(imageWorkbench).toContain('ref="referenceInput"')
    expect(imageWorkbench).toContain('isSupportedLocalImage')
    expect(imageWorkbench).toContain('referenceUploadMessage')
    expect(imageWorkbench).toContain('new AbortController()')
    expect(imageWorkbench).toContain('promptSupplement')
    expect(imageWorkbench).toContain('actionGuard')
    expect(imageWorkbench).toContain('<slot name="brief"></slot>')

    const sourceDocument = createWritingDocument('前文。\n\n![雾港](pinax-media://media-1)\n')
    expect(validateWritingDocument(sourceDocument)).toMatchObject({ valid: true })
    const mediaNode = sourceDocument.content.flatMap((unit) => unit.content).find((node) => node.type === 'mediaReference')
    expect(mediaNode?.attrs).toMatchObject({
      kind: 'media-reference',
      mediaAssetId: 'media-1',
      alt: '雾港'
    })
    const roundTripped = editorContentToWritingDocument(
      writingDocumentToEditorContent(sourceDocument),
      sourceDocument
    )
    expect(validateWritingDocument(roundTripped)).toMatchObject({ valid: true })
    expect(getWritingDocumentMarkdown(roundTripped)).toContain('![雾港](pinax-media://media-1)')
    expect(getWritingDocumentMarkdown(roundTripped)).not.toContain('data:image')
    expect(writingDocumentSchema).toContain("const MEDIA_REFERENCE_PATTERN")
    expect(getAuthoringIllustrationSourceRefs({
      projectId: 'book-1',
      prompt: '雾港夜景',
      sourceRefs: ['chapter:chapter-1', 'worldbook-entry:location-harbor', 'scene-projection:chapter-1:unit-1'],
      sourceRevisions: {
        'chapter:chapter-1': 'chapter-rev-4',
        'worldbook-entry:location-harbor': 'entry-rev-2',
        'scene-projection:chapter-1:unit-1': 'scene-rev-3'
      }
    }, {
      mediaAssetId: 'media-1',
      sourceRefs: [{ refType: 'chapter', refId: 'chapter-1', projectId: 'book-1' }]
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ refType: 'chapter', refId: 'chapter-1', version: 'chapter-rev-4' }),
      expect.objectContaining({ refType: 'worldbook-entry', refId: 'location-harbor', version: 'entry-rev-2' }),
      expect.objectContaining({ refType: 'scene-projection', refId: 'chapter-1:unit-1', version: 'scene-rev-3' }),
      expect.objectContaining({ refType: 'image', refId: 'media-1' })
    ]))
}
{
expect(notebookEditor).toContain('markdown: getWritingDocumentMarkdown(currentDocument.value)')
    expect(notebookEditor).toContain('markdownFrom')
    expect(notebookEditor).toContain('resolveWritingCommandMenuPosition')
    expect(notebookEditor).toContain('const scale = getBodyUiScale()')
    expect(notebookEditor).toContain('collisionWidth')
    expect(notebookEditor).toContain('getCommandMenuViewport()')
    expect(notebookEditor).toContain("window.visualViewport?.addEventListener('resize', handleViewportChange")
    expect(notebookEditor).toContain('positionCommandMenu(editor.value.view, lastCommandMenuGeometry)')
    expect(notebookEditor).toContain("'is-submenu-left': commandMenu.submenuPlacement === 'left'")
    expect(notebookEditor).toContain('onBlur() {\n    closeCommandMenu()')
    expect(notebookEditor).not.toContain('commandMenu.value.top = Math.round(visualTop / scale)')
    expect(writing).toContain('openBlockComposer({ ...notebookSelection.value, ...command })')
    expect(writing).toContain('selectionBookmark')
    expect(notebookEditor).toContain("trigger: 'shortcut'")
    expect(writing).toContain('const target = getNodeRewriteTarget(previousNodeId)')
    expect(writing).toContain('getRewriteTargetFromAnnotation(annotation)')
    expect(writing).toContain('target.startOffset')
    expect(writing).toContain('useAuthoringRewriteWorkflow({')
    expect(writing).toContain("target?.pane === 'dual'")
    expect(writing).toContain('commitDualRewriteCandidate(candidate, target)')
    expect(authoringRewriteComposable).toContain('return !getWritingCandidateStaleReason(candidate, current)')
    expect(writing).toContain('useAuthoringAnnotationSession({')
    expect(authoringAnnotationComposable).toContain('function createAnnotationFromSelection()')
    expect(authoringAnnotationComposable).toContain('setAnnotations(deleteWritingAnnotation(getAnnotations(), annotation.id))')
    expect(writing).not.toContain('function saveAnnotationEdit(annotation)')
    expect(writing).toContain('useAuthoringAnnotationSelection({')
    expect(authoringAnnotationSelection).toContain('function buildAnnotationRangeContext(')
    expect(writing).not.toContain('function getAnnotationSelectionContext()')
    expect(writing).toContain('useAuthoringAnnotationLayout({')
    expect(authoringAnnotationLayout).toContain("window.addEventListener('resize', scheduleAnnotationLayout)")
    expect(authoringAnnotationLayout).toContain('resolveAnnotationLaneLayout(items, { gap: 14 })')
    expect(writing).not.toContain('function refreshAnnotationLayout()')
    expect(writing).not.toContain("quickNoteStatus.value = '上一段定位已经变化，请重新打开命令。'")
    expect(narrativeTurn).toContain('canCollectWriting')
    expect(narrativeTurn).toContain('收进稿件')
    expect(gamePanel).toContain("emit('collect-writing', { message, turn })")
    expect(experience).toContain('aria-labelledby="writing-collect-title"')
    expect(experience).toContain('aria-label="目标作品"')
    expect(experience).toContain('aria-label="目标章节"')
    expect(notebookEditor).toContain('data-writing-unit')
    expect(normalizeWritingTypography({ blockBoundaries: 'all' }).blockBoundaries).toBe('all')
    expect(normalizeWritingTypography({ blockBoundaries: 'broken' }).blockBoundaries).toBe('current')
    const lock = { text: '别动', start: 0, end: 2 }
    expect(validateWritingLockedSegments('别动，再说别动', '改掉，再说别动', [lock])).toBe(false)
    expect(validateWritingLockedSegments('别动，再说别动', '别动，再说一句', [lock])).toBe(true)
    expect(validateWritingLockedSegments('😀别动，结束', '😀别动，再说', [{ text: '别动', start: 2, end: 4 }])).toBe(true)
    expect(normalizeWritingCandidates([{ text: '改掉，再说别动', lockedSegments: [] }], { baseText: '别动，再说别动', lockedSegments: [lock] })).toHaveLength(0)
    expect(notebookEditor).toContain('splitWritingUnit')
    expect(notebookEditor).toContain('mergeWritingUnit')
    expect(notebookEditor).toContain('nodeId: anchorNodeId')
    expect(notebookEditor).not.toContain('nodeId: anchorNode?.attrs.nodeId')
    expect(notebookEditor).toContain('props.inlineSuggestionGenerating')
    expect(notebookEditor).toContain('props.inlineSuggestionError')
    expect(notebookEditor).toContain("event.key === 'Enter'")
    expect(notebookEditor).toContain('focusParagraphPluginKey')
    expect(notebookEditor).toContain("section[data-writing-unit]:not(:first-child)::after")
    expect(notebookEditor).toContain('bottom: 0;')
    expect(notebookEditor).toContain('data-block-boundaries')
    expect(notebookEditor).toContain('writingPreferences.zen')
    expect(authoringKnowledgeAssistant).toContain('AuthoringGoalReview')
    expect(imageWorkbench).toContain('retryImageStorage')
    expect(imageWorkbench).not.toContain('for (const entry of [...archivedEntries].reverse())')
    expect(writingGlobalCss).toContain('.writing-notebook-editor__surface .ProseMirror > section > p {')
    expect(writingGlobalCss).toContain('text-indent: var(--notebook-first-line-indent, 2em)')
    expect(writingGlobalCss).not.toContain('.wt3-prototype .writing-notebook-editor__surface .ProseMirror > section > p {')
    expect(writingGlobalCss).toContain('Desktop ownership: manuscript scrolls; shelf, tool rail and inspector stay')
    expect(writingGlobalCss).toContain('height: 100%;\n    overflow: hidden;')
    expect(writing).toContain("window.addEventListener('scroll', handleWritingWorkspaceScroll, true)")
    expect(writing).toContain('positionSelectionActions(notebookEditorRef.value?.getSelection?.())')
    expect(writing).toContain('scheduleAnnotationLayout()')
    expect(writing).toContain('class="wall__dossier-scroll"')
    expect(authoringBlockCss).toContain('.theme-legacy .writing-page .wall__dossier-scroll {')
    expect(authoringBlockCss).toContain('overflow-y: auto;\n  overflow-x: clip;')
    expect(authoringBlockCss).toContain('.theme-legacy .writing-page .dossier-footer {\n  position: static;')
    expect(authoringBlockCss).toContain('padding-top: 48px;\n  padding-bottom: 0;')
    expect(authoringBlockCss).toContain('padding-inline: 0;\n  padding-bottom: 0;\n  overflow: hidden;')
    expect(authoringBlockCss).toContain('padding-inline: var(--authoring-manuscript-gutter);\n  overflow-y: auto;')
    expect(authoringBlockCss).toContain('z-index: var(--z-workbench-sheet);')
    expect(authoringBlockCss).toContain('grid-template-columns: var(--authoring-shelf-width, 248px) minmax(360px, 1fr) clamp(420px, 31vw, 440px) var(--writing-tool-rail-width, 52px);')
    for (const token of ['--authoring-catalog-title-size: 17px', '--authoring-catalog-control-size: 14px', '--authoring-catalog-folder-size: 13px', '--authoring-catalog-entry-size: 13px', '--authoring-catalog-label-size: 12px', '--authoring-catalog-body-size: 14px']) expect(authoringBlockCss).toContain(token)
    expect(authoringBlockCss).toContain('inset-inline-end: var(--writing-tool-rail-width, 52px);\n    width: min(440px, calc(100% - 264px));')
    expect(authoringBlockCss).toContain('width: min(440px, calc(100% - var(--writing-tool-rail-width, 52px)));')
    expect(authoringDualPane).toContain('grid-template-columns: minmax(0, 1.62fr) minmax(160px, 1fr)')
    expect(authoringDualPane).toContain('grid-template-columns: 20px minmax(0, 1fr) auto')
    expect(authoringDualPane).toContain('<select :value="activeSwitch" :aria-label="tr(&quot;副窗内容类型&quot;)"')
    expect(authoringDualPane).not.toContain('class="authoring-dual-pane__switch"')
    expect(authoringBlockCss).toContain('.theme-legacy .writing-page .writing-inspector.is-open {\n    transform: translateX(0);')
    expect(authoringBlockCss).toContain('inset-block-end: 44px;\n    width: auto;\n    height: min(62vh, 480px);')
    expect(authoringBlockCss).toContain('.theme-legacy .writing-page .writing-inspector.is-open {\n    transform: translateY(0);')
    expect(notebookEditor).not.toMatch(/运行单元|执行序号|输出区|command mode/i)
    expect(writing).toMatch(/从此处分开|与上一单元合并/)
    expect(writing).not.toContain('>来自体验</button>')
    expect(writing).toContain('<AuthoringHistoryPanel')
    expect(authoringHistoryPanel).toContain('class="writing-block-history"')
    expect(authoringHistoryPanel).toContain('v-for="entry in history.recentBlockHistory.value"')
    expect(authoringHistoryPanel).toContain('@click="history.restoreBlock(entry)"')
    const writingAgentContextStart = writing.indexOf('function getWritingAgentPageContext(')
    const writingAgentContextEnd = writing.indexOf('function buildLiveContextDependencyRevisions', writingAgentContextStart)
    expect(writingAgentContextStart).toBeGreaterThanOrEqual(0)
    expect(writingAgentContextEnd).toBeGreaterThan(writingAgentContextStart)
    const writingAgentContext = writing.slice(writingAgentContextStart, writingAgentContextEnd)
    expect(writingAgentContext).toContain('nodeTarget')
    expect(writingAgentContext).not.toContain('blockTarget')
    expect(writing).toContain('const inserted = writingAgentPeek(mode)')
    expect(writing).toContain('if (!wt3ActiveDoc.value && transition?.type)')
    expect(writing).toContain('function reconcileActiveEditorAnnotations(')
    expect(writing).toContain('if (wt3ActiveDoc.value) wt3Annotations.value = reconciled')
    const selectionPayload = notebookEditor.slice(
      notebookEditor.indexOf("emit('selection-change'"),
      notebookEditor.indexOf('updateCurrentLineOverlay()', notebookEditor.indexOf("emit('selection-change'"))
    )
    expect(selectionPayload).not.toMatch(/blockId:|blockRevision:|startBlockId:|endBlockId:/)
    const exposedEditorApi = notebookEditor.slice(notebookEditor.indexOf('defineExpose({'), notebookEditor.indexOf('</script>'))
    expect(exposedEditorApi).not.toMatch(/findBlockRange|focusBlock|replaceBlockText|replaceBlockRanges/)
    expect(exposedEditorApi).toContain('closeCommandMenu')
    expect(exposedEditorApi).toContain('insertWritingUnitBatch')
    expect(notebookEditor.match(/emitCurrentSelectionSnapshot\(currentEditor\)/g)?.length).toBeGreaterThanOrEqual(3)
}
{
expect(writing).toContain('const scrollState = captureWritingScrollState()')
    expect(writing).toContain('restoreWritingScrollState(scrollState)')
    expect(writing).toContain("focus({ preventScroll: true })")
}
{
const notesTemplate = notes.split('<script setup>')[0]

    expect(notes).toContain("import { findAssetsByContentRefs } from '../services/media/narrativeAssetRetrieval'")
    expect(notes).toContain('const exactRelatedAssets = computed')
    expect(notes).toContain('result.exactMatches')
    expect(notes).toContain('explicitPinnedSlipAssets')
    expect(notes).toContain("sidekickReason: 'same-source'")
    expect(notes).not.toContain('const sameKind = chapters.value.filter')
    expect(notesTemplate).toContain('同来源')
    expect(notesTemplate).toContain('暂无同来源素材')

    expect(notesCatalog).toContain('ensureAssetCanvasCards')
    expect(notesCatalog).toContain('function sendCheckedAssetsToCanvas()')
    expect(notesTemplate).toContain('送入画布')
    expect(notesTemplate).toContain(':disabled="checkedAssetIds.length === 0"')
    expect(notesCatalog).toContain("navigate({ name: 'prose-essay', query: { assetId: primary.id } })")
    expect(notesCatalog).toContain('已送入画布 ${result.cards.length} 项，其中 ${result.existingAssetIds.length} 项已存在')
    expect(notesTemplate).toContain('role="status"')
    expect(notesTemplate).toContain('aria-live="polite"')

    for (const unchangedAction of ['mergeCheckedAssets', "setCheckedAssetsState('archived')", 'deleteCheckedAssets']) {
      expect(notesTemplate).toContain(unchangedAction)
    }
}
})

  it("defines a controlled, keyboard-operable scene material board（合并4例）", async () => {
    // Leaving the canvas must not reopen video or release a newer preparation.
    const pending = []
    const opened = []
    const controller = useProseDirectorExport({
      prepareVersion: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
      openVideoPanel: version => opened.push(version)
    })
    const old = controller.handoff()
    expect(await controller.handoff()).toBeNull()
    controller.reset()
    const current = controller.handoff()
    pending[0].resolve({ id: 'old' })
    expect(await old).toBeNull()
    expect(controller.busy.value).toBe(true)
    pending[1].resolve({ id: 'current' })
    await current
    expect(opened).toEqual([{ id: 'current' }])
    const abandoned = controller.handoff()
    controller.dispose()
    pending[2].reject(new Error('late error'))
    expect(await abandoned).toBeNull()
    expect(controller.error.value).toBe('')
    expect(await controller.handoff()).toBeNull()
{
expect(existsSync(sceneMaterialBoardPath)).toBe(true)
    for (const prop of ['model', 'selectedCardId', 'relationTypes', 'directorExportStatus']) {
      expect(sceneMaterialBoard).toContain(`${prop}:`)
    }
    for (const event of [
      'select-card',
      'open-source',
      'add-to-beats',
      'remove-from-beats',
      'move-beat',
      'set-relation'
    ]) {
      expect(sceneMaterialBoard).toContain(`'${event}'`)
    }

    for (const region of ['关系编组', '节拍', '待选素材']) {
      expect(sceneMaterialBoard).toContain(region)
    }
    expect(sceneMaterialBoard).toContain("const mobileTab = ref('beats')")
    expect(sceneMaterialBoard).toContain('把第 ${item.sequence} 个节拍上移')
    expect(sceneMaterialBoard).toContain('把第 ${item.sequence} 个节拍下移')
    expect(sceneMaterialBoard).toContain(':aria-pressed="selectedRelationType === relationType.value"')
    expect(sceneMaterialBoard).toContain('来源已归档')
    expect(sceneMaterialBoard).toContain('来源已断开')
    expect(sceneMaterialBoard).toContain('从待选素材加入第一个节拍')
    expect(sceneMaterialBoard).toContain('请选择两张卡片建立关系')
    expect(sceneMaterialBoard).not.toMatch(/pointerdown|pointermove|pointerup|touchstart|touchmove|draggable=/)
    expect(sceneMaterialBoard).toContain('@media (max-width: 760px)')
}
{
const proseTemplate = proseEssay.split('<script setup>')[0]
    const mobilePanes = proseEssay.slice(
      proseEssay.indexOf('const canvasMobilePanes'),
      proseEssay.indexOf('// Director mode edge types')
    )

    expect(proseEssay).toContain('SceneMaterialBoard,')
    expect(proseEssayComponents).toContain("SceneMaterialBoard } from './SceneMaterialBoard.vue'")
    for (const helper of [
      'buildSceneMaterialBoard',
      'addCardToOutline',
      'removeCardFromOutline',
      'moveOutlineItem',
      'upsertSceneRelationship'
    ]) {
      expect(proseEssay).toContain(helper)
    }
    expect(proseEssay).toContain("const canvasSurface = ref('scene')")
    expect(proseTemplate).toContain('场景板')
    expect(proseTemplate).toContain('自由画布')
    expect(proseTemplate).toContain('<SceneMaterialBoard')
    expect(proseEssay).toContain('const sceneBoardModel = computed(() => buildSceneMaterialBoard({')
    expect(proseEssay).toContain('cards: flatCards.value')
    expect(proseEssay).toContain('outline: outline.value')
    expect(proseEssay).toContain('edges: edges.value')
    expect(proseEssay).toContain('assets: canvasAssets.value')
    expect(proseEssay).toContain('outline.value = addCardToOutline(outline.value, card)')
    expect(proseEssay).toContain('const next = moveOutlineItem(outline.value, fromIndex, toIndex)')
    expect(proseEssay).toContain('const next = upsertSceneRelationship(edges.value, relationship)')
    expect(proseEssay).toContain('if (next === outline.value) return')
    expect(proseEssay).toContain('if (next === edges.value) return')

    expect(mobilePanes).toContain("{ value: 'scene', label: '场景板' }")
    expect(mobilePanes).not.toContain("value: 'free'")
    expect(proseTemplate).toContain('<CanvasTimeline')
    expect(proseTemplate).toContain('directorExportStatus')
    expect(proseTemplate).toContain('directorExportController.handoff')
    expect(proseTemplate).toContain('openCardMaterial')
    expect(proseEssay).not.toContain('MATERIAL_BEATS_V1')
}
{
expect(uiAudit).toContain("'scene-board'")
    expect(uiAudit).toContain('function makeSceneBoardFixture')
    expect(uiAudit).toContain("state === 'scene-board'")
    expect(uiAudit).toContain("'/prose-essay?assetId=scene-asset-1'")
    expect(uiAudit).toContain("page.locator('[data-scene-material-board]')")
    expect(uiAudit).toContain("status: index === 4 ? 'archived' : 'accepted'")
    expect(uiAudit).toContain("assetId: index === 5 ? 'scene-asset-missing' : assets[index].id")
}
{
expect(uiAudit).toContain("id: 'authoring'")
    expect(uiAudit).toContain("'generating', 'context', 'conflict'")
    expect(uiAudit).toContain('composer primary exposes stop while a request is pending')
    expect(uiAudit).toContain('context inspector opens and closes with Escape without raw prompts')
    expect(uiAudit).toContain("path: '/experience'")
}
})
})

describe('authoring memory projection contracts', () => {
  it("shows a transient candidate count and reserves review for exceptions（合并3例）", async () => {
{
const source = await readFile(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    expect(source).toContain('<AuthoringAssistantWorkspace')
    const workspace = await readFile(resolve(__dirname, '../components/authoring/AuthoringAssistantWorkspace.vue'), 'utf8')
    expect(workspace).toContain('<AuthoringKnowledgeAssistant')
    expect(workspace).toContain(':notice="notice"')
    expect(source).toContain(':notice="authoringMemoryNotice"')
    expect(source).not.toContain('<AuthoringMemoryNotice')
    expect(source).toContain('<AuthoringMemoryReview')
    expect(source).not.toMatch(/memory-confirm-modal-per-candidate/)
}
{
const source = await readFile(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
    expect(source).toContain('data-action="remember-selection"')
    expect(source).toContain('rememberAuthoringSelection')
}
{
const reviewSource = await readFile(resolve(__dirname, '../components/authoring/AuthoringMemoryReview.vue'), 'utf8')
    expect(reviewSource).toContain('@keydown.esc')
    expect(reviewSource).not.toMatch(/#[0-9a-fA-F]{6}/)
}
})
})
