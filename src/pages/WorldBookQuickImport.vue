<template>
  <div class="quick-page">
    <SettingsSectionNav />
    <div class="quick-page__body">
      <WorldbookHeroCard
        v-if="featuredPreset"
        :preset="featuredPreset"
        data-test="quick-page-hero"
        @enter="enterDefaultWorld"
      />
      <MyWorldbooksNav
        :worldbooks-index="worldbooksIndex"
        :active-worldbook="activeWorldbook"
        @change="onWorldbookChange"
        @advanced="openAdvanced"
      />
      <WorldbookPresetGrid
        v-if="featuredPresets.length"
        :presets="featuredPresets"
        data-test="quick-page-presets"
        @select="enterPresetWorld"
      />
      <WorldbookExtraActions
        @structured="openStructuredSettings"
        @import="openAdvanced('import')"
        @ai="openAdvanced('ai')"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { seedWorldbookPresets, enterPresetWorld as helperEnterPresetWorld } from '../services/worldbookQuickImportHelpers'
import SettingsSectionNav from '../components/workbench/SettingsSectionNav.vue'
import WorldbookHeroCard from '../components/workbench/WorldbookHeroCard.vue'
import MyWorldbooksNav from '../components/workbench/MyWorldbooksNav.vue'
import WorldbookPresetGrid from '../components/workbench/WorldbookPresetGrid.vue'
import WorldbookExtraActions from '../components/workbench/WorldbookExtraActions.vue'

const router = useRouter()
const worldStore = useWorldStore()

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbook = computed(() => worldStore.activeWorldbook)
const featuredPresets = computed(() => (Array.isArray(seedWorldbookPresets) ? seedWorldbookPresets.slice(0, 5) : []))

// Hero 卡跟随 activeWorldbook 变化: 用户在 MyWorldbooksNav 切换后,
// hero 自动 re-render 显示新选中的世界书信息 (name + 衍生 genreLabel +
// openingHook excerpt + 3 briefing chip). 没选 worldbook 时 fallback 到
// 默认 preset (首次访问).
const featuredPreset = computed(() => {
  const wb = activeWorldbook.value
  if (wb && (wb.name || wb.entries?.length)) {
    return activeWorldbookToPreset(wb)
  }
  return seedWorldbookPresets[0] || null
})

function activeWorldbookToPreset(worldbook) {
  const entries = Array.isArray(worldbook?.entries) ? worldbook.entries : []
  const orgs = entries.filter(e => e?.type === 'organization').map(e => e?.name)
  const locations = entries.filter(e => e?.type === 'location').map(e => e?.name)
  const items = entries.filter(e => e?.type === 'item').map(e => e?.name)
  const description = String(worldbook?.worldDescription || worldbook?.description || '')
  const firstEntryContent = String(entries[0]?.content || '')
  const openingHook = description.slice(0, 80) || firstEntryContent.slice(0, 80)
  return {
    id: worldbook?.id || 'active',
    name: worldbook?.name || '当前世界书',
    genreLabel: orgs[0] ? `${orgs[0]} 势力` : '我的世界书',
    openingHook,
    entries
  }
}

async function onWorldbookChange(id) {
  if (id) {
    await worldStore.setActiveWorldbook(id)
  }
}

function enterDefaultWorld(preset) {
  helperEnterPresetWorld(worldStore, router, preset).catch((err) => {
    console.error('[世界书·主页] 导入 preset 失败:', err)
  })
}

function enterPresetWorld(preset) {
  enterDefaultWorld(preset)
}

function openAdvanced(section) {
  router.push({ name: 'settings-worldbook-advanced', query: { section } })
}

function openStructuredSettings() {
  router.push({ name: 'settings-structured' })
}

onMounted(async () => {
  try {
    await worldStore.loadWorldbooksIndex()
    if (typeof worldStore.ensureActiveWorldbook === 'function') {
      await worldStore.ensureActiveWorldbook()
    }
  } catch (e) {
    console.error('[世界书·主页] 初始化失败:', e)
  }
})
</script>

<style scoped>
.quick-page {
  /* W4c.5 follow-up: was `min-height: 100vh`. With min-height, the
     page grows with its content and the `.quick-page__body` below
     has no bounded height, so its `overflow: auto` never triggers
     and any `position: sticky` descendants (e.g. .my-worldbooks
     picker) fall back to <html> as their scroll ancestor and scroll
     out of view with the document. Switch to a bounded `height:
     100vh` + `overflow: hidden` so the body inside becomes a real
     scroll container — mirrors the W4b .editor-layout pattern
     exactly. */
  height: var(--app-viewport-height, 100vh);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: hidden;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 94%, transparent), var(--bg-primary));
  color: var(--text-primary);
}

.quick-page__body {
  /* AppShell is height: 100vh + overflow: hidden; mirror the W4b
     pattern so hero + nav + preset grid + extra actions can scroll
     inside the bounded shell instead of being clipped. The body
     fills the remaining viewport space (.quick-page is min-height:
     100vh; display: flex; column above), and the sticky
     MyWorldbooksNav picker inside this body pins relative to here. */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
  overflow: auto;
}

@media (max-width: 760px) {
  .quick-page {
    padding: 12px;
  }
}
</style>
