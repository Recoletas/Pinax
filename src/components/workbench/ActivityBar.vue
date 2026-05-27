<template>
  <nav class="activity-bar" aria-label="一级导航">
    <button
      v-for="item in items"
      :key="item.key"
      class="activity-btn"
      :class="{ active: item.key === activeKey }"
      type="button"
      :title="item.label"
      @click="$emit('select', item.key)"
    >
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
        <svg v-else-if="item.icon === 'music'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 3V10"></path>
          <path d="M10 3L13.5 2V9"></path>
          <circle cx="6.2" cy="11.2" r="1.8"></circle>
          <circle cx="12.2" cy="10.2" r="1.8"></circle>
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
      <span class="activity-label">{{ item.label }}</span>
    </button>
  </nav>
</template>

<script setup>
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
.activity-bar {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 6px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
}

.activity-btn {
  width: 44px;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.activity-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.activity-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.activity-btn.active {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent);
}

.activity-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.activity-icon svg {
  display: block;
}

.activity-label {
  font-size: 10px;
  line-height: 1;
}

:global(.theme-dark) .activity-btn {
  color: #c4ced9;
}

:global(.theme-dark) .activity-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f4f8fc;
}

:global(.theme-dark) .activity-btn.active {
  background: rgba(79, 195, 247, 0.2);
  border-color: #62cdfd;
  color: #62cdfd;
}

@media (max-width: 760px) {
  .activity-bar {
    flex-direction: row;
    justify-content: space-around;
    border-right: none;
    border-top: 1px solid var(--border);
    padding: 6px;
  }

  .activity-btn {
    width: auto;
    min-width: 68px;
    min-height: 40px;
  }
}
</style>
