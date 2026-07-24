<template>
  <nav class="activity-bar" aria-label="一级导航">
    <button
      v-for="item in items"
      :key="item.key"
      class="activity-btn"
      :class="{ active: item.key === activeKey }"
      type="button"
      @click="$emit('select', item.key)"
    >
      <span class="activity-icon" aria-hidden="true">
        <WorkbenchIcon :name="item.icon" :size="16" />
      </span>
      <span class="activity-copy">
        <span class="activity-label">{{ item.label }}</span>
        <span class="activity-desc">{{ item.description }}</span>
      </span>
    </button>
  </nav>
</template>

<script setup>
import WorkbenchIcon from './WorkbenchIcon.vue'

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
   top mast (AppShell.vue V3) and on the materials drawer. Each row is a flat 硬边纸签 stacked
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
  grid-template-columns: 24px minmax(0, 1fr);
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
