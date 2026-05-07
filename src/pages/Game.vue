<template>
  <div class="game-page">
    <!-- 标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="goBack" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="app-title">游戏</span>
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
        <button class="action-btn" :class="{ active: gameStore.useAI }" @click="gameStore.toggleAI">
          AI {{ gameStore.useAI ? 'ON' : 'OFF' }}
        </button>
        <button class="action-btn" @click="showCharacter = true">角色</button>
        <button class="action-btn" @click="showSettings = true">设置</button>
      </div>
    </header>

    <div class="game-layout">
      <aside class="sidebar">
        <div class="sidebar-section">
          <StatusBar />
        </div>
        <div class="sidebar-section">
          <WorldMap />
        </div>
        <div class="sidebar-section">
          <Inventory />
        </div>
        <div class="sidebar-section">
          <QuestLog />
        </div>
      </aside>

      <div class="game-main">
        <GamePanel />
        <InputArea @send="handleSend" />
      </div>
    </div>

    <Character v-if="showCharacter" @close="showCharacter = false" />
    <Settings v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { useTheme } from '../composables/useTheme'
import GamePanel from '../components/GamePanel.vue'
import InputArea from '../components/InputArea.vue'
import StatusBar from '../components/StatusBar.vue'
import Inventory from '../components/Inventory.vue'
import QuestLog from '../components/QuestLog.vue'
import WorldMap from '../components/WorldMap.vue'
import Settings from '../components/Settings.vue'
import Character from '../components/Character.vue'

const router = useRouter()
const gameStore = useGameStore()
const { isDark, toggleTheme } = useTheme()
const showCharacter = ref(false)
const showSettings = ref(false)

function goBack() {
  router.push('/fit')
}

function handleSend(text) {
  gameStore.sendAction(text)
}
</script>

<style scoped>
.game-page {
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
  gap: 8px;
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

.action-btn {
  height: 32px;
  padding: 0 12px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.game-layout {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  overflow: hidden;
}

.sidebar {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
}

.game-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}
</style>
