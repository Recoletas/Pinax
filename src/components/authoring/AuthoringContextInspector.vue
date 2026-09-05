<script setup>
import { computed, ref } from 'vue'
import { trapFocusWithin, useTransientLayer } from '../../composables/useTransientLayer'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'

// 上下文说明：只接收低敏感度的 context ledger（来源、状态、字数、来源引用），
// 永远不接收消息原文、完整 prompt 或 provider 推理链。
const props = defineProps({
  open: Boolean,
  ledger: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const panelRef = ref(null)
const closeRef = ref(null)
const isOpen = computed(() => props.open)

useBodyScrollLock(isOpen)
useTransientLayer({
  id: 'authoring-context-inspector',
  isOpen,
  onClose: () => emit('close'),
  initialFocus: () => closeRef.value
})

const KIND_LABELS = {
  character: '人物',
  place: '地点',
  relation: '关系',
  event: '事件',
  timeline: '时间线',
  memory: '记忆',
  worldbook: '世界书',
  outline: '章节纲要',
  prose: '章节正文',
  reference: '续写参考'
}

const STATUS_LABELS = {
  included: '已采用',
  truncated: '已截断',
  dropped: '已弃用',
  excluded: '已排除'
}

const REASON_LABELS = {
  'relevance-above-threshold': '相关度达标',
  'below-threshold': '相关度不足',
  scope: '范围外',
  'source-stale': '来源已过期',
  status: '状态不可召回',
  'per-scope-cap': '单范围内数量上限',
  'top-k': '超出总量上限',
  'within-budget': '预算内保留',
  'budget-exhausted': '预算耗尽',
  'lower-priority-than-retained-context': '优先级低于保留内容',
  'priority-block-retained-partially': '按优先级部分保留'
}

const SCORE_DIMENSION_LABELS = [
  ['relevance', '相关'],
  ['importance', '重要'],
  ['authority', '权威'],
  ['recency', '新近'],
  ['scopeFit', '范围']
]

const parts = computed(() => (Array.isArray(props.ledger?.parts) ? props.ledger.parts : []))

function kindLabel(kind) {
  return KIND_LABELS[kind] || String(kind || '来源')
}

function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || '')
}

function reasonLabel(reason) {
  return REASON_LABELS[reason] || String(reason || '')
}

function scoreLabel(score) {
  if (!score || typeof score !== 'object') return ''
  const segments = []
  for (const [key, label] of SCORE_DIMENSION_LABELS) {
    const value = Number(score[key])
    if (Number.isFinite(value)) segments.push(`${label} ${value.toFixed(2)}`)
  }
  const final = Number(score.final)
  if (Number.isFinite(final)) segments.push(`综合 ${final.toFixed(2)}`)
  return segments.join(' · ')
}

function recallAuditLabel(audit) {
  if (!audit || typeof audit !== 'object' || !audit.byReason) return ''
  const segments = Object.entries(audit.byReason).map(([reason, count]) => `${reasonLabel(reason)} ×${count}`)
  return segments.length ? `排除 ${audit.excludedCount ?? ''}：${segments.join('，')}` : ''
}

function sourceLabel(sourceRefs) {
  const list = (Array.isArray(sourceRefs) ? sourceRefs : []).map(String).filter(Boolean)
  if (!list.length) return ''
  return `来源 ${list.slice(0, 3).join(' · ')}${list.length > 3 ? ' 等' : ''}`
}
</script>

<template>
  <div
    v-if="open"
    class="authoring-context-inspector"
    role="dialog"
    aria-modal="true"
    aria-label="上下文说明"
    @keydown="trapFocusWithin($event, panelRef)"
  >
    <div class="authoring-context-inspector__backdrop" @click="emit('close')"></div>
    <section ref="panelRef" class="authoring-context-inspector__panel">
      <header class="authoring-context-inspector__head">
        <strong>本次创作采用的上下文</strong>
        <button
          ref="closeRef"
          type="button"
          class="authoring-context-inspector__close"
          aria-label="关闭上下文说明"
          @click="emit('close')"
        >×</button>
      </header>
      <p v-if="!parts.length" class="authoring-context-inspector__empty">当前没有需要说明的上下文。</p>
      <ul v-else class="authoring-context-inspector__list">
        <li v-for="(part, index) in parts" :key="`${part.kind}-${index}`" class="authoring-context-inspector__item">
          <span class="authoring-context-inspector__kind">{{ kindLabel(part.kind) }}</span>
          <span class="authoring-context-inspector__status">{{ statusLabel(part.status) }}</span>
          <span class="authoring-context-inspector__chars">{{ Number(part.chars || 0).toLocaleString() }} 字</span>
          <span v-if="part.sourceRefs?.length" class="authoring-context-inspector__refs">{{ sourceLabel(part.sourceRefs) }}</span>
          <span v-if="part.entryId" class="authoring-context-inspector__refs">{{ part.entryId }}</span>
          <span v-if="reasonLabel(part.reason) && part.reason !== 'within-budget'" class="authoring-context-inspector__refs">{{ reasonLabel(part.reason) }}</span>
          <span v-if="scoreLabel(part.score)" class="authoring-context-inspector__refs">{{ scoreLabel(part.score) }}</span>
          <span v-if="recallAuditLabel(part.recallAudit)" class="authoring-context-inspector__refs">{{ recallAuditLabel(part.recallAudit) }}</span>
        </li>
      </ul>
      <footer class="authoring-context-inspector__foot">
        <button type="button" @click="emit('close')">知道了</button>
      </footer>
    </section>
  </div>
</template>
