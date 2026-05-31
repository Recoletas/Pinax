<script setup>
defineProps({
  items: {
    type: Array,
    required: true
  },
  activeKey: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select'])

const icons = {
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  archive: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
  film: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`
}

function getIcon(iconName) {
  return icons[iconName] || icons.compass
}

function handleSelect(key) {
  emit('select', key)
}
</script>

<template>
  <div class="activity-bar">
    <div class="activity-items">
      <button
        v-for="item in items"
        :key="item.key"
        class="activity-item touch-target"
        :class="{ active: activeKey === item.key }"
        :title="item.description"
        @click="handleSelect(item.key)"
      >
        <span class="activity-icon" v-html="getIcon(item.icon)"></span>
        <span class="activity-label">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  width: 56px;
  height: 100%;
  background: var(--bg-secondary, #1a1a2e);
  border-right: 1px solid var(--border-color, #2d2d44);
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.activity-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.activity-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--text-muted, #888);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.activity-item:hover {
  background: var(--bg-hover, #2d2d44);
  color: var(--text-primary, #fff);
}

.activity-item.active {
  background: var(--accent-color, #6366f1);
  color: #fff;
}

.activity-icon {
  width: 22px;
  height: 22px;
}

.activity-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.activity-label {
  font-size: 10px;
  text-align: center;
  line-height: 1.2;
}
</style>