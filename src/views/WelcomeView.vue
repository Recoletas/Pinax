<template>
  <div class="welcome-view">
    <div class="welcome-inner">
      <div class="welcome-header">
        <h1 class="welcome-title">欢迎使用 WriterHelper</h1>
        <p class="welcome-subtitle">选择你要进入的工作区</p>
      </div>

      <div class="welcome-grid">
        <button
          v-for="item in ACTIVITY_ITEMS"
          :key="item.key"
          class="welcome-tile"
          :class="{ primary: item.key === 'experience' }"
          @click="handleEnter(item)"
        >
          <span class="tile-icon" aria-hidden="true">
            <svg v-if="item.icon === 'compass'" width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="8" cy="8" r="5"></circle>
              <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"></path>
            </svg>
            <svg v-else-if="item.icon === 'book'" width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 2.5H7A2 2 0 0 1 9 4.5V13.5H4A1 1 0 0 0 3 14.5V2.5Z"></path>
              <path d="M13 2.5H9A2 2 0 0 0 7 4.5V13.5H12A1 1 0 0 1 13 14.5V2.5Z"></path>
            </svg>
            <svg v-else-if="item.icon === 'music'" width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 3V10"></path>
              <path d="M10 3L13.5 2V9"></path>
              <circle cx="6.2" cy="11.2" r="1.8"></circle>
              <circle cx="12.2" cy="10.2" r="1.8"></circle>
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 2.5H9L12 5.5V13A1 1 0 0 1 11 14H4A1 1 0 0 1 3 13V3.5A1 1 0 0 1 4 2.5Z"></path>
              <path d="M9 2.5V5.5H12"></path>
              <path d="M5.5 8H10.5"></path>
              <path d="M5.5 10.5H10.5"></path>
            </svg>
          </span>
          <span class="tile-label">{{ item.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ACTIVITY_ITEMS } from '../config/workbenchNav'

const router = useRouter()

function handleEnter(item) {
  router.push({ name: item.defaultRouteName })
}
</script>

<style scoped>
.welcome-view {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.welcome-inner {
  width: min(520px, 100%);
  padding: 24px;
}

.welcome-header {
  text-align: center;
  margin-bottom: 20px;
}

.welcome-title {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.welcome-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.welcome-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.welcome-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.welcome-tile:hover {
  border-color: var(--accent);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.welcome-tile.primary {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--accent);
}

.welcome-tile.primary:hover {
  background: color-mix(in srgb, var(--accent) 18%, var(--bg-secondary));
  border-color: var(--accent);
}

.tile-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tile-icon svg {
  display: block;
}

.tile-label {
  font-size: 13px;
  font-weight: 500;
}

@media (max-width: 480px) {
  .welcome-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>