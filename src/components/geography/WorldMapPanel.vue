<template>
  <div class="world-map-panel">
    <!-- Toolbar -->
    <div class="panel-toolbar">
      <h2 class="panel-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        世界地图
        <span v-if="activeNode" class="active-world-name">
          — {{ activeNode.name }}
        </span>
      </h2>
      <div class="toolbar-right">
        <div class="view-toggle">
          <button class="toggle-btn" :class="{ active: viewMode === 'voronoi' }" @click="viewMode = 'voronoi'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            奇幻
          </button>
          <button class="toggle-btn disabled" @click="alert('3D 地图功能正在开发调优中，敬请期待！')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            3D
          </button>
        </div>

        <button class="generate-btn" @click="handleGenerate" :disabled="streaming">
          <svg v-if="streaming" class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
          <template v-else-if="voronoiConfig">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            AI 重新生成
          </template>
          <template v-else>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
            AI 生成地图
          </template>
        </button>
      </div>
    </div>

    <!-- AI error -->
    <div v-if="aiError" class="ai-error">{{ aiError }}</div>

    <!-- AI streaming progress -->
    <div v-if="streaming" class="ai-progress">
      <div class="progress-header">
        <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        AI 正在分析世界设定，生成地图参数...
      </div>
      <div class="progress-preview">{{ streamOutput.slice(0, 200) }}{{ streamOutput.length > 200 ? '...' : '' }}</div>
    </div>

    <!-- Main content: world tree + map -->
    <div class="main-content">
      <WorldTreeSidebar />
      <div class="map-area">
        <WorldMapVoronoi
          :config="voronoiConfig"
          :markers="markers"
          @map-generated="onMapGenerated"
          @add-marker="handleAddMarker"
          @update-marker="handleUpdateMarker"
          @delete-marker="handleDeleteMarker"
          @marker-drag-end="handleMarkerDragEnd"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeographyStore } from '../../stores/geographyStore'
import { buildVoronoiMapPrompt, parseVoronoiMapConfig } from '../../services/ai/voronoiMapAdapter'
import { getResolvedApiSettings } from '../../services/api'
import { runGenerationTask } from '../../services/generationService'
import WorldTreeSidebar from './WorldTreeSidebar.vue'
import WorldMapVoronoi from './WorldMapVoronoi.vue'

const geoStore = useGeographyStore()
const { overview, locations, activeWorldNode: activeNode, voronoiConfig, markers } = storeToRefs(geoStore)

const viewMode = ref('voronoi')
const streaming = ref(false)
const streamOutput = ref('')
const aiError = ref(null)

async function handleGenerate() {
  streaming.value = true
  aiError.value = null
  streamOutput.value = ''

  try {
    const messages = buildVoronoiMapPrompt(null, overview.value, locations.value)

    const settings = await getResolvedApiSettings()
    if (!settings?.baseUrl || !settings?.apiKey || !settings?.model) {
      aiError.value = '未检测到可用 AI 配置'
      streaming.value = false
      return
    }

    const result = await runGenerationTask({
      taskType: 'geography.voronoi-map',
      baseMessages: messages,
      settings,
      generationOptions: { temperature: 0.7, max_tokens: 4000 },
      attempts: [{ name: 'voronoi-map' }],
    })

    const raw = result?.parsed || result?.content || ''
    if (!raw) {
      streaming.value = false
      return
    }

    const config = parseVoronoiMapConfig(raw)
    if (activeNode.value) {
      config.mapName = activeNode.value.name
    }
    geoStore.saveVoronoiConfig(config)
  } catch (err) {
    console.error('Failed to generate Voronoi config:', err)
    aiError.value = err.message || '生成失败'
  } finally {
    streaming.value = false
  }
}

function onMapGenerated(data) {
  // No-op: the child component owns the rendered output.
  // Kept as a hook for future telemetry.
  void data
}

function handleAddMarker(x, y) {
  geoStore.addMarker({
    id: 'mk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: '新标记',
    x, y,
    type: 'custom',
    importance: 2,
    userAdded: true,
  })
}

function handleUpdateMarker(id, patch) {
  geoStore.updateMarker(id, patch)
}

function handleDeleteMarker(id) {
  geoStore.deleteMarker(id)
}

function handleMarkerDragEnd(id, x, y) {
  geoStore.updateMarker(id, { x, y })
}

// Load geography data on mount
onMounted(() => {
  geoStore.loadAll()
})
</script>

<style scoped>
.world-map-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.active-world-name {
  font-size: 13px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 4px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 2px;
  border: 1px solid var(--border);
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.toggle-btn:hover { color: var(--text-primary); }
.toggle-btn.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary)); }
.toggle-btn.disabled { opacity: 0.4; }

.generate-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.generate-btn:hover { background: var(--accent-hover); }
.generate-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ai-error {
  margin-bottom: 12px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
  border-radius: 8px;
  font-size: 12px;
  color: var(--danger);
}

.ai-progress {
  margin-bottom: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 4px;
}

.progress-preview {
  font-size: 11px;
  color: var(--text-muted);
  max-height: 80px;
  overflow-y: auto;
  font-family: monospace;
}

.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.map-area {
  flex: 1;
  min-width: 0;
}
</style>
