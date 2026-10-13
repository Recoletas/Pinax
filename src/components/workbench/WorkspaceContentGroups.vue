<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { isWorkspaceModule } from '../../services/workspace/workspaceViewContract.js'
import WorkspaceContentTabs from './WorkspaceContentTabs.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'
const Sources = defineAsyncComponent(() => import('./WorkspaceSourcesView.vue'))
const Reference = defineAsyncComponent(() => import('./WorkspaceReferenceView.vue'))
const Media = defineAsyncComponent(() => import('./WorkspaceMediaView.vue'))
const Module = defineAsyncComponent(() => import('./WorkspaceModuleView.vue'))
const Settings = defineAsyncComponent(() => import('./WorkspaceSettingsView.vue'))
const viewComponents = { 'game-editor': Module, 'map-editor': Module, 'entries-editor': Module, 'online-editor': Module, 'comic-editor': Module, 'director-editor': Module, 'materials-editor': Module, sources: Sources, 'settings-editor': Settings, source: Reference, chapter: Reference, exploration: Reference, entry: Reference, asset: Media, comic: Media, video: Media }
const host = useComposableWorkspace()
const root = ref(null)
const mainTarget = ref(null)
const sideTarget = ref(null)
const targetsReady = ref(false)
const renderedViews = computed(() => host.state.views.filter(view => view.resource.type !== 'online-editor' || host.onlineMountAllowed.value))
// Chapters are navigated in the authoring shelf, not a second header row.
const sideViews = computed(() => host.state.views.filter(view => view.group !== 'main'))
const mainModule = computed(() => !host.state.hidden && host.state.views.find(view => view.id === host.state.mainModuleId))
const titles = host.viewTitles
const active = computed(() => host.state.views.find(view => view.id === host.state.sideActiveId && view.group !== 'main'))
const visible = computed(() => Boolean(active.value && active.value.id !== host.state.mainModuleId && !host.state.hidden && (!narrow.value || Boolean(host.state.activeId) && host.state.activeId !== host.state.mainModuleId)))
const narrowQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 900px)') : null
const narrow = ref(Boolean(narrowQuery?.matches))
watch(() => [host.state.activeId, visible.value, host.state.mainModuleId, host.state.expanded, host.state.width, Object.values(titles).join('|')], async () => {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  for (const tab of root.value?.querySelectorAll('.workspace-content-tab.is-active') || []) {
    const slot = tab.closest('.workspace-content-tab-slot'), strip = slot?.parentElement
    if (!strip || !strip.offsetWidth) continue
    const box = slot.getBoundingClientRect(), bounds = strip.getBoundingClientRect()
    const scale = bounds.width / strip.offsetWidth || 1
    if (box.left < bounds.left) strip.scrollLeft += (box.left - bounds.left) / scale
    else if (box.right > bounds.right) strip.scrollLeft += (box.right - bounds.right) / scale
  }
}, { immediate: true, flush: 'post' })
const primaryHidden = computed(() => visible.value && narrow.value && !host.state.primaryComposing)
const mainUsesPrimary = computed(() => !mainModule.value || ['chapter', 'exploration'].includes(mainModule.value.resource.type))
watch(primaryHidden, hidden => { host.state.primaryVisible = !hidden && mainUsesPrimary.value }, { immediate: true })
watch(() => host.scope.value.bookId, bookId => { host.directoryDocked.value = Boolean(bookId) }, { immediate: true })
watch(mainModule, () => { host.state.primaryVisible = !primaryHidden.value && mainUsesPrimary.value })
watch(narrow, value => { host.state.narrow = value }, { immediate: true })
function composition(event, composing) {
  const id = event.target?.closest?.('[data-workspace-view-id]')?.getAttribute('data-workspace-view-id')
  if (id) host.state.composingViewId = composing ? id : ''
  else if (event.target?.closest?.('.workspace-primary-group')) host.state.primaryComposing = composing
}
function focusOwner(event) {
  const id = event.target?.closest?.('[data-workspace-view-id]')?.getAttribute('data-workspace-view-id')
  if (id) host.focusView(id)
  else if (event.target?.closest?.('.workspace-original-primary')) host.focusView(mainUsesPrimary.value ? host.state.mainModuleId : '')
}
function updateViewport(event) { narrow.value = event.matches }
function returnToInspector(event) {
  const button = event.target?.closest?.('[data-authoring-tool]')
  if (!visible.value || !button || !button.closest('.workspace-primary-group, .workspace-writing-tools')) return
  const alreadyOpen = button.dataset.selected === 'true' && (root.value?.querySelector('.workspace-primary-group .writing-inspector.is-open') || button.dataset.authoringTool === 'dual')
  if (!host.hide() || alreadyOpen) {
    event.preventDefault()
    event.stopPropagation()
  }
}
onMounted(() => { targetsReady.value = true; narrowQuery?.addEventListener('change', updateViewport) })
let drag = null
async function close(view) {
  await nextTick()
  if (await host.close(view.id)) { delete titles[view.id]; await nextTick(); root.value?.querySelector('.workspace-content-tab.is-active')?.focus() }
  else if (!host.state.notice) host.state.notice = view.resource.type === 'online-editor' && view.resource.roomSlug ? '请先在联机页离开房间，再关闭联机。' : host.state.composingViewId === view.id ? '请先完成当前输入，再关闭内容。' : '当前内容尚未保存，或仍有任务运行。请先完成保存或处理任务。'
}
function startResize(event) {
  if (event.button !== 0) return
  event.preventDefault()
  drag = { x: event.clientX, width: host.state.width, target: event.currentTarget, pointerId: event.pointerId }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function resize(event) { if (drag) host.resize(drag.width + (drag.x - event.clientX) / (root.value?.getBoundingClientRect().width / root.value?.offsetWidth || 1)) }
function endResize() { if (drag?.target.hasPointerCapture?.(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId); drag = null }
function resizeKey(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Home') host.resetLayout()
  else host.resize(host.state.width + (event.key === 'ArrowLeft' ? 24 : -24))
}
onBeforeUnmount(() => { host.tabsTarget.value = null; host.railTarget.value = null; host.directoryTarget.value = null; host.directoryDocked.value = false; endResize(); narrowQuery?.removeEventListener('change', updateViewport) })
</script>

<template>
  <div ref="root" class="workspace-content-groups" :class="{ 'has-project-directory': Boolean(host.scope.value.bookId), 'has-reference': visible, 'has-docked-tools': host.railDocked.value, 'is-expanded': visible && host.state.expanded, 'primary-is-composing': host.state.primaryComposing }" :style="{ '--workspace-reference-width': `${host.state.width}px` }" data-test="workspace-content-groups" @pointerdown.capture="focusOwner" @focusin.capture="focusOwner" @click.capture="returnToInspector" @compositionstart.capture="composition($event, true)" @compositionend.capture="composition($event, false)">
    <div :ref="element => host.directoryTarget.value = element" v-show="Boolean(host.scope.value.bookId)" class="workspace-directory-dock writing-page" :class="{ 'is-open': host.state.directoryOpen }" @keydown.esc.stop="host.state.directoryOpen = false"></div>
    <section class="workspace-primary-group" :inert="primaryHidden ? '' : undefined" :aria-hidden="primaryHidden ? 'true' : undefined">
      <div :ref="element => host.tabsTarget.value = element" class="workspace-tabs-host"></div>
      <div ref="mainTarget" v-show="!mainUsesPrimary" class="workspace-main-body"></div>
      <div v-show="mainUsesPrimary" class="workspace-original-primary" :inert="mainUsesPrimary ? undefined : ''"><slot /></div>
    </section>
    <p v-if="!visible && host.state.notice" class="workspace-host-notice" role="status">{{ tr(host.state.notice) }}<button type="button" :aria-label="tr('关闭提示')" @click="host.state.notice = ''"><WorkbenchIcon name="close" :size="14" /></button></p>
    <div v-show="visible" class="workspace-reference-group" :inert="visible ? undefined : ''" :aria-hidden="visible ? undefined : 'true'" :aria-label="tr('参考内容')">
      <div class="workspace-reference-resize" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="tr('调整参考栏宽度')" :aria-valuenow="host.state.width" aria-valuemin="320" aria-valuemax="680" @pointerdown="startResize" @pointermove="resize" @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="endResize" @keydown="resizeKey"></div>
      <header class="workspace-reference-header">
        <WorkspaceContentTabs :views="sideViews" :active-id="host.state.sideActiveId" :titles="titles" group="side" label="旁区已打开的内容" @activate="host.activate" @close="close" @reorder="host.reorderView($event.id, $event.beforeId, $event.group)" />
        <div class="workspace-reference-controls">
          <button type="button" :title="tr('移到主区')" :aria-label="tr('移到主区')" @click="host.move(true, active.id)"><WorkbenchIcon :name="'canvas'" :size="17" /></button>
          <button type="button" :title="tr('恢复默认布局')" :aria-label="tr('恢复默认布局')" @click="host.resetLayout"><WorkbenchIcon name="undo-extension" :size="16" /></button>
          <button type="button" :title="tr('回到工作区')" :aria-label="tr('回到工作区')" @click="host.hide"><WorkbenchIcon name="arrow-left" :size="17" /></button>
        </div>
      </header>

      <p v-if="host.state.notice" class="workspace-reference-notice" role="status">{{ tr(host.state.notice) }}</p>
      <div ref="sideTarget" class="workspace-side-body">
      </div>
    </div>
    <div :ref="element => host.railTarget.value = element" v-show="host.railDocked.value" class="workspace-writing-tools" :aria-label="tr('写作工具')"></div>
    <template v-if="targetsReady"><Teleport v-for="view in renderedViews" :key="view.id" :to="view.id === host.state.mainModuleId ? mainTarget : sideTarget">
      <section v-show="!host.state.hidden && ((view.id === host.state.mainModuleId && !['chapter', 'exploration'].includes(view.resource.type)) || (view.group !== 'main' && view.id === host.state.sideActiveId))" :data-workspace-view-id="view.id" class="workspace-reference-body" :class="{ 'workspace-module-body': isWorkspaceModule(view.resource.type) }" :inert="!host.state.hidden && ((view.id === host.state.mainModuleId && !['chapter', 'exploration'].includes(view.resource.type)) || (view.group !== 'main' && view.id === host.state.sideActiveId)) ? undefined : ''">
        <component :is="viewComponents[view.resource.type]" :resource="view.resource" :instance-id="view.id" @title="titles[view.id] = $event" @icon="host.viewIcons[view.id] = $event" />
      </section>
    </Teleport></template>
  </div>
</template>

<style scoped>
.workspace-tabs-host { flex: none; min-width: 0; }
.workspace-directory-dock.writing-page { display: flex; flex-direction: row; flex: 0 0 248px; width: 248px; min-width: 0; min-height: 0; padding: 0; overflow: hidden; }
.workspace-directory-dock :deep(.wall__shelf) { box-sizing: border-box; width: 100%; height: 100%; align-self: stretch; }
.workspace-directory-toggle { display: none; border: 0; color: var(--text-primary); background: transparent; min-height: 44px; padding: 0 12px; }
.workspace-directory-dock:empty { display: none; }
@media (max-width: 900px) { .workspace-directory-toggle { display: block; } .workspace-directory-dock.writing-page { display: none; } .workspace-directory-dock.writing-page.is-open { display: flex; position: absolute; inset: 44px auto 0 0; width: min(320px, calc(100vw - 42px)); z-index: 110; background: var(--surface-workbench-muted); box-shadow: var(--shadow-workbench-float); } .workspace-directory-dock.writing-page :deep(.wall__shelf) { position: static; transform: none; height: 100%; max-height: none; } }
.workspace-content-groups { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.workspace-primary-group { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.workspace-original-primary { display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.workspace-main-body, .workspace-side-body { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.workspace-main-body { background: var(--surface-workbench); color: var(--text-primary); }
.workspace-main-header { justify-content: space-between; }
.workspace-primary-return { max-width: min(220px, 40%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: none; min-height: 44px; padding: 0 14px; border: 0; background: transparent; color: var(--text-secondary); font: 13px var(--font-sans); cursor: pointer; }
.workspace-primary-return[aria-current] { color: var(--text-primary); background: var(--nav-focused); }
.workspace-main-header strong { display: flex; align-items: center; gap: 8px; padding: 0 14px; font: 500 13px var(--font-sans); color: var(--text-primary); }
.workspace-module-body { display: flex; flex-direction: column; overflow: hidden; }
.workspace-reference-group { position: relative; display: flex; flex-direction: column; flex: 0 0 min(var(--workspace-reference-width), 42%); min-width: 320px; min-height: 0; border-inline-start: 1px solid var(--hairline-soft); background: var(--surface-workbench); color: var(--text-primary); }
.workspace-reference-header { display: flex; align-items: center; gap: 4px; flex: none; min-height: 46px; border-bottom: 1px solid var(--hairline-soft); }
.workspace-content-tabs { display: flex; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
.workspace-content-tab-slot { display: flex; flex: none; align-items: center; max-width: 220px; border-inline-end: 1px solid var(--hairline-soft); }
.workspace-content-tab { display: flex; align-items: center; gap: 7px; min-width: 0; height: 44px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary); font: 13px var(--font-sans); cursor: pointer; }
.workspace-content-tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-content-tab.is-active { color: var(--text-primary); background: var(--nav-focused); }
.workspace-content-close, .workspace-reference-controls button { display: grid; place-items: center; flex: none; width: 30px; height: 36px; border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
.workspace-reference-controls { display: flex; flex: none; padding-inline: 4px; }
.workspace-reference-header button:hover { background: var(--nav-hover); color: var(--text-primary); }
.workspace-reference-header button:focus-visible, .workspace-reference-resize:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.workspace-reference-body { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.workspace-reference-notice { margin: 0; padding: 8px 16px; font: 12px/1.5 var(--font-sans); color: var(--text-secondary); }
.workspace-host-notice { position: absolute; bottom: 20px; inset-inline: 20px; z-index: 5; display: flex; align-items: center; gap: 12px; width: fit-content; max-width: calc(100% - 40px); margin: 0 auto; padding: 10px 14px; background: var(--surface-workbench); border: 1px solid var(--hairline-soft); color: var(--text-secondary); font: 13px/1.5 var(--font-sans); }
.workspace-host-notice button { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border: 0; background: transparent; color: inherit; cursor: pointer; }
.workspace-reference-task-summary { display: flex; gap: 12px; flex: none; padding: 6px 16px; border-bottom: 1px solid var(--hairline-soft); }
.workspace-reference-task-summary button { border: 0; background: transparent; color: var(--text-secondary); font: 12px/1.5 var(--font-sans); cursor: pointer; }
.workspace-reference-resize { position: absolute; inset-block: 0; inset-inline-start: -3px; width: 6px; z-index: 2; cursor: col-resize; touch-action: none; }
.workspace-reference-resize:hover { background: var(--nav-focused); }
.is-expanded .workspace-primary-group { position: absolute; inset: 0; visibility: hidden; pointer-events: none; }
.is-expanded .workspace-reference-group { flex: 1; border-inline-start: 0; }
.is-expanded .workspace-reference-resize { display: none; }
/* Reference content uses the inspector space without destroying its owner. */
.has-reference :deep(.writing-page:not(.is-assistant-full) .writing-inspector) { display: none !important; }
.has-reference :deep(.writing-page .writing-tool-rail button[aria-pressed="true"]) { background: transparent; color: var(--text-secondary); }
@media (min-width: 901px) {
  .has-reference:not(.has-docked-tools) :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector) { grid-template-columns: var(--workspace-sidebar-width, 240px) minmax(0, 1fr) var(--writing-tool-rail-width, 52px) !important; }
  .has-reference:not(.has-docked-tools) :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector .writing-tool-rail) { grid-column: 3 !important; }
}
@media (min-width: 901px) and (max-width: 1280px) {
  .has-reference:not(.has-docked-tools) :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector) { grid-template-columns: 220px minmax(0, 1fr) var(--writing-tool-rail-width, 52px) !important; }
}
@media (max-width: 900px) {
  .has-reference .workspace-reference-group { position: absolute; inset: 0; min-width: 0; border: 0; }
  .has-reference .workspace-primary-group { visibility: hidden; pointer-events: none; }
  .has-reference.primary-is-composing .workspace-primary-group { visibility: visible; pointer-events: auto; }
  .has-reference.primary-is-composing .workspace-reference-group { display: none !important; }
  .workspace-reference-resize { display: none; }
  .workspace-reference-controls button, .workspace-content-close { min-width: 40px; min-height: 44px; }
}
.workspace-writing-tools { box-sizing: border-box; padding-top: var(--workspace-toolbar-height, 52px); --writing-tool-rail-width: 52px; display: flex; flex: 0 0 var(--writing-tool-rail-width); min-height: 0; overflow: hidden; background: var(--surface-workbench-muted); }
@media (min-width: 901px) {
  .has-docked-tools :deep(.writing-page:not(.is-assistant-full) .wall__main) { grid-template-columns: var(--workspace-sidebar-width, 240px) minmax(0, 1fr) !important; }
}
@media (min-width: 901px) and (max-width: 1280px) {
  .has-docked-tools :deep(.writing-page:not(.is-assistant-full) .wall__main) { grid-template-columns: 220px minmax(0, 1fr) !important; }
}
@media (min-width: 901px) {
  .has-project-directory :deep(.writing-page:not(.is-assistant-full) .wall__main) { grid-template-columns: 0 minmax(0, 1fr) var(--writing-tool-rail-width, 52px) !important; }
  .has-project-directory :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector) { grid-template-columns: 0 minmax(360px, 1fr) var(--writing-dock-width, clamp(420px, 31vw, 440px)) var(--writing-tool-rail-width, 52px) !important; }
  .has-project-directory :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector:has(> .writing-inspector.is-catalog-workbench)) { grid-template-columns: 0 minmax(360px, 1fr) clamp(520px, 38vw, 600px) var(--writing-tool-rail-width, 52px) !important; }
  .has-project-directory.has-reference :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector), .has-project-directory.has-reference :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector:has(> .writing-inspector.is-catalog-workbench)) { grid-template-columns: 0 minmax(0, 1fr) var(--writing-tool-rail-width, 52px) !important; }
  .has-project-directory.has-docked-tools :deep(.writing-page:not(.is-assistant-full) .wall__main), .has-project-directory.has-docked-tools :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector:has(> .writing-inspector.is-catalog-workbench)) { grid-template-columns: 0 minmax(0, 1fr) !important; }
  .has-project-directory :deep(.writing-page .wall__dossier) { grid-column: 2; grid-row: 1; }
}
@media (min-width: 901px) and (max-width: 1180px) {
  .has-project-directory :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector), .has-project-directory :deep(.writing-page:not(.is-assistant-full) .wall__main.has-inspector:has(> .writing-inspector.is-catalog-workbench)) { grid-template-columns: 0 minmax(0, 1fr) var(--writing-tool-rail-width, 52px) !important; }
  .has-project-directory :deep(.writing-page .writing-inspector), .has-project-directory :deep(.authoring-dual-pane) { width: min(440px, calc(100% - var(--writing-tool-rail-width, 52px))); }
}
.workspace-content-groups:has(.writing-page.is-zen) .workspace-directory-dock { display: none; }
</style>
