<script setup>
import { computed, onMounted } from 'vue'
import { tr } from '../../i18n/index.js'
import TextModelPicker from '../text/TextModelPicker.vue'
import { useModelCatalog } from '../../composables/useModelCatalog.js'
import { refreshTextModelStatus, textModelReadOnly, textModelReady } from '../../composables/useTextModelStatus.js'
defineProps({ manage: Boolean })
const catalog = useModelCatalog('text')
const effectiveModel = computed(() => catalog.selected.value?.model || catalog.configs.value.find(config => config.builtin)?.model || '')
onMounted(refreshTextModelStatus)
</script>
<template>
  <div class="api-settings-panel">
    <TextModelPicker v-if="!textModelReadOnly" :manage="manage" :model-value="catalog.selectedId.value" :configs="catalog.configs.value" @update:model-value="catalog.select" @configs-updated="catalog.refresh" />
    <p class="ai-settings-note" role="status" data-test="model-effective-line">{{ textModelReadOnly ? tr('当前使用服务器提供的文本模型。') : tr('默认文本模型') }}<span v-if="effectiveModel"> · {{ effectiveModel }}</span></p>
    <p v-if="!textModelReady" class="ai-settings-note" role="status">{{ tr('模型服务暂不可用，请稍后重试。') }}</p>
    <p v-if="catalog.error.value" role="alert" data-test="model-apply-message">{{ tr(catalog.error.value) }}</p>
  </div>
</template>
<style scoped>
.api-settings-panel { display:flex;flex-direction:column;gap:12px;font:14px/1.6 var(--font-sans); }
.ai-settings-note { margin:0;color:var(--text-secondary);font-size:12px; }
</style>
