<template>
  <div class="context-selector">
    <div class="selector-header">
      <span class="selector-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 1L1 4v6l6 3 6-3V4L7 1zm0 1.5l4.5 2.5v5L7 12.5 2.5 10v-5L7 2.5z"/>
        </svg>
      </span>
      <span>上下文</span>
      <button class="toggle-btn" @click="showPanel = !showPanel">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          <path :d="showPanel ? 'M2 6.5L5 3.5L8 6.5' : 'M2 3.5L5 6.5L8 3.5'" stroke-width="1.5"/>
        </svg>
      </button>
    </div>

    <div class="section-list" v-if="showPanel">
      <button
        v-for="s in sections"
        :key="s.id"
        :class="['section-btn', { active: isSelected(s.id) }]"
        @click="toggleSection(s.id)"
      >
        <svg v-if="isSelected(s.id)" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M2 5l2 2 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
        <span>{{ s.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useContextSelector } from '../composables/useContextSelector'

const { sections, isSelected, toggleSection, loadSelection } = useContextSelector()
const showPanel = ref(false)

onMounted(() => {
  loadSelection()
})
</script>

<style scoped>
.context-selector {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.selector-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.selector-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.toggle-btn {
  margin-left: auto;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
}
.toggle-btn:hover { background: var(--bg-hover); }

.section-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 12px 12px;
}

.section-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.section-btn:hover { border-color: var(--accent); color: var(--accent); }
.section-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
</style>