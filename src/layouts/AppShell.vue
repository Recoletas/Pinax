<script setup>
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import ActivityBar from '../components/workbench/ActivityBar.vue'
import SidePanel from '../components/workbench/SidePanel.vue'
import { ACTIVITY_ITEMS, SIDE_PANELS, resolveActivityKey } from '../config/workbenchNav'

const route = useRoute()
const router = useRouter()

const currentActivityKey = computed(() => resolveActivityKey(route))
const currentPanel = computed(() => SIDE_PANELS[currentActivityKey.value] || { title: '模块', items: [] })
const panelItems = computed(() => currentPanel.value.items || [])
const showPanel = computed(() => panelItems.value.length > 1)

function handleSelectActivity(activityKey) {
  const matched = ACTIVITY_ITEMS.find((item) => item.key === activityKey)
  if (!matched) return
  if (route.name === matched.defaultRouteName) return
  router.push({ name: matched.defaultRouteName })
}

function handleSelectPanel(routeName) {
  if (!routeName) return
  if (route.name === routeName) return
  router.push({ name: routeName })
}
</script>

<template>
  <div class="app-shell" :class="{ 'without-panel': !showPanel }">
    <div class="shell-activity">
      <ActivityBar :items="ACTIVITY_ITEMS" :active-key="currentActivityKey" @select="handleSelectActivity" />
    </div>

    <div v-if="showPanel" class="shell-panel">
      <SidePanel :title="currentPanel.title" :items="panelItems" :active-route-name="String(route.name || '')" @select="handleSelectPanel" />
    </div>

    <main class="shell-content">
      <RouterView v-slot="{ Component, route: routeInfo }">
        <transition name="page-route" mode="out-in">
          <component v-if="Component" :is="Component" :key="routeInfo.name || routeInfo.fullPath" />
          <div v-else class="route-loading">
            <span class="route-loading-spinner"></span>
            <span>加载中…</span>
          </div>
        </transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  --activity-width: 56px;
  --panel-width: 176px;
  height: var(--app-viewport-height, 100vh);
  min-height: var(--app-viewport-height, 100vh);
  display: grid;
  grid-template-columns: var(--activity-width) var(--panel-width) minmax(0, 1fr);
  background: var(--bg-primary);
}

.app-shell.without-panel {
  grid-template-columns: var(--activity-width) minmax(0, 1fr);
}

.shell-activity {
  grid-column: 1;
  min-height: var(--app-viewport-height, 100vh);
}

.shell-panel {
  grid-column: 2;
  min-height: var(--app-viewport-height, 100vh);
}

.shell-content {
  grid-column: 3;
  min-width: 0;
  min-height: var(--app-viewport-height, 100vh);
  overflow: auto;
  background: var(--bg-primary);
}

.app-shell.without-panel .shell-content {
  grid-column: 2;
}

.route-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 200px;
  color: var(--text-muted, #999);
  font-size: 13px;
}

.route-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border, #e5e7eb);
  border-top-color: var(--accent, #6366f1);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) calc(56px + env(safe-area-inset-bottom, 0px));
    height: var(--app-viewport-height, 100vh);
    min-height: var(--app-viewport-height, 100vh);
  }

  .shell-panel {
    display: none;
  }

  .shell-content {
    grid-column: 1;
    grid-row: 1;
    min-height: 0;
    height: 100%;
  }

  .shell-activity {
    grid-column: 1;
    grid-row: 2;
    height: calc(56px + env(safe-area-inset-bottom, 0px));
    min-height: calc(56px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
