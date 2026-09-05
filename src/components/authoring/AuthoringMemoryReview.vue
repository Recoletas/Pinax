<script setup>
import { computed, ref } from 'vue'

// 受控记忆异常审阅：默认只列 pending 冲突 / 来源失效 / 身份歧义候选。
// 确认/拒绝/置顶/降权经 repository API；不弹逐条 modal，不做自动采纳。
const props = defineProps({
  open: Boolean,
  candidates: { type: Array, default: () => [] }
})
const emit = defineEmits(['confirm', 'reject', 'pin', 'demote', 'supersede', 'jump-source', 'close'])

const KIND_LABELS = {
  'author-preference': '作者偏好',
  'project-fact': '作品事实',
  'character-state': '角色状态',
  'plot-event': '剧情事件',
  'style-sample': '风格样本',
  'constraint': '约束'
}

const items = computed(() => (Array.isArray(props.candidates) ? props.candidates : []))

function reasonLabel(item) {
  if (item?.metadata?.staleReason) return '来源已变化'
  if (Array.isArray(item?.conflictsWith) && item.conflictsWith.length) return '与现有记忆冲突'
  return KIND_LABELS[item?.kind] || '待确认'
}

function closeOnEsc(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
  }
}
</script>

<template>
  <section
    v-if="open && items.length"
    class="authoring-memory-review"
    aria-label="记忆候选审阅"
    role="dialog"
    aria-modal="false"
    tabindex="-1"
    @keydown.esc="closeOnEsc"
  >
    <header class="authoring-memory-review__head">
      <strong>记忆候选</strong>
      <button
        type="button"
        class="authoring-memory-review__dismiss"
        aria-label="关闭记忆审阅"
        @click="emit('close')"
      >×</button>
    </header>
    <article v-for="item in items" :key="item.id" class="authoring-memory-review__item">
      <span class="authoring-memory-review__reason">{{ reasonLabel(item) }}</span>
      <p class="authoring-memory-review__summary">{{ item.content }}</p>
      <p v-if="item.sourceRefs?.length" class="authoring-memory-review__source">
        来源：{{ item.sourceRefs.join('、') }}
      </p>
      <div class="authoring-memory-review__actions">
        <button type="button" data-action="confirm-candidate" @click="emit('confirm', item.id)">确认</button>
        <button type="button" data-action="reject-candidate" @click="emit('reject', item.id)">拒绝</button>
        <button
          v-if="Array.isArray(item.conflictsWith) && item.conflictsWith.length"
          type="button"
          data-action="merge-candidate"
          @click="emit('merge', item.id)"
        >合并冲突项</button>
        <button
          v-if="Array.isArray(item.conflictsWith) && item.conflictsWith.length"
          type="button"
          data-action="supersede-candidate"
          @click="emit('supersede', item.id)"
        >替换冲突项</button>
        <button type="button" data-action="pin-candidate" @click="emit('pin', item.id)">置顶</button>
        <button type="button" data-action="demote-candidate" @click="emit('demote', item.id)">降权</button>
        <button
          v-if="item.sourceRefs?.length"
          type="button"
          data-action="jump-source"
          @click="emit('jump-source', item)"
        >查看来源</button>
      </div>
    </article>
  </section>
</template>
