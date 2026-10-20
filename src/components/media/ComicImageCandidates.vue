<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Check, ChevronLeft, ChevronRight, Columns2, X } from 'lucide-vue-next'

const props = defineProps({
  panelId: { type: String, required: true },
  panelOrder: Number,
  stageLabel: { type: String, default: '' },
  selectLabel: { type: String, default: '选用这张' },
  selectedLabel: { type: String, default: '已选用' },
  takes: { type: Array, default: () => [] },
  currentImage: { type: Object, default: null }
})
const emit = defineEmits(['select'])
const dialog = ref(null)
const previewId = ref('')
const compare = ref(false)
const preview = computed(() => props.takes.find(take => take.id === previewId.value))
const previewIndex = computed(() => props.takes.findIndex(take => take.id === previewId.value))
const isCurrent = computed(() => preview.value?.id === props.currentImage?.id)

async function open(take) {
  previewId.value = take.id
  compare.value = false
  await nextTick()
  dialog.value?.showModal()
}
function close() { dialog.value?.close() }
function step(offset) {
  const take = props.takes[previewIndex.value + offset]
  if (take) previewId.value = take.id
}
// A preview belongs to its original panel, even when the surrounding inspector changes.
watch(() => props.panelId, close)
watch(preview, take => { if (!take) close() })
</script>

<template>
  <section v-if="takes.length" class="comic-candidates" aria-label="图片候选">
    <header><span>候选图片</span><span>{{ takes.length }}</span></header>
    <div class="comic-candidates__strip">
      <button v-for="(take, index) in takes" :key="take.id" type="button"
        :class="{ 'is-current': take.id === currentImage?.id }"
        :aria-label="`查看候选 ${index + 1}${take.id === currentImage?.id ? `，${selectedLabel}` : ''}`"
        :title="`查看候选 ${index + 1}`" @click="open(take)">
        <img :src="take.data" alt="" />
        <span class="comic-candidates__number">{{ index + 1 }}</span>
        <Check v-if="take.id === currentImage?.id" :size="13" class="comic-candidates__check" aria-hidden="true" />
      </button>
    </div>
    <dialog ref="dialog" class="comic-candidates__dialog" aria-label="查看漫画候选" @click="($event.target === dialog) && close()" @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)">
      <template v-if="preview">
        <header>
          <strong>第 {{ panelOrder }} 格 {{ stageLabel }}<span>候选 {{ previewIndex + 1 }} / {{ takes.length }}</span></strong>
          <button v-if="currentImage && !isCurrent" type="button" :aria-pressed="compare" title="与当前画面对比" aria-label="与当前画面对比" @click="compare = !compare"><Columns2 :size="18" /></button>
          <button type="button" title="关闭" aria-label="关闭候选预览" @click="close"><X :size="18" /></button>
        </header>
        <div class="comic-candidates__images" :class="{ 'is-comparing': compare && currentImage && !isCurrent }">
          <figure v-if="compare && currentImage && !isCurrent"><figcaption>当前画面</figcaption><img :src="currentImage.data" alt="当前选用的画面" /></figure>
          <figure><figcaption v-if="compare && currentImage && !isCurrent">候选 {{ previewIndex + 1 }}</figcaption><img :src="preview.data" :alt="`第 ${panelOrder} 格候选 ${previewIndex + 1}`" /></figure>
        </div>
        <footer>
          <div class="comic-candidates__navigation">
            <button type="button" aria-label="上一个候选" :disabled="previewIndex <= 0" @click="step(-1)"><ChevronLeft :size="18" /></button>
            <button type="button" aria-label="下一个候选" :disabled="previewIndex >= takes.length - 1" @click="step(1)"><ChevronRight :size="18" /></button>
          </div>
          <button class="comic-candidates__adopt" type="button" :disabled="isCurrent" @click="emit('select', preview.id)">{{ isCurrent ? selectedLabel : selectLabel }}</button>
        </footer>
      </template>
    </dialog>
  </section>
</template>

<style scoped>
.comic-candidates { min-width: 0; padding-block: 16px; }
.comic-candidates > header { display: flex; justify-content: space-between; color: var(--text-secondary); font: 13px/1.5 var(--font-sans); margin-bottom: 10px; }
.comic-candidates__strip { display: flex; gap: 8px; overflow-x: auto; padding: 2px; scrollbar-width: thin; }
.comic-candidates__strip button { position: relative; flex: 0 0 76px; height: 76px; padding: 0; border: 1px solid var(--hairline-soft); border-radius: 5px; overflow: hidden; background: var(--surface-workbench-muted); cursor: pointer; }
.comic-candidates__strip button.is-current { outline: 1px solid var(--text-primary); outline-offset: 1px; }
.comic-candidates__strip img { width: 100%; height: 100%; object-fit: contain; }
.comic-candidates__number, .comic-candidates__check { position: absolute; bottom: 3px; padding: 2px 4px; background: var(--surface-workbench-canvas); color: var(--text-primary); border-radius: 3px; font: 11px/1.3 var(--font-sans); }
.comic-candidates__number { left: 3px; }
.comic-candidates__check { right: 3px; box-sizing: content-box; }
.comic-candidates__dialog { position: fixed; inset: 0; margin: auto; width: min(1040px, calc(100vw - 40px)); max-width: none; max-height: calc(100dvh - 40px); padding: 0; border: 1px solid var(--hairline-soft); border-radius: 12px; background: var(--surface-workbench-canvas); color: var(--text-primary); box-shadow: var(--shadow-workbench); font-family: var(--font-sans); }
.comic-candidates__dialog::backdrop { background: var(--surface-workbench-scrim, var(--surface-overlay)); }
.comic-candidates__dialog > header, .comic-candidates__dialog > footer { display: flex; align-items: center; gap: 8px; padding: 14px 20px; }
.comic-candidates__dialog strong { flex: 1; font-size: 14px; font-weight: 600; }
.comic-candidates__dialog strong span { margin-left: 16px; color: var(--text-secondary); font-weight: 400; }
.comic-candidates__dialog button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; padding: 6px; border: 0; border-radius: 5px; color: var(--text-secondary); background: transparent; cursor: pointer; font: 13px var(--font-sans); }
.comic-candidates__dialog button:hover:not(:disabled), .comic-candidates__dialog button[aria-pressed="true"] { background: var(--nav-hover); color: var(--text-primary); }
.comic-candidates__dialog button:disabled { opacity: .5; cursor: default; }
.comic-candidates button:focus-visible { outline: 2px solid var(--workbench-focus); outline-offset: 2px; }
.comic-candidates__images { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 16px 20px; background: var(--surface-workbench-muted); }
.comic-candidates__images.is-comparing { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.comic-candidates__images figure { display: flex; min-width: 0; flex-direction: column; gap: 10px; margin: 0; }
.comic-candidates__images figcaption { color: var(--text-secondary); font-size: 12px; }
.comic-candidates__images img { display: block; width: 100%; height: min(56dvh, 620px); object-fit: contain; }
.comic-candidates__navigation { display: flex; gap: 4px; margin-right: auto; }
.comic-candidates__dialog .comic-candidates__adopt { padding-inline: 18px; color: var(--workbench-action-text); background: var(--workbench-action); }
.comic-candidates__dialog .comic-candidates__adopt:hover:not(:disabled) { color: var(--workbench-action-text); background: var(--workbench-action-hover); }
@media (max-width: 640px) {
  .comic-candidates__dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); }
  .comic-candidates__dialog > header, .comic-candidates__dialog > footer, .comic-candidates__images { padding: 12px; }
  .comic-candidates__images.is-comparing { grid-template-columns: minmax(0, 1fr); }
  .comic-candidates__images.is-comparing img { height: 23dvh; }
  .comic-candidates__dialog button { min-height: 44px; min-width: 44px; }
}
</style>
