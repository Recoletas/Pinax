<script setup>
import { computed, reactive, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Combine,
  Crosshair,
  MessageCircleDashed,
  MoveUpRight,
  Plus,
  Rows2,
  Trash2,
  Type,
  UserRound
} from 'lucide-vue-next'
import ComicPagePreview from './ComicPagePreview.vue'
import {
  addComicDirectionControl,
  canMergeComicPanelWithNext,
  getComicFrameBounds,
  mergeComicPanelWithNext,
  removeComicDirectionControl,
  reorderComicPanel,
  resizeComicPanelFrame,
  setComicCompositionFormat,
  setComicPanelGutter,
  splitComicPanel,
  updateComicDirectionControl,
  updateComicPanelDirection
} from '../../services/media/comicCompositionService'

const props = defineProps({
  page: { type: Object, required: true },
  activePanelId: { type: String, default: '' }
})

const emit = defineEmits(['select-panel', 'update-page', 'update-lettering-box', 'update-lettering-tail'])
const mode = ref('layout')
const transientFrames = reactive({})
const transientControls = reactive({})
const handles = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
const modes = [
  { value: 'layout', label: '格框', icon: Columns2 },
  { value: 'blocking', label: '人物框', icon: UserRound },
  { value: 'motion', label: '运动线', icon: MoveUpRight },
  { value: 'focus', label: '焦点', icon: Crosshair },
  { value: 'balloon', label: '气泡留白', icon: MessageCircleDashed },
  { value: 'lettering', label: '文字', icon: Type }
]
let dragState = null

const activePanel = computed(() => props.page.panels.find((panel) => panel.id === props.activePanelId)
  || props.page.panels[0]
  || null)
const activeIndex = computed(() => props.page.panels
  .slice()
  .sort((a, b) => a.order - b.order)
  .findIndex((panel) => panel.id === activePanel.value?.id))
const mergeAllowed = computed(() => canMergeComicPanelWithNext(props.page, activePanel.value?.id))

function pageStyle() {
  const width = Number(props.page.canvas?.width) || 1200
  const height = Number(props.page.canvas?.height) || 1600
  return { aspectRatio: `${width} / ${height}` }
}

function panelStyle(panel) {
  const bounds = getComicFrameBounds(transientFrames[panel.id] || panel.frame)
  return boundsStyle(bounds)
}

function boundsStyle(bounds) {
  return {
    left: `${bounds.x * 100}%`,
    top: `${bounds.y * 100}%`,
    width: `${bounds.width * 100}%`,
    height: `${bounds.height * 100}%`
  }
}

function selectPanel(panelId) {
  emit('select-panel', panelId)
}

function updatePage(nextPage) {
  emit('update-page', nextPage)
}

function split(axis) {
  if (!activePanel.value) return
  const next = splitComicPanel(props.page, activePanel.value.id, axis)
  updatePage(next)
  const ordered = next.panels.slice().sort((a, b) => a.order - b.order)
  selectPanel(ordered[Math.min(activeIndex.value + 1, ordered.length - 1)]?.id || activePanel.value.id)
}

function mergeNext() {
  if (!activePanel.value) return
  updatePage(mergeComicPanelWithNext(props.page, activePanel.value.id))
}

function reorder(delta) {
  if (!activePanel.value) return
  updatePage(reorderComicPanel(props.page, activePanel.value.id, delta))
}

function updateGutter(value) {
  if (!activePanel.value) return
  updatePage(setComicPanelGutter(props.page, activePanel.value.id, Number(value)))
}

function updateFormat(format) {
  updatePage(setComicCompositionFormat(props.page, format))
}

function addControl() {
  if (!activePanel.value || !['blocking', 'motion', 'balloon'].includes(mode.value)) return
  updatePage(addComicDirectionControl(props.page, activePanel.value.id, mode.value))
}

function removeControl(kind, controlId) {
  if (!activePanel.value) return
  updatePage(removeComicDirectionControl(props.page, activePanel.value.id, kind, controlId))
}

function startFrameDrag(event, panel, handle) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const pageElement = event.currentTarget.closest('.comic-composition__page')
  if (!pageElement) return
  const frame = JSON.parse(JSON.stringify(panel.frame))
  transientFrames[panel.id] = frame
  dragState = {
    type: 'frame',
    pointerId: event.pointerId,
    element: event.currentTarget,
    pageElement,
    panelId: panel.id,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    source: frame
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function startBoxDrag(event, panel, kind, control, resize = false) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const panelElement = event.currentTarget.closest('.comic-composition__panel-layer')
  if (!panelElement) return
  const key = controlKey(kind, control.id)
  const source = [...control.box]
  transientControls[key] = source
  dragState = {
    type: 'box',
    pointerId: event.pointerId,
    element: event.currentTarget,
    panelElement,
    panelId: panel.id,
    kind,
    controlId: control.id,
    resize,
    startX: event.clientX,
    startY: event.clientY,
    source
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function startMotionDrag(event, panel, control, endpoint) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const panelElement = event.currentTarget.closest('.comic-composition__panel-layer')
  if (!panelElement) return
  const key = controlKey('motion', control.id)
  const source = { from: [...control.from], to: [...control.to] }
  transientControls[key] = source
  dragState = {
    type: 'motion',
    pointerId: event.pointerId,
    element: event.currentTarget,
    panelElement,
    panelId: panel.id,
    kind: 'motion',
    controlId: control.id,
    endpoint,
    source
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function startCameraDrag(event, panel, field) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  const panelElement = event.currentTarget.closest('.comic-composition__panel-layer')
  if (!panelElement) return
  const source = {
    focalPoint: {
      x: finiteUnit(panel.direction?.focalPoint?.x, 0.5),
      y: finiteUnit(panel.direction?.focalPoint?.y, 0.5)
    },
    horizonY: panel.direction?.horizonY === null || panel.direction?.horizonY === undefined
      ? 0.5
      : finiteUnit(panel.direction.horizonY, 0.5)
  }
  transientControls[`camera:${panel.id}`] = source
  dragState = {
    type: 'camera',
    pointerId: event.pointerId,
    element: event.currentTarget,
    panelElement,
    panelId: panel.id,
    field,
    source
  }
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function moveDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return
  if (dragState.type === 'frame') {
    const rect = dragState.pageElement.getBoundingClientRect()
    transientFrames[dragState.panelId] = resizeComicPanelFrame(dragState.source, dragState.handle, {
      x: (event.clientX - dragState.startX) / Math.max(1, rect.width),
      y: (event.clientY - dragState.startY) / Math.max(1, rect.height)
    })
    return
  }
  const rect = dragState.panelElement.getBoundingClientRect()
  const point = [
    clampUnit((event.clientX - rect.left) / Math.max(1, rect.width)),
    clampUnit((event.clientY - rect.top) / Math.max(1, rect.height))
  ]
  if (dragState.type === 'camera') {
    const cameraKey = `camera:${dragState.panelId}`
    transientControls[cameraKey] = dragState.field === 'horizonY'
      ? { ...dragState.source, horizonY: point[1] }
      : { ...dragState.source, focalPoint: { x: point[0], y: point[1] } }
    return
  }
  const key = controlKey(dragState.kind, dragState.controlId)
  if (dragState.type === 'motion') {
    transientControls[key] = {
      ...dragState.source,
      [dragState.endpoint]: point
    }
    return
  }
  const [x, y, width, height] = dragState.source
  if (dragState.resize) {
    transientControls[key] = [
      x,
      y,
      Math.max(0.04, Math.min(1 - x, point[0] - x)),
      Math.max(0.04, Math.min(1 - y, point[1] - y))
    ]
  } else {
    transientControls[key] = [
      clamp(point[0] - width / 2, 0, 1 - width),
      clamp(point[1] - height / 2, 0, 1 - height),
      width,
      height
    ]
  }
}

function finishDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return
  const state = dragState
  state.element.releasePointerCapture?.(event.pointerId)
  dragState = null
  if (state.type === 'frame') {
    const frame = transientFrames[state.panelId] || state.source
    const next = {
      ...props.page,
      layout: 'free',
      panels: props.page.panels.map((panel) => panel.id === state.panelId ? { ...panel, frame } : panel)
    }
    delete transientFrames[state.panelId]
    updatePage(next)
    return
  }
  if (state.type === 'camera') {
    const key = `camera:${state.panelId}`
    const value = transientControls[key] || state.source
    delete transientControls[key]
    updatePage(updateComicPanelDirection(props.page, state.panelId, value))
    return
  }
  const key = controlKey(state.kind, state.controlId)
  const value = transientControls[key]
  delete transientControls[key]
  const patch = state.type === 'motion' ? value : { box: value }
  updatePage(updateComicDirectionControl(props.page, state.panelId, state.kind, state.controlId, patch))
}

function cancelDrag(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return
  if (dragState.type === 'frame') delete transientFrames[dragState.panelId]
  else if (dragState.type === 'camera') delete transientControls[`camera:${dragState.panelId}`]
  else delete transientControls[controlKey(dragState.kind, dragState.controlId)]
  dragState = null
}

function boxStyle(kind, control) {
  const box = transientControls[controlKey(kind, control.id)] || control.box
  return {
    left: `${box[0] * 100}%`,
    top: `${box[1] * 100}%`,
    width: `${box[2] * 100}%`,
    height: `${box[3] * 100}%`
  }
}

function motionValue(control) {
  return transientControls[controlKey('motion', control.id)] || control
}

function cameraValue(panel) {
  const focalPoint = panel.direction?.focalPoint
  return transientControls[`camera:${panel.id}`] || {
    focalPoint: {
      x: finiteUnit(focalPoint?.x, 0.5),
      y: finiteUnit(focalPoint?.y, 0.5)
    },
    horizonY: panel.direction?.horizonY === null || panel.direction?.horizonY === undefined
      ? 0.5
      : finiteUnit(panel.direction.horizonY, 0.5)
  }
}

function pointStyle(point) {
  return {
    left: `${point[0] * 100}%`,
    top: `${point[1] * 100}%`
  }
}

function controlKey(kind, id) {
  return `${kind}:${id}`
}

function clampUnit(value) {
  return Math.round(clamp(value, 0, 1) * 10000) / 10000
}

function finiteUnit(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? clampUnit(number) : fallback
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}
</script>

<template>
  <section class="comic-composition" aria-label="漫画分镜与构图画布">
    <header class="comic-composition__toolbar">
      <div class="comic-composition__modes" role="radiogroup" aria-label="构图模式">
        <button
          v-for="item in modes"
          :key="item.value"
          type="button"
          :class="{ active: mode === item.value }"
          :aria-checked="mode === item.value"
          role="radio"
          @click="mode = item.value"
        >
          <component :is="item.icon" :size="14" aria-hidden="true" />
          {{ item.label }}
        </button>
      </div>

      <div class="comic-composition__commands">
        <template v-if="mode === 'layout'">
          <button type="button" title="纵向拆分当前格" aria-label="纵向拆分当前格" :disabled="page.panels.length >= 12" @click="split('vertical')">
            <Columns2 :size="15" aria-hidden="true" />
          </button>
          <button type="button" title="横向拆分当前格" aria-label="横向拆分当前格" :disabled="page.panels.length >= 12" @click="split('horizontal')">
            <Rows2 :size="15" aria-hidden="true" />
          </button>
          <button type="button" title="与阅读顺序下一格合并；下一格已有画面或文字时不可合并" aria-label="与阅读顺序下一格合并" :disabled="!mergeAllowed" @click="mergeNext">
            <Combine :size="15" aria-hidden="true" />
          </button>
          <button type="button" title="阅读顺序前移" aria-label="阅读顺序前移" :disabled="activeIndex <= 0" @click="reorder(-1)">
            <ArrowUp :size="15" aria-hidden="true" />
          </button>
          <button type="button" title="阅读顺序后移" aria-label="阅读顺序后移" :disabled="activeIndex < 0 || activeIndex >= page.panels.length - 1" @click="reorder(1)">
            <ArrowDown :size="15" aria-hidden="true" />
          </button>
          <label class="comic-composition__gutter">
            <span>沟槽</span>
            <input
              type="range"
              min="0"
              max="0.08"
              step="0.002"
              :value="activePanel?.frame?.gutter || 0"
              @change="updateGutter($event.target.value)"
            />
          </label>
        </template>
        <button
          v-else-if="['blocking', 'motion', 'balloon'].includes(mode)"
          type="button"
          class="comic-composition__add"
          @click="addControl"
        >
          <Plus :size="14" aria-hidden="true" />
          添加{{ modes.find((item) => item.value === mode)?.label }}
        </button>
        <label class="comic-composition__format">
          <span>阅读</span>
          <select :value="page.format" @change="updateFormat($event.target.value)">
            <option value="page-ltr">左到右页漫</option>
            <option value="page-rtl">右到左页漫</option>
            <option value="webtoon">竖向条漫</option>
          </select>
        </label>
      </div>
    </header>

    <div class="comic-composition__stage">
      <div
        class="comic-composition__page"
        :class="{ 'is-webtoon': page.format === 'webtoon' }"
        :style="pageStyle()"
      >
        <ComicPagePreview
          :page="page"
          :active-panel-id="activePanel?.id || ''"
          :interactive="mode === 'lettering'"
          :editable-lettering="mode === 'lettering'"
          @select-panel="selectPanel"
          @update-lettering-box="$emit('update-lettering-box', $event)"
          @update-lettering-tail="$emit('update-lettering-tail', $event)"
        />

        <div v-if="mode !== 'lettering'" class="comic-composition__overlay">
          <div
            v-for="panel in page.panels"
            :key="panel.id"
            class="comic-composition__panel-layer"
            :class="{ active: panel.id === activePanel?.id }"
            :style="panelStyle(panel)"
            role="button"
            tabindex="0"
            :aria-label="`选择第 ${panel.order} 格`"
            @click="selectPanel(panel.id)"
            @keydown.enter.prevent="selectPanel(panel.id)"
            @keydown.space.prevent="selectPanel(panel.id)"
          >
            <span class="comic-composition__order">{{ panel.order }}</span>

            <template v-if="panel.id === activePanel?.id && mode === 'layout'">
              <button
                v-for="handle in handles"
                :key="handle"
                type="button"
                class="comic-composition__frame-handle"
                :class="`is-${handle}`"
                :aria-label="`调整第 ${panel.order} 格 ${handle} 边界`"
                @pointerdown="startFrameDrag($event, panel, handle)"
                @pointermove="moveDrag"
                @pointerup="finishDrag"
                @pointercancel="cancelDrag"
              ></button>
            </template>

            <template v-if="panel.id === activePanel?.id && mode === 'blocking'">
              <div
                v-for="control in panel.direction.blocking"
                :key="control.id"
                class="comic-composition__box is-blocking"
                :style="boxStyle('blocking', control)"
                @pointerdown="startBoxDrag($event, panel, 'blocking', control)"
                @pointermove="moveDrag"
                @pointerup="finishDrag"
                @pointercancel="cancelDrag"
              >
                <span>{{ control.label }}</span>
                <i
                  title="调整人物框大小"
                  @pointerdown.stop="startBoxDrag($event, panel, 'blocking', control, true)"
                  @pointermove="moveDrag"
                  @pointerup="finishDrag"
                  @pointercancel="cancelDrag"
                ></i>
                <button type="button" title="删除人物框" aria-label="删除人物框" @pointerdown.stop @click.stop="removeControl('blocking', control.id)">
                  <Trash2 :size="11" aria-hidden="true" />
                </button>
              </div>
            </template>

            <template v-if="panel.id === activePanel?.id && mode === 'balloon'">
              <div
                v-for="control in panel.direction.balloonSafeZones"
                :key="control.id"
                class="comic-composition__box is-balloon"
                :style="boxStyle('balloon', control)"
                @pointerdown="startBoxDrag($event, panel, 'balloon', control)"
                @pointermove="moveDrag"
                @pointerup="finishDrag"
                @pointercancel="cancelDrag"
              >
                <span>{{ control.label }}</span>
                <i
                  title="调整留白大小"
                  @pointerdown.stop="startBoxDrag($event, panel, 'balloon', control, true)"
                  @pointermove="moveDrag"
                  @pointerup="finishDrag"
                  @pointercancel="cancelDrag"
                ></i>
                <button type="button" title="删除气泡留白" aria-label="删除气泡留白" @pointerdown.stop @click.stop="removeControl('balloon', control.id)">
                  <Trash2 :size="11" aria-hidden="true" />
                </button>
              </div>
            </template>

            <template v-if="panel.id === activePanel?.id && mode === 'motion'">
              <div v-for="control in panel.direction.motionVectors" :key="control.id" class="comic-composition__motion">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <line
                    :x1="motionValue(control).from[0] * 100"
                    :y1="motionValue(control).from[1] * 100"
                    :x2="motionValue(control).to[0] * 100"
                    :y2="motionValue(control).to[1] * 100"
                  />
                </svg>
                <button
                  type="button"
                  class="comic-composition__motion-point is-from"
                  :style="pointStyle(motionValue(control).from)"
                  :aria-label="`${control.label} 起点`"
                  @pointerdown="startMotionDrag($event, panel, control, 'from')"
                  @pointermove="moveDrag"
                  @pointerup="finishDrag"
                  @pointercancel="cancelDrag"
                ></button>
                <button
                  type="button"
                  class="comic-composition__motion-point is-to"
                  :style="pointStyle(motionValue(control).to)"
                  :aria-label="`${control.label} 终点`"
                  @pointerdown="startMotionDrag($event, panel, control, 'to')"
                  @pointermove="moveDrag"
                  @pointerup="finishDrag"
                  @pointercancel="cancelDrag"
                ></button>
                <button type="button" class="comic-composition__motion-remove" title="删除运动线" aria-label="删除运动线" @click.stop="removeControl('motion', control.id)">
                  <Trash2 :size="11" aria-hidden="true" />
                </button>
              </div>
            </template>

            <template v-if="panel.id === activePanel?.id && mode === 'focus'">
              <button
                type="button"
                class="comic-composition__horizon"
                :style="{ top: `${cameraValue(panel).horizonY * 100}%` }"
                aria-label="拖动地平线"
                @pointerdown="startCameraDrag($event, panel, 'horizonY')"
                @pointermove="moveDrag"
                @pointerup="finishDrag"
                @pointercancel="cancelDrag"
              ></button>
              <button
                type="button"
                class="comic-composition__focus"
                :style="{
                  left: `${cameraValue(panel).focalPoint.x * 100}%`,
                  top: `${cameraValue(panel).focalPoint.y * 100}%`
                }"
                aria-label="拖动视觉焦点"
                @pointerdown="startCameraDrag($event, panel, 'focalPoint')"
                @pointermove="moveDrag"
                @pointerup="finishDrag"
                @pointercancel="cancelDrag"
              >
                <Crosshair :size="16" aria-hidden="true" />
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.comic-composition {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--archive-ink, var(--text-primary));
}

.comic-composition *,
.comic-composition *::before,
.comic-composition *::after { box-sizing: border-box; }

.comic-composition__toolbar {
  flex: 0 0 auto;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 16%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 84%, transparent);
}

.comic-composition__modes,
.comic-composition__commands {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.comic-composition button,
.comic-composition select,
.comic-composition input {
  font: inherit;
}

.comic-composition__modes button,
.comic-composition__commands > button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 7px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
  font-size: 10px;
}

.comic-composition__modes button:hover,
.comic-composition__modes button.active,
.comic-composition__commands > button:hover:not(:disabled) {
  color: var(--archive-ink);
}

.comic-composition__modes button.active {
  border-bottom-color: var(--accent);
  font-weight: 700;
}

.comic-composition__commands > button:disabled { opacity: 0.35; cursor: not-allowed; }
.comic-composition__add { color: var(--accent) !important; }

.comic-composition__gutter,
.comic-composition__format {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-inline: 6px;
  color: var(--archive-ink-soft);
  font-size: 9px;
}

.comic-composition__gutter input { width: 72px; accent-color: var(--accent); }
.comic-composition__format select {
  min-height: 26px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 22%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink);
  font-size: 10px;
}

.comic-composition__stage {
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px;
  overflow: auto;
  display: grid;
  justify-items: center;
  align-items: start;
  background: color-mix(in srgb, var(--archive-paper-soft) 48%, transparent);
}

.comic-composition__page {
  position: relative;
  width: min(100%, 760px);
  flex: 0 0 auto;
}

.comic-composition__page.is-webtoon { width: min(100%, 560px); }
.comic-composition__page :deep(.comic-page-preview) { width: 100%; height: 100%; box-shadow: 0 12px 28px color-mix(in srgb, var(--archive-ink) 14%, transparent); }
.comic-composition__overlay { position: absolute; inset: 0; z-index: 20; }

.comic-composition__panel-layer {
  position: absolute;
  outline: 1px solid transparent;
  cursor: pointer;
}

.comic-composition__panel-layer.active {
  outline: 2px solid color-mix(in srgb, var(--accent) 72%, transparent);
  outline-offset: -2px;
}

.comic-composition__panel-layer:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.comic-composition__order {
  position: absolute;
  z-index: 5;
  top: 4px;
  left: 4px;
  min-width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--archive-ink) 76%, transparent);
  color: white;
  font-size: 9px;
  pointer-events: none;
}

.comic-composition__frame-handle {
  position: absolute;
  z-index: 8;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--accent) 68%, var(--archive-ink));
  border-radius: 50%;
  background: var(--archive-paper);
  touch-action: none;
}

.comic-composition__frame-handle.is-nw { top: -6px; left: -6px; cursor: nwse-resize; }
.comic-composition__frame-handle.is-n { top: -6px; left: calc(50% - 6px); cursor: ns-resize; }
.comic-composition__frame-handle.is-ne { top: -6px; right: -6px; cursor: nesw-resize; }
.comic-composition__frame-handle.is-e { top: calc(50% - 6px); right: -6px; cursor: ew-resize; }
.comic-composition__frame-handle.is-se { right: -6px; bottom: -6px; cursor: nwse-resize; }
.comic-composition__frame-handle.is-s { bottom: -6px; left: calc(50% - 6px); cursor: ns-resize; }
.comic-composition__frame-handle.is-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.comic-composition__frame-handle.is-w { top: calc(50% - 6px); left: -6px; cursor: ew-resize; }

.comic-composition__box {
  position: absolute;
  z-index: 7;
  min-width: 24px;
  min-height: 20px;
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 9%, transparent);
  color: var(--accent);
  cursor: move;
  touch-action: none;
}

.comic-composition__box.is-balloon {
  border-style: dashed;
  color: var(--signal-warm, var(--archive-gold));
}

.comic-composition__box > span {
  position: absolute;
  top: 2px;
  left: 3px;
  font-size: 8px;
  pointer-events: none;
}

.comic-composition__box > i {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 10px;
  height: 10px;
  border: 1px solid currentColor;
  background: var(--archive-paper);
  cursor: nwse-resize;
}

.comic-composition__box > button,
.comic-composition__motion-remove {
  position: absolute;
  z-index: 3;
  top: 1px;
  right: 1px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: color-mix(in srgb, var(--archive-paper) 86%, transparent);
  color: inherit;
  cursor: pointer;
}

.comic-composition__horizon {
  position: absolute;
  z-index: 7;
  left: 0;
  width: 100%;
  height: 14px;
  padding: 0;
  border: 0;
  border-top: 1px dashed var(--signal-warm, var(--archive-gold));
  background: transparent;
  cursor: ns-resize;
  touch-action: none;
}

.comic-composition__focus {
  position: absolute;
  z-index: 8;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--archive-paper) 82%, transparent);
  color: var(--accent);
  transform: translate(-50%, -50%);
  cursor: move;
  touch-action: none;
}

.comic-composition__motion,
.comic-composition__motion svg {
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;
}

.comic-composition__motion line {
  stroke: var(--accent);
  stroke-width: 1.4;
  stroke-dasharray: 3 2;
  vector-effect: non-scaling-stroke;
}

.comic-composition__motion-point {
  position: absolute;
  z-index: 8;
  width: 13px;
  height: 13px;
  padding: 0;
  border: 1px solid var(--accent);
  border-radius: 50%;
  background: var(--archive-paper);
  transform: translate(-50%, -50%);
  cursor: move;
  pointer-events: auto;
  touch-action: none;
}

.comic-composition__motion-point.is-to {
  width: 15px;
  height: 15px;
  background: var(--accent);
}

.comic-composition__motion-remove {
  top: 4px;
  right: 4px;
  color: var(--accent);
  pointer-events: auto;
}

@media (max-width: 760px) {
  .comic-composition__toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 2px;
  }

  .comic-composition__modes,
  .comic-composition__commands {
    overflow-x: auto;
  }

  .comic-composition__modes button { flex: 0 0 auto; }
  .comic-composition__commands { min-height: 34px; }
  .comic-composition__stage { padding: 8px 4px 16px; }
}
</style>
