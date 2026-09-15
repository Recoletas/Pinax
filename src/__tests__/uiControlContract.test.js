import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { trapFocusWithin } from '../composables/useTransientLayer'
import { useAuthoringFirstRun } from '../composables/useAuthoringFirstRun.js'
import { generateWritingNames } from '../services/writingNameGenerator.js'
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
const experience = readFileSync(resolve(__dirname, '../pages/Experience.vue'), 'utf8')
const appShell = readFileSync(resolve(__dirname, '../layouts/AppShell.vue'), 'utf8')
const inputArea = readFileSync(resolve(__dirname, '../components/InputArea.vue'), 'utf8')
const uiAudit = readFileSync(resolve(__dirname, '../../scripts/ui-audit.mjs'), 'utf8')
const proseEssay = readFileSync(resolve(__dirname, '../pages/ProseEssay.vue'), 'utf8')
const notes = readFileSync(resolve(__dirname, '../pages/Notes.vue'), 'utf8')
// C1 后批量画布/送画布实现迁入 useNotesAssetCatalog；断言跟随真实模块接线
const notesCatalog = readFileSync(resolve(__dirname, '../composables/useNotesAssetCatalog.js'), 'utf8')
const writing = readFileSync(resolve(__dirname, '../pages/Authoring.vue'), 'utf8')
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
    {
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow: hidden;/)
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \.wall__cork \{[\s\S]*display: flex;[\s\S]*flex-wrap: nowrap;[\s\S]*overflow-x: auto;/)
      expect(authoringBlockCss).toMatch(/\.theme-legacy \.writing-page \.wall__main \{[\s\S]*display: grid;[\s\S]*grid-template-columns:/)
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
    expect(source).toContain('function chineseChapterNumber(value)')
    expect(source).toContain("return name ? `${ordinal} ${name}` : ordinal")
    expect(source).toContain(':aria-label="`${chapterRowLabel(entry.index, entry.chapter.title)} · 拖拽排序`"')
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
    expect(source).toContain('<AuthoringKnowledgeAssistant')
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
    expect(source).toContain('saveWritingBooks(nextBooks)')
    expect(source).not.toContain('showFindReplace')
    expect(source).toContain(':checked="writingHistoryPreferences.enabled"')
    expect(source).toContain('planWritingMilestoneSnapshot')
    expect(source).toContain('recordWritingProtectionSnapshot')
    expect(source).toContain(':before-destructive-edit="protectMainDestructiveEdit"')
    expect(source).toContain(':protect-destructive-edit="protectDualDestructiveEdit"')
    expect(source).toContain('dualPaneRef.value?.prepareClose?.() === false')
    expect(source).toContain('dualPaneRef.value?.reloadSearchSource?.({')
    expect(source).toMatch(/document\.revision = Math\.max\([\s\S]*?Number\(document\.revision \|\| 0\)[\s\S]*?\) \+ 1/)
    expect(source).toContain('historyRestoreEpoch: `restore-${Date.now().toString(36)}-')
    expect(source).toContain("historyRestoreEpoch: String(source?.meta?.historyRestoreEpoch || '')")
    expect(authoringDualPane).toContain("historyRestoreEpoch: String(documentState.value?.meta?.historyRestoreEpoch || '')")
    expect(source).not.toContain('<AuthoringAiReference')
    expect(authoringToolRail).toContain("{ id: 'ai', label: '助手' }")
    expect(writing).toContain('<AuthoringCharacterPanel')
    expect(writing).toContain("'is-catalog-workbench': ['outline', 'characters', 'worldbook'].includes(activeInspectorTool)")
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
    expect(source).toContain('@open-full="openWorldbookFromDual"')
    expect(authoringCharacterPanel).toContain('@input="resizeProfileField($event.currentTarget)"')
    expect(authoringCharacterPanel).toContain('resize:none')
    expect(authoringCharacterPanel).toContain('overflow:hidden')
    expect(authoringCharacterPanel).not.toContain('rows="3"')
    expect(authoringCharacterPanel).toContain('生成角色图')
    expect(authoringCharacterPanel).toContain('上传角色图')
    expect(authoringCharacterPanel).toContain('单张不大于 5MB')
    expect(authoringCharacterPanel).toContain('新建时会自动为这本书建立资料库')
    expect(source).toContain('ensureBookWorldbookForAuthoring')
    expect(source).toContain("description: '随书稿建立的人物与设定资料库'")
    expect(authoringCharacterPanel).not.toContain('editing')
    expect(authoringCharacterPanel).not.toContain('人物出身、经历与当前处境')
    expect(authoringCharacterAiReview).toContain("dispatch('settings.character.complete'")
    expect(authoringCharacterAiReview).not.toContain('parseCharacterCards')
    expect(authoringWorldbookPanel).toContain("directoryMode = ref('contextual')")
    expect(authoringWorldbookPanel).toContain("entry?.type !== 'character'")
    expect(authoringWorldbookPanel).toContain('新建时会自动为这本书建立资料库')
    expect(authoringWorldbookPanel).toContain("emit('update', selectedEntry.value.id")
    expect(authoringWorldbookPanel).toContain('<AuthoringSettingAiReview')
    expect(authoringWorldbookPanel).toContain('class="setting-directory__search-row"')
    expect(authoringWorldbookPanel).toContain('aria-label="新建设定"')
    expect(authoringWorldbookPanel).not.toContain("emit('open-character'")
    expect(authoringWorldbookPanel).toContain(':aria-expanded="(!collapsedFolders.has(group.name)).toString()"')
    expect(writing).toContain("activeInspectorTool === 'history' || (activeInspectorTool === 'annotations' && inspectorTab === 'version')")
    expect(writing).toContain(':focus-entry-id="inspectorCharacterEntryId"')
    expect(writing).toContain('visualReferenceCandidates')
    expect(authoringIllustratorComposable).toContain('inlineCandidates')
    for (const label of ['文本模式', '历史版本', '总纲', '章纲']) expect(authoringOutlinePanel).toContain(label)
    expect(authoringOutlinePanel).toContain("emit('insert', selectedItem)")
    expect(authoringOutlinePanel).toContain("toggleGroup('project')")
    expect(authoringOutlinePanel).toContain("toggleGroup('chapter')")
    const knowledgeTemplate = authoringKnowledgeAssistant.split('<script setup>')[0]
    for (const task of ['查设定', '找伏笔', '理线索', '挖角色', '算数值', '问全书', '自由问']) {
      expect(authoringKnowledgeAssistant).toContain(task)
    }
    expect(knowledgeTemplate).toContain('查看依据')
    expect(knowledgeTemplate).toContain('资料已更新')
    expect(knowledgeTemplate).not.toMatch(/manifest|receipt|token|candidate ID|上下文数量/i)
    expect(knowledgeTemplate).not.toContain('<q>')
    expect(authoringKnowledgeComposable).toContain('createAuthoringKnowledgeQuerySession')
    expect(authoringKnowledgeComposable).toContain('reconcileAuthoringKnowledgeAnswer')
    expect(authoringKnowledgeComposable).toContain('resolveLiveSource')
    expect(authoringKnowledgeComposable).toContain('AbortController')
    expect(authoringKnowledgeComposable).not.toContain('localStorage')
    expect(authoringInspectorComposable).toContain("normalizedTool === 'ai'")
    expect(authoringInspectorComposable).toContain('captureAssistantInvocation?.()')
    expect(source).toContain('captureAssistantInvocation: captureKnowledgeAssistantInvocation')
    expect(source).toContain('if (wt3ActiveDoc.value) return null')
    expect(authoringDualPane).toContain('captureKnowledgeSource')
    expect(source).toContain('aria-label="快捷词建议"')
    expect(source).toContain('writingCompositionActive.value || dualCompositionActive.value')
    expect(authoringQuickWords).toContain('角色')
    expect(authoringQuickWords).toContain('设定')
    expect(authoringQuickWords).toContain('智能提取')
    expect(authoringQuickWords).toContain("['，', '。', '！', '？', '：', '；', '“', '”']")
    expect(source).toContain('handleQuickWordDigitKey(event)')
    expect(source).toContain(':aria-keyshortcuts="String(index + 1)"')
    expect(source).toContain('@document-change="dualQuickWordDocument = $event"')
    expect(authoringDualPane).toContain('aria-label="副栏快捷词建议"')
    expect(authoringDualPane).toContain("emit('document-change', value)")
    expect(source).toContain("activeInspectorTool === 'dual'")
    expect(source).toContain('在双栏打开')
    expect(source).not.toContain('>多窗<')
    expect(authoringDualPane).toContain('data-test="authoring-dual-pane"')
    expect(authoringDualPane).toContain('data-test="authoring-dual-directory"')
    expect(authoringDualPane).toContain('aria-label="副窗内容类型"')
    expect(authoringDualPane).toContain("{ id: 'character', label: '角色' }")
    expect(authoringDualPane).toContain("{ id: 'exploration', label: '便签' }")
    expect(authoringDualPane).toContain('closeSwitchOnNarrow()')
    expect(authoringDualPane).toContain(':editable="true"')
    expect(authoringDualPane).toContain(':block-composer-enabled="interventionGhostOpen"')
    expect(authoringDualPane).toContain(':block-composer-target="interventionGhostTarget"')
    expect(authoringDualPane).toContain(':before-destructive-edit="requestDestructiveProtection"')
    expect(authoringDualPane).toContain('block-gap-id="authoring-dual-block-gap"')
    expect(authoringDualPane).toContain('aria-label="交换主副章"')
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
    expect(source).toContain("associationLabel: associationLabels.length ? `关联")
    expect(source).not.toMatch(/node\.chapterRef(?!s)/)
    expect(source).not.toContain('node.adoptedDocumentId')
    expect(source).not.toContain("includes('wt3=1')")
    expect(source).toContain('<span>事实</span>')
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
    expect(css).toMatch(/@media \(pointer: coarse\)/)
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
    // 单一产品主题在入口静态加载控件层，不再保留运行时主题分叉。
    expect(mainEntry).toContain("import './styles/workbench-controls.css'")
}
})

  it("closes the topmost experience overlay with Escape before the rail（合并4例）", async () => {
{
expect(experience).toContain('if (writingCollectOpen.value) {')
    expect(experience).toContain("id: 'experience-writing-collect'")
    expect(experience).toContain('initialFocus: () => writingCollectCloseRef.value')
    expect(experience).toContain('@keydown="trapWritingCollectFocus"')
    expect(experience).toContain('writingCollectOpen.value || quickNoteOpen.value')
    expect(experience).toContain("if (inlineDetail.value) {")
    expect(experience).toContain("if (codexDetailSection.value) {")
    expect(experience).toContain("if (quickNoteOpen.value) {")
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
    expect(shellTemplate).toContain(':active-panel="activePanel"')
    expect(shellTemplate).toContain('data-test="shell-storage-status"')

    expect(experienceTemplate).not.toContain('ws-topstrip__settings-link')
    expect(experienceTemplate).not.toContain('ws-topstrip__session-chip')
    expect(experienceTemplate).toContain('ws-session-trigger')
    expect(experienceTemplate).toContain('ws-more-menu')
    expect(experienceTemplate).toContain('ws-topstrip__codex-toggle')
}
{
expect(inputArea).toContain('<textarea')
    expect(inputArea).toContain('placeholder="写下行动或续写方向"')
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
    expect(writing).toContain('return !getWritingCandidateStaleReason(candidate, current)')
    expect(writing).not.toContain("quickNoteStatus.value = '上一段定位已经变化，请重新打开命令。'")
    expect(narrativeTurn).toContain('canCollectWriting')
    expect(narrativeTurn).toContain('收进稿件')
    expect(gamePanel).toContain("emit('collect-writing', { message, turn })")
    expect(experience).toContain('aria-labelledby="writing-collect-title"')
    expect(experience).toContain('aria-label="目标作品"')
    expect(experience).toContain('aria-label="目标章节"')
    expect(notebookEditor).toContain('data-writing-unit')
    expect(notebookEditor).toContain('splitWritingUnit')
    expect(notebookEditor).toContain('mergeWritingUnit')
    expect(notebookEditor).toContain('nodeId: anchorNodeId')
    expect(notebookEditor).not.toContain('nodeId: anchorNode?.attrs.nodeId')
    expect(notebookEditor).toContain('props.inlineSuggestionGenerating')
    expect(notebookEditor).toContain('props.inlineSuggestionError')
    expect(notebookEditor).toContain("event.key === 'Enter'")
    expect(notebookEditor).toContain('focusParagraphPluginKey')
    expect(notebookEditor).toContain("section[data-writing-unit]:not(:first-child)::after")
    expect(notebookEditor).toContain('bottom: auto;')
    expect(notebookEditor).toContain('height: 1em;')
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
    expect(authoringBlockCss).toContain('grid-template-columns: clamp(210px, 16vw, 250px) minmax(360px, 1fr) clamp(420px, 31vw, 440px) 52px;')
    for (const token of ['--authoring-catalog-title-size: 17px', '--authoring-catalog-control-size: 14px', '--authoring-catalog-folder-size: 13px', '--authoring-catalog-entry-size: 13px', '--authoring-catalog-label-size: 12px', '--authoring-catalog-body-size: 14px']) expect(authoringBlockCss).toContain(token)
    expect(authoringBlockCss).toContain('inset-inline-end: 52px;\n    width: min(440px, calc(100% - 264px));')
    expect(authoringBlockCss).toContain('width: min(440px, calc(100% - 52px));')
    expect(authoringDualPane).toContain('grid-template-columns: minmax(0, 1.62fr) minmax(160px, 1fr)')
    expect(authoringDualPane).toContain('grid-template-columns: 20px minmax(0, 1fr) auto')
    expect(authoringDualPane).toContain('<select :value="activeSwitch" aria-label="副窗内容类型"')
    expect(authoringDualPane).not.toContain('class="authoring-dual-pane__switch"')
    expect(authoringBlockCss).toContain('.theme-legacy .writing-page .writing-inspector.is-open {\n    transform: translateX(0);')
    expect(authoringBlockCss).toContain('inset-block-end: 44px;\n    width: auto;\n    height: min(62vh, 480px);')
    expect(authoringBlockCss).toContain('.theme-legacy .writing-page .writing-inspector.is-open {\n    transform: translateY(0);')
    expect(notebookEditor).not.toMatch(/运行单元|执行序号|输出区|command mode/i)
    expect(writing).toMatch(/从此处分开|与上一单元合并/)
    expect(writing).not.toContain('>来自体验</button>')
    expect(writing).toContain('class="writing-block-history"')
    expect(writing).toContain('v-for="entry in recentWritingBlockHistory"')
    expect(writing).toContain('@click="restoreWritingBlockHistory(entry)"')
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

    expect(notes).toContain("import { findAssetsByContentRefs } from '../services/narrativeAssetRetrieval'")
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

    expect(proseEssay).toContain("import SceneMaterialBoard from '../components/canvas/SceneMaterialBoard.vue'")
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
    expect(proseTemplate).toContain('openStoryboardVideoPanel')
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
    expect(source).toContain('<AuthoringKnowledgeAssistant')
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
