<template>
  <div class="game-page">
    <header class="game-header">
      <button class="back-btn" @click="goBack">← 返回</button>
      <h1>游戏</h1>
      <div class="header-actions">
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
const showCharacter = ref(false)
const showSettings = ref(false)

function goBack() {
  router.push('/')
}

function handleSend(text) {
  gameStore.sendAction(text)
}
</script>

<style scoped>
.game-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.game-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.game-header h1 {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.back-btn {
  padding: 0.4rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  padding: 0.4rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.action-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.game-layout {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1rem 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.sidebar {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
}

.sidebar-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
}

.game-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}
</style>