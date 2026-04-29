<template>
  <div class="quest-log">
    <div class="panel-header">任务</div>
    <div v-if="gameStore.quests.length === 0" class="empty-state">
      暂无任务
    </div>
    <div v-else class="quest-list">
      <div
        v-for="(quest, index) in gameStore.quests"
        :key="index"
        class="quest-item"
      >
        <div class="quest-info">
          <span class="quest-icon">{{ quest.completed ? '✅' : quest.inProgress ? '🔄' : '📋' }}</span>
          <span class="quest-name">{{ quest.name || quest }}</span>
        </div>
        <span class="badge" :class="questBadgeClass(quest)">
          {{ questStatus(quest) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

function questStatus(quest) {
  if (quest.completed) return '完成'
  if (quest.inProgress) return '进行中'
  return '待接取'
}

function questBadgeClass(quest) {
  if (quest.completed) return 'badge-success'
  if (quest.inProgress) return 'badge-warning'
  return ''
}
</script>

<style scoped>
.quest-log {
  color: var(--text-primary);
}

.panel-header {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 1rem;
  font-size: 0.8rem;
}

.quest-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.quest-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem 0;
  font-size: 0.8rem;
}

.quest-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.quest-icon {
  font-size: 0.75rem;
}

.quest-name {
  color: var(--text-primary);
}

.badge {
  padding: 0.1rem 0.375rem;
  border-radius: 3px;
  font-size: 0.65rem;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}
</style>