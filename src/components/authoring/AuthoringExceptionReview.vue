<script setup>
import { computed, ref, watch } from 'vue'

// 异常审阅：只列出 locked-conflict / identity-ambiguity / destructive-retcon。
// 破坏性回溯的「采用正文派生」需要第二次显式确认。
const props = defineProps({
  exceptions: { type: Array, default: () => [] },
  open: Boolean
})
const emit = defineEmits(['resolve', 'close'])

const REASON_LABELS = {
  'locked-conflict': '与锁定设定冲突',
  'identity-ambiguity': '人物身份歧义',
  'destructive-retcon': '破坏性回溯'
}

const confirmRetconId = ref(null)
const dismissed = ref(false)

const items = computed(() => (Array.isArray(props.exceptions) ? props.exceptions : []))
const itemKey = computed(() => items.value.map((item) => String(item?.id || '')).join('|'))
const visible = computed(() => props.open && items.value.length > 0 && !dismissed.value)

watch(() => props.open, (open) => {
  if (!open) dismissed.value = false
})
watch(itemKey, () => {
  dismissed.value = false
  confirmRetconId.value = null
})

function closeReview() {
  dismissed.value = true
  confirmRetconId.value = null
  emit('close')
}

function requestAdoption(item) {
  if (item?.reason !== 'destructive-retcon') {
    emit('resolve', item.id, 'adopt-derived')
    return
  }
  confirmRetconId.value = confirmRetconId.value === item.id ? null : item.id
}

function confirmAdoption(item) {
  confirmRetconId.value = null
  emit('resolve', item.id, 'adopt-derived')
}

function keepLocked(item) {
  confirmRetconId.value = null
  emit('resolve', item.id, 'keep-locked')
}

function deferItem(item) {
  confirmRetconId.value = null
  emit('resolve', item.id, 'defer')
}
</script>

<template>
  <section v-if="visible" class="authoring-exception-review" aria-label="派生信息异常审阅">
    <header class="authoring-exception-review__head">
      <strong>注意 · 需要你决定的派生信息</strong>
      <button type="button" class="authoring-exception-review__dismiss" aria-label="关闭异常审阅" @click="closeReview">×</button>
    </header>
    <article v-for="item in items" :key="item.id" class="authoring-exception-review__item">
      <span class="authoring-exception-review__reason">{{ REASON_LABELS[item.reason] || item.reason }}</span>
      <p class="authoring-exception-review__summary">{{ item.summary }}</p>
      <div class="authoring-exception-review__actions">
        <button type="button" @click="keepLocked(item)">保留锁定设定</button>
        <button
          type="button"
          @click="requestAdoption(item)"
        >采用正文派生</button>
        <button type="button" @click="deferItem(item)">稍后处理</button>
      </div>
      <p v-if="confirmRetconId === item.id" class="authoring-exception-review__confirm">
        这会覆盖已锁定的既有设定，确定采用正文派生的版本？
        <button type="button" @click="confirmAdoption(item)">确认覆盖</button>
        <button type="button" @click="confirmRetconId = null">取消</button>
      </p>
    </article>
  </section>
</template>

<style scoped>
.authoring-exception-review {
  display: grid;
  margin: 0 0 10px;
  padding: 0 2px;
  border-block: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.authoring-exception-review__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  font-size: 13px;
}

.authoring-exception-review__dismiss,
.authoring-exception-review__actions button,
.authoring-exception-review__confirm button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.authoring-exception-review__dismiss {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 18px;
}

.authoring-exception-review__item {
  padding: 11px 0 12px;
  border-top: 1px solid var(--border-subtle);
}

.authoring-exception-review__reason {
  color: var(--signal-danger, var(--text-secondary));
  font-size: 11px;
}

.authoring-exception-review__summary {
  margin: 5px 0 8px;
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.authoring-exception-review__actions,
.authoring-exception-review__confirm {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
}

.authoring-exception-review__actions button,
.authoring-exception-review__confirm button {
  min-height: 44px;
  padding: 4px 0;
  font-size: 12px;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.authoring-exception-review__confirm {
  align-items: center;
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.authoring-exception-review__dismiss:hover,
.authoring-exception-review__actions button:hover,
.authoring-exception-review__confirm button:hover {
  color: var(--accent-primary);
}

.authoring-exception-review__actions button:focus-visible,
.authoring-exception-review__confirm button:focus-visible,
.authoring-exception-review__dismiss:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
</style>
