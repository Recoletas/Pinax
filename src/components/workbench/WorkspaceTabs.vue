<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkbenchIcon from './WorkbenchIcon.vue'
import WorkspaceTabOverflow from './WorkspaceTabOverflow.vue'
import { useWorkspaceTabsStore } from '../../stores/workspaceTabsStore'
import { activateWorkspaceTab, closeWorkspaceTab } from '../../services/workspace/workspaceRouteAdapter'

// 顶部工作台标签（计划 Task 4）：第二层可横向滚动的工作标签。
// 视觉规范：活动态靠底边短色条，不用厚卡片；同书标签用相同项目短色条关联；
// dirty 用信号点；移动端只显示当前标签，其余进入“全部标签”菜单。
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
  const selected = scrollRef.value?.querySelector('[aria-selected="true"]')
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
    role="tablist"
    aria-label="工作台标签"
    data-test="workspace-tabs"
    @keydown="onTablistKeydown"
  >
    <div ref="scrollRef" class="ws-tabs__scroll">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :data-tab-id="tab.id"
        :data-tab-key="tab.key"
        class="ws-tab"
        :class="{ 'is-active': tab.id === activeTabId }"
        role="tab"
        :aria-selected="tab.id === activeTabId ? 'true' : 'false'"
        :tabindex="tab.id === activeTabId ? 0 : -1"
        :title="tab.title"
        :style="projectInkStyle(tab)"
        @click="activateTab(tab.id)"
        @keydown.enter.prevent="activateTab(tab.id)"
        @keydown.space.prevent="activateTab(tab.id)"
        @mousedown="onTabMiddleClick($event, tab.id)"
      >
        <span class="ws-tab__project-bar" aria-hidden="true"></span>
        <WorkbenchIcon class="ws-tab__icon" :name="surfaceIcon(tab.surface)" :size="14" />
        <span class="ws-tab__label">
          <span class="ws-tab__label-full">{{ tab.title }}</span>
          <span class="ws-tab__label-short">{{ shortTitle(tab) }}</span>
        </span>
        <span v-if="tab.dirty" class="ws-tab__dirty" title="有未保存更改" aria-label="有未保存更改"></span>
        <button
          v-if="!tab.pinned"
          class="ws-tab__close"
          type="button"
          :aria-label="`关闭 ${tab.title}`"
          :tabindex="tab.id === activeTabId ? 0 : -1"
          @click.stop="closeTab(tab.id)"
          @keydown.stop
        >
          <WorkbenchIcon name="close" :size="12" />
        </button>
      </div>
    </div>
    <WorkspaceTabOverflow
      v-if="tabs.length > 1"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      @activate="activateTab"
      @close="closeTab"
    />
    <slot />
  </div>
</template>

<style scoped>
.ws-tabs {
  display: flex;
  align-items: stretch;
  min-height: 34px;
  flex: 0 0 auto;
  padding: 0 10px 0 12px;
  gap: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft, #fbfdfe) 78%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 16%, transparent);
  position: relative;
  z-index: var(--z-workbench-chrome, 90);
}

.ws-tabs__scroll {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  min-width: 0;
  flex: 1 1 auto;
}

.ws-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 6px 0 9px;
  height: 34px;
  flex: 0 0 auto;
  max-width: 250px;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--archive-ink-soft, #4a637d);
  font-size: 12.5px;
  line-height: 1;
  font-family: var(--font-body, inherit);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  transition: color var(--motion-fast, 140ms) ease, background-color var(--motion-fast, 140ms) ease;
}

.ws-tab:hover {
  color: var(--archive-ink, #0f2236);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 6%, transparent);
}

.ws-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 70%, transparent);
  outline-offset: -2px;
}

.ws-tab.is-active {
  color: var(--archive-ink, #0f2236);
  font-weight: 600;
  background: color-mix(in srgb, var(--archive-paper-soft, #fbfdfe) 94%, white 6%);
}

.ws-tab.is-active::after {
  content: '';
  position: absolute;
  left: 7px;
  right: 7px;
  bottom: -1px;
  height: 2px;
  background: var(--archive-olive, #1f4d7a);
}

.ws-tab__project-bar {
  width: 3px;
  height: 13px;
  flex: 0 0 auto;
  background: var(--ws-project-ink, var(--archive-gold, #7d97b0));
  opacity: 0.9;
}

.ws-tab__icon {
  flex: 0 0 auto;
  opacity: 0.85;
}

.ws-tab__label {
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border: none;
  padding: 0;
  background: transparent;
  color: var(--archive-ink-soft, #4a637d);
  border-radius: 50%;
  cursor: pointer;
  transition: color var(--motion-fast, 140ms) ease, background-color var(--motion-fast, 140ms) ease;
}

.ws-tab__close:hover {
  color: var(--archive-ink, #0f2236);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 14%, transparent);
}

.ws-tab__close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 70%, transparent);
  outline-offset: 1px;
}

/* 760-1179：缩短为书名或 surface 名。 */
@media (max-width: 1179px) {
  .ws-tab {
    max-width: 172px;
  }

  .ws-tab__label-full {
    display: none;
  }

  .ws-tab__label-short {
    display: inline;
  }
}

/* <760：只显示当前标签，其余进入“全部标签”菜单。 */
@media (max-width: 759px) {
  .ws-tabs {
    padding: 0 8px;
  }

  .ws-tab:not(.is-active) {
    display: none;
  }

  .ws-tab.is-active {
    max-width: none;
    flex: 1 1 auto;
  }

  .ws-tab__label-full {
    display: inline;
  }

  .ws-tab__label-short {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ws-tab,
  .ws-tab__close {
    transition: none;
  }
}

/* 浏览器式工作标签：常驻首页与作品使用同一导航 owner。 */
.ws-tabs { min-height: 52px; padding: 8px 12px 0; background: color-mix(in srgb, var(--archive-paper-strong) 55%, var(--archive-paper)); gap: 8px; align-items: center; }
.ws-tabs__scroll { align-self: stretch; scrollbar-width: none; }
.ws-tabs__scroll::-webkit-scrollbar { display: none; }
.ws-tab { height: 44px; flex: 0 0 218px; min-width: 0; max-width: 218px; padding: 0 10px 0 14px; gap: 8px; font-size: 14px; border-radius: 7px 7px 0 0; border: 1px solid transparent; border-bottom: 0; }
.ws-tab[data-tab-key="home"] { flex-basis: 96px; }
.ws-tab:not(.is-active):not(:hover)::before { content: ''; position: absolute; right: 0; height: 18px; width: 1px; background: var(--archive-paper-strong); }
.ws-tab__label-full { display: inline; }
.ws-tab__label-short { display: none; }
.ws-tab.is-active { background: var(--archive-paper-soft); border-color: color-mix(in srgb, var(--archive-ink) 12%, transparent); }
.ws-tab.is-active::after, .ws-tab__project-bar { display: none; }
.ws-tab__label { flex: 1; }
.ws-tab__close { width: 26px; height: 26px; }
.ws-tab__icon { width: 17px; height: 17px; }
@media (max-width: 759px) {
  .ws-tab[data-tab-key="home"] { display: inline-flex; flex: 0 0 96px; min-width: 96px; }
  .ws-tab { min-width: 0; max-width: 210px; font-size: 14px; }
  .ws-tab.is-active { min-width: 0; }
}
</style>
