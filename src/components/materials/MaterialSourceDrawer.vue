<script setup>
import { computed, ref } from 'vue'
import { getAssetKindLabel } from '../../services/narrativeAssets'

const props = defineProps({
  assets: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' }
})

const emit = defineEmits(['select'])
const collapsedKinds = ref({})

const ASSET_KIND_ORDER = [
  'storyboard-seed',
  'reference-image',
  'draft-prose',
  'event',
  'character-fact',
  'worldbook-draft',
  'inspiration'
]

const groupedAssets = computed(() => ASSET_KIND_ORDER
  .map((kind) => ({
    kind,
    label: getAssetKindLabel(kind),
    color: kindColor(kind),
    items: props.assets.filter((asset) => asset.kind === kind)
  }))
  .filter((group) => group.items.length > 0))

function toggleKind(kind) {
  collapsedKinds.value = {
    ...collapsedKinds.value,
    [kind]: !collapsedKinds.value[kind]
  }
}

function groupLabel(index) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][index] || String(index + 1).padStart(2, '0')
}

function statusLabel(status) {
  if (status === 'accepted') return '已采纳'
  if (status === 'archived') return '归档'
  if (status === 'rejected') return '拒绝'
  return '待处理'
}

function kindColor(kind) {
  return {
    'draft-prose': '#5b8def',
    event: '#ef5350',
    'character-fact': '#f59e0b',
    'worldbook-draft': '#66bb6a',
    inspiration: '#ab47bc',
    'storyboard-seed': '#26c6da',
    'reference-image': '#ff7043'
  }[kind] || '#7c92ff'
}
</script>

<template>
  <aside class="material-drawer material-source-drawer" aria-label="漫画素材索引">
    <div class="material-source-drawer__context">
      <span>素材索引</span>
      <strong>{{ assets.length }} 卷</strong>
    </div>
    <div class="drawer-units">
      <section
        v-for="(group, groupIndex) in groupedAssets"
        :key="group.kind"
        class="drawer-unit"
        :class="{ 'is-collapsed': collapsedKinds[group.kind] }"
      >
        <button
          class="drawer-handle"
          type="button"
          :aria-expanded="!collapsedKinds[group.kind]"
          @click="toggleKind(group.kind)"
        >
          <span class="drawer-handle__spine" :style="{ background: group.color }" aria-hidden="true"></span>
          <span class="drawer-handle__roman">{{ groupLabel(groupIndex) }}</span>
          <span class="drawer-handle__title">{{ group.label }}</span>
          <span class="drawer-handle__count">{{ group.items.length }}</span>
          <span class="drawer-handle__chevron" aria-hidden="true">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
              <path v-if="collapsedKinds[group.kind]" d="M3 1.5L6 4.5L3 7.5" />
              <path v-else d="M1.5 3L4.5 6L7.5 3" />
            </svg>
          </span>
        </button>
        <div v-show="!collapsedKinds[group.kind]" class="drawer-body">
          <button
            v-for="(asset, assetIndex) in group.items"
            :key="asset.id"
            type="button"
            class="index-card"
            :class="{ 'is-selected': selectedId === asset.id }"
            :style="{
              '--card-tilt': ((groupIndex + assetIndex) % 3 === 0 ? -1.2 : (groupIndex + assetIndex) % 3 === 1 ? 0.65 : -0.35) + 'deg',
              '--card-shift': ((groupIndex + assetIndex) % 2 === 0 ? 0 : 2) + 'px'
            }"
            :aria-label="`将素材用于当前漫画格：${asset.title || '无标题素材'}`"
            :aria-pressed="selectedId === asset.id"
            @click="emit('select', asset.id)"
          >
            <span class="index-card__source-dot" :style="{ background: group.color }" aria-hidden="true"></span>
            <span class="index-card__body">
              <strong class="index-card__title">{{ asset.title || '无标题素材' }}</strong>
              <span class="index-card__meta">{{ statusLabel(asset.status) }}</span>
            </span>
            <svg v-if="selectedId === asset.id" class="index-card__selected-mark" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
              <path d="M3 8.5l3 3 7-7" />
            </svg>
          </button>
        </div>
      </section>
      <div v-if="groupedAssets.length === 0" class="drawer-empty">
        <span>抽屉全空 · 先在素材页建立素材</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.material-source-drawer {
  width: 260px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--archive-ink, var(--text-primary));
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--archive-paper-strong) 92%, transparent) 0%,
      color-mix(in srgb, var(--archive-paper-strong) 70%, var(--archive-paper-soft)) 60%,
      color-mix(in srgb, var(--archive-paper-soft) 80%, var(--archive-paper)) 100%);
  border-right: 1px solid color-mix(in srgb, var(--archive-gold) 70%, transparent);
  box-shadow: inset 8px 0 16px color-mix(in srgb, var(--archive-ink) 22%, transparent);
}

.material-source-drawer__context {
  height: 42px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 38%, transparent);
  color: var(--archive-ink-soft, var(--text-secondary));
  font-size: 10px;
}

.material-source-drawer__context strong { color: var(--archive-ink); font-size: 11px; }
.drawer-units { flex: 1; min-height: 0; padding: 4px 0 12px; overflow-y: auto; }
.drawer-unit { margin: 0 0 10px; border-top: 1px dashed color-mix(in srgb, var(--archive-gold) 30%, transparent); }
.drawer-handle { width: 100%; display: flex; align-items: center; gap: 6px; padding: 5px 10px 6px; border: 0; border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 22%, transparent); background: transparent; color: var(--archive-ink); cursor: pointer; text-align: left; }
.drawer-handle:hover { background: color-mix(in srgb, var(--archive-gold) 8%, transparent); }
.drawer-handle__spine { width: 4px; align-self: stretch; flex: 0 0 auto; margin-right: 4px; }
.drawer-handle__roman { min-width: 18px; color: var(--archive-ink-soft); font-family: var(--font-display); font-size: 11px; font-style: italic; letter-spacing: 0.06em; }
.drawer-handle__title { flex: 1; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.drawer-handle__count { color: var(--archive-ink-soft); font-size: 11px; }
.drawer-handle__chevron { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; color: var(--archive-ink-soft); }
.drawer-body { display: grid; gap: 7px; padding: 2px 12px 6px; }
.index-card { position: relative; min-width: 0; min-height: 48px; display: flex; align-items: center; gap: 7px; margin-inline: var(--card-shift, 0) 2px; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent); border-radius: 0; background: linear-gradient(105deg, color-mix(in srgb, var(--archive-paper) 32%, transparent), transparent 42%), var(--archive-paper-soft); box-shadow: 0 3px 8px color-mix(in srgb, var(--archive-ink) 11%, transparent); color: var(--archive-ink); cursor: pointer; font: inherit; text-align: left; transform: rotate(var(--card-tilt, 0deg)); transform-origin: 50% 12%; transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease; }
.index-card::before { content: ''; position: absolute; top: -2px; left: 50%; width: 28px; height: 4px; border-radius: 1px; background: color-mix(in srgb, var(--archive-gold) 34%, var(--archive-paper)); box-shadow: 0 1px 1px color-mix(in srgb, var(--archive-ink) 12%, transparent); opacity: 0.72; transform: translateX(-50%); pointer-events: none; }
.index-card:hover { border-color: color-mix(in srgb, var(--archive-gold) 70%, var(--archive-ink)); box-shadow: 0 5px 12px color-mix(in srgb, var(--archive-ink) 15%, transparent); transform: rotate(0deg) translate(2px, -1px); }
.index-card:focus-visible { outline: 2px solid var(--archive-gold); outline-offset: 2px; }
.index-card.is-selected { border-color: color-mix(in srgb, var(--archive-gold) 72%, var(--archive-ink)); background: linear-gradient(90deg, color-mix(in srgb, var(--archive-gold) 16%, transparent), transparent 38%), var(--archive-paper-soft); box-shadow: inset 3px 0 0 color-mix(in srgb, var(--archive-gold) 76%, var(--archive-ink)), 0 5px 12px color-mix(in srgb, var(--archive-ink) 14%, transparent); transform: rotate(0deg) translateY(-1px); }
.index-card__source-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; }
.index-card__body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.index-card__title { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.index-card__meta { margin-top: 1px; color: var(--archive-ink-soft); font-size: 10px; }
.index-card__selected-mark { flex: 0 0 auto; color: var(--archive-olive); }
.drawer-empty { padding: 22px 14px; color: var(--archive-ink-soft); font-size: 11px; font-style: italic; text-align: center; }

@media (max-width: 980px) {
  .material-source-drawer { width: 180px; }
  .drawer-body { padding-inline: 8px; }
  .index-card { padding-inline: 7px; }
}
</style>
