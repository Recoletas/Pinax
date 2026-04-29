<template>
  <div class="status-bar">
    <div class="status-header">
      <span class="status-icon">📊</span>
      <span>状态</span>
    </div>
    <div class="status-content">
      <div class="status-row">
        <span class="status-label">时间</span>
        <span class="status-value time">{{ gameStore.time.day > 0 ? `第${gameStore.time.day}天 ${gameStore.time.period}` : '-' }}</span>
      </div>
      <div class="status-row">
        <span class="status-label">地点</span>
        <span class="status-value location">{{ gameStore.worldState.currentLocation || '未知' }}</span>
      </div>
      <div class="status-divider"></div>
      <div class="status-row">
        <span class="status-label">生命</span>
        <div class="bar-container">
          <div class="bar-fill vitality" :style="{ width: vitalityPercent + '%' }"></div>
        </div>
        <span class="status-value">{{ gameStore.player.vitality }}/{{ gameStore.player.maxVitality }}</span>
      </div>
      <div class="status-row">
        <span class="status-label">心情</span>
        <div class="bar-container">
          <div class="bar-fill mood" :style="{ width: moodPercent + '%' }"></div>
        </div>
        <span class="status-value">{{ gameStore.player.mood }}/{{ gameStore.player.maxMood }}</span>
      </div>
      <div class="status-row">
        <span class="status-label">金钱</span>
        <span class="status-value money">{{ gameStore.player.money }} 金币</span>
      </div>
      <div class="status-row">
        <span class="status-label">等级</span>
        <span class="status-value level">Lv.{{ gameStore.player.level }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

const vitalityPercent = computed(() => {
  if (!gameStore.player.maxVitality) return 0
  return (gameStore.player.vitality / gameStore.player.maxVitality) * 100
})

const moodPercent = computed(() => {
  if (!gameStore.player.maxMood) return 0
  return (gameStore.player.mood / gameStore.player.maxMood) * 100
})
</script>

<style scoped>
.status-bar {
  color: var(--text-primary);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-icon {
  font-size: 0.9rem;
}

.status-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.status-label {
  color: var(--text-muted);
  min-width: 35px;
  font-size: 0.75rem;
}

.status-value {
  color: var(--text-primary);
}

.status-value.time { color: var(--accent); }
.status-value.location { color: var(--success); }
.status-value.money { color: var(--warning); }
.status-value.level { color: #a78bfa; }

.status-divider {
  height: 1px;
  background: var(--border);
  margin: 0.375rem 0;
}

.bar-container {
  flex: 1;
  height: 4px;
  background: var(--bg-primary);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  transition: width 0.2s ease;
  border-radius: 2px;
}

.bar-fill.vitality {
  background: #ef4444;
}

.bar-fill.mood {
  background: var(--warning);
}
</style>