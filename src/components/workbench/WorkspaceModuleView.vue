<script setup>
import { computed, defineAsyncComponent, onScopeDispose, nextTick, provide, reactive, ref, watch } from 'vue'
import { routeLocationKey, routerKey, useRouter } from 'vue-router'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { WORKSPACE_MODULE_ROUTES, WORKSPACE_VIEW_TYPES } from '../../services/workspace/workspaceViewContract.js'
import WorkspaceProductionSource from './WorkspaceProductionSource.vue'

const props = defineProps({ resource: { type: Object, required: true }, instanceId: { type: String, required: true } })
const emit = defineEmits(['title'])
const host = useComposableWorkspace()
const router = useRouter()
const editor = ref(null)
const notice = ref('')
const moduleName = WORKSPACE_MODULE_ROUTES[props.resource.type]
const loaders = { experience: () => import('../../pages/Experience.vue'), comics: () => import('../../pages/ComicStudio.vue'), materials: () => import('./LegacyMaterialsView.vue'), 'online-experience': () => import('../../pages/OnlineExperience.vue'), 'prose-essay': () => import('../../pages/ProseEssay.vue'), 'settings-world-map': () => import('../../pages/WorldMapPage.vue'), 'settings-worldbook-advanced': () => import('../../pages/WorldBookEditor.vue') }
const component = defineAsyncComponent(loaders[moduleName])
const location = reactive({ name: moduleName, path: moduleName === 'comics' ? '/comics' : '/prose-essay', query: {}, hash: '', fullPath: '', meta: {}, params: {}, matched: [] })
watch(() => props.resource, resource => {
  location.query = Object.fromEntries(['bookId', 'worldbookId', 'pageId', 'panelId', 'assetId', 'workspace', 'entryId', 'placeId', 'historyNodeId', 'sessionId', 'messageId'].filter(key => resource[key]).map(key => [key, resource[key]]))
  location.params = moduleName === 'online-experience' && resource.roomSlug ? { roomSlug: resource.roomSlug } : {}
  const resolved = router.resolve({ name: moduleName, params: location.params, query: location.query })
  location.path = resolved.path
  location.fullPath = resolved.fullPath
}, { immediate: true })
// Local page selection updates the view reference, never the primary route.
async function navigate(target, replace = false) {
  if (target?.name === moduleName && (String(target.query?.bookId || '') === props.resource.bookId || moduleName === 'online-experience')) {
    if (!host.updateResource(props.instanceId, { pageId: target.query?.pageId || '', panelId: target.query?.panelId || '', assetId: target.query?.assetId || '', workspace: target.query?.workspace || '', roomSlug: target.params?.roomSlug || '', entryId: target.query?.entryId || '', placeId: target.query?.placeId || '', historyNodeId: target.query?.historyNodeId || '', sessionId: target.query?.sessionId || '', messageId: target.query?.messageId || '' })) throw Error('内容位置未能更新')
    await nextTick()
    return undefined
  }
  const type = Object.keys(WORKSPACE_MODULE_ROUTES).find(type => WORKSPACE_MODULE_ROUTES[type] === target?.name)
  if (type && String(target.query?.bookId || '') === props.resource.bookId) {
    if (router.currentRoute.value.name === target.name && !host.state.views.some(view => view.resource.type === type)) {
      const failure = await router.push(target)
      if (!failure || router.currentRoute.value.fullPath === router.resolve(target).fullPath) host.hide()
      return failure
    }
    if (!host.openResource({ type, bookId: props.resource.bookId, worldbookId: props.resource.worldbookId, pageId: target.query?.pageId || '', panelId: target.query?.panelId || '', assetId: target.query?.assetId || '', workspace: target.query?.workspace || '', entryId: target.query?.entryId || '', placeId: target.query?.placeId || '', historyNodeId: target.query?.historyNodeId || '', sessionId: target.query?.sessionId || '', messageId: target.query?.messageId || '' })) throw Error('工作台暂时无法打开')
    host.move(true)
    return undefined
  }
  return replace ? router.replace(target) : router.push(target)
}
provide(routeLocationKey, location)
provide(routerKey, { ...router, push: target => navigate(target), replace: target => navigate(target, true) })
const active = computed(() => !host.state.hidden && host.state.activeId === props.instanceId && (host.state.sideActiveId === props.instanceId || host.state.mainModuleId === props.instanceId))
const releaseGuard = host.registerGuard(props.instanceId, () => editor.value?.canCloseWorkspace?.() ?? true)
const releaseTask = host.registerTaskAdapter(props.instanceId, { summary: () => { const task = editor.value?.getWorkspaceTaskSummary?.(); return task ? { ...task, icon: WORKSPACE_VIEW_TYPES[props.resource.type].icon } : null }, open: () => host.activate(props.instanceId) })
async function compareChapter(chapterId) {
  try {
    const target = { name: 'authoring', query: { bookId: props.resource.bookId, chapterId } }
    const failure = await router.push(target)
    if (failure && !(router.currentRoute.value.name === target.name && router.currentRoute.value.query.chapterId === chapterId && router.currentRoute.value.query.bookId === props.resource.bookId)) { notice.value = '请先处理正文中尚未完成的操作。'; return }
    host.activate(props.instanceId)
    host.move(false)
    notice.value = ''
  } catch { notice.value = '暂时无法打开原章，制作内容仍保留。' }
}
onScopeDispose(() => { releaseGuard(); releaseTask() })
emit('title', moduleName === 'settings-world-map' ? '地图' : moduleName === 'settings-worldbook-advanced' ? '条目' : moduleName === 'comics' ? '漫画' : moduleName === 'materials' ? '素材与插画' : moduleName === 'online-experience' ? '联机' : moduleName === 'experience' ? '跑团' : '视频')
</script>

<template>
  <section class="workspace-module-view" :data-module-editor="moduleName">
      <WorkspaceProductionSource v-if="moduleName === 'prose-essay'" :book-id="resource.bookId" :asset-id="resource.assetId" :module="moduleName" :blocked="Boolean(editor?.getWorkspaceTaskSummary?.())" @source="host.updateResource(instanceId, { assetId: $event })" @compare="compareChapter" />
      <p v-if="notice" role="status">{{ tr(notice) }}</p>
      <p v-if="!editor" class="workspace-module-loading" role="status">{{ tr('加载工作台…') }}</p>
      <component :is="component" ref="editor" workspace-embedded :workspace-active="active" @workspace-resource="host.updateResource(instanceId, $event)">
        <template v-if="moduleName === 'comics'" #chapter-source><WorkspaceProductionSource compact :book-id="resource.bookId" :asset-id="resource.assetId" module="comics" :blocked="Boolean(editor?.getWorkspaceTaskSummary?.())" @adapt="editor?.adaptFromSource($event)" @source="host.updateResource(instanceId, { assetId: $event })" @compare="compareChapter" /></template>
      </component>
  </section>
</template>

<style scoped>
.workspace-module-view { container-type: inline-size; container-name: creative-module; display: flex; flex: 1; flex-direction: column; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface-workbench); }
.workspace-module-view > :deep(.comic-studio), .workspace-module-view > :deep(.prose-essay-page) { flex: 1; min-height: 0; width: 100%; }
.workspace-module-view > :deep(.game-page), .workspace-module-view > :deep(.world-map-page), .workspace-module-view > :deep(.worldbook-page), .workspace-module-view > :deep(.online-page), .workspace-module-view > :deep(.writing-page) { flex: 1; min-height: 0; width: 100%; }
.workspace-module-view :deep(.comic-studio__mode-picker) { display: none; }
.workspace-module-duplicate { padding: 24px; color: var(--text-secondary); }
/* A moved editor gets the same compact panes as its native phone layout. */
@container creative-module (max-width: 980px) {
  .workspace-module-view :deep(.workspace-pane-switch--1100) { display: flex; }
  .workspace-module-view :deep(.notes-content-area) { display: block; min-height: 0; overflow: hidden; }
  .workspace-module-view :deep(.notes-content-area > .material-drawer), .workspace-module-view :deep(.notes-content-area > .folio-surface), .workspace-module-view :deep(.notes-content-area > .notes-sidekick) { display: none; }
  .workspace-module-view :deep(.notes-content-area[data-mobile-pane="index"] > .material-drawer), .workspace-module-view :deep(.notes-content-area[data-mobile-pane="content"] > .folio-surface), .workspace-module-view :deep(.notes-content-area[data-mobile-pane="tools"] > .notes-sidekick) { display: flex; width: 100%; height: 100%; }
  .workspace-module-view :deep(.notes-content-area[data-mobile-pane="content"] .reading-deck) { height: 100%; }
  .workspace-module-view :deep(.comic-studio__workspace) { display: block; }
  .workspace-module-view :deep(.comic-studio__workspace > *) { width: 100%; height: 100%; }
  .workspace-module-view :deep(.comic-studio__catalog), .workspace-module-view :deep(.comic-studio__canvas), .workspace-module-view :deep(.comic-studio__inspector) { display: none; }
  .workspace-module-view :deep([data-mobile-pane="sources"] .comic-studio__catalog), .workspace-module-view :deep([data-mobile-pane="page"] .comic-studio__canvas), .workspace-module-view :deep([data-mobile-pane="panel"] .comic-studio__inspector) { display: flex; }
  .workspace-module-view :deep(.workspace-pane-switch--980) { display: flex; }
  .workspace-module-view :deep(.comic-studio__workflow) { display: flex; flex: none; width: auto; margin-left: 0; gap: 8px; }
  .workspace-module-view :deep(.comic-studio__mast-left) { flex: 1; flex-wrap: nowrap; min-width: 0; }
  .workspace-module-view :deep(.comic-studio__mast) { padding: 4px 12px; flex-wrap: nowrap; }
  .workspace-module-view :deep(.comic-studio__mast-actions) { flex: none; }
  .workspace-module-view :deep(.comic-studio__book strong) { max-width: 14ch; }
}
@container creative-module (max-width: 760px) {
  .workspace-module-view :deep(.comic-studio__new) { width: 36px; min-height: 40px; padding: 0; }
  .workspace-module-view :deep(.comic-studio__new > span) { display: none; }
  .workspace-module-view :deep(.comic-studio__mast-left) { gap: 10px; }
  .workspace-module-view :deep(.worldbook-page .entry-layout) { grid-template-columns: minmax(0, 1fr); gap: 12px; min-height: 0; }
  .workspace-module-view :deep(.worldbook-page .entry-editor) { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .workspace-module-view :deep(.worldbook-page .entry-editor > *) { grid-column: 1; min-width: 0; }
  .workspace-module-view :deep(.worldbook-page .entry-md-actions) { flex-shrink: 0; }
  .workspace-module-view :deep(.worldbook-page .entry-list) { max-height: 180px; border-right: 0; padding: 0; }
  .workspace-module-view :deep(.worldbook-page .editor-main) { padding: 12px; min-width: 0; }
  .workspace-module-view :deep(.worldbook-page .editor-tabs) { overflow-x: auto; flex-wrap: nowrap; }
  .workspace-module-view :deep(.worldbook-page .card-head), .workspace-module-view :deep(.worldbook-page .entry-editor-heading) { flex-wrap: wrap; }
  .workspace-module-view :deep(.world-map-panel .panel-toolbar) { flex-wrap: wrap; gap: 8px; padding: 10px 12px; }
  .workspace-module-view :deep(.world-map-panel .toolbar-right) { flex-wrap: wrap; min-width: 0; }
  .workspace-module-view :deep(.world-map-panel .main-content) { min-width: 0; }
  .workspace-module-view :deep(.voronoi-container .hint-text) { display: none; }
  .workspace-module-view :deep(.game-page .ws-layout) { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); padding: 8px 12px 10px; }
  .workspace-module-view :deep(.game-page .ws-center-stage) { grid-row: 2; grid-column: 1; }
  .workspace-module-view :deep(.game-page .ws-right-rail) { display: none; position: absolute; inset: 54px 8px 8px; width: auto; z-index: 10; }
  .workspace-module-view :deep(.game-page .ws-right-rail.is-mobile-open) { display: flex; }
  .workspace-module-view :deep(.game-page .ws-topstrip__codex-toggle) { display: inline-flex; }
  .workspace-module-view :deep(.game-page .ws-topstrip) { min-width: 0; flex-wrap: wrap; }
  .workspace-module-view :deep(.online-page__room) { display: flex; flex-direction: column; }
  .workspace-module-view :deep(.online-page__room-toggle) { display: flex; justify-content: space-between; flex-shrink: 0; min-height: 44px; padding: 8px 12px; color: var(--text-secondary); background: var(--surface-workbench); border: 0; border-bottom: 1px solid var(--hairline-soft); }
  .workspace-module-view :deep(.online-page__room-panel) { display: none; position: static; order: 1; flex: 0 0 auto; width: auto; max-height: 38vh; overflow: auto; margin: 0 10px 8px; }
  .workspace-module-view :deep(.is-room-panel-open .online-page__room-panel) { display: block; }
  .workspace-module-view :deep(.online-page__stage) { flex: 1; min-height: 0; height: auto; }
  .workspace-module-view :deep(.online-page__lobby) { padding: 16px 12px; overflow-y: auto; }
  .workspace-module-view :deep(.online-page__lobby-card) { padding: 20px 12px; }
  .workspace-module-view :deep(.material-top) { flex-wrap: wrap; gap: 8px; padding-inline: 12px; }
  .workspace-module-view :deep(.material-top .manuscript-top__left), .workspace-module-view :deep(.material-top .manuscript-top__right) { width: 100%; min-width: 0; }
  .workspace-module-view :deep(.material-top .manuscript-top__right) { flex-wrap: wrap; justify-content: flex-end; }
  .workspace-module-view :deep(.material-top .manuscript-top__book), .workspace-module-view :deep(.material-top .manuscript-top__tab) { flex-shrink: 0; white-space: nowrap; }
  .workspace-module-view :deep(.material-top .manuscript-top__chip) { flex: 1; min-width: 0; }
  .workspace-module-view :deep(.workspace-pane-switch--760) { display: flex; }
  .workspace-module-view :deep(.prose-top) { flex-wrap: wrap; padding-inline: 12px; }
  .workspace-module-view :deep(.prose-top__left), .workspace-module-view :deep(.prose-top__right) { width: 100%; flex-wrap: wrap; }
  .workspace-module-view :deep(.prose-top__mid) { flex: 1 1 100%; }
  .workspace-module-view :deep(.pe-main) { display: block; min-height: 0; }
  .workspace-module-view :deep(.pe-main .left-panel), .workspace-module-view :deep(.pe-main .scene-board-host), .workspace-module-view :deep(.pe-main .card-wall) { display: none; }
  .workspace-module-view :deep(.pe-main[data-mobile-pane="scene"] .scene-board-host), .workspace-module-view :deep(.pe-main[data-mobile-pane="timeline"] .left-panel) { display: flex; width: 100%; height: 100%; }
  .workspace-module-view :deep(.canvas-surface-switch) { display: none; }
  .workspace-module-view :deep(.scene-material-board__mobile-tabs) { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 6px 10px; }
  .workspace-module-view :deep(.scene-material-board__layout) { display: block; overflow-y: auto; }
  .workspace-module-view :deep(.scene-material-board__main), .workspace-module-view :deep(.scene-board-region--unplaced) { display: none; overflow: visible; }
  .workspace-module-view :deep([data-mobile-tab="relations"] .scene-material-board__main), .workspace-module-view :deep([data-mobile-tab="beats"] .scene-material-board__main) { display: block; padding: 12px; }
  .workspace-module-view :deep([data-mobile-tab="relations"] .scene-board-region--beats), .workspace-module-view :deep([data-mobile-tab="beats"] .scene-board-region--relations) { display: none; }
  .workspace-module-view :deep([data-mobile-tab="unplaced"] .scene-board-region--unplaced) { display: block; padding: 12px; border-left: 0; }
}
</style>
