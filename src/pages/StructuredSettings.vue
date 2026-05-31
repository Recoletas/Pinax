<template>
  <div class="settings-page" @click="onGlobalClick">
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="openExperience" title="返回体验">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 3L5 8l5 5V3z"/>
          </svg>
        </button>
        <span class="title-text">设定</span>
        <select class="worldbook-select" v-model="selectedWorldbookId" @change="onWorldbookChange">
          <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
            {{ wb.name }}
          </option>
        </select>
      </div>
      <div class="title-right">
        <button class="toolbar-text-btn" @click="createWorldbook">新建世界书</button>
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          <span class="theme-icon">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1a6 6 0 100 12A6 6 0 007 1zm0 2a4 4 0 110 8 4 4 0 010-8z"/>
            </svg>
          </span>
        </button>
      </div>
    </header>

    <div class="settings-body">
      <StructuredSettingsPanel
        v-if="activeWorldbook"
        :worldbook="activeWorldbook"
      />
      <div v-else class="empty-state">
        <p>请选择一个世界书开始编辑结构化设定</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { useTheme } from '../composables/useTheme'
import StructuredSettingsPanel from '../components/worldbook/StructuredSettingsPanel.vue'

const router = useRouter()
const worldStore = useWorldStore()
const { isDark, toggleTheme } = useTheme()

const selectedWorldbookId = ref('')

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbook = computed(() => worldStore.activeWorldbook)

function openExperience() {
  router.push({ name: 'experience' })
}

function onGlobalClick() {
  // placeholder for global click handler if needed
}

async function onWorldbookChange() {
  if (selectedWorldbookId.value) {
    await worldStore.setActiveWorldbook(selectedWorldbookId.value)
  }
}

async function createWorldbook() {
  const nextName = `世界书 ${worldbooksIndex.value.length + 1}`
  const created = await worldStore.createWorldbook({ name: nextName })
  await worldStore.loadWorldbooksIndex()
  if (created?.id) {
    await worldStore.setActiveWorldbook(created.id)
    selectedWorldbookId.value = created.id
  }
}

onMounted(async () => {
  try {
    await worldStore.loadWorldbooksIndex()
    if (typeof worldStore.ensureActiveWorldbook === 'function') {
      await worldStore.ensureActiveWorldbook()
    }
    if (activeWorldbook.value?.id) {
      selectedWorldbookId.value = activeWorldbook.value.id
    }
  } catch (e) {
    console.error('[结构化设定] 初始化失败:', e)
  }
})
</script>

<style scoped>
.settings-page {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.title-left, .title-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.worldbook-select {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 12px;
  max-width: 160px;
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
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toolbar-text-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-text-btn:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--surface-raised);
  border-color: var(--accent);
  color: var(--accent);
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
