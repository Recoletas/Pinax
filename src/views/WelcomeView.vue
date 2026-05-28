<template>
  <div class="welcome-view">
    <div class="welcome-inner">
      <!-- 标题 -->
      <div class="welcome-header">
        <h1 class="welcome-title">Pinax</h1>
        <p class="welcome-desc">叙事创作工作台</p>
      </div>

      <!-- 入口分组 -->
      <div class="welcome-sections">
        <div class="welcome-section">
          <h2 class="section-heading">开始</h2>
          <div class="section-entries">
            <button
              v-for="item in startItems"
              :key="item.key"
              class="entry-row"
              @click="handleEnter(item)"
            >
              <span class="entry-arrow">›</span>
              <span class="entry-info">
                <span class="entry-name">{{ item.label }}</span>
                <span class="entry-desc">{{ item.description }}</span>
              </span>
            </button>
          </div>
        </div>

        <div class="welcome-section">
          <h2 class="section-heading">工具</h2>
          <div class="section-entries">
            <button
              v-for="item in toolItems"
              :key="item.key"
              class="entry-row"
              @click="handleEnter(item)"
            >
              <span class="entry-arrow">›</span>
              <span class="entry-info">
                <span class="entry-name">{{ item.label }}</span>
                <span class="entry-desc">{{ item.description }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 工作流提示 -->
      <div class="welcome-workflow">
        工作流：体验 → 世界书 → 写作 → 素材 / 画布
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ACTIVITY_ITEMS } from '../config/workbenchNav'

const router = useRouter()

const startItems = computed(() =>
  ACTIVITY_ITEMS.filter(i => i.key === 'experience' || i.key === 'writing')
)

const toolItems = computed(() =>
  ACTIVITY_ITEMS.filter(i => i.key === 'worldbook' || i.key === 'materials' || i.key === 'storyboard')
)

function handleEnter(item) {
  router.push({ name: item.defaultRouteName })
}
</script>

<style scoped>
.welcome-view {
  height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  background: var(--bg-primary);
}

.welcome-inner {
  width: min(580px, 100%);
  padding: 32px;
}

/* 标题 */
.welcome-header {
  margin-bottom: 36px;
}

.welcome-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, var(--accent-purple)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 6px 0 0;
}

/* 入口分组 */
.welcome-sections {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

.section-heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

/* 入口行 */
.entry-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease, transform 0.1s ease;
}

.entry-row:hover {
  background: var(--bg-hover);
  transform: translateX(2px);
}

.entry-arrow {
  color: var(--accent);
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.entry-row:hover .entry-arrow {
  opacity: 1;
}

.entry-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.entry-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* 工作流提示 */
.welcome-workflow {
  margin-top: 36px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
</style>
