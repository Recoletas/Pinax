<script setup>
import { useSettingsPopup } from '../../composables/useSettingsPopup.js'
import { useModelCatalog } from '../../composables/useModelCatalog.js'
import ApiSettingsPanel from '../worldbook/ApiSettingsPanel.vue'
import ImageModelPicker from '../media/ImageModelPicker.vue'
import VideoModelPicker from '../media/VideoModelPicker.vue'
import { tr } from '../../i18n/index.js'
const { modelKind } = useSettingsPopup()
const catalog = useModelCatalog(modelKind)
const kinds = [{ id:'text', label:'文本' }, { id:'image', label:'图片' }, { id:'video', label:'视频' }]
</script>
<template>
  <div class="model-settings">
    <nav :aria-label="tr('模型类型')" class="model-settings-kinds"><button v-for="kind in kinds" :key="kind.id" type="button" :aria-pressed="modelKind === kind.id" @click="modelKind = kind.id">{{ tr(kind.label) }}</button></nav>
    <ApiSettingsPanel v-if="modelKind === 'text'" manage />
    <ImageModelPicker v-else-if="modelKind === 'image'" manage :model-value="catalog.selectedId.value" :configs="catalog.configs.value" @update:model-value="catalog.select" @configs-updated="catalog.refresh" />
    <VideoModelPicker v-else manage :model-value="catalog.selectedId.value" :configs="catalog.configs.value" @update:model-value="catalog.select" @configs-updated="catalog.refresh" />
    <p v-if="catalog.error.value" role="alert">{{ tr(catalog.error.value) }}</p>
  </div>
</template>
<style scoped>
.model-settings { min-width:0; }
.model-settings-kinds { display:flex;gap:18px;margin-bottom:20px;border-bottom:1px solid var(--hairline-soft); }
.model-settings-kinds button { padding:8px 2px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--text-secondary);font:14px/1.5 var(--font-sans);cursor:pointer; }
.model-settings-kinds button[aria-pressed=true] { border-bottom-color:var(--text-primary);color:var(--text-primary); }
.model-settings-kinds button:focus-visible { outline:2px solid var(--accent);outline-offset:2px; }
</style>
