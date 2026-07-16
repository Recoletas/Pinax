<template>
  <div class="time-quick-rail" aria-label="当前时间摘要">
    <div class="time-quick-rail__row">
      <span>纪年</span>
      <strong>{{ eraLabel }}</strong>
    </div>
    <div class="time-quick-rail__row">
      <span>日期</span>
      <strong>{{ dateLabel }}</strong>
    </div>
    <p v-if="isEmpty" class="time-quick-rail__hint">
      尚未登记纪年。打开详情后可为本次冒险设定时间锚点。
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()

onMounted(() => {
  if (typeof gameStore.loadWritingTime === 'function') {
    gameStore.loadWritingTime()
  }
})

const time = computed(() => gameStore.writingTime || {})

const eraLabel = computed(() => {
  const era = String(time.value.eraName || '').trim()
  const year = String(time.value.year || '').trim()
  if (era && year) return `${era} ${year}年`
  if (era) return era
  if (year) return `${year}年`
  return '未登记'
})

const dateLabel = computed(() => {
  const month = String(time.value.month || '').trim()
  const day = String(time.value.day || '').trim()
  if (month && day) return `${month}月${day}日`
  if (month) return `${month}月`
  if (day) return `${day}日`
  return '待设定'
})

const isEmpty = computed(() => {
  return !String(time.value.eraName || '').trim()
    && !String(time.value.year || '').trim()
    && !String(time.value.month || '').trim()
    && !String(time.value.day || '').trim()
})
</script>

<style scoped>
.time-quick-rail {
  display: grid;
  gap: 7px;
}

.time-quick-rail__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
}

.time-quick-rail__row span {
  color: var(--text-muted);
  font-size: 11px;
}

.time-quick-rail__row strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-quick-rail__hint {
  margin: 0;
  padding: 7px 9px;
  border: 1px dashed color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}
</style>
