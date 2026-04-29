<template>
  <div class="inventory">
    <div class="panel-header">背包</div>
    <div v-if="gameStore.inventory.length === 0" class="empty-state">
      背包空空如也
    </div>
    <div v-else class="inventory-list">
      <div
        v-for="(item, index) in gameStore.inventory"
        :key="index"
        class="inventory-item"
      >
        <span class="item-icon">📦</span>
        <span class="item-name">{{ item.name || item }}</span>
        <span v-if="item.count" class="item-count">x{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
</script>

<style scoped>
.inventory {
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

.inventory-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.inventory-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
}

.item-icon {
  font-size: 0.8rem;
}

.item-name {
  color: var(--text-primary);
  flex: 1;
}

.item-count {
  color: var(--text-muted);
  font-size: 0.75rem;
}
</style>