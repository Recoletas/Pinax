<script setup>
import { computed, ref } from 'vue'

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

const items = computed(() => (Array.isArray(props.exceptions) ? props.exceptions : []))

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
  <section v-if="open && items.length" class="authoring-exception-review" aria-label="派生信息异常审阅">
    <header class="authoring-exception-review__head">
      <strong>需要你决定的派生信息</strong>
      <button type="button" class="authoring-exception-review__dismiss" aria-label="关闭异常审阅" @click="emit('close')">×</button>
    </header>
    <article v-for="item in items" :key="item.id" class="authoring-exception-review__item">
      <span class="authoring-exception-review__reason">{{ REASON_LABELS[item.reason] || item.reason }}</span>
      <p class="authoring-exception-review__summary">{{ item.summary }}</p>
      <div class="authoring-exception-review__actions">
        <button type="button" @click="keepLocked(item)">保留锁定设定</button>
        <button
          type="button"
          @click="requestAdoption(item)"
        >{{ item.reason === 'destructive-retcon' ? '采用正文派生' : '采用正文派生' }}</button>
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
