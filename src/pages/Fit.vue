<template>
  <div class="fit-page">
    <!-- 标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="goBack" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="app-title">拟合</span>
      </div>
      <div class="title-right">
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          <span class="theme-icon">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
            </svg>
          </span>
          <span class="theme-label">{{ isDark ? '暗色' : '亮色' }}</span>
        </button>
      </div>
    </header>

    <div class="content-area">
      <div class="worlds-container">
        <h2 class="section-title">选择世界</h2>
        <p class="section-desc">选择一个世界开始你的冒险旅程</p>

        <div class="world-grid">
          <div
            v-for="world in worlds"
            :key="world.id"
            class="world-card"
            @click="startGame(world.id)"
          >
            <div class="world-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h3>{{ world.name }}</h3>
            <p>{{ world.description }}</p>
            <div class="world-tags">
              <span v-for="tag in (world.tags || []).slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <button class="start-btn">开始冒险</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getWorlds, startGame as apiStartGame } from '../services/api'
import { useGameStore } from '../stores/gameStore'
import { useTheme } from '../composables/useTheme'

const router = useRouter()
const gameStore = useGameStore()
const { isDark, toggleTheme } = useTheme()
const worlds = ref([])

onMounted(async () => {
  try {
    worlds.value = await getWorlds()
  } catch (e) {
    console.error('Failed to load worlds:', e)
  }
})

function goBack() {
  router.push('/')
}

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
.fit-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}

.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-left .app-title {
  font-size: 14px;
  font-weight: 600;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}

.worlds-container {
  max-width: 1000px;
  margin: 0 auto;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
}

.section-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.world-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.world-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.world-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 12px var(--shadow);
}

.world-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-light);
  color: var(--accent);
  border-radius: 8px;
  margin-bottom: 12px;
}

.world-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.world-card p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
}

.world-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.tag {
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.start-btn {
  width: 100%;
  padding: 10px;
  background: var(--accent);
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.start-btn:hover {
  background: var(--accent-hover);
}
</style>
