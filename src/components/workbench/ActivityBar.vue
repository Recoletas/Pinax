<template>
  <nav class="activity-bar" aria-label="一级导航">
    <button
      v-for="(item, index) in items"
      :key="item.key"
      class="activity-btn"
      :class="{ active: item.key === activeKey }"
      type="button"
      @click="$emit('select', item.key)"
    >
      <span class="activity-index" aria-hidden="true">{{ ROMAN_INDEX_LABELS[index] || '·' }}</span>
      <span class="activity-icon" aria-hidden="true">
        <svg v-if="item.icon === 'compass'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="5"></circle>
          <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"></path>
        </svg>
        <svg v-else-if="item.icon === 'book'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 2.5H7A2 2 0 0 1 9 4.5V13.5H4A1 1 0 0 0 3 14.5V2.5Z"></path>
          <path d="M13 2.5H9A2 2 0 0 0 7 4.5V13.5H12A1 1 0 0 1 13 14.5V2.5Z"></path>
        </svg>
        <svg v-else-if="item.icon === 'archive'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 4.2h10l-.8 8.3A1.2 1.2 0 0 1 11 13.6H5a1.2 1.2 0 0 1-1.2-1.1L3 4.2Z"></path>
          <path d="M2.5 2.4h11v1.8h-11z"></path>
          <path d="M6.2 7h3.6"></path>
        </svg>
        <svg v-else-if="item.icon === 'settings'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="2"></circle>
          <path d="M8 1.8v1.5M8 12.7v1.5M1.8 8h1.5M12.7 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1"></path>
        </svg>
        <svg v-else-if="item.icon === 'film'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.2" y="3" width="11.6" height="10" rx="1.2"></rect>
          <path d="M5.2 3v10M10.8 3v10M2.2 6h11.6M2.2 10h11.6"></path>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 2.5H9L12 5.5V13A1 1 0 0 1 11 14H4A1 1 0 0 1 3 13V3.5A1 1 0 0 1 4 2.5Z"></path>
          <path d="M9 2.5V5.5H12"></path>
          <path d="M5.5 8H10.5"></path>
          <path d="M5.5 10.5H10.5"></path>
        </svg>
      </span>
      <span class="activity-copy">
        <span class="activity-label">{{ item.label }}</span>
        <span class="activity-desc">{{ item.description }}</span>
      </span>
    </button>
  </nav>
</template>

<script setup>
/* UI-NAV16 (2026-06-27): roman numeral stamps replace the 01/02
   padStart numerals from V1. ACTIVITY_ITEMS is bounded at 5 (workbenchNav.js)
   so the lookup is hard-coded; the same Roman vocabulary as AppShell.vue's
   ROMAN_ACTIVITY_STAMPS is reused so the mast tab and the drawer nav
   read as one catalogue language. If the count ever exceeds Ⅹ, extend
   the array. */
const ROMAN_INDEX_LABELS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ']

defineProps({
  items: {
    type: Array,
    default: () => []
  },
  activeKey: {
    type: String,
    default: ''
  }
})

defineEmits(['select'])
</script>

<style scoped>
/* UI-NAV16 (2026-06-27): left-drawer primary nav moves out of V1's
   arrow-notch / skewX / padStart / SaaS-gradient card language and
   into the archive-folio 目录纸签 family that already lives on the
   top mast (AppShell.vue V3) and on the materials drawer (Notes.vue
   N5C-A drawer-handle__roman). Each row is a flat 硬边纸签 stacked
   like a binder row, no rounded chip, no clip-path notch. */
.activity-bar {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 6px 0 10px;
}

.activity-btn {
  position: relative;
  min-height: 54px;
  display: grid;
  grid-template-columns: 24px 22px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 9px 12px 9px 14px;
  border: none;
  border-left: 3px solid transparent;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 16%, transparent);
  background: transparent;
  color: var(--archive-ink-soft);
  text-align: left;
  cursor: pointer;
  transition: border-left-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.activity-btn:first-child {
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 16%, transparent);
}

.activity-btn:hover {
  background: color-mix(in srgb, var(--archive-paper) 60%, transparent);
  color: var(--archive-ink);
}

.activity-btn.active {
  border-left-color: color-mix(in srgb, var(--archive-rose) 78%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 88%, transparent);
  color: var(--archive-ink);
}

/* Roman numeral stamp — LXGW brush via var(--font-display), same
   vocabulary as the top mast (.shell-tab__index). No skewX, no
   padStart, no tabular-nums (roman numerals do not align). */
.activity-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--archive-ink-soft) 86%, transparent);
}

.activity-btn.active .activity-index {
  color: color-mix(in srgb, var(--archive-rose) 86%, var(--archive-ink));
}

/* Icon — directory mark, not a SaaS button. Transparent box, no
   clip-path notch, hard edge. Active = ink-color flip to olive. */
.activity-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--archive-ink-soft) 88%, transparent);
  background: transparent;
}

.activity-btn.active .activity-icon {
  color: color-mix(in srgb, var(--archive-olive) 82%, var(--archive-ink));
}

.activity-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.activity-label {
  display: block;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
  color: var(--archive-ink);
}

.activity-desc {
  display: block;
  font-size: 11px;
  line-height: 1.35;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--archive-ink-soft) 80%, transparent);
}
</style>