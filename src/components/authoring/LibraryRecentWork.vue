<script setup>
import { computed } from 'vue'
import { tr, uiLocale } from '../../i18n/index.js'

const props = defineProps({
  entries: { type: Array, default: () => [] },
  continueEntry: { type: Object, default: null },
  openingKey: { type: String, default: '' }
})
defineEmits(['open'])
const recentEntries = computed(() => [props.continueEntry, ...props.entries.filter(entry => entry.key !== props.continueEntry?.key)].filter(Boolean).slice(0, 4))
function detail(entry) {
  const title = entry.object?.title
  const surface = entry.object?.kind === 'exploration' ? tr('速记') : tr(entry.surfaceLabel)
  const parts = title ? [title, surface] : [surface]
  if (entry.object?.kind === 'comic-page' && Number.isInteger(entry.panelNumber) && entry.panelNumber > 0) parts.push(tr('第 {count} 格', { count: entry.panelNumber }))
  return parts.join(' · ')
}
function timeLabel(entry) {
  return new Date(entry.lastUsedAt).toLocaleString(uiLocale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function unavailableLabel(entry) {
  return tr(entry.reason === 'lookup-failed' ? '暂时无法读取这个位置' : '这个位置已不存在')
}
</script>

<template>
  <section v-if="recentEntries.length" class="library-recent" :aria-label="tr('最近打开')">
    <header><h2>{{ tr('最近打开') }}</h2></header>
    <ul><li v-for="(entry, index) in recentEntries" :key="entry.key">
      <button type="button" :data-test="index === 0 ? 'welcome-continue-book' : undefined" :disabled="!entry.available || openingKey === entry.key" @click="$emit('open', entry)">
        <span class="library-recent__name"><strong :title="entry.bookTitle">{{ entry.bookTitle || tr('未命名书稿') }}</strong><small v-if="!entry.available">{{ unavailableLabel(entry) }}</small></span>
        <span class="library-recent__location" :title="detail(entry)">{{ detail(entry) }}</span>
        <time :datetime="new Date(entry.lastUsedAt).toISOString()">{{ timeLabel(entry) }}</time>
      </button>
    </li></ul>
  </section>
</template>

<style scoped>
.library-recent { margin: 0 0 32px; color: var(--text-primary); }
.library-recent header { padding-block: 4px 10px; }
.library-recent h2 { margin: 0; font: 500 16px/1.5 var(--font-sans); }
.library-recent ul { margin: 0; padding: 0; list-style: none; }
.library-recent button { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto; gap: 20px; align-items: center; width: 100%; min-height: 46px; padding: 10px 0; border: 0; border-bottom: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; color: inherit; font: 14px/1.5 var(--font-sans); text-align: start; cursor: pointer; }
.library-recent__name { display: grid; min-width: 0; gap: 3px; }
.library-recent strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.library-recent__location { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 13px; }
.library-recent time { color: var(--text-muted); font-size: 12px; white-space: nowrap; }
.library-recent small { color: var(--signal-warm); font-size: 12px; }
.library-recent button:disabled { cursor: default; }
.library-recent button:not(:disabled):hover strong { color: var(--accent); }
.library-recent button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 520px) {
  .library-recent button { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; min-height: 58px; }
  .library-recent__location { grid-column: 1; grid-row: 2; }
  .library-recent time { grid-column: 2; grid-row: 1 / 3; font-size: 11px; }
}
</style>
