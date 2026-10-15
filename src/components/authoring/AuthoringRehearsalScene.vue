<script setup>
import { ref, watch, computed } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ projection: { type: Object, default: () => ({}) }, detailOpen: Boolean, recognitionPending: Boolean })
const expanded = ref(false)
const people = computed(() => (props.projection.presentCharacters || []).map(person => person.name).filter(Boolean).join('、'))
watch(() => [props.detailOpen, props.recognitionPending], ([detail, pending], previous = []) => { if (detail || pending) expanded.value = true; else if (previous.some(Boolean)) expanded.value = false }, { immediate: true })
</script>
<template>
  <details class="rehearsal-current-scene" :open="expanded" data-test="rehearsal-current-scene" @toggle="expanded = $event.currentTarget.open">
    <summary><span><strong>{{ tr('当前场') }}</strong><span class="rehearsal-current-scene__summary">{{ [projection.location?.name, projection.time?.label, people].filter(Boolean).join(' · ') || tr('设置地点、时间和在场人物') }}</span></span><WorkbenchIcon name="chevron-down" :size="15" /></summary>
    <div class="rehearsal-current-scene__content"><slot /></div>
  </details>
</template>
<style scoped>
.rehearsal-current-scene { flex: none; margin: 0 16px 8px; border-bottom: 1px solid var(--hairline-soft); color: var(--text-primary); }
.rehearsal-current-scene summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; cursor: pointer; list-style: none; font: 13px/1.5 var(--font-sans); }
.rehearsal-current-scene summary::-webkit-details-marker { display: none; }
.rehearsal-current-scene strong { font-weight: 600; }
.rehearsal-current-scene__summary { display: block; color: var(--text-secondary); margin-top: 3px; overflow-wrap: anywhere; }
.rehearsal-current-scene[open] summary > svg { transform: rotate(180deg); }
.rehearsal-current-scene__content { padding: 0 0 12px; max-height: min(55vh, 560px); overflow-y: auto; }
.rehearsal-current-scene summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media(max-width:720px) { .rehearsal-current-scene summary { min-height: 44px; } }
</style>
