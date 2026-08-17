<template>
  <nav
    class="settings-section-nav"
    role="tablist"
    aria-label="设定分区"
  >
    <router-link
      v-for="tab in tabs"
      :key="tab.key"
      class="settings-section-tab"
      :class="{ active: tab.key === currentTabKey }"
      role="tab"
      :aria-selected="(tab.key === currentTabKey).toString()"
      :data-test="`settings-section-tab-${tab.key}`"
      :to="{ name: tab.routeName }"
    >
      <WorkbenchIcon class="settings-section-tab__icon" :name="tab.icon" :size="14" />
      <span class="settings-section-tab__label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import WorkbenchIcon from './WorkbenchIcon.vue'

/* 设定工作区只保留三个一级职责：设定、地图、条目。
   世界书首页作为设定入口保留路由，但不再占用一个重复 tab。 */
const tabs = [
  { key: 'structured', icon: 'network', label: '设定', routeNames: ['settings-structured', 'settings-worldbook'], routeName: 'settings-structured' },
  { key: 'map', icon: 'compass', label: '地图', routeNames: ['settings-world-map'], routeName: 'settings-world-map' },
  { key: 'advanced', icon: 'settings', label: '条目', routeNames: ['settings-worldbook-advanced'], routeName: 'settings-worldbook-advanced' }
]

const route = useRoute()
const currentRouteName = computed(() => String(route.name || ''))
const currentTabKey = computed(() => tabs.find((tab) => tab.routeNames.includes(currentRouteName.value))?.key || '')
</script>

<style scoped>
.settings-section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 0 clamp(12px, 3vw, 42px);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 54%, transparent);
  background: transparent;
  flex-shrink: 0;
  /* W5b UX sweep: on <760px the nav becomes overflow-x: auto and
     the active tab can scroll out of view. Pure CSS scroll-snap +
     scroll-padding keeps the active tab flush with the visible edge
     so the user can always see which tab is selected. */
  scroll-padding-inline: 8px;
  scroll-behavior: smooth;
}

/* The active tab is the snap target; inline:start means it docks to the
   left edge of the scroller (or right, in RTL) after route change. */


/* 透明底、底部活动线和小间距保持设定工作区的连续稿面语言。 */
.settings-section-tab {
  position: relative;
  min-height: 34px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.16s ease, background 0.16s ease;
}

.settings-section-tab:first-child {
  border-left: 0;
}

.settings-section-tab:hover {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  color: var(--text-primary);
}

.settings-section-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.settings-section-tab.active {
  color: var(--text-primary);
  font-weight: 600;
  border-bottom-color: var(--accent);
  /* W5b UX sweep (continued): scroll-snap-align + scroll-margin so the
     active tab stays in view when the nav scrolls horizontally. */
  scroll-snap-align: start;
  scroll-margin-inline-start: 8px;
}

/* 一级导航只用图标、文字和活动线，不再添加编号或印章。 */
.settings-section-tab::before {
  content: none;
}

.settings-section-tab__icon {
  display: inline-flex;
  color: var(--text-muted);
}

:global(html.theme-legacy .settings-section-tab__icon) {
  display: inline-flex;
}

:global(html.theme-legacy .settings-section-tab.active .settings-section-tab__icon) {
  color: var(--signal-primary);
}

.settings-section-tab__label {
  display: inline-flex;
  align-items: center;
}

/* 760px 以下允许横向滚动，保证三个一级入口仍可触达。 */
@media (max-width: 760px) {
  .settings-section-nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 8px;
  }

  .settings-section-tab {
    min-width: max-content;
    padding: 0 10px;
    font-size: 11px;
  }
}

/* 兼容旧主题的色彩覆盖；主题 2 仍保持冷白稿面。 */
.theme-kao .settings-section-nav {
  border-bottom-color: color-mix(in srgb, var(--archive-gold) 18%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 96%, var(--archive-paper-soft));
}

.theme-kao .settings-section-tab {
  min-height: 34px;
  border-bottom-color: transparent;
  color: var(--archive-ink-soft);
}

.theme-kao .settings-section-tab:hover {
  background: color-mix(in srgb, var(--archive-paper) 80%, transparent);
  color: var(--archive-ink);
}

.theme-kao .settings-section-tab.active {
  color: var(--archive-ink);
}

.theme-kao .settings-section-tab.active {
  border-bottom-color: var(--archive-olive);
}

/* Theme 2: one quiet workbench rail shared by every settings surface. */
.theme-legacy .settings-section-nav {
  min-height: 42px;
  align-items: stretch;
  gap: 0;
  padding-inline: clamp(14px, 3vw, 42px);
  border-bottom-color: color-mix(in srgb, var(--archive-olive) 16%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 74%, transparent);
}

.theme-legacy .settings-section-tab {
  min-height: 42px;
  padding-inline: 14px;
  gap: 7px;
  color: var(--archive-ink-soft);
  font-size: 12px;
}

.theme-legacy .settings-section-tab:hover {
  background: color-mix(in srgb, var(--archive-olive) 5%, transparent);
  color: var(--archive-ink);
}

.theme-legacy .settings-section-tab.active {
  border-bottom-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 4%, transparent);
  color: var(--archive-ink);
}

.theme-legacy .settings-section-tab.active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 18px;
  height: 2px;
  background: var(--archive-rose);
  transform: translateX(-50%);
}

@media (max-width: 760px) {
  .theme-legacy .settings-section-nav {
    min-height: 40px;
    padding-inline: 6px;
  }

  .theme-legacy .settings-section-tab {
    min-height: 40px;
    padding-inline: 11px;
  }
}
</style>
