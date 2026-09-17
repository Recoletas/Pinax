<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { useWorkspaceTabsStore } from '../../stores/workspaceTabsStore'
import { activateWorkspaceTab, closeWorkspaceTab } from '../../services/workspace/workspaceRouteAdapter'

// 顶部工作台标签：浏览器式连续标签带。活动标签与内容面连通；
// dirty 用信号点；窄屏通过横向滚动访问全部标签。
const router = useRouter()
const route = useRoute()
const workspaceTabs = useWorkspaceTabsStore()

const scrollRef = ref(null)

const SURFACE_ICONS = {
  authoring: 'pencil',
  materials: 'folder',
  canvas: 'storyboard',
  settings: 'settings',
  map: 'compass',
  comics: 'film',
  experience: 'message-square',
  docs: 'book',
  'settings-worldbook': 'settings',
  'settings-worldbook-create': 'bookmark-plus',
  'settings-worldbook-advanced': 'settings',
  'settings-world-map': 'compass',
  'online-experience': 'users',
  'collaboration-review': 'users'
}

const HOME_TAB_ID = 'pinax-home'
const homeTab = { id: HOME_TAB_ID, key: 'home', title: '首页', surface: 'home', pinned: true }
const tabs = computed(() => [homeTab, ...workspaceTabs.tabs])
const activeTabId = computed(() => route.name === 'welcome' ? HOME_TAB_ID : workspaceTabs.activeTabId)
async function revealActiveTab() {
  await nextTick()
  const selected = scrollRef.value?.querySelector('[aria-current="true"]')
  selected?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}
watch(activeTabId, revealActiveTab, { immediate: true })

function surfaceIcon(surface) {
  if (surface === 'home') return 'book'
  return SURFACE_ICONS[surface] || 'archive'
}

// 同书标签的项目色条：由书 ID 确定性推导低饱和墨色，只作辅助关联，不单独承载区分。
function projectInkStyle(tab) {
  if (tab.scope !== 'project' || !tab.projectId) return null
  let hash = 5381
  const id = String(tab.projectId)
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0
  }
  const hue = hash % 360
  return { '--ws-project-ink': `hsl(${hue} 38% 40%)` }
}

// 760-1179 的缩短标题：项目子 surface 只显示 surface 名，写作标签显示书名。
function shortTitle(tab) {
  if (tab.scope !== 'project') return tab.title
  return tab.surface === 'authoring'
    ? tab.title
    : tab.title.split(' · ').slice(1).join(' · ') || tab.title
}

function displayTitle(tab) {
  if (tab.scope !== 'project' || tab.surface === 'authoring') return tab.title
  const [project, ...surface] = tab.title.split(' · ')
  return surface.length ? `${surface.join(' · ')} · ${project}` : tab.title
}

function activateTab(tabId) {
  if (tabId === HOME_TAB_ID) { void router.push({ name: 'welcome' }); return }
  void activateWorkspaceTab(workspaceTabs, router, tabId)
}

function closeTab(tabId) {
  if (tabId === HOME_TAB_ID) return
  void closeWorkspaceTab(workspaceTabs, router, tabId).then(() => {
    focusActiveTab()
  })
}

function focusActiveTab() {
  nextTick(() => {
    const el = scrollRef.value?.querySelector(`[data-tab-id="${activeTabId.value}"]`)
    if (el) el.focus({ preventScroll: false })
  })
}

function visibleTabElements() {
  if (!scrollRef.value) return []
  return [...scrollRef.value.querySelectorAll('[data-tab-id]')]
    .filter((el) => el.offsetParent !== null || el.getBoundingClientRect().width > 0)
}

function onTablistKeydown(event) {
  const elements = visibleTabElements()
  if (elements.length === 0) return
  const currentIndex = elements.indexOf(document.activeElement)
  let targetIndex = -1
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1 + elements.length) % elements.length
  else if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + elements.length) % elements.length
  else if (event.key === 'Home') targetIndex = 0
  else if (event.key === 'End') targetIndex = elements.length - 1
  if (targetIndex >= 0) {
    event.preventDefault()
    elements[targetIndex].focus()
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && currentIndex >= 0) {
    event.preventDefault()
    closeTab(elements[currentIndex].getAttribute('data-tab-id'))
  }
}

function onTabMiddleClick(event, tabId) {
  if (event.button === 1) {
    event.preventDefault()
    closeTab(tabId)
  }
}

// 全局快捷键：Ctrl/Cmd+W 关闭当前标签、Ctrl(+Shift)+Tab 循环。
// 正文/输入控件内不截获（原生编辑语义优先）；浏览器保留键在桌面壳内生效。
function onGlobalKeydown(event) {
  const key = event.key
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && (key === 'w' || key === 'W')) {
    const target = event.target
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
    if (!activeTabId.value) return
    event.preventDefault()
    closeTab(activeTabId.value)
    return
  }
  if (event.ctrlKey && key === 'Tab' && tabs.value.length > 1) {
    event.preventDefault()
    const order = tabs.value
    const index = order.findIndex((tab) => tab.id === activeTabId.value)
    const delta = event.shiftKey ? -1 : 1
    const next = order[(index + delta + order.length) % order.length]
    if (next) activateTab(next.id)
  }
}

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('resize', revealActiveTab)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', revealActiveTab)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div
    v-if="tabs.length > 0"
    class="ws-tabs"
    role="group"
    aria-label="工作台标签"
    data-test="workspace-tabs"
    @keydown="onTablistKeydown"
  >
    <!-- NB03：标签 = 真实 button + 关闭为兄弟 button（禁止交互嵌套）；
         滚动容器可聚焦（scrollable-region-focusable）；激活态用 aria-current。 -->
    <div
      ref="scrollRef"
      class="ws-tabs__scroll"
      role="group"
      aria-label="标签（可左右滚动）"
      tabindex="0"
    >
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :data-tab-slot-id="tab.id"
        class="ws-tab-slot"
        :style="projectInkStyle(tab)"
        @mousedown="onTabMiddleClick($event, tab.id)"
      >
        <button
          type="button"
          class="ws-tab"
          :class="{ 'is-active': tab.id === activeTabId, 'is-pinned': tab.pinned }"
          :data-tab-id="tab.id"
          :data-tab-key="tab.key"
          :aria-current="tab.id === activeTabId ? 'true' : undefined"
          :title="tab.title"
          @click="activateTab(tab.id)"
        >
          <span class="ws-tab__project-bar" aria-hidden="true"></span>
          <img v-if="tab.surface === 'home'" class="ws-tab__brand" src="/pinax-icon-192.png" alt="" width="18" height="18" />
          <WorkbenchIcon v-else class="ws-tab__icon" :name="surfaceIcon(tab.surface)" :size="14" />
          <span class="ws-tab__label">
            <span class="ws-tab__label-full">{{ displayTitle(tab) }}</span>
            <span class="ws-tab__label-short">{{ shortTitle(tab) }}</span>
          </span>
          <span v-if="tab.dirty" class="ws-tab__dirty" title="有未保存更改" aria-label="有未保存更改"></span>
        </button>
        <button
          v-if="!tab.pinned"
          class="ws-tab__close"
          type="button"
          :aria-label="`关闭 ${tab.title}`"
          @click.stop="closeTab(tab.id)"
          @keydown.stop
        >
          <WorkbenchIcon name="close" :size="12" />
        </button>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.ws-tabs {
  display: flex;
  align-items: flex-end;
  min-height: 38px;
  flex: 0 0 auto;
  padding: 4px 6px 0;
  gap: 0;
  background: var(--surface-workbench-muted);
  box-shadow: inset 0 -1px var(--hairline-soft);
  position: relative;
  z-index: var(--z-workbench-chrome, 90);
}

.ws-tabs__scroll {
  display: flex;
  align-items: flex-end;
  align-self: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  min-width: 0;
  flex: 1 1 auto;
}
.ws-tabs__scroll::-webkit-scrollbar { display: none; }
.ws-tabs__scroll:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}

.ws-tab-slot {
  position: relative;
  display: inline-flex;
  align-self: stretch;
}

.ws-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 30px 0 12px;
  height: 34px;
  flex: 0 0 176px;
  min-width: 88px;
  max-width: 204px;
  border: 0;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--archive-ink-soft);
  font-size: 13px;
  line-height: 1;
  font-family: var(--font-sans, inherit);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  isolation: isolate;
  transition: color 120ms ease, background-color 120ms ease;
}

.ws-tab:hover {
  color: var(--archive-ink);
  background: color-mix(in srgb, var(--archive-paper-soft) 54%, transparent);
}

.ws-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -3px;
}

.ws-tab.is-active {
  color: var(--archive-ink);
  font-weight: 500;
  background: var(--archive-paper-soft);
  box-shadow: inset 0 1px color-mix(in srgb, var(--archive-ink) 7%, transparent);
  z-index: 1;
}

.ws-tab.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--archive-paper-soft);
}

.ws-tab:not(.is-active):not(:last-child)::before {
  content: '';
  position: absolute;
  right: 0;
  width: 1px;
  height: 16px;
  background: var(--hairline-soft);
}
.ws-tab:not(.is-active):hover::before { opacity: 0; }

.ws-tab__project-bar { display: none; }

.ws-tab__icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  opacity: 0.78;
}
.ws-tab__brand { flex: none; border-radius: 4px; object-fit: contain; }

.ws-tab__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-tab__label-short {
  display: none;
}

.ws-tab__dirty {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--archive-rose, #a23a4a);
}

.ws-tab__close {
  position: absolute;
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border: none;
  padding: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  border-radius: 5px;
  cursor: pointer;
  opacity: 0;
  transition: color 120ms ease, background-color 120ms ease, opacity 120ms ease;
}
.ws-tab-slot:is(:hover, :focus-within) .ws-tab__close,
.ws-tab.is-active + .ws-tab__close { opacity: 1; }

.ws-tab__close:hover {
  color: var(--archive-ink);
  background: color-mix(in srgb, var(--archive-ink) 9%, transparent);
}

.ws-tab__close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 70%, transparent);
  outline-offset: 1px;
}

.ws-tab[data-tab-key="home"] { flex: 0 0 82px; }
.ws-tab.is-pinned { padding-right: 8px; }

@media (max-width: 1179px) {
  .ws-tab { flex-basis: 158px; max-width: 176px; }
  .ws-tab__label-full { display: none; }
  .ws-tab__label-short { display: inline; }
}

@media (max-width: 759px) {
  .ws-tabs { min-height: 42px; padding-inline: 4px; }
  .ws-tab { height: 38px; flex-basis: 166px; max-width: 190px; font-size: 14px; }
  .ws-tab[data-tab-key="home"] { flex-basis: 82px; min-width: 82px; }
  .ws-tab__label-full { display: inline; }
  .ws-tab__label-short { display: none; }
  .ws-tab__close { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .ws-tab,
  .ws-tab__close {
    transition: none;
  }
}

</style>
