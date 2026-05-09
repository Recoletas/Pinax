<template>
  <div class="home-page">
    <!-- 标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <span class="app-title">WriterHelper</span>
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

    <!-- 主内容 -->
    <main class="content-area">
      <div class="hero-section">
        <h1 class="app-logo">✦</h1>
        <h1 class="app-name">WriterHelper</h1>
        <p class="app-desc">你的写作与冒险助手</p>
      </div>

      <div class="entry-grid">
        <router-link to="/fit" class="entry-card">
          <div class="entry-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 4L4 10v12l12 6 12-6V10L16 4zm0 3l9 4.5v9L16 25l-9-4.5v-9L16 7z"/>
            </svg>
          </div>
          <h2>体验</h2>
          <p>亲身体验其中，感知文字的温度</p>
        </router-link>

        <router-link to="/writing" class="entry-card">
          <div class="entry-icon accent">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
              <path d="M6 6h14v20H6V6zm4 4v12h10V10H10zm4 2h6v2h-6v-2zm0 4h4v2h-4v-2z"/>
            </svg>
          </div>
          <h2>写作</h2>
          <p>创建书籍，编写章节，管理你的作品</p>
        </router-link>
      </div>
    </main>
  </div>
</template>

<script setup>
import { useTheme } from '../composables/useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<style scoped>
.home-page {
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
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.title-left {
  display: flex;
  align-items: center;
}

.app-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.hero-section {
  text-align: center;
  margin-bottom: 48px;
}

.app-logo {
  font-size: 48px;
  color: var(--accent);
  margin-bottom: 8px;
}

.app-name {
  font-size: 36px;
  font-weight: 600;
  margin-bottom: 8px;
}

.app-desc {
  font-size: 16px;
  color: var(--text-secondary);
}

.entry-grid {
  display: flex;
  gap: 20px;
  max-width: 700px;
  width: 100%;
}

.entry-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.2s ease;
}

.entry-card:hover {
  border-color: var(--accent);
  box-shadow: 0 8px 24px var(--shadow);
  transform: translateY(-2px);
}

.entry-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 12px;
  margin-bottom: 16px;
}

.entry-icon.accent {
  background: var(--accent-light);
  color: var(--accent);
}

.entry-card h2 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.entry-card p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

@media (max-width: 600px) {
  .entry-grid {
    flex-direction: column;
  }
}
</style>
