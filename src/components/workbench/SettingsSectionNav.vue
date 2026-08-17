<template>
  <nav
    class="settings-section-nav"
    role="tablist"
    aria-label="设定分区"
  >
    <router-link
      v-for="tab in tabs"
      :key="tab.routeName"
      class="settings-section-tab"
      :class="{ active: tab.routeName === currentRouteName }"
      role="tab"
      :aria-selected="(tab.routeName === currentRouteName).toString()"
      :data-test="`settings-section-tab-${tab.key}`"
      :to="{ name: tab.routeName }"
    >
      <span class="settings-section-tab__index" aria-hidden="true">{{ tab.index }}</span>
      <WorkbenchIcon class="settings-section-tab__icon" :name="tab.icon" :size="14" />
      <span class="settings-section-tab__label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import WorkbenchIcon from './WorkbenchIcon.vue'

/* UI-S16 (2026-06-27): settings activity 内部切换条. 4 个设定子页
   共享同一段 router-link 标签条, 顺序 = activity 入口默认序:
   结构化 → 世界书 → 地图 → 高级. 跟 AppShell mast 顶 tab
   同款 archive-folio 语言: 撕边 dashed 分隔 + 罗马数字 index
   + active 的 ◆ 印章. 用户进 设定 activity 后, 4 个 sub-page
   内部就能互跳, 不必再回左侧抽屉 / mast activity tab. */
const tabs = [
  { key: 'structured', index: 'Ⅰ', icon: 'network', label: '结构化设定', routeName: 'settings-structured' },
  { key: 'worldbook', index: 'Ⅱ', icon: 'book', label: '世界书', routeName: 'settings-worldbook' },
  { key: 'map', index: 'Ⅲ', icon: 'compass', label: '地图', routeName: 'settings-world-map' },
  { key: 'advanced', index: 'Ⅳ', icon: 'settings', label: '高级', routeName: 'settings-worldbook-advanced' }
]

const route = useRoute()
const currentRouteName = computed(() => String(route.name || ''))
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


/* UI-S16: 撕边 dashed 分隔 (跟 mast tab 同款 1px dashed border,
   第一项无 leading stub). 圆角 0 / 透明底 / ◆ 印章 active = 档案
   册语言, 不走 Material 圆角 chip 高亮. */
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

/* UI-S16: active 印章 ◆ 跟 mast tab 同款做法, ::before 内容
   "◆" + opacity 0→1 切换. aria-hidden on the index + the stamp
   means screen readers fall back to aria-selected on the tab. */
.settings-section-tab::before {
  content: none;
}

/* UI-S16: 罗马数字 index 沿用 mast tab 字体栈
   var(--font-display) → Iowan Old Style / Songti SC / STSong. 12px
   跟 mast 一致, 不加 tabular-nums. */
.settings-section-tab__index {
  display: none;
  min-width: 0;
  text-align: center;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.settings-section-tab.active .settings-section-tab__index {
  color: var(--text-primary);
}

.settings-section-tab__icon {
  display: inline-flex;
  color: var(--text-muted);
}

:global(html.theme-legacy .settings-section-tab__index) {
  display: none;
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

/* UI-S16: 760px 横向滚, 保留 4 个 tab 都能看到. */
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

/* UI-S16: kao 主题覆写 — 撕边 / 印章 / ink 颜色都换 archive-folio
   语汇. 默认走冷色 archive-paper, kao 走暖 archive-gold + rose
   stamp, 跟 mast tab 完全一致. */
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

.theme-kao .settings-section-tab__index {
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  color: var(--archive-ink-soft);
}

.theme-kao .settings-section-tab.active .settings-section-tab__index {
  color: var(--archive-ink);
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
