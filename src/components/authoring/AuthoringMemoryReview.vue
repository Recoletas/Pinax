<script setup>
import { computed } from 'vue'
import { tr, uiLocale } from '../../i18n/index.js'

// 受控记忆异常审阅：默认只列 pending 冲突 / 来源失效 / 身份歧义候选。
// 确认/拒绝/置顶/降权经 repository API；不弹逐条 modal，不做自动采纳。
const props = defineProps({
  open: Boolean,
  candidates: { type: Array, default: () => [] },
  canJumpSource: { type: Function, default: () => false }
})
const emit = defineEmits(['confirm', 'reject', 'pin', 'demote', 'supersede', 'merge', 'jump-source', 'close'])

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
    :aria-label="tr('记忆候选审阅')"
    role="dialog"
    aria-modal="false"
    tabindex="-1"
    @keydown.esc="closeOnEsc"
  >
    <header class="authoring-memory-review__head">
      <strong>{{ tr('记忆候选') }}</strong>
      <button
        type="button"
        class="authoring-memory-review__dismiss"
        :aria-label="tr('关闭记忆审阅')"
        @click="emit('close')"
      >×</button>
    </header>
    <article v-for="item in items" :key="item.id" class="authoring-memory-review__item">
      <span class="authoring-memory-review__reason">{{ tr(reasonLabel(item)) }}</span>
      <p class="authoring-memory-review__summary">{{ item.content }}</p>
      <p v-if="item.sourceRefs?.length" class="authoring-memory-review__source">
        {{ tr('来源：') }}{{ item.sourceRefs.join(uiLocale === 'en' ? ', ' : '、') }}
      </p>
      <div class="authoring-memory-review__actions">
        <button type="button" data-action="confirm-candidate" @click="emit('confirm', item.id)">{{ tr('确认') }}</button>
        <button type="button" data-action="reject-candidate" @click="emit('reject', item.id)">{{ tr('拒绝') }}</button>
        <button
          v-if="Array.isArray(item.conflictsWith) && item.conflictsWith.length"
          type="button"
          data-action="merge-candidate"
          @click="emit('merge', item.id)"
        >{{ tr('合并冲突项') }}</button>
        <button
          v-if="Array.isArray(item.conflictsWith) && item.conflictsWith.length"
          type="button"
          data-action="supersede-candidate"
          @click="emit('supersede', item.id)"
        >{{ tr('替换冲突项') }}</button>
        <button type="button" data-action="pin-candidate" @click="emit('pin', item.id)">{{ tr('置顶') }}</button>
        <button type="button" data-action="demote-candidate" @click="emit('demote', item.id)">{{ tr('降权') }}</button>
        <button
          v-if="item.sourceRefs?.some((ref) => props.canJumpSource(ref))"
          type="button"
          data-action="jump-source"
          @click="emit('jump-source', item)"
        >{{ tr('查看来源') }}</button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.authoring-memory-review {
  display: grid;
  margin: 0 0 10px;
  padding: 0 2px;
  border-block: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.authoring-memory-review__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  font-size: 13px;
}

.authoring-memory-review__dismiss,
.authoring-memory-review__actions button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.authoring-memory-review__dismiss {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 18px;
}

.authoring-memory-review__item {
  padding: 11px 0 12px;
  border-top: 1px solid var(--border-subtle);
}

.authoring-memory-review__reason {
  color: var(--text-secondary);
  font-size: 11px;
}

.authoring-memory-review__summary {
  margin: 5px 0;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.authoring-memory-review__source {
  margin: 0 0 8px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.authoring-memory-review__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
}

.authoring-memory-review__actions button {
  min-height: 44px;
  padding: 4px 0;
  font-size: 12px;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.authoring-memory-review__dismiss:hover,
.authoring-memory-review__actions button:hover {
  color: var(--accent-primary);
}

.authoring-memory-review__actions button:focus-visible,
.authoring-memory-review__dismiss:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}

@media (max-width: 760px) {
  .authoring-memory-review {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: var(--z-workbench-sheet, 60);
    max-height: 60dvh;
    margin: 0;
    padding: 0 16px calc(10px + env(safe-area-inset-bottom));
    overflow-y: auto;
    border-bottom: 0;
    background: var(--surface-workbench-raised, var(--surface-primary));
  }
}
</style>
