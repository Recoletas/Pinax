<script setup>
import { computed } from 'vue'
import { Check, CircleAlert, Image, LoaderCircle } from 'lucide-vue-next'
import { useComicRequestActivity } from '../../composables/comics/useComicRequestActivity.js'
import { resolveComicPanelDisplay } from '../../services/media/comicPanelDisplay.js'
import { COMIC_STAGE_LABELS } from '../../services/media/comicProductionService.js'
const props = defineProps({ page: { type: Object, required: true }, activePanelId: String })
const emit = defineEmits(['select'])
const activity = useComicRequestActivity()
const panels = computed(() => [...props.page.panels].sort((a, b) => a.order - b.order).map(panel => {
  const stages = Object.entries(panel.production || {})
  const runningStage = stages.find(([, state]) => activity.isActive(state.pendingRequest?.requestId))
  const unresolvedStage = stages.find(([, state]) => state.pendingRequest || state.error || state.status === 'failed')
  if (activity.isActive(panel.pendingGeneration?.requestId)) return { panel, label: '生成中', state: 'running' }
  if (runningStage) return { panel, label: `${COMIC_STAGE_LABELS[runningStage[0]] || '精修'}生成中`, state: 'running', stage: runningStage[0] }
  if (panel.pendingGeneration || panel.generationError) return { panel, label: panel.pendingGeneration ? '待恢复' : '生成失败', state: 'error' }
  if (unresolvedStage) return { panel, label: `${COMIC_STAGE_LABELS[unresolvedStage[0]] || '精修'}待处理`, state: 'error', stage: unresolvedStage[0] }
  const display = resolveComicPanelDisplay(panel, props.page)
  return { panel, label: display ? '已有画面' : '待生成', state: display ? 'ready' : 'empty' }
}))
const ready = computed(() => panels.value.filter(item => resolveComicPanelDisplay(item.panel, props.page)).length)
</script>
<template>
  <section class="comic-activity" aria-label="本页画面进度">
    <header><span>本页画面</span><span>{{ ready }} / {{ panels.length }}</span></header>
    <div class="comic-activity__panels">
      <button v-for="item in panels" :key="item.panel.id" type="button" :class="[`is-${item.state}`, { 'is-selected': activePanelId === item.panel.id }]"
        :aria-pressed="activePanelId === item.panel.id" :title="`第 ${item.panel.order} 格 · ${item.label}`" @click="emit('select', { panelId: item.panel.id, stage: item.stage || '' })">
        <LoaderCircle v-if="item.state === 'running'" :size="15" class="comic-activity__spinner" aria-hidden="true" />
        <CircleAlert v-else-if="item.state === 'error'" :size="15" aria-hidden="true" />
        <Check v-else-if="item.state === 'ready'" :size="15" aria-hidden="true" />
        <Image v-else :size="15" aria-hidden="true" />
        <span>第 {{ item.panel.order }} 格</span><small>{{ item.label }}</small>
      </button>
    </div>
  </section>
</template>
<style scoped>
.comic-activity { flex: none; min-width: 0; padding: 10px 20px 14px; background: var(--surface-workbench-canvas); color: var(--text-secondary); font-family: var(--font-sans); }
.comic-activity header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 12px; }
.comic-activity header span:last-child { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.comic-activity__panels { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: thin; padding: 2px; }
.comic-activity button { display: grid; grid-template-columns: 16px auto; align-items: center; column-gap: 7px; row-gap: 3px; flex: 0 0 auto; padding: 7px 14px; min-height: 48px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; font: 13px/1.4 var(--font-sans); }
.comic-activity button small { grid-column: 2; color: var(--text-muted); font-size: 11px; }
.comic-activity button:hover { background: var(--nav-hover); }
.comic-activity button.is-selected { background: var(--nav-selected); color: var(--text-primary); }
.comic-activity button.is-error svg { color: var(--danger); }
.comic-activity button:focus-visible { outline: 2px solid var(--workbench-focus); outline-offset: 1px; }
.comic-activity__spinner { animation: comic-activity-spin 1.4s linear infinite; }
@keyframes comic-activity-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .comic-activity__spinner { animation: none; } }
@media (max-width: 640px) { .comic-activity { padding: 8px 12px; } }
</style>
