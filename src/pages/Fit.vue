<template>
  <div class="home">
    <div class="home-header">
      <h1>⚔️ 文字冒险</h1>
      <p>选择世界，开始你的旅程</p>
    </div>

    <div class="world-grid">
      <div
        v-for="world in worlds"
        :key="world.id"
        class="world-card"
        @click="startGame(world.id)"
      >
        <h3>{{ world.name }}</h3>
        <p>{{ world.description }}</p>
        <div class="world-tags">
          <span v-for="tag in world.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <button class="start-btn">开始冒险</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getWorlds, startGame as apiStartGame } from '../services/api'
import { useGameStore } from '../stores/gameStore'

const router = useRouter()
const gameStore = useGameStore()
const worlds = ref([])

onMounted(async () => {
  try {
    worlds.value = await getWorlds()
  } catch (e) {
    console.error('Failed to load worlds:', e)
  }
})

async function startGame(worldId) {
  try {
    await apiStartGame(worldId)
    await gameStore.initGame()
    router.push('/game')
  } catch (e) {
    console.error('Failed to start game:', e)
  }
}
</script>

<style scoped>
.home {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.home-header {
  text-align: center;
  margin-bottom: 3rem;
}

.home-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.home-header p {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.world-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.world-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.world-card:hover {
  border-color: var(--accent);
}

.world-card h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.world-card p {
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.world-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 1rem;
}

.tag {
  padding: 0.15rem 0.5rem;
  background: var(--bg-primary);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.7rem;
}

.start-btn {
  width: 100%;
  padding: 0.5rem;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.start-btn:hover {
  background: var(--accent-hover);
}
</style>
