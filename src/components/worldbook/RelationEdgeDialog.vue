<template>
  <Teleport to="body">
    <!-- 遮罩模式对齐 MilestoneModal 的全局弹窗写法（Teleport + fixed 遮罩 + click.self 关闭）；
         令牌沿用 worldbook 组件的 --bg/--border/--text 变量与全局 ghost-btn/primary-btn -->
    <div v-if="open" class="relation-edge-overlay" @click.self="cancel">
      <div
        ref="cardRef"
        class="relation-edge-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="tr('新建关系边')"
        tabindex="-1"
        @keydown.esc="cancel"
      >
        <header class="relation-edge-head">
          <p class="relation-edge-kicker">{{ tr('图谱建边') }}</p>
          <h3 class="relation-edge-title">{{ tr('{from} → {to}', { from: fromName, to: toName }) }}</h3>
        </header>

        <label class="relation-edge-field">
          <span class="relation-edge-label">{{ tr('类型') }}</span>
          <select v-model="draft.type" class="select-input">
            <option value="">{{ tr('未指定') }}</option>
            <option v-for="typeValue in typeValues" :key="typeValue" :value="typeValue">{{ tr(typeValue) }}</option>
          </select>
        </label>

        <div class="relation-edge-field">
          <span class="relation-edge-label">{{ tr('立场') }}</span>
          <div class="relation-edge-segments" role="radiogroup" :aria-label="tr('立场')">
            <button
              v-for="stance in stanceValues"
              :key="stance"
              type="button"
              role="radio"
              :aria-checked="draft.stance === stance"
              :class="['segment-btn', { on: draft.stance === stance }]"
              @click="toggleStance(stance)"
            >
              {{ tr(stance) }}
            </button>
          </div>
        </div>

        <label class="relation-edge-toggle">
          <input v-model="draft.covert" type="checkbox" />
          <span>{{ tr('暗线') }}</span>
        </label>

        <label class="relation-edge-field relation-edge-weight">
          <span class="relation-edge-label">{{ tr('权重（1-5）') }}</span>
          <input v-model.number="draft.weight" class="text-input" type="number" min="1" max="5" step="1" />
        </label>

        <footer class="relation-edge-actions">
          <button type="button" class="ghost-btn" @click="cancel">{{ tr('取消') }}</button>
          <button type="button" class="primary-btn" @click="confirmEdge">{{ tr('建边') }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import {
  RELATION_STANCE_VALUES,
  RELATION_TYPE_VALUES
} from '../../services/worldbook/entryRelations.js'

/**
 * W2·G2 图谱建边小对话框：GraphCanvas 的 create-edge 落地前的属性补全。
 * 枚举单源于 entryRelations（10 类型 / 3 立场），weight 默认 2、步进 1-5，
 * 确认即 emit('confirm', { type, stance, covert, weight }) 并自关（v-model:open）。
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  fromName: { type: String, default: '' },
  toName: { type: String, default: '' }
})

const emit = defineEmits(['update:open', 'confirm'])

const typeValues = RELATION_TYPE_VALUES
const stanceValues = RELATION_STANCE_VALUES
const cardRef = ref(null)

// 每次打开重置为默认值，避免上一次的补全残留
const draft = reactive({ type: '', stance: '', covert: false, weight: 2 })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    draft.type = ''
    draft.stance = ''
    draft.covert = false
    draft.weight = 2
    nextTick(() => cardRef.value?.focus())
  }
)

function toggleStance(stance) {
  draft.stance = draft.stance === stance ? '' : stance
}

function clampWeight(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 2
  return Math.min(5, Math.max(1, n))
}

function cancel() {
  emit('update:open', false)
}

function confirmEdge() {
  emit('confirm', {
    type: String(draft.type || ''),
    stance: stanceValues.includes(draft.stance) ? draft.stance : '',
    covert: draft.covert === true,
    weight: clampWeight(draft.weight)
  })
  emit('update:open', false)
}
</script>

<style scoped>
.relation-edge-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.relation-edge-dialog {
  width: min(360px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 12px;
  background: var(--bg-secondary, var(--surface-primary));
  color: var(--text-primary);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
  outline: none;
}

.relation-edge-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.relation-edge-kicker {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.relation-edge-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}

.relation-edge-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.relation-edge-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.relation-edge-field .select-input,
.relation-edge-field .text-input {
  width: 100%;
  box-sizing: border-box;
  color: var(--text-primary);
}

.relation-edge-segments {
  display: flex;
  gap: 6px;
}

.segment-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.segment-btn.on {
  border-color: var(--accent, var(--border));
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent, #b09a5f) 14%, transparent);
}

.relation-edge-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
}

.relation-edge-weight { max-width: 160px; }

.relation-edge-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

@media (pointer: coarse) {
  .relation-edge-actions button,
  .segment-btn { min-height: 44px; }
}
</style>
