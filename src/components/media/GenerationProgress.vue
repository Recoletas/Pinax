<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
const props = defineProps({ startedAt: Number, label: { type: String, default: '正在生成画面' }, completed: Number, total: Number })
const now = ref(Date.now())
const timer = setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(timer))
const elapsed = computed(() => Math.max(0, Math.floor((now.value - (props.startedAt || now.value)) / 1000)))
const progress = computed(() => props.total > 0 ? Math.round((props.completed || 0) / props.total * 100) : null)
</script>
<template>
  <div class="generation-progress" role="status" aria-live="polite">
    <div><span>{{ label }}</span><span>{{ total ? `${completed || 0} / ${total} · ${progress}%` : `${elapsed} 秒` }}</span></div>
    <progress :value="progress ?? undefined" max="100" :aria-label="label"></progress>
  </div>
</template>
<style scoped>
.generation-progress { padding: 12px 0; color: var(--text-secondary); font: 12px/1.5 var(--font-interface); }
.generation-progress > div { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 7px; }
progress { display: block; width: 100%; height: 3px; border: 0; accent-color: var(--accent); border-radius: 2px; }
</style>
