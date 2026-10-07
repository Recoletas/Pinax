<script setup>
import { tr } from '../../i18n/index.js'
import { getAssetKindLabel } from '../../services/media/narrativeAssets'

// 检查器「素材」页：只显示可直接用于当前稿面的收件箱内容，完整库与收件箱
// 仍由宿主页面的入口打开。
defineProps({
  assets: { type: Array, default: () => [] }
})
const emit = defineEmits(['open-asset', 'open-inbox', 'open-library'])
</script>

<template>
  <div class="writing-inspector__body" data-authoring-inspector="materials">
    <p class="writing-inspector__context"><strong>{{ tr('写作素材') }}</strong><span>{{ tr('这里只显示可直接用于当前稿面的收件箱内容') }}</span></p>
    <div v-if="assets.length" class="writing-inspector-simple-list">
      <button
        v-for="asset in assets.slice(0, 12)"
        :key="asset.id"
        type="button"
        @click="emit('open-asset', asset)"
      ><strong>{{ asset.title || tr('未命名素材') }}</strong><span>{{ getAssetKindLabel(asset.kind) }}</span></button>
    </div>
    <div v-else class="writing-inspector__actions">
      <span>{{ tr('当前收件箱没有素材。') }}</span>
      <button type="button" @click="emit('open-inbox')">{{ tr('打开收件箱') }}</button>
    </div>
    <div class="writing-inspector__actions">
      <button type="button" @click="emit('open-library')">{{ tr('打开完整素材库') }}</button>
    </div>
  </div>
</template>
