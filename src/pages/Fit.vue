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
      <div class="genre-container">
        <h2 class="section-title">选择体裁</h2>
        <p class="section-desc">在文字中遇见另一个自己</p>

        <div class="genre-grid">
          <div class="genre-card" @click="enterExperience('novel')">
            <div class="genre-icon">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="6" y="5" width="24" height="26" rx="2"/>
                <line x1="10" y1="11" x2="26" y2="11"/>
                <line x1="10" y1="16" x2="26" y2="16"/>
                <line x1="10" y1="21" x2="20" y2="21"/>
                <line x1="10" y1="26" x2="16" y2="26"/>
              </svg>
            </div>
            <h3>小说</h3>
            <p>以叙事之线，织就人情与世事的纹理</p>
          </div>

          <div class="genre-card" @click="enterExperience('poetry')">
            <div class="genre-icon accent">
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M18 6c-2 4-6 7-6 12a6 6 0 1012 0c0-5-4-8-6-12z"/>
                <path d="M14 26c1 2 3 3 4 3s3-1 4-3" stroke-linecap="round"/>
              </svg>
            </div>
            <h3>诗歌</h3>
            <p>以凝练之词，写尽悲欢与美的瞬间</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { useTheme } from '../composables/useTheme'

const router = useRouter()
const gameStore = useGameStore()
const { isDark, toggleTheme } = useTheme()

function goBack() {
  router.push('/')
}

async function enterExperience(genre) {
  if (genre === 'poetry') {
    router.push('/poetry-lab')
    return
  }

  gameStore.genre = genre
  await gameStore.initGame()
  router.push('/game')
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

.genre-container {
  max-width: 700px;
  margin: 0 auto;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
  text-align: center;
}

.section-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 40px;
  text-align: center;
}

.genre-grid {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.genre-card {
  flex: 1;
  max-width: 280px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px 24px;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
}

.genre-card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 24px var(--shadow);
  transform: translateY(-2px);
}

.genre-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: 12px;
  margin: 0 auto 16px;
  color: var(--text-secondary);
}

.genre-icon.accent {
  background: var(--accent-light);
  color: var(--accent);
}

.genre-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.genre-card p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
