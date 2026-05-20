<template>
  <div class="welcome-page">
    <header class="title-bar">
      <div class="title-left">
        <span class="app-title">WriterHelper 欢迎页</span>
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

    <main class="content-area">
      <section class="hero-panel">
        <p class="hero-kicker">WELCOME</p>
        <h1 class="hero-title">进入你的写作与冒险工作台</h1>
        <p class="hero-subtitle">首页只负责欢迎与分发入口，体验模式改为直接进入，不再经过体裁选择页。</p>
      </section>

      <section class="entry-section">
        <h2 class="section-title">快捷入口</h2>
        <div class="entry-grid">
          <router-link to="/game" class="entry-card primary">
            <div class="entry-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="8"></circle>
                <path d="M9.2 13.8L10.8 10.2L14.4 8.6L12.8 12.2L9.2 13.8Z"></path>
              </svg>
            </div>
            <h3>开始体验</h3>
            <p>直接进入冒险，不再经过体裁选择界面</p>
          </router-link>

          <router-link to="/writing" class="entry-card">
            <div class="entry-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 4H11A3 3 0 0 1 14 7V20H7A2 2 0 0 0 5 22V4Z"></path>
                <path d="M19 4H13A3 3 0 0 0 10 7V20H17A2 2 0 0 1 19 22V4Z"></path>
              </svg>
            </div>
            <h3>小说写作</h3>
            <p>书籍管理、章节编辑与内容创作</p>
          </router-link>

          <router-link to="/notes" class="entry-card">
            <div class="entry-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 3H14L18 7V19A2 2 0 0 1 16 21H6A2 2 0 0 1 4 19V5A2 2 0 0 1 6 3Z"></path>
                <path d="M14 3V7H18"></path>
                <path d="M8 11H14"></path>
                <path d="M8 15H14"></path>
              </svg>
            </div>
            <h3>灵感笔记</h3>
            <p>记录想法、整理素材与导入速记</p>
          </router-link>

          <router-link to="/poetry-lab" class="entry-card">
            <div class="entry-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 4V14"></path>
                <path d="M14.5 4L19 3V13"></path>
                <circle cx="9" cy="15" r="3"></circle>
                <circle cx="17" cy="14" r="3"></circle>
              </svg>
            </div>
            <h3>诗歌工坊</h3>
            <p>灵感树、续写与分镜创作</p>
          </router-link>

          <router-link to="/prose-essay" class="entry-card">
            <div class="entry-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                <path d="M8 9H16"></path>
                <path d="M8 13H16"></path>
                <path d="M8 17H13"></path>
              </svg>
            </div>
            <h3>散文工坊</h3>
            <p>卡片扩展、大纲组织与导出</p>
          </router-link>
        </div>
      </section>

      <section class="tips-panel">
        <h2>今天怎么开始？</h2>
        <p>如果你想快速进入剧情，点“开始体验”；如果你是创作模式，直接进入小说、笔记、诗歌或散文模块。</p>
      </section>
    </main>

    <footer class="welcome-status" aria-label="状态栏">
      <div class="status-left">
        <span class="status-item">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3" fill="currentColor" />
          </svg>
          就绪
        </span>
        <span class="status-item">欢迎模式</span>
        <span class="status-item hide-mobile">路径 {{ currentPath }}</span>
      </div>

      <div class="status-right">
        <span class="status-item hide-mobile">UTF-8</span>
        <span class="status-item hide-mobile">Vue 3</span>
        <span class="status-item">端口 5173</span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from '../composables/useTheme'

const { isDark, toggleTheme } = useTheme()
const route = useRoute()
const currentPath = computed(() => route.path || '/')
</script>

<style scoped>
.welcome-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 10% -10%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 42%),
    radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 38%),
    var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}

.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(8px);
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
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 30px 0 32px;
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 24px;
}

.welcome-status {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  background: var(--accent);
  color: #fff;
  border-top: 1px solid color-mix(in srgb, var(--accent) 72%, #000 28%);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.status-item {
  height: 18px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  color: inherit;
  background: color-mix(in srgb, #fff 16%, transparent);
}

.hero-panel {
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
}

.hero-kicker {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--accent);
  margin-bottom: 10px;
}

.hero-title {
  font-size: clamp(24px, 4vw, 36px);
  line-height: 1.2;
  margin: 0 0 10px;
}

.hero-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.entry-section {
  background: color-mix(in srgb, var(--bg-secondary) 90%, transparent);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px;
}

.section-title {
  font-size: 14px;
  margin: 0 0 12px;
  color: var(--text-secondary);
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.entry-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary);
  text-decoration: none;
  color: var(--text-primary);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.entry-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 10px 20px var(--shadow);
}

.entry-card.primary {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
}

.entry-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.entry-card h3 {
  font-size: 16px;
  margin: 0;
}

.entry-card p {
  font-size: 12px;
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.tips-panel {
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
  padding: 14px 16px;
}

.tips-panel h2 {
  margin: 0 0 8px;
  font-size: 14px;
}

.tips-panel p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

@media (max-width: 980px) {
  .entry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .content-area {
    width: calc(100% - 20px);
    padding: 16px 0 20px;
    gap: 14px;
  }

  .welcome-status {
    height: 26px;
    padding: 0 6px;
  }

  .status-left,
  .status-right {
    gap: 4px;
  }

  .status-item {
    padding: 0 5px;
    font-size: 10px;
  }

  .hide-mobile {
    display: none;
  }

  .entry-grid {
    grid-template-columns: 1fr;
  }

  .hero-panel,
  .entry-section,
  .tips-panel {
    padding: 14px;
  }
}
</style>
