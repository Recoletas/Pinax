<script setup>
import { computed, onMounted } from 'vue'
import ModelPickerMenu from '../settings/ModelPickerMenu.vue'
import { useModelCatalog } from '../../composables/useModelCatalog.js'
import { refreshTextModelStatus, textModelReadOnly } from '../../composables/useTextModelStatus.js'
const catalog = useModelCatalog('text')
const configs = computed(() => textModelReadOnly.value ? catalog.configs.value.filter(config => config.builtin) : catalog.configs.value)
onMounted(refreshTextModelStatus)
</script>
<template><div class="assistant-model"><ModelPickerMenu kind="text" :configs="configs" :model-value="textModelReadOnly ? configs[0]?.id : catalog.selectedId.value" @refresh="catalog.refresh" @update:model-value="catalog.select" /><span v-if="catalog.error.value" role="alert">{{ catalog.error.value }}</span></div></template>
<style scoped>.assistant-model { flex:1 1 0;min-width:0;max-width:none; }.assistant-model :deep(.model-picker-trigger) { width:100%;max-width:100%;padding-inline:4px;font-size:12px; } .assistant-model :deep(.model-picker-trigger svg) { flex:none; } .assistant-model span[role=alert] { color:var(--danger);font-size:11px; }</style>
