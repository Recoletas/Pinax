<script setup>
import { computed, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ sources: { type: Array, default: () => [] } })
defineEmits(['open'])
const open = ref(false)
const unique = computed(() => [...new Map(props.sources.map(source => [source.sourceRef, source])).values()])
const preview = computed(() => unique.value.slice(0, 2).map(source => source.label).join('、'))
</script>
<template>
  <div v-if="unique.length" class="assistant-sources">
    <button type="button" class="assistant-sources__summary" :aria-expanded="open" @click="open = !open"><WorkbenchIcon name="sources" :size="13" /><span>{{ tr('{count} 个来源', { count: unique.length }) }}<small> · {{ preview }}</small></span><WorkbenchIcon :name="open ? 'chevron-down' : 'chevron-right'" :size="12" /></button>
    <ol v-if="open"><li v-for="source in unique" :key="source.sourceRef"><button type="button" @click="$emit('open', source, $event.currentTarget)">{{ source.label }}</button></li></ol>
  </div>
</template>
<style scoped>
.assistant-sources { min-width: 0; margin-top: 10px; color: var(--text-secondary); font: 12px/1.5 var(--font-sans); }
.assistant-sources button { border: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; min-height: 30px; }
.assistant-sources__summary { display: flex; align-items: center; gap: 6px; width: 100%; padding: 0; }
.assistant-sources__summary > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-sources__summary svg { flex: none; }
.assistant-sources small { color: var(--text-muted); font: inherit; }
.assistant-sources ol { margin: 4px 0; padding-inline-start: 24px; }
.assistant-sources li button { overflow-wrap: anywhere; }
.assistant-sources button:hover { color: var(--text-primary); }
.assistant-sources button:focus-visible { outline: 2px solid var(--workbench-focus); }
@media(max-width:720px) { .assistant-sources button { min-height: 44px; } }
</style>
