<template>
  <article
    class="setting-field-card"
    :class="[
      `control-${meta.controlType}`,
      {
        'is-forbidden': meta.entryType === 'forbidden',
        'has-draft': hasDraft,
        [`is-${dirty.state.value}`]: dirty.state.value !== 'pristine'
      }
    ]"
    :data-setting-field-card="`${section.key}.${field.key}`"
  >
    <div class="field-head">
      <div class="field-title-group">
        <label :for="inputId" class="field-label">{{ field.label }}</label>
        <span class="field-type-pill">{{ controlLabel }}</span>
      </div>
      <SettingFieldActions
        :field-label="field.label"
        :model-value="modelValue"
        :working="working"
        :has-draft="hasDraft"
        @generate="$emit('generate', payload)"
        @convert-entry="$emit('convert-entry', payload)"
      />
    </div>

    <component
      :is="FieldComponent"
      :model-value="modelValue"
      :input-id="inputId"
      :rows="meta.controlType === 'textarea' ? rows : undefined"
      :placeholder="meta.placeholder"
      :max-length="meta.maxLength"
      :delimiter="meta.delimiter"
      :parse-mode="meta.parseMode"
      :aria-required="false"
      :aria-invalid="false"
      @update:model-value="onUserInput"
    />

    <div v-if="dirty.state.value !== 'pristine'" class="field-status" :class="`is-${dirty.state.value}`">
      <span class="status-dot" aria-hidden="true"></span>
      <span class="status-text">{{ statusText }}</span>
    </div>

    <span
      v-if="hasDraft"
      class="draft-ready-dot"
      :aria-label="`字段「${field.label}」有 AI 草稿待采纳`"
      role="img"
    ></span>

    <p v-if="meta.controlType === 'textarea' && meta.maxLength" class="field-hint">
      {{ modelValue.length }} / {{ meta.maxLength }}
    </p>
  </article>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { getFieldMeta } from '../../services/settingPanelSchema'
import { useFieldDirty } from '../../composables/useFieldDirty'
import { useFieldUndo } from '../../composables/useFieldUndo'
import SettingFieldActions from './SettingFieldActions.vue'
import FieldTextarea from './fields/FieldTextarea.vue'
import FieldCharacterChips from './fields/FieldCharacterChips.vue'
import FieldRuleList from './fields/FieldRuleList.vue'
import FieldStyleTags from './fields/FieldStyleTags.vue'
import FieldForbiddenList from './fields/FieldForbiddenList.vue'

const props = defineProps({
  worldbookId: { type: [String, Number], required: true },
  section: { type: Object, required: true },
  field: { type: Object, required: true },
  modelValue: { type: String, default: '' },
  working: { type: Boolean, default: false },
  hasDraft: { type: Boolean, default: false },
  rows: { type: Number, default: 4 }
})

const emit = defineEmits(['update:modelValue', 'generate', 'convert-entry', 'saved'])

const dirtyRegistry = inject('dirtyRegistry', null)

const meta = computed(() => getFieldMeta(props.section.key, props.field.key) || {})

const inputId = computed(() => `setting-field-${props.section.key}-${props.field.key}`)

const FieldComponent = computed(() => {
  if (meta.value.controlType === 'textarea') return FieldTextarea
  if (meta.value.controlType === 'chips') return FieldCharacterChips
  if (meta.value.controlType === 'tags') return FieldStyleTags
  if (meta.value.controlType === 'list') {
    return meta.value.entryType === 'forbidden' ? FieldForbiddenList : FieldRuleList
  }
  return FieldTextarea
})

const payload = computed(() => ({
  sectionKey: props.section.key,
  fieldKey: props.field.key
}))

const lastCommitted = ref(props.modelValue)
const suppressedHistoryCommitValue = ref(null)
const dirty = useFieldDirty({
  worldbookId: props.worldbookId,
  sectionKey: props.section.key,
  fieldKey: props.field.key,
  dirtyRegistry: dirtyRegistry ? { add: (k) => dirtyRegistry.add(k), delete: (k) => dirtyRegistry.delete(k) } : null
})
const undo = useFieldUndo()

dirty.setOnCommit((checkpoint) => {
  if (suppressedHistoryCommitValue.value !== null && checkpoint.after === suppressedHistoryCommitValue.value) {
    suppressedHistoryCommitValue.value = null
  } else {
    suppressedHistoryCommitValue.value = null
    undo.push(checkpoint)
  }
  lastCommitted.value = checkpoint.after
  emit('saved', checkpoint.at)
})

onBeforeUnmount(() => {
  if (dirty.state.value !== 'pristine') {
    dirtyRegistry?.delete?.(dirty.key)
  }
})

// 外部 store 反向同步：仅在 pristine 时接受
watch(() => props.modelValue, (newVal) => {
  if (newVal === lastCommitted.value) return
  if (dirty.state.value === 'pristine') {
    lastCommitted.value = newVal
  }
  // dirty 状态时，外部 sync 跳过（用户输入优先）
})

function onUserInput(newVal) {
  // 用户输入：标记 dirty + emit
  if (newVal === lastCommitted.value) {
    dirty.cancel()
    dirty.markPristine()
    emit('update:modelValue', newVal)
    return
  }
  dirty.markDirty(newVal, lastCommitted.value)
  emit('update:modelValue', newVal)
}

function applyHistoryValue(value) {
  if (value == null) return
  emit('update:modelValue', value)
  if (value === lastCommitted.value) {
    dirty.cancel()
    dirty.markPristine()
    suppressedHistoryCommitValue.value = null
    return
  }
  suppressedHistoryCommitValue.value = value
  dirty.markDirty(value, lastCommitted.value)
}

const statusText = computed(() => {
  switch (dirty.state.value) {
    case 'dirty': return '未保存'
    case 'saving': return '保存中…'
    case 'saved': return '已保存'
    case 'error': return `保存失败${dirty.error.value ? `：${dirty.error.value}` : ''}`
    default: return ''
  }
})

const controlLabel = computed(() => {
  if (meta.value.entryType === 'forbidden') return '禁写'
  if (meta.value.controlType === 'chips') return '角色'
  if (meta.value.controlType === 'tags') return '标签'
  if (meta.value.controlType === 'list') return '清单'
  return '长文本'
})

defineExpose({
  flush: dirty.flush,
  cancel: dirty.cancel,
  undo: () => applyHistoryValue(undo.undo()),
  redo: () => applyHistoryValue(undo.redo()),
  state: dirty.state
})
</script>

<style scoped>
.setting-field-card {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 12px;
  padding: 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 98%, var(--bg-primary)), color-mix(in srgb, var(--bg-secondary) 92%, var(--bg-primary)));
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 10%, transparent) inset;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.setting-field-card:hover,
.setting-field-card:focus-within {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, #ffffff 12%, transparent) inset,
    0 10px 22px color-mix(in srgb, #000 6%, transparent);
}

.setting-field-card.is-dirty,
.setting-field-card.is-saving {
  border-color: color-mix(in srgb, var(--accent-amber, var(--accent)) 42%, var(--border));
}

.setting-field-card.is-saved {
  border-color: color-mix(in srgb, var(--success) 30%, var(--border));
}

.setting-field-card.is-forbidden {
  border-color: color-mix(in srgb, var(--danger) 34%, var(--border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--danger) 5%, var(--bg-secondary)), color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary)));
}

.field-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.field-title-group {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.field-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.field-type-pill {
  display: inline-flex;
  align-items: center;
  height: 19px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.is-forbidden .field-type-pill {
  border-color: color-mix(in srgb, var(--danger) 28%, var(--border));
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  color: var(--danger);
}

.field-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}

.field-status {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.draft-ready-dot {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--success);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--success) 16%, transparent),
    0 0 12px color-mix(in srgb, var(--success) 38%, transparent);
  cursor: help;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.field-status.is-dirty .status-dot {
  background: var(--accent-amber, var(--accent));
}

.field-status.is-saving .status-dot {
  background: var(--accent);
  animation: pulse 1s ease-in-out infinite;
}

.field-status.is-saved .status-dot {
  background: var(--success);
}

.field-status.is-error .status-dot {
  background: var(--danger);
}

.field-status.is-error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
