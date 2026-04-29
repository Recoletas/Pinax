<template>
  <div class="world-map">
    <div class="map-header">
      <span class="map-icon">🗺️</span>
      <span>地图</span>
    </div>
    <div class="map-content">
      <div class="current-location">
        <span class="loc-icon">📍</span>
        <span class="loc-name">{{ gameStore.worldState.currentLocation || '未知' }}</span>
      </div>
      <div v-if="gameStore.discoveredPlaces.length > 0" class="discovered-places">
        <div class="places-label">已探索</div>
        <div class="places-list">
          <span
            v-for="place in gameStore.discoveredPlaces"
            :key="place"
            class="place-tag"
          >
            {{ place }}
          </span>
        </div>
      </div>
      <div v-else class="no-places">
        探索未知区域...
      </div>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
</script>

<style scoped>
.world-map {
  color: var(--text-primary);
}

.map-header {
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

.map-icon {
  font-size: 0.9rem;
}

.map-content {
  font-size: 0.8rem;
}

.current-location {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

.loc-icon {
  font-size: 0.8rem;
}

.loc-name {
  color: var(--text-primary);
  font-size: 0.8rem;
}

.discovered-places {
  padding: 0.5rem 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.places-label {
  color: var(--text-muted);
  font-size: 0.7rem;
  margin-bottom: 0.375rem;
}

.places-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.place-tag {
  padding: 0.15rem 0.4rem;
  background: var(--bg-secondary);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.7rem;
}

.no-places {
  color: var(--text-muted);
  text-align: center;
  padding: 0.75rem;
  font-size: 0.75rem;
}
</style>