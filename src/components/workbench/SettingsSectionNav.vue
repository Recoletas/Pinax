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
      <span class="settings-section-tab__label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

/* UI-S16 (2026-06-27): settings activity 内部切换条. 4 个设定子页
   共享同一段 router-link 标签条, 顺序 = activity 入口默认序:
   世界书 (entry) → 结构化 → 地图 → 高级. 跟 AppShell mast 顶 tab
   同款 archive-folio 语言: 撕边 dashed 分隔 + 罗马数字 index
   + active 的 ◆ 印章. 用户进 设定 activity 后, 4 个 sub-page
   内部就能互跳, 不必再回左侧抽屉 / mast activity tab. */
const tabs = [
  { key: 'worldbook', index: 'Ⅰ', label: '世界书', routeName: 'settings-worldbook' },
  { key: 'structured', index: 'Ⅱ', label: '结构化', routeName: 'settings-structured' },
  { key: 'map', index: 'Ⅲ', label: '地图', routeName: 'settings-world-map' },
  { key: 'advanced', index: 'Ⅳ', label: '高级', routeName: 'settings-worldbook-advanced' }
]

const route = useRoute()
const currentRouteName = computed(() => String(route.name || ''))
</script>

<style scoped>
.settings-section-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  padding: 0 8px;
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 86%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  flex-shrink: 0;
}

/* UI-S16: 撕边 dashed 分隔 (跟 mast tab 同款 1px dashed border,
   第一项无 leading stub). 圆角 0 / 透明底 / ◆ 印章 active = 档案
   册语言, 不走 Material 圆角 chip 高亮. */
.settings-section-tab {
  position: relative;
  min-height: 36px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-left: 1px dashed color-mix(in srgb, var(--border) 86%, transparent);
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
  border-left: none;
}

.settings-section-tab:hover {
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  color: var(--text-primary);
}

.settings-section-tab.active {
  color: var(--text-primary);
  font-weight: 600;
}

/* UI-S16: active 印章 ◆ 跟 mast tab 同款做法, ::before 内容
   "◆" + opacity 0→1 切换. aria-hidden on the index + the stamp
   means screen readers fall back to aria-selected on the tab. */
.settings-section-tab::before {
  content: "";
  display: inline-block;
  width: 0;
  opacity: 0;
  margin-right: 0;
  transition: opacity 0.18s ease, width 0.18s ease, margin-right 0.18s ease;
}

.settings-section-tab.active::before {
  content: "◆";
  opacity: 1;
  width: auto;
  margin-right: 4px;
  font-size: 9px;
  line-height: 1;
  color: color-mix(in srgb, var(--accent) 72%, transparent);
}

/* UI-S16: 罗马数字 index 沿用 mast tab 字体栈
   var(--font-display) → Iowan Old Style / Songti SC / STSong. 12px
   跟 mast 一致, 不加 tabular-nums. */
.settings-section-tab__index {
  display: inline-block;
  min-width: 14px;
  text-align: center;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.settings-section-tab.active .settings-section-tab__index {
  color: var(--text-primary);
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
    padding: 0 4px;
  }

  .settings-section-tab {
    min-width: max-content;
    padding: 0 12px;
    font-size: 11px;
  }

  .settings-section-tab__index {
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
  border-left-color: color-mix(in srgb, var(--archive-gold) 18%, transparent);
  color: var(--archive-ink-soft);
}

.theme-kao .settings-section-tab:hover {
  background: color-mix(in srgb, var(--archive-paper) 80%, transparent);
  color: var(--archive-ink);
}

.theme-kao .settings-section-tab.active {
  color: var(--archive-ink);
}

.theme-kao .settings-section-tab.active::before {
  color: color-mix(in srgb, var(--archive-rose) 88%, transparent);
}

.theme-kao .settings-section-tab__index {
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  color: var(--archive-ink-soft);
}

.theme-kao .settings-section-tab.active .settings-section-tab__index {
  color: var(--archive-ink);
}
</style>
