<template>
  <section v-if="items.length" class="assistant-message-queue" :aria-label="tr('待发送消息')">
    <header><span>{{ tr('待发送') }} · {{ items.length }}</span><button v-if="!busy" type="button" :aria-label="tr('继续发送队列')" :title="tr('继续发送队列')" @click="$emit('resume')"><WorkbenchIcon name="arrow-right" :size="15" /></button></header>
    <div v-for="item in items" :key="item.id" class="assistant-message-queue__item">
      <p :title="item.question">{{ item.question }}</p>
      <span v-if="item.status !== 'waiting'" class="assistant-message-queue__status">{{ tr('等待接收') }}</span>
      <template v-else>
        <button type="button" :disabled="hasDraft" :aria-label="tr('编辑待发送消息')" :title="tr('编辑待发送消息')" @click="$emit('edit', item.id)"><WorkbenchIcon name="pencil" :size="14" /></button>
        <button type="button" :aria-label="tr('移除待发送消息')" :title="tr('移除待发送消息')" @click="$emit('remove', item.id)"><WorkbenchIcon name="close" :size="15" /></button>
      </template>
    </div>
  </section>
</template>
<script setup>
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
defineProps({ items: { type: Array, default: () => [] }, busy: Boolean, hasDraft: Boolean })
defineEmits(['edit', 'remove', 'resume'])
</script>
<style scoped>
.assistant-message-queue { padding: 0 4px 10px; color: var(--text-secondary); font-size: 12px; }
.assistant-message-queue header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.assistant-message-queue__item { display: flex; align-items: center; gap: 6px; padding-block: 5px; }
.assistant-message-queue__item p { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.6; }
.assistant-message-queue button { display: grid; flex: none; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: 5px; background: transparent; color: inherit; cursor: pointer; }
.assistant-message-queue button:hover { background: var(--nav-hover); color: var(--text-primary); }
.assistant-message-queue button:disabled { opacity: .35; cursor: default; }
.assistant-message-queue button:focus-visible { outline: 2px solid var(--workbench-focus); }
.assistant-message-queue__status { color: var(--text-muted); font-size: 11px; }
@media (pointer: coarse) { .assistant-message-queue button { width: 44px; height: 44px; } }
</style>
