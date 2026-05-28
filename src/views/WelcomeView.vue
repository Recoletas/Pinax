<template>
  <div class="welcome-view">
    <header class="welcome-chrome">
      <div class="welcome-chrome-left">
        <span class="welcome-appmark">Pinax</span>
      </div>
      <div class="welcome-chrome-right">
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

    <main class="welcome-layout">
      <section class="welcome-brand-panel">
        <h1 class="welcome-title">Pinax</h1>
        <p class="welcome-subtitle">A WritingHelper, Or just a game</p>
      </section>

      <section class="welcome-entry-panel">
        <div class="welcome-panel-head">
          <div>
            <p class="welcome-panel-kicker">START</p>
            <h2 class="welcome-panel-title">入口</h2>
          </div>
        </div>

        <div class="welcome-entry-groups">
          <article
            v-for="group in entryGroups"
            :key="group.key"
            class="welcome-entry-group"
          >
            <div class="welcome-group-header">
              <h3>{{ group.title }}</h3>
              <span>{{ group.items.length }} 项</span>
            </div>
            <div class="welcome-entry-list">
              <button
                v-for="item in group.items"
                :key="item.key"
                class="welcome-entry-card"
                @click="handleEnter(item)"
              >
                <span class="welcome-entry-icon" aria-hidden="true">
                  <svg v-if="item.icon === 'compass'" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="5"></circle>
                    <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"></path>
                  </svg>
                  <svg v-else-if="item.icon === 'book'" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 2.5H7A2 2 0 0 1 9 4.5V13.5H4A1 1 0 0 0 3 14.5V2.5Z"></path>
                    <path d="M13 2.5H9A2 2 0 0 0 7 4.5V13.5H12A1 1 0 0 1 13 14.5V2.5Z"></path>
                  </svg>
                  <svg v-else-if="item.icon === 'archive'" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 4.2h10l-.8 8.3A1.2 1.2 0 0 1 11 13.6H5a1.2 1.2 0 0 1-1.2-1.1L3 4.2Z"></path>
                    <path d="M2.5 2.4h11v1.8h-11z"></path>
                    <path d="M6.2 7h3.6"></path>
                  </svg>
                  <svg v-else-if="item.icon === 'settings'" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="8" cy="8" r="2"></circle>
                    <path d="M8 1.8v1.5M8 12.7v1.5M1.8 8h1.5M12.7 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1"></path>
                  </svg>
                  <svg v-else-if="item.icon === 'film'" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2.2" y="3" width="11.6" height="10" rx="1.2"></rect>
                    <path d="M5.2 3v10M10.8 3v10M2.2 6h11.6M2.2 10h11.6"></path>
                  </svg>
                </span>
                <span class="welcome-entry-copy">
                  <span class="welcome-entry-name">{{ item.label }}</span>
                  <span class="welcome-entry-desc">{{ item.description }}</span>
                </span>
                <span class="welcome-entry-arrow">↗</span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>

    <footer class="welcome-status" aria-label="状态栏">
      <div class="welcome-status-left">
        <span class="welcome-status-item">就绪</span>
        <span class="welcome-status-item">Pinax Workspace</span>
        <span class="welcome-status-item welcome-status-muted">{{ currentPath }}</span>
      </div>
      <div class="welcome-status-right">
        <span class="welcome-status-item welcome-status-muted">Vue 3</span>
        <span class="welcome-status-item welcome-status-muted">端口 5173</span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { ACTIVITY_ITEMS } from '../config/workbenchNav'

const { isDark, toggleTheme } = useTheme()
const route = useRoute()
const router = useRouter()
const currentPath = computed(() => route.path || '/')

const entryGroups = computed(() => [
  {
    key: 'start',
    title: '开始',
    items: ACTIVITY_ITEMS
      .filter((i) => i.key === 'experience' || i.key === 'writing')
  },
  {
    key: 'tools',
    title: '工具',
    items: ACTIVITY_ITEMS
      .filter((i) => i.key === 'worldbook' || i.key === 'materials' || i.key === 'storyboard')
  }
])

function handleEnter(item) {
  router.push({ name: item.defaultRouteName })
}
</script>

<style scoped>
.welcome-view {
  --welcome-paper-strip: #efe1ad;
  --welcome-hole-core: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-secondary) 18%);
  --welcome-hole-ring: color-mix(in srgb, #d7bf79 58%, transparent);
  --welcome-hole-edge-light: color-mix(in srgb, #fff7dc 70%, transparent);
  --welcome-hole-shadow: color-mix(in srgb, #8e7441 28%, transparent);
  --welcome-panel-border: color-mix(in srgb, var(--border) 88%, var(--accent) 12%);
  --welcome-panel-top-sheen: color-mix(in srgb, #ffffff 42%, transparent);
  --welcome-panel-inner-shadow: color-mix(in srgb, #b7a06b 10%, transparent);
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 640px at 16% 12%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 58%),
    radial-gradient(900px 520px at 92% 18%, color-mix(in srgb, var(--accent-teal) 7%, transparent), transparent 54%),
    linear-gradient(135deg, color-mix(in srgb, var(--bg-secondary) 90%, var(--accent) 4%), color-mix(in srgb, var(--bg-primary) 92%, var(--accent-teal) 3%)),
    var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  overflow: hidden;
}

.welcome-view::before,
.welcome-view::after {
  content: '';
  position: absolute;
  inset: -8%;
  pointer-events: none;
}

.welcome-view::before {
  background:
    radial-gradient(560px 320px at 18% 18%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 68%),
    radial-gradient(460px 280px at 84% 22%, color-mix(in srgb, var(--accent-teal) 10%, transparent), transparent 70%),
    radial-gradient(520px 340px at 58% 82%, color-mix(in srgb, var(--accent-amber) 7%, transparent), transparent 72%);
  filter: blur(24px);
  opacity: 0.58;
  transform: translate3d(0, 0, 0) scale(1.04);
  animation: contour-drift 22s ease-in-out infinite alternate;
}

.welcome-view::after {
  display: none;
}

.welcome-chrome {
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

.welcome-chrome-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.welcome-appmark {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary);
}

.welcome-chrome-right {
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

.welcome-layout {
  flex: 1;
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 56px 0 18px;
  display: grid;
  grid-template-columns: minmax(240px, 0.7fr) minmax(460px, 1.3fr);
  align-items: start;
  gap: 20px;
  min-height: 0;
}

.welcome-status {
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--accent) 6%);
  color: var(--text-secondary);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.welcome-status-left,
.welcome-status-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.welcome-status-item {
  min-height: 18px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  color: inherit;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
}

.welcome-status-muted {
  color: var(--text-muted);
}

.welcome-brand-panel,
.welcome-entry-panel {
  min-width: 0;
  position: relative;
  border: 1px solid var(--welcome-panel-border);
  border-radius: 8px;
  background:
    linear-gradient(90deg, var(--welcome-paper-strip) 0 34px, transparent 34px),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary)), color-mix(in srgb, var(--bg-secondary) 90%, var(--bg-primary)));
  box-shadow:
    0 14px 30px color-mix(in srgb, #000 9%, transparent),
    inset 0 1px 0 var(--welcome-panel-top-sheen),
    inset 0 -1px 0 color-mix(in srgb, #000 5%, transparent),
    inset 34px 0 18px var(--welcome-panel-inner-shadow);
}

.welcome-brand-panel::after,
.welcome-entry-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(180deg, color-mix(in srgb, #ffffff 22%, transparent), transparent 18%),
    linear-gradient(105deg, color-mix(in srgb, #ffffff 10%, transparent), transparent 24% 76%, color-mix(in srgb, #000 4%, transparent));
  pointer-events: none;
}

.welcome-brand-panel {
  position: sticky;
  top: 48px;
  min-height: 220px;
  padding: 34px 30px 30px 58px;
  display: grid;
  align-content: start;
  gap: 12px;
}

.welcome-brand-panel::before,
.welcome-entry-panel::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 18px;
  width: 20px;
  height: calc(100% - 36px);
  background:
    radial-gradient(circle at 10px 16px,
      var(--welcome-hole-core) 0 5px,
      color-mix(in srgb, var(--welcome-hole-core) 72%, #000 28%) 5.1px 5.8px,
      var(--welcome-hole-shadow) 5.9px 7px,
      var(--welcome-hole-ring) 7.1px 8.6px,
      var(--welcome-hole-edge-light) 8.7px 9.4px,
      transparent 9.5px) 0 0 / 20px 78px,
    linear-gradient(180deg, var(--welcome-paper-strip), var(--welcome-paper-strip));
  border-right: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 8px 0 0 8px;
  box-shadow:
    inset -1px 0 0 color-mix(in srgb, #ffffff 32%, transparent),
    2px 0 4px color-mix(in srgb, #000 5%, transparent);
  pointer-events: none;
}

.welcome-kicker,
.welcome-panel-kicker {
  margin: 0;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.welcome-title {
  font-size: 42px;
  line-height: 1.05;
  font-weight: 750;
  margin: 0;
  letter-spacing: 0;
  color: var(--text-primary);
}

.welcome-subtitle {
  margin: 0;
  font-family: 'Baskerville', 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
  font-style: italic;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0;
  color: color-mix(in srgb, var(--text-muted) 88%, var(--accent));
  max-width: 28ch;
}

.welcome-panel-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  max-width: 38ch;
}

.welcome-entry-panel {
  position: relative;
  padding: 54px 18px 18px 56px;
  display: grid;
  gap: 14px;
  min-width: 0;
}

.welcome-panel-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.welcome-panel-title {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.welcome-entry-groups {
  display: grid;
  gap: 12px;
}

.welcome-entry-group {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 92%, transparent), color-mix(in srgb, var(--bg-primary) 82%, transparent));
}

.welcome-entry-group::before {
  content: '';
  position: absolute;
  top: 12px;
  left: -10px;
  width: 10px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  border-right: 0;
  border-radius: 6px 0 0 6px;
  background: color-mix(in srgb, #f2e1ae 46%, var(--bg-secondary));
}

:global(.theme-dark) .welcome-view {
  --welcome-paper-strip: #625a3d;
  --welcome-hole-core: color-mix(in srgb, var(--bg-primary) 86%, var(--bg-secondary) 14%);
  --welcome-hole-ring: color-mix(in srgb, #9f8d55 38%, transparent);
  --welcome-hole-edge-light: color-mix(in srgb, #c0b17d 24%, transparent);
  --welcome-hole-shadow: color-mix(in srgb, #000 38%, transparent);
  --welcome-panel-border: color-mix(in srgb, var(--border) 94%, #43515b 6%);
  --welcome-panel-top-sheen: color-mix(in srgb, #ffffff 8%, transparent);
  --welcome-panel-inner-shadow: color-mix(in srgb, #000 16%, transparent);
  background:
    radial-gradient(960px 520px at 16% 12%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 60%),
    radial-gradient(760px 420px at 88% 20%, color-mix(in srgb, var(--accent-teal) 7%, transparent), transparent 58%),
    linear-gradient(135deg, color-mix(in srgb, var(--bg-secondary) 92%, #12171a 8%), color-mix(in srgb, var(--bg-primary) 96%, #101417 4%)),
    var(--bg-primary);
}

:global(.theme-dark) .welcome-chrome,
:global(.theme-dark) .welcome-status {
  background: color-mix(in srgb, var(--bg-secondary) 94%, transparent);
}

:global(.theme-dark) .welcome-brand-panel,
:global(.theme-dark) .welcome-entry-panel,
:global(.theme-dark) .welcome-entry-group,
:global(.theme-dark) .welcome-entry-card {
  background-color: var(--bg-secondary);
}

:global(.theme-dark) .welcome-brand-panel,
:global(.theme-dark) .welcome-entry-panel {
  box-shadow: 0 18px 36px color-mix(in srgb, #000 32%, transparent);
}

:global(.theme-dark) .welcome-brand-panel::after,
:global(.theme-dark) .welcome-entry-panel::after {
  background:
    linear-gradient(180deg, color-mix(in srgb, #ffffff 5%, transparent), transparent 14%),
    linear-gradient(105deg, color-mix(in srgb, #ffffff 4%, transparent), transparent 24% 76%, color-mix(in srgb, #000 12%, transparent));
}

:global(.theme-dark) .welcome-entry-card {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 11%, transparent) 0 4px, transparent 4px),
    color-mix(in srgb, var(--bg-secondary) 82%, var(--bg-primary));
}

:global(.theme-dark) .welcome-entry-card:hover {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, transparent) 0 4px, transparent 4px),
    color-mix(in srgb, var(--accent) 7%, var(--bg-secondary));
}

@keyframes contour-drift {
  from {
    transform: scale(1.03) translate3d(-1.1%, -0.7%, 0);
  }
  to {
    transform: scale(1.06) translate3d(1.3%, 0.8%, 0);
  }
}

@keyframes contour-shift {
  from {
    transform: translate3d(-0.8%, 0.2%, 0) scale(1.02);
  }
  to {
    transform: translate3d(0.8%, -0.2%, 0) scale(1.03);
  }
}

.welcome-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.welcome-group-header h3 {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
}

.welcome-group-header span {
  white-space: nowrap;
}

.welcome-entry-list {
  display: grid;
  gap: 8px;
}

.welcome-entry-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 58px;
  padding: 11px 13px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 7px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 7%, transparent) 0 4px, transparent 4px),
    color-mix(in srgb, var(--bg-secondary) 90%, var(--bg-primary));
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
}

.welcome-entry-card:hover {
  border-color: var(--accent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, transparent) 0 4px, transparent 4px),
    color-mix(in srgb, var(--accent) 5%, var(--bg-secondary));
  box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 10%, transparent);
  transform: translateX(2px);
}

.welcome-entry-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  flex-shrink: 0;
}

.welcome-entry-icon svg {
  width: 18px;
  height: 18px;
}

.welcome-entry-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.welcome-entry-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.welcome-entry-desc {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}

.welcome-entry-arrow {
  color: var(--accent);
  font-size: 15px;
  line-height: 1;
}

@media (max-width: 960px) {
  .welcome-layout {
    grid-template-columns: 1fr;
    padding-top: 24px;
  }
}

@media (max-width: 640px) {
  .welcome-view {
    min-height: auto;
  }

  .welcome-chrome {
    padding: 0 12px;
  }

  .welcome-layout {
    width: min(100%, calc(100% - 20px));
    padding: 40px 0 18px;
  }

  .welcome-brand-panel,
  .welcome-entry-panel {
    padding: 16px 16px 16px 42px;
  }

  .welcome-title {
    font-size: 28px;
  }

  .welcome-entry-arrow {
    display: none;
  }

  .welcome-status {
    padding: 0 8px;
    flex-wrap: wrap;
  }
}

@media (max-width: 480px) {
  .welcome-chrome-left {
    gap: 6px;
  }
}
</style>
