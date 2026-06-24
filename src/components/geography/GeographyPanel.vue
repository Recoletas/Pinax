<template>
  <div class="geography-panel">
    <header class="geo-header">
      <div class="geo-title-block">
        <span class="panel-kicker">案卷索引</span>
        <h2 class="panel-heading">地点卡</h2>
      </div>
      <span class="geo-count" aria-label="地点数量">{{ locations.length }}</span>
    </header>

    <!-- UI-E13-BIG1: demo mode — show the local demo scene's
         location / time / weather as an honest placeholder. Same
         pattern as the section above (shows what the current scene
         has, not a fake history). -->
    <div v-if="isDemoMode" class="demo-scene" aria-label="本场景地点">
      <div class="demo-scene__location">{{ meta.demoScene?.title || '未登记 · 空白' }}</div>
      <div class="demo-scene__meta">
        <span>{{ meta.demoScene?.timeOfDay || '' }}</span>
        <span>·</span>
        <span>{{ meta.demoScene?.weather || '' }}</span>
      </div>
    </div>

    <!-- UI-E11-C: 0-data stat strip placeholder — 当没有地点时, 显示 dashed
         placeholder + inline hint (档案员批注风格), 不再是 0 0 0 堆叠 -->
    <div
      v-if="locations.length === 0"
      class="geo-stat-strip geo-stat-strip--empty"
      aria-label="无地点卷"
    >
      <span class="geo-stat-strip--hint">暂无卷宗</span>
      <span class="geo-stat-strip--hint">地点是档案柜的目录</span>
      <span class="geo-stat-strip--hint">点 + 添加第一条</span>
    </div>
    <div v-else class="geo-stat-strip" aria-label="地点卷统计">
      <span><strong>{{ locationStats.root }}</strong> 卷号</span>
      <span><strong>{{ locationStats.linked }}</strong> 从属</span>
      <span><strong>{{ locationStats.described }}</strong> 已记</span>
    </div>

    <!-- Overview -->
    <div class="section overview-card">
      <div class="field-label-row">
        <label class="field-label" for="geo-overview">地理总述</label>
        <span class="save-hint">失焦自动保存</span>
      </div>
      <textarea
        id="geo-overview"
        class="text-area"
        rows="5"
        v-model="overview"
        @blur="saveOverview"
        placeholder="描述这个世界的整体地理面貌、大陆分布、气候特征等..."
      ></textarea>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-title-group">
        <h3 class="toolbar-title">地点网络</h3>
        <span class="toolbar-subtitle">{{ locationStats.described }} / {{ locations.length }} 个地点有描述</span>
      </div>
      <div class="toolbar-actions">
        <div class="view-tabs">
          <button class="tab-btn" :class="{ active: view === 'map' }" :aria-pressed="view === 'map'" @click="view = 'map'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
            树状图
          </button>
          <button class="tab-btn" :class="{ active: view === 'aimap' }" :aria-pressed="view === 'aimap'" @click="view = 'aimap'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z"/></svg>
            AI地图
          </button>
          <button class="tab-btn" :class="{ active: view === 'list' }" :aria-pressed="view === 'list'" @click="view = 'list'">
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
    <div v-if="view === 'map'" class="view-surface">
      <LocationTreeMap :locations="locations" />
    </div>

    <!-- AI concept map view -->
    <div v-if="view === 'aimap'" class="view-surface ai-map-panel">
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
        <span v-if="locations.length === 0" class="hint-text">请先添加地点</span>
      </div>

      <div v-if="streaming && !svgContent" class="ai-status">
        <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        AI 正在绘制地图...
      </div>

      <div v-if="!streaming && !svgContent" class="ai-empty">
        <span class="ai-empty-icon" aria-hidden="true">✦</span>
        <strong>{{ locations.length ? '生成一张地点关系概念图' : '还没有地点可绘制' }}</strong>
        <span>{{ locations.length ? '会根据总述、地点层级和剧情重要性绘制关系图。' : '先建立几个地点，再让 AI 绘制世界结构。' }}</span>
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
    <div v-if="view !== 'map'" class="location-list" :class="{ 'below-ai-map': view === 'aimap' }">
      <div v-if="locations.length === 0" class="empty-state">
        <span class="empty-icon" aria-hidden="true">⌖</span>
        <strong>暂无地点</strong>
        <span>先添加一个大陆、城市或关键场景。</span>
        <button class="toolbar-text-btn" @click="addLocation">添加第一个地点</button>
      </div>
      <div
        v-for="loc in locations"
        :key="loc.id"
        class="location-card"
        :class="{ expanded: expandedId === loc.id }"
        :style="{ '--loc-color': typeColor(loc.type) }"
      >
        <button class="location-header" @click="toggleExpand(loc.id)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline v-if="expandedId === loc.id" points="6 9 12 15 18 9"/><polyline v-else points="9 18 15 12 9 6"/></svg>
          <span class="loc-pin" aria-hidden="true"></span>
          <span class="loc-copy">
            <span class="loc-name">{{ loc.name }}</span>
            <span class="loc-meta">{{ parentLabel(loc.parentId) }}</span>
          </span>
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
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGeographyStore } from '../../stores/geographyStore'
import { buildConceptMapPrompt, buildImageMapPrompt } from '../../services/ai/geographyAdapter'
import { getResolvedApiSettings } from '../../services/api'
import { runGenerationTask } from '../../services/generationService'
import { LOCATION_TYPES } from '../../config/geography-types'
import { useWorkstationMeta } from '../../composables/useWorkstationMeta'
import { sanitizeSvg } from '../../utils/sanitize'
import LocationTreeMap from './LocationTreeMap.vue'

const geoStore = useGeographyStore()
const { overview, locations } = storeToRefs(geoStore)

const view = ref('map')
const expandedId = ref(null)
const svgContent = ref('')
const imagePrompt = ref('')
const copied = ref(false)
const streaming = ref(false)
const meta = useWorkstationMeta()
const isDemoMode = computed(() => meta.isDemoMode.value)

const locationStats = computed(() => {
  const items = locations.value || []
  return {
    root: items.filter((loc) => !loc.parentId).length,
    linked: items.filter((loc) => loc.parentId).length,
    described: items.filter((loc) => String(loc.description || '').trim()).length,
  }
})

function typeLabel(type) {
  return LOCATION_TYPES.find(t => t.value === type)?.label || type
}

function typeColor(type) {
  return LOCATION_TYPES.find(t => t.value === type)?.color || 'var(--accent)'
}

function parentLabel(parentId) {
  if (!parentId) return '顶级地点'
  const parent = locations.value.find((loc) => loc.id === parentId)
  return parent ? `从属：${parent.name}` : '父级缺失'
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
    svgContent.value = sanitizeSvg(
      raw
        .replace(/^```(?:svg|xml)?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim()
    )
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
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  --geo-radius: 11px;
}

.geo-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.geo-title-block {
  min-width: 0;
}

.panel-kicker {
  display: block;
  margin-bottom: 2px;
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-muted) 82%, var(--accent));
}

.panel-heading {
  font-size: 15px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.geo-count {
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
  border-radius: 999px;
  background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 62%),
    var(--bg-primary);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.geo-stat-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.geo-stat-strip span {
  min-width: 0;
  padding: 7px 5px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg-primary) 76%, transparent);
  color: var(--text-muted);
  font-size: 10px;
  text-align: center;
}

.geo-stat-strip strong {
  display: block;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

/* UI-E11-C: 0-data 状态 placeholder — dashed outline + muted hint */
.geo-stat-strip--empty {
  border: 1px dashed var(--border);
  background: transparent;
}
.geo-stat-strip--hint {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
  letter-spacing: 0.04em;
}

.section { margin: 0; }

.overview-card {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: var(--geo-radius);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 96%, transparent), color-mix(in srgb, var(--bg-secondary) 92%, transparent));
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-secondary);
  margin-bottom: 0;
}

.save-hint {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.text-area {
  width: 100%;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--bg-primary) 86%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.55;
  resize: vertical;
  min-height: 86px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.text-area:focus {
  border-color: color-mix(in srgb, var(--accent) 64%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

.toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}

.toolbar-title-group {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.toolbar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.toolbar-subtitle {
  color: var(--text-muted);
  font-size: 10px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  width: 100%;
}

.view-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  flex: 1 1 100%;
  min-width: 0;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  border-radius: 10px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
}

.tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  padding: 7px 5px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  border-radius: 8px;
  transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--bg-secondary)), color-mix(in srgb, var(--accent) 8%, var(--bg-secondary)));
  color: var(--accent);
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 18%, transparent) inset;
}

.tab-btn:focus-visible,
.primary-btn-sm:focus-visible,
.toolbar-text-btn:focus-visible,
.copy-btn:focus-visible,
.danger-btn-sm:focus-visible,
.location-header:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.primary-btn-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
}

.primary-btn-sm:hover { background: var(--accent-hover); }
.primary-btn-sm:disabled { opacity: 0.4; cursor: not-allowed; }

.toolbar-text-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-text-btn:hover {
  background: var(--surface-raised);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  color: var(--text-primary);
}
.toolbar-text-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.hint-text { font-size: 12px; color: var(--text-muted); }

.view-surface {
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: var(--geo-radius);
  background: color-mix(in srgb, var(--bg-primary) 64%, transparent);
  overflow: hidden;
}

/* AI section */
.ai-map-panel {
  padding: 10px;
}

.ai-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.ai-actions .primary-btn-sm,
.ai-actions .toolbar-text-btn {
  flex: 1 1 100%;
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

.ai-empty {
  min-height: 150px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  padding: 20px 14px;
  border: 1px dashed color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 12%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 58%),
    color-mix(in srgb, var(--bg-primary) 74%, transparent);
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
  line-height: 1.45;
}

.ai-empty strong {
  color: var(--text-primary);
  font-size: 13px;
}

.ai-empty-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-secondary));
  color: var(--accent);
}

.svg-output {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  background: var(--bg-primary);
}

.image-prompt-box {
  margin-top: 16px;
  padding: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 10px;
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
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
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
  gap: 9px;
}

.empty-state {
  min-height: 170px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
  padding: 24px 12px;
  border: 1px dashed color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: var(--geo-radius);
  background: color-mix(in srgb, var(--bg-primary) 64%, transparent);
  color: var(--text-muted);
  font-size: 12px;
}

.empty-state strong {
  color: var(--text-primary);
  font-size: 13px;
}

.empty-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.location-card {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: var(--geo-radius);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--loc-color, var(--accent)) 16%, transparent) 0 3px, transparent 3px),
    color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.location-card:hover,
.location-card.expanded {
  border-color: color-mix(in srgb, var(--loc-color, var(--accent)) 46%, var(--border));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--loc-color, var(--accent)) 24%, transparent) 0 3px, transparent 3px),
    color-mix(in srgb, var(--bg-secondary) 96%, var(--bg-primary));
}

.location-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 11px 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
  color: var(--text-primary);
}

.location-header:hover { background: color-mix(in srgb, var(--bg-hover) 70%, transparent); }

.loc-pin {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--loc-color, var(--accent)) 58%, var(--border));
  background:
    radial-gradient(circle, var(--loc-color, var(--accent)) 0 4px, transparent 4px),
    color-mix(in srgb, var(--loc-color, var(--accent)) 12%, var(--bg-primary));
}

.loc-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
  text-align: left;
}

.loc-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loc-meta {
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loc-type-badge {
  font-size: 11px;
  color: color-mix(in srgb, var(--loc-color, var(--accent)) 82%, var(--text-primary));
  background: color-mix(in srgb, var(--loc-color, var(--accent)) 10%, var(--bg-primary));
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--loc-color, var(--accent)) 28%, var(--border));
  white-space: nowrap;
}

.location-body {
  padding: 11px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 42%, transparent);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.text-input {
  width: 100%;
  padding: 8px 9px;
  background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.text-input:focus {
  border-color: color-mix(in srgb, var(--accent) 64%, var(--border));
  background: var(--bg-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
}

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
  background: color-mix(in srgb, var(--danger) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 18%, transparent);
  font-size: 12px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.danger-btn-sm:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }

@media (min-width: 420px) {
  .field-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .toolbar-actions {
    width: auto;
  }

  .view-tabs {
    flex-basis: auto;
  }

  .ai-actions .primary-btn-sm,
  .ai-actions .toolbar-text-btn {
    flex: 0 1 auto;
  }
}
</style>
