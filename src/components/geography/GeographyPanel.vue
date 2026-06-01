<template>
  <div class="geography-panel">
    <h2 class="panel-heading">地理环境</h2>

    <!-- Overview -->
    <div class="section">
      <label class="field-label">地理总述</label>
      <textarea
        class="text-area"
        rows="5"
        v-model="overview"
        @blur="saveOverview"
        placeholder="描述这个世界的整体地理面貌、大陆分布、气候特征等..."
      ></textarea>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <h3 class="toolbar-title">地点列表 ({{ locations.length }})</h3>
      <div class="toolbar-actions">
        <div class="view-tabs">
          <button class="tab-btn" :class="{ active: view === 'map' }" @click="view = 'map'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
            树状图
          </button>
          <button class="tab-btn" :class="{ active: view === 'aimap' }" @click="view = 'aimap'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
            AI地图
          </button>
          <button class="tab-btn" :class="{ active: view === 'list' }" @click="view = 'list'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            列表
          </button>
        </div>
        <button class="primary-btn-sm" @click="addLocation">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          添加地点
        </button>
      </div>
    </div>

    <!-- Tree map view -->
    <div v-if="view === 'map'" class="mb-6">
      <LocationTreeMap :locations="locations" />
    </div>

    <!-- AI concept map view -->
    <div v-if="view === 'aimap'" class="mb-6">
      <div class="ai-actions">
        <button class="primary-btn-sm" @click="generateConceptMap" :disabled="streaming || locations.length === 0">
          <svg v-if="streaming" class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
          {{ streaming ? 'AI 生成中...' : '生成 AI 概念地图' }}
        </button>
        <button class="toolbar-text-btn" @click="generateImagePrompt" :disabled="locations.length === 0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          生成图像 Prompt
        </button>
        <span v-if="locations.length === 0" class="hint-text">请先在列表中添加地点</span>
      </div>

      <div v-if="streaming && !svgContent" class="ai-status">
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        AI 正在绘制地图...
      </div>

      <div v-if="svgContent" class="svg-output" v-html="svgContent"></div>

      <div v-if="imagePrompt" class="image-prompt-box">
        <div class="prompt-header">
          <span class="prompt-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            图像生成 Prompt（适用于 Midjourney / DALL-E）
          </span>
          <button class="copy-btn" @click="copyPrompt">
            <svg v-if="!copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <p class="prompt-text">{{ imagePrompt }}</p>
      </div>
    </div>

    <!-- Location list -->
    <div v-if="view !== 'map'" class="location-list">
      <div v-if="locations.length === 0" class="empty-state">暂无地点，点击上方按钮添加</div>
      <div v-for="loc in locations" :key="loc.id" class="location-card">
        <button class="location-header" @click="toggleExpand(loc.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline v-if="expandedId === loc.id" points="6 9 12 15 18 9"/><polyline v-else points="9 18 15 12 9 6"/></svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span class="loc-name">{{ loc.name }}</span>
          <span class="loc-type-badge">{{ typeLabel(loc.type) }}</span>
        </button>

        <div v-if="expandedId === loc.id" class="location-body">
          <div class="field-grid">
            <div class="field">
              <label class="field-label">名称</label>
              <input class="text-input" :value="loc.name" @input="updateLocation(loc.id, { name: $event.target.value })" />
            </div>
            <div class="field">
              <label class="field-label">类型</label>
              <select class="text-input" :value="loc.type" @change="updateLocation(loc.id, { type: $event.target.value })">
                <option v-for="t in LOCATION_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <div class="field">
              <label class="field-label">上级地点</label>
              <select class="text-input" :value="loc.parentId || ''" @change="updateLocation(loc.id, { parentId: $event.target.value || null })">
                <option value="">（顶级）</option>
                <option v-for="l in locations.filter(x => x.id !== loc.id)" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label class="field-label">描述</label>
            <textarea class="text-area" rows="3" :value="loc.description" @input="updateLocation(loc.id, { description: $event.target.value })"></textarea>
          </div>
          <div class="field">
            <label class="field-label">剧情重要性</label>
            <input class="text-input" :value="loc.significance" @input="updateLocation(loc.id, { significance: $event.target.value })" />
          </div>
          <div class="location-footer">
            <button class="danger-btn-sm" @click="deleteLocation(loc.id)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              删除地点
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeographyStore } from '../../stores/geographyStore'
import { buildConceptMapPrompt, buildImageMapPrompt } from '../../services/ai/geographyAdapter'
import { getResolvedApiSettings } from '../../services/api'
import { runGenerationTask } from '../../services/generationService'
import { LOCATION_TYPES } from '../../config/geography-types'
import LocationTreeMap from './LocationTreeMap.vue'

const geoStore = useGeographyStore()
const { overview, locations } = storeToRefs(geoStore)

const view = ref('map')
const expandedId = ref(null)
const svgContent = ref('')
const imagePrompt = ref('')
const copied = ref(false)
const streaming = ref(false)

function typeLabel(type) {
  return LOCATION_TYPES.find(t => t.value === type)?.label || type
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function saveOverview() {
  geoStore.saveGeography({ overview: overview.value })
}

function addLocation() {
  const newLoc = {
    id: 'loc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: '新地点',
    type: 'other',
    description: '',
    significance: '',
    parentId: null,
    order: locations.value.length,
  }
  const updated = [...locations.value, newLoc]
  expandedId.value = newLoc.id
  geoStore.saveGeography({ locations: updated })
}

function updateLocation(id, data) {
  const updated = locations.value.map(l => l.id === id ? { ...l, ...data } : l)
  geoStore.saveGeography({ locations: updated })
}

function deleteLocation(id) {
  const updated = locations.value.filter(l => l.id !== id && l.parentId !== id)
  geoStore.saveGeography({ locations: updated })
}

async function generateConceptMap() {
  svgContent.value = ''
  streaming.value = true
  try {
    const messages = buildConceptMapPrompt(overview.value, locations.value)
    const settings = await getResolvedApiSettings()
    if (!settings?.baseUrl || !settings?.apiKey || !settings?.model) {
      streaming.value = false
      return
    }
    const result = await runGenerationTask({
      taskType: 'geography.concept-map',
      baseMessages: messages,
      settings,
      generationOptions: { temperature: 0.7, max_tokens: 4000 },
      attempts: [{ name: 'concept-map' }],
    })
    const raw = result?.parsed || result?.content || ''
    svgContent.value = raw
      .replace(/^```(?:svg|xml)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()
  } catch (e) {
    console.error('Concept map generation failed:', e)
  } finally {
    streaming.value = false
  }
}

function generateImagePrompt() {
  imagePrompt.value = buildImageMapPrompt('项目', overview.value, locations.value)
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(imagePrompt.value)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  } catch { /* ignore */ }
}
</script>

<style scoped>
.geography-panel {
  max-width: 800px;
}

.panel-heading {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 16px;
}

.section { margin-bottom: 24px; }

.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.text-area {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-area:focus { border-color: var(--accent); }

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.toolbar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.view-tabs {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 2px;
  border: 1px solid var(--border);
}

.tab-btn {
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

.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary)); color: var(--accent); }

.primary-btn-sm {
  display: flex;
  align-items: center;
  gap: 4px;
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

.primary-btn-sm:hover { background: var(--accent-hover); }
.primary-btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }

.toolbar-text-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-text-btn:hover { background: var(--surface-raised); color: var(--text-primary); }
.toolbar-text-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.hint-text { font-size: 12px; color: var(--text-muted); }

.mb-6 { margin-bottom: 24px; }

/* AI section */
.ai-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ai-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 32px 0;
  justify-content: center;
}

.svg-output {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--bg-primary);
}

.image-prompt-box {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.prompt-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.copy-btn:hover { color: var(--accent); }

.prompt-text {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  word-break: break-all;
  user-select: all;
  margin: 0;
}

/* Location list */
.location-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 32px 0;
  color: var(--text-muted);
  font-size: 12px;
}

.location-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.location-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.location-header:hover { background: var(--bg-hover); }

.loc-name {
  flex: 1;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.loc-type-badge {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.location-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--border);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.text-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-input:focus { border-color: var(--accent); }

.location-footer {
  display: flex;
  justify-content: flex-end;
}

.danger-btn-sm {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  color: var(--danger);
  background: transparent;
  border: none;
  font-size: 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.danger-btn-sm:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
</style>
