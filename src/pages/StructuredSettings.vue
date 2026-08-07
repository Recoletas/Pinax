<template>
  <div class="settings-page" @click="onGlobalClick">
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="openExperience" title="返回体验">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 3L5 8l5 5V3z"/>
          </svg>
        </button>
        <span class="title-text">结构化设定</span>
        <select class="worldbook-select" v-model="selectedWorldbookId" @change="onWorldbookChange" :title="worldbooksIndex.find(w => w.id === selectedWorldbookId)?.name || '选择世界书'">
          <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id" :title="wb.name">
            {{ wb.name }}
          </option>
        </select>
      </div>
      <div class="title-right">
        <button class="toolbar-text-btn" @click="createWorldbook">新建世界书</button>
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'" :aria-label="isDark ? '切换到亮色主题' : '切换到暗色主题'">
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

    <SettingsSectionNav />

    <section
      v-if="focusedPlace"
      class="place-context-strip"
      data-test="settings-place-context"
      aria-label="当前地点上下文"
    >
      <div class="place-context-copy">
        <span class="place-context-kicker">地点上下文</span>
        <strong>{{ focusedPlace.name || focusedPlace.placeId }}</strong>
        <span>历史 {{ focusedPlace.historyNodeIds?.length || 0 }} · 条目 {{ focusedPlace.entryIds?.length || 0 }}</span>
      </div>
      <div class="place-context-actions">
        <button type="button" class="toolbar-text-btn" @click="openFocusedPlaceMap()">
          在地图查看
        </button>
        <div v-if="focusedPlace.historyNodes?.length" class="place-context-links">
          <span class="place-context-links-label">历史节点</span>
          <button
            v-for="item in focusedPlace.historyNodes"
            :key="`history-${item.id}`"
            type="button"
            class="place-context-link"
            data-test="place-history-map-link"
            :title="`在地图查看：${item.title || item.id}`"
            @click="openFocusedPlaceMap('history', item.id)"
          >
            {{ item.title || item.id }}
          </button>
        </div>
        <div v-if="focusedPlace.entries?.length" class="place-context-links">
          <span class="place-context-links-label">设定条目</span>
          <button
            v-for="item in focusedPlace.entries"
            :key="`entry-${item.id}`"
            type="button"
            class="place-context-link"
            data-test="place-entry-map-link"
            :title="`在地图查看：${item.name || item.id}`"
            @click="openFocusedPlaceMap('entry', item.id)"
          >
            {{ item.name || item.id }}
          </button>
        </div>
      </div>
    </section>

    <div class="settings-body">
      <StructuredSettingsWorkspace
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
import { useRoute, useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { useTheme } from '../composables/useTheme'
import { buildPlaceEntityIndex, resolvePlaceEntity } from '../services/worldHistory/placeEntity'
import StructuredSettingsWorkspace from '../components/worldbook/StructuredSettingsWorkspace.vue'
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'

const router = useRouter()
const route = useRoute()
const worldStore = useWorldStore()
const { isDark, toggleTheme } = useTheme()

const selectedWorldbookId = ref('')

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbook = computed(() => worldStore.activeWorldbook)
const placeEntityIndex = computed(() => buildPlaceEntityIndex(activeWorldbook.value || {}))
const focusedPlace = computed(() => resolvePlaceEntity(placeEntityIndex.value, String(route.query.placeId || '')))

function openExperience() {
  router.push({ name: 'experience' })
}

function openFocusedPlaceMap(kind = '', itemId = '') {
  if (!focusedPlace.value?.placeId) return
  const query = { placeId: focusedPlace.value.placeId }
  if (kind === 'history' && itemId) query.historyNodeId = itemId
  if (kind === 'entry' && itemId) query.entryId = itemId
  router.push({ name: 'settings-world-map', query })
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
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.worldbook-select {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 14px;
  max-width: 160px;
}

/* W5c UX sweep: warn users about pending unsaved edits in the
   StructuredSettingsWorkspace before they switch the active worldbook. */
.worldbook-select.is-dirty {
  border-color: var(--warning, #b37213);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--warning, #b37213) 30%, transparent);
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
  font-size: 14px;
  white-space: nowrap;
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

.place-context-strip {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 12px 0;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-secondary));
}

.place-context-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.place-context-kicker {
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.place-context-copy strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.place-context-copy > span:last-child {
  color: var(--text-muted);
  font-size: 11px;
}

.place-context-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.place-context-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: min(54vw, 620px);
}

.place-context-links-label {
  color: var(--text-muted);
  font-size: 10px;
  margin-right: 2px;
}

.place-context-link {
  max-width: 150px;
  overflow: hidden;
  padding: 3px 5px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
  background: transparent;
  color: var(--accent);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.place-context-link:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}

@media (max-width: 760px) {
  .title-text {
    display: none;
  }

  .title-left,
  .title-right {
    min-width: 0;
  }

  .worldbook-select {
    max-width: 140px;
  }

  .toolbar-text-btn {
    padding-inline: 8px;
  }

  .place-context-strip {
    flex-direction: column;
  }

  .place-context-actions,
  .place-context-links {
    justify-content: flex-start;
    max-width: 100%;
  }
}
</style>
