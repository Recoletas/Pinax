<template>
  <div class="settings-page" @click="onGlobalClick">
    <ContourField class="settings-page__contour" density="relation" entry="right" />
    <div class="settings-topbar">
      <SettingsContextBar
        v-model="selectedWorldbookId"
        :worldbooks-index="worldbooksIndex"
        :active-worldbook="activeWorldbook"
        @change="onWorldbookChange"
      />

      <SettingsSectionNav />
    </div>

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
        <button type="button" class="place-context-map-btn" @click="openFocusedPlaceMap()">
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
import { buildPlaceEntityIndex, resolvePlaceEntity } from '../services/worldHistory/placeEntity'
import StructuredSettingsWorkspace from '../components/worldbook/StructuredSettingsWorkspace.vue'
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import ContourField from '../components/workbench/ContourField.vue'

const router = useRouter()
const route = useRoute()
const worldStore = useWorldStore()
const selectedWorldbookId = ref('')

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbook = computed(() => worldStore.activeWorldbook)
const placeEntityIndex = computed(() => buildPlaceEntityIndex(activeWorldbook.value || {}))
const focusedPlace = computed(() => resolvePlaceEntity(placeEntityIndex.value, String(route.query.placeId || '')))

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

async function onWorldbookChange(worldbookId = selectedWorldbookId.value) {
  if (worldbookId) {
    await worldStore.setActiveWorldbook(worldbookId)
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
  position: relative;
  overflow: hidden;
}

.settings-page > :not(.settings-page__contour) {
  position: relative;
  z-index: 3;
}

.settings-page__contour {
  inset: 0 0 auto auto;
  width: min(720px, 58vw);
  height: 290px;
  opacity: .64;
}

.settings-topbar {
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr);
  min-height: 48px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 16%, transparent);
  background: color-mix(in srgb, var(--archive-paper-strong) 44%, var(--archive-paper-soft));
}

.settings-topbar :deep(.settings-section-nav) {
  align-self: stretch;
  min-width: 0;
  padding-inline: 12px clamp(16px, 3vw, 42px);
  border-bottom: 0;
  background: transparent;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  width: min(1320px, 100%);
  margin: 0 auto;
  padding: 0 clamp(14px, 3vw, 42px) 34px;
}

.place-context-strip {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: min(1240px, calc(100% - clamp(28px, 6vw, 84px)));
  margin: 14px auto 0;
  padding: 10px 0 10px 12px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 66%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, transparent);
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

.place-context-map-btn {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
}

.place-context-map-btn:hover {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
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
  .settings-topbar {
    grid-template-columns: 1fr;
  }

  .settings-topbar :deep(.settings-section-nav) {
    padding-inline: 6px;
  }

  .settings-page__contour {
    width: 100%;
    height: 220px;
    opacity: .44;
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
