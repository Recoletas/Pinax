<script setup>
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from './WorkbenchIcon.vue'

defineProps({ current: { type: String, required: true }, compact: Boolean, documentTitle: { type: String, default: '' }, blocked: Boolean, blockedTitle: { type: String, default: '' } })
defineEmits(['select'])
const surfaces = [
  { key: 'writing', label: '正文', icon: 'writing' },
  { key: 'assistant', label: '助手', icon: 'message-square' },
  { key: 'settings', label: '设定', icon: 'worldbook' },
  { key: 'sources', label: '资料', icon: 'sources' }
]
</script>

<template>
  <nav class="project-writing-nav" :class="{ 'is-compact': compact }" :aria-label="tr('作品导航')">
    <button v-for="surface in surfaces" :key="surface.key" type="button" :data-project-surface="surface.key" :class="{ 'is-current': current === surface.key }" :aria-current="current === surface.key ? 'page' : null" :disabled="blocked && ['settings', 'sources'].includes(surface.key)" :title="blocked && ['settings', 'sources'].includes(surface.key) ? blockedTitle : surface.key === 'writing' && documentTitle ? `${tr(surface.label)} · ${documentTitle}` : tr(surface.label)" @click="$emit('select', surface.key)">
      <WorkbenchIcon :name="surface.icon" :size="18" />
      <span>{{ tr(surface.label) }}<small v-if="!compact && surface.key === 'writing' && documentTitle">{{ documentTitle }}</small></span>
    </button>
  </nav>
</template>

<style scoped>
.project-writing-nav { display: grid; flex: none; gap: 4px; min-width: 0; font-family: var(--font-sans); }
.project-writing-nav button { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 42px; padding: 10px 14px; border: 0; border-radius: 14px; background: transparent; color: var(--nav-fg, var(--text-secondary)); font: 14px/1.45 var(--font-sans); text-align: left; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.project-writing-nav button > svg { flex: none; }
.project-writing-nav button > span { display: grid; min-width: 0; gap: 2px; }
.project-writing-nav small { overflow: hidden; color: var(--text-secondary); font-size: 12px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
.project-writing-nav .is-current { background: var(--nav-primary-selected, var(--nav-selected)); color: var(--nav-primary-fg, var(--accent)); }
.project-writing-nav button:hover:not(:disabled) { background: var(--nav-hover); color: var(--nav-fg-selected); }
.project-writing-nav .is-current:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, var(--nav-surface)); color: var(--nav-primary-fg, var(--accent)); }
.project-writing-nav button:active:not(:disabled) { background: var(--nav-focused); }
.project-writing-nav .is-current { font-weight: 500; }
.project-writing-nav button:disabled { opacity: .45; cursor: not-allowed; }
.project-writing-nav button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.project-writing-nav.is-compact { grid-template-columns: minmax(0, 1fr); gap: 4px; margin: 0 12px 20px; padding: 0; border: 0; }
.is-compact button { flex-direction: row; justify-content: flex-start; gap: 12px; min-height: 42px; padding: 10px 14px; font-size: 14px; }
.is-compact button > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px), (pointer: coarse) { .project-writing-nav button { min-height: 44px; } .project-writing-nav.is-compact button { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .project-writing-nav button { transition: none; } }
</style>
