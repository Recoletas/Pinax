<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { settingUsage } from '../../services/worldbook/settingUsageModel.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ bookId: String, worldbook: Object, entry: Object, targetTitle: String, canInsert: Boolean, busy: Boolean })
const emit = defineEmits(['locate', 'insert'])
const books = ref(loadWritingBooks())
const unsubscribe = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
onBeforeUnmount(unsubscribe)
const usage = computed(() => settingUsage(books.value.find(book => String(book.id) === props.bookId), props.worldbook, props.entry))
const expanded = ref(true), tab = ref('mentions'), height = ref(220), root = ref(null)
let drag = null
function start(event) { if (event.button !== 0) return; event.preventDefault(); drag = { y: event.clientY, height: height.value }; event.currentTarget.setPointerCapture(event.pointerId) }
function resize(event) { if (drag) height.value = Math.min(420, Math.max(120, drag.height + (drag.y - event.clientY) / (root.value?.getBoundingClientRect().height / root.value?.offsetHeight || 1))) }
function stop() { drag = null }
function resizeKey(event) { if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return; event.preventDefault(); height.value = event.key === 'Home' ? 220 : Math.min(420, Math.max(120, height.value + (event.key === 'ArrowUp' ? 24 : -24))) }
</script>
<template>
  <section ref="root" class="setting-usage" :class="{ 'is-collapsed': !expanded }" :style="{ '--usage-height': height + 'px' }" :aria-label="tr('设定使用情况')">
    <div v-if="expanded" class="setting-usage__resize" role="separator" tabindex="0" aria-orientation="horizontal" :aria-label="tr('调整设定底栏高度')" :aria-valuenow="height" aria-valuemin="120" aria-valuemax="420" @pointerdown="start" @pointermove="resize" @pointerup="stop" @pointercancel="stop" @lostpointercapture="stop" @keydown="resizeKey"></div>
    <header><div role="tablist" :aria-label="tr('设定底栏')"><button type="button" role="tab" :aria-selected="tab === 'mentions'" @click="tab = 'mentions'; expanded = true">{{ tr('正文提及') }}<small v-if="usage.hits.length">{{ usage.hits.length }}{{ usage.truncated ? '+' : '' }}</small></button><button type="button" role="tab" :aria-selected="tab === 'insert'" @click="tab = 'insert'; expanded = true">{{ tr('插入正文') }}</button></div><button type="button" class="setting-usage__toggle" :aria-label="tr(expanded ? '收起设定底栏' : '展开设定底栏')" :title="tr(expanded ? '收起设定底栏' : '展开设定底栏')" @click="expanded = !expanded"><WorkbenchIcon name="chevron-down" :size="16" :class="{ 'is-up': !expanded }" /></button></header>
    <div v-show="expanded" class="setting-usage__body" role="tabpanel">
      <template v-if="tab === 'mentions'"><p v-if="!bookId" class="setting-usage__empty">{{ tr('从作品中打开设定，即可查看正文中的提及。') }}</p><p v-else-if="!usage.hits.length" class="setting-usage__empty">{{ tr('正文中还没有提及这项设定。') }}</p><button v-for="hit in usage.hits" :key="hit.chapterId + ':' + hit.nodeId + ':' + hit.start" type="button" class="setting-usage__hit" :disabled="busy" @click="emit('locate', hit)"><WorkbenchIcon name="chapter" :size="15" /><span><strong>{{ hit.chapterTitle }}<small v-if="hit.ambiguous">{{ tr('同名匹配') }}</small></strong><span>{{ hit.before }}<mark>{{ hit.term }}</mark>{{ hit.after }}</span></span><WorkbenchIcon name="arrow-right" :size="14" /></button></template>
      <div v-else class="setting-usage__insert"><span>{{ entry?.name }}</span><p>{{ canInsert ? tr('插入「{title}」的光标处，可在正文撤销。', { title: targetTitle }) : tr('先打开一章正文，再从这里插入名称。') }}</p><button type="button" class="control-primary" :disabled="busy || !canInsert" @click="emit('insert')"><WorkbenchIcon name="plus" :size="15" />{{ tr('插入名称') }}</button></div>
    </div>
  </section>
</template>
<style scoped>
.setting-usage { position: relative; flex: none; height: min(var(--usage-height), 40vh); min-height: 120px; display: flex; flex-direction: column; border-top: 1px solid var(--hairline-soft); background: var(--surface-workbench); font: 13px/1.6 var(--font-interface); }
.setting-usage.is-collapsed { height: 42px; min-height: 42px; }
.setting-usage__resize { position: absolute; z-index: 2; top: -3px; inset-inline: 0; height: 6px; cursor: row-resize; touch-action: none; }
.setting-usage__resize:hover { background: var(--nav-focused); }
.setting-usage header { display: flex; flex: none; align-items: center; justify-content: space-between; min-height: 42px; padding: 0 20px; border-bottom: 1px solid var(--hairline-soft); }
.setting-usage [role=tablist] { display: flex; gap: 20px; }
.setting-usage button { border: 0; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.setting-usage [role=tab] { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 0; border-bottom: 2px solid transparent; }
.setting-usage [aria-selected=true] { color: var(--text-primary); border-bottom-color: var(--accent); }
.setting-usage small { font-size: 11px; color: var(--text-muted); }
.setting-usage__toggle { display: grid; place-items: center; width: 32px; min-height: 32px; border-radius: var(--radius-control); }
.setting-usage__toggle:hover { background: var(--nav-hover); }
.setting-usage__toggle .is-up { transform: rotate(180deg); }
.setting-usage__body { min-height: 0; flex: 1; overflow: auto; overscroll-behavior: contain; padding: 8px 12px; }
.setting-usage__hit { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; padding: 8px; text-align: start; border-radius: var(--radius-control); }
.setting-usage__hit:hover { background: var(--nav-hover); }
.setting-usage__hit > svg { flex: none; }
.setting-usage__hit > span { flex: 1; min-width: 0; }
.setting-usage__hit strong { display: flex; gap: 8px; color: var(--text-primary); font-weight: 500; }
.setting-usage__hit span > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: 12px; }
.setting-usage mark { color: var(--text-primary); background: var(--nav-selected-secondary); }
.setting-usage__empty { margin: 18px 8px; color: var(--text-muted); }
.setting-usage__insert { padding: 8px; }
.setting-usage__insert > span { font-weight: 600; color: var(--text-primary); }
.setting-usage__insert p { margin: 6px 0 12px; color: var(--text-muted); }
.setting-usage__insert .control-primary { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--radius-control); background: var(--control-accent-bg); color: var(--control-accent-text); }
.setting-usage button:disabled { opacity: .5; cursor: default; }
.setting-usage :is(button,.setting-usage__resize):focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 900px), (pointer: coarse) { .setting-usage header { padding-inline: 16px; } .setting-usage [role=tab], .setting-usage__toggle, .setting-usage__insert button { min-height: 44px; } }
</style>
