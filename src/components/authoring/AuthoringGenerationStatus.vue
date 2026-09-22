<template>
  <div class="authoring-generation-status" role="status" aria-live="polite">
    <span>{{ tr(label) }}</span>
    <span aria-hidden="true">{{ tr('已等待 {seconds} 秒', { seconds: elapsed }) }}</span>
    <small v-if="elapsed >= 15">{{ tr("暂未完成，仍在等待模型返回；可以随时停止。") }}</small>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { onBeforeUnmount, ref } from 'vue'

defineProps({ label: { type: String, default: '正在生成推演稿…' } })
const elapsed = ref(0)
const startedAt = Date.now()
const timer = setInterval(() => { elapsed.value = Math.floor((Date.now() - startedAt) / 1000) }, 1000)
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.authoring-generation-status { display: flex; flex-wrap: wrap; gap: 4px 12px; padding-block: 10px; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.authoring-generation-status > span:first-child { color: var(--text-primary); }
.authoring-generation-status small { flex-basis: 100%; font-size: inherit; }
</style>
