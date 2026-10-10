<template>
  <nav
    ref="sectionNav"
    class="settings-section-nav"
    role="tablist"
    :aria-label="tr('设定分区')"
  >
    <router-link
      v-for="tab in tabs"
      :key="tab.key"
      class="settings-section-tab"
      :class="{ active: tab.key === currentTabKey }"
      role="tab"
      :aria-selected="(tab.key === currentTabKey).toString()"
      :data-test="`settings-section-tab-${tab.key}`"
      :to="sectionRoute(tab)"
    >
      <WorkbenchIcon class="settings-section-tab__icon" :name="tab.icon" :size="16" />
      <span class="settings-section-tab__label">{{ tr(tab.label) }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { useRoute } from 'vue-router'
import WorkbenchIcon from './WorkbenchIcon.vue'

/* 设定工作区的一级分区（W2-A-2b 后）：资料、地图、知识。
   「设定」不再是独立一级页——结构化设定是知识控制台内的视图（?view=settings），旧路由重定向过去。
   「知识」tab 覆盖知识控制台 + 编辑台（settings-worldbook-advanced，写面真源）+ 世界书快速导入页。
   活动栏那份把「世界书」「高级设置」当独立入口列出的 nav 配置已删（无运行时引用）；
   这两个页面本身是否再收进控制台，属 W4-B 待裁，不在命名收口范围内。 */
const tabs = [
  { key: 'sources', icon: 'sources', label: '资料', routeNames: ['settings-sources'], routeName: 'settings-sources' },
  { key: 'map', icon: 'map', label: '地图', routeNames: ['settings-world-map'], routeName: 'settings-world-map' },
  { key: 'knowledge', icon: 'list', label: '知识', routeNames: ['settings-knowledge', 'settings-worldbook-advanced', 'settings-worldbook'], routeName: 'settings-knowledge' }
]

const route = useRoute()
const sectionNav = ref(null)
const currentRouteName = computed(() => String(route.name || ''))
const currentTabKey = computed(() => tabs.find((tab) => tab.routeNames.includes(currentRouteName.value))?.key || '')

function revealCurrentSection() {
  const nav = sectionNav.value
  if (!nav || nav.scrollWidth <= nav.clientWidth) return
  const active = nav.querySelector('.settings-section-tab.active')
  if (!active) return
  const navLeft = nav.getBoundingClientRect().left + nav.clientLeft
  const navRight = navLeft + nav.clientWidth
  const activeBounds = active.getBoundingClientRect()
  if (activeBounds.left < navLeft) {
    nav.scrollLeft += activeBounds.left - navLeft
  } else if (activeBounds.right > navRight) {
    nav.scrollLeft += activeBounds.right - navRight
  }
}

onMounted(revealCurrentSection)
watch(currentTabKey, revealCurrentSection, { flush: 'post' })

// 分区切换保留项目上下文与适用的对象定位（联动闭环 L2）。
// bookId/worldbookId 始终保留；对象定位只带给用得到它的分区，跨分区清除。
// 正文回程不依赖这里的 query（存在 Authoring 标签的 volatile ledger），不会被覆盖。
const QUERY_WHITELIST_BY_TAB = {
  sources: ['bookId', 'worldbookId'],
  map: ['bookId', 'worldbookId', 'placeId', 'historyNodeId', 'entryId'],
  knowledge: ['bookId', 'worldbookId', 'entryId', 'view']
}
function sectionRoute(tab) {
  const query = {}
  for (const key of QUERY_WHITELIST_BY_TAB[tab.key] || []) {
    const value = route.query?.[key]
    if (typeof value === 'string' && value) query[key] = value
  }
  return { name: tab.routeName, query }
}
</script>

<style scoped>
.settings-section-nav {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
  min-width: 0;
  padding: 6px 20px;
  background: var(--surface-workbench-canvas);
  scroll-padding-inline: 8px;
  scroll-behavior: auto;
  scrollbar-width: none;
}
.settings-section-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: var(--workspace-control-height, 36px);
  padding: 0 10px;
  border: 0;
  border-radius: var(--workspace-radius, 10px);
  background: transparent;
  color: var(--text-secondary);
  font: 500 13px/1.4 var(--font-sans);
  text-decoration: none;
  white-space: nowrap;
  transition: color .16s ease, background .16s ease;
}
.settings-section-tab:hover { background: var(--nav-hover); color: var(--text-primary); }
.settings-section-tab.active { color: var(--text-primary); scroll-snap-align: start; scroll-margin-inline-start: 8px; }
.settings-section-tab.active::after { content: ''; position: absolute; inset-inline: 10px; bottom: 1px; height: 2px; border-radius: 1px; background: currentColor; }
.settings-section-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.settings-section-tab__icon { display: inline-flex; flex: none; width: 16px; height: 16px; color: currentColor; }
.settings-section-tab__label { display: inline-flex; align-items: center; }
@media (max-width: 760px), (pointer: coarse) { .settings-section-tab { min-height: 44px; } }
@media (max-width: 760px) { .settings-section-nav { overflow-x: auto; padding: 6px 12px; } .settings-section-tab { flex: 1 0 auto; padding-inline: 10px; } }
@media (prefers-reduced-motion: reduce) { .settings-section-tab { transition: none; } }
</style>
