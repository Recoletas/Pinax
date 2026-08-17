<template>
  <div class="quick-page">
    <ContourField class="quick-page__contour" density="relation" entry="right" />
    <SettingsSectionNav />
    <div class="quick-page__body">
      <header class="quick-context">
        <div>
          <span class="quick-context__kicker">WORLD ARCHIVE</span>
          <strong>世界档案</strong>
        </div>
        <span class="quick-context__current">
          <i aria-hidden="true"></i>
          {{ activeWorldbook?.name || '尚未选择世界书' }}
        </span>
      </header>
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
import ContourField from '../components/workbench/ContourField.vue'

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

const heroUsesActiveWorldbook = computed(() => Boolean(activeWorldbook.value?.id))

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
    entries,
    // 标记该卡展示的是「当前已存在的世界书」，而不是待导入的 preset。
    // 「开始冒险」应直接进入它，而非再走一次 preset 导入 → 生成重复世界书。
    isActiveWorldbook: true
  }
}

async function onWorldbookChange(id) {
  if (id) {
    await worldStore.setActiveWorldbook(id)
  }
}

async function enterDefaultWorld(preset) {
  if (!preset) return
  // hero 展示的是当前世界书本身：直接进入体验，不再重复生成一份。
  if (heroUsesActiveWorldbook.value || preset.isActiveWorldbook) {
    router.push({
      name: 'experience',
      query: { worldbookId: activeWorldbook.value?.id || preset.id }
    })
    return
  }
  helperEnterPresetWorld(worldStore, router, preset).catch((err) => {
    console.error('[世界书·主页] 导入 preset 失败:', err)
  })
}

function enterPresetWorld(preset) {
  enterDefaultWorld(preset)
}

function openAdvanced(section) {
  if (['new', 'import', 'ai'].includes(section)) {
    router.push({
      name: 'settings-worldbook-create',
      query: { mode: section === 'import' ? 'sources' : section === 'ai' ? 'brief' : 'sources' }
    })
    return
  }
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
  padding: 0 clamp(14px, 3vw, 42px) 28px;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 94%, transparent), var(--bg-primary));
  color: var(--text-primary);
  position: relative;
}

.quick-page > :not(.quick-page__contour) {
  position: relative;
  z-index: 3;
}

.quick-page__contour {
  inset: 36px 0 auto auto;
  width: min(720px, 58vw);
  height: 300px;
  opacity: .72;
}

.quick-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  grid-area: context;
  width: 100%;
  min-height: 70px;
  margin: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
}

.quick-context > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.quick-context__kicker {
  color: var(--text-muted);
  font: 600 9px/1 var(--font-mono, ui-monospace, monospace);
  letter-spacing: .12em;
}

.quick-context strong {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 680;
}

.quick-context__current {
  overflow: hidden;
  max-width: 42%;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-context__current i {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 10%, transparent);
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 290px);
  grid-template-areas:
    "context context"
    "hero picker"
    "presets actions";
  align-content: start;
  gap: 22px 34px;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
  overflow: auto;
  position: relative;
}

.quick-page__body::before {
  content: '';
  position: absolute;
  top: 78px;
  right: -8px;
  width: 230px;
  height: 160px;
  opacity: .32;
  background-image: radial-gradient(circle, color-mix(in srgb, var(--archive-gold) 54%, transparent) 0 1px, transparent 1.2px);
  background-size: 13px 13px;
  mask-image: linear-gradient(110deg, transparent, #000 34%, transparent 92%);
  pointer-events: none;
}

.quick-page__body :deep(.worldbook-hero) {
  grid-area: hero;
  min-width: 0;
}

.quick-page__body :deep(.worldbook-hero__roman),
.quick-page__body :deep(.worldbook-hero__stamp) {
  display: none;
}

.quick-page__body :deep(.my-worldbooks) {
  grid-area: picker;
  align-self: start;
}

.quick-page__body :deep(.preset-grid) {
  grid-area: presets;
}

.quick-page__body :deep(.quick-extra) {
  grid-area: actions;
  align-self: start;
}

@media (max-width: 760px) {
  .quick-page {
    padding-inline: 14px;
  }

  .quick-context {
    min-height: 54px;
  }

  .quick-page__body {
    grid-template-columns: 1fr;
    grid-template-areas:
      "context"
      "hero"
      "picker"
      "actions"
      "presets";
    gap: 16px;
  }

  .quick-page__body :deep(.worldbook-hero) {
    min-height: 280px;
  }

  .quick-context__current {
    max-width: 48%;
  }

  .quick-page__contour {
    width: 100%;
    height: 220px;
    opacity: .46;
  }
}
</style>
