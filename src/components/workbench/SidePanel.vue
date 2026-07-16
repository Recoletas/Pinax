<template>
  <aside class="side-panel" aria-label="二级导航">
    <header class="side-panel-head">
      <span class="side-panel-kicker">Section</span>
      <h2 class="side-panel-title">{{ title }}</h2>
    </header>

    <div class="side-panel-list">
      <button
        v-for="(item, index) in items"
        :key="item.routeName"
        class="side-link"
        :class="{ active: item.routeName === activeRouteName }"
        type="button"
        @click="$emit('select', item.routeName)"
      >
        <span class="side-link-index" aria-hidden="true">{{ SIDE_INDEX_LABELS[index] || '·' }}</span>
        <span class="side-link-copy">
          <span class="side-link-label">{{ item.label }}</span>
          <span class="side-link-desc">{{ item.description }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<script setup>
/* UI-NAV16 (2026-06-27): same roman vocabulary as the mast tab
   (.shell-tab__index in AppShell.vue V3) and the drawer primary nav
   (ActivityBar.vue NAV16). SIDE_PANELS items are bounded at ≤4 in
   workbenchNav.js so the lookup fits I-V. */
const SIDE_INDEX_LABELS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ']

defineProps({
  title: {
    type: String,
    default: '模块'
  },
  items: {
    type: Array,
    default: () => []
  },
  activeRouteName: {
    type: String,
    default: ''
  }
})

defineEmits(['select'])
</script>

<style scoped>
/* UI-NAV16 (2026-06-27): same 纸签 / 目录 binder-row language as the
   drawer primary nav (ActivityBar.vue). Drops V1's clip-path polygon
   (arrow notch) and the SaaS-gradient active card; the active row is
   just a left-edge ink stamp + paper tint. No skewX, no padding on
   the row body (binder row). */
.side-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.side-panel-head {
  padding: 18px 16px 12px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 16%, transparent);
  background:
    linear-gradient(126deg, color-mix(in srgb, var(--archive-gold) 10%, transparent) 0 34%, transparent 34.4% 100%);
}

.side-panel-kicker {
  display: inline-block;
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink-soft));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.side-panel-title {
  margin-top: 6px;
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 22px;
  line-height: 1;
  font-weight: 820;
  letter-spacing: 0.04em;
  color: var(--archive-ink);
}

.side-panel-list {
  padding: 6px 0 14px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.side-link {
  position: relative;
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 8px 12px 8px 18px;
  border: none;
  border-left: 3px solid transparent;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 14%, transparent);
  background: transparent;
  color: color-mix(in srgb, var(--archive-ink-soft) 92%, transparent);
  cursor: pointer;
  transition: border-left-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.side-link:hover {
  background: color-mix(in srgb, var(--archive-paper) 62%, transparent);
  color: var(--archive-ink);
}

.side-link.active {
  border-left-color: color-mix(in srgb, var(--archive-rose) 78%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 86%, transparent);
  color: var(--archive-ink);
}

.side-link-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--archive-ink-soft) 84%, transparent);
}

.side-link.active .side-link-index {
  color: color-mix(in srgb, var(--archive-rose) 86%, var(--archive-ink));
}

.side-link-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.side-link-label {
  display: block;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
  color: var(--archive-ink);
}

.side-link-desc {
  display: block;
  font-size: 11px;
  line-height: 1.35;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--archive-ink-soft) 78%, transparent);
}
</style>