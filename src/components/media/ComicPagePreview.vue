<script setup>
import { reactive } from 'vue'
import { getComicCanvasSize, getComicImageStyle, getComicPanelRect } from '../../services/media/comicLayout'

const props = defineProps({
  page: { type: Object, default: null },
  activePanelId: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
  editableLettering: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
})

const emit = defineEmits(['select-panel', 'update-lettering-box', 'update-lettering-tail'])
const loadedDimensions = reactive({})
const transientLetteringBoxes = reactive({})
const transientLetteringTargets = reactive({})
const letteringResizeHandles = Object.freeze(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
let letteringDrag = null

function selectedTake(panel) {
  return panel.imageTakes?.find((take) => take.id === panel.selectedTakeId) || null
}

function pageStyle(page) {
  const canvas = getComicCanvasSize(page?.canvas)
  return { aspectRatio: `${canvas.width} / ${canvas.height}` }
}

function panelStyle(page, panel) {
  const canvas = getComicCanvasSize(page?.canvas)
  const rect = getComicPanelRect(page, panel.order)
  return {
    left: `${rect.x / canvas.width * 100}%`,
    top: `${rect.y / canvas.height * 100}%`,
    width: `${rect.width / canvas.width * 100}%`,
    height: `${rect.height / canvas.height * 100}%`
  }
}

function imageStyle(page, panel, take) {
  return getComicImageStyle(page, panel, {
    width: take?.width || loadedDimensions[take?.id]?.width,
    height: take?.height || loadedDimensions[take?.id]?.height
  })
}

function rememberImageSize(event, take) {
  if (!take?.id || !event.currentTarget?.naturalWidth) return
  loadedDimensions[take.id] = {
    width: event.currentTarget.naturalWidth,
    height: event.currentTarget.naturalHeight
  }
}

function letteringStyle(object) {
  const [x, y, width, height] = normalizeBox(transientLetteringBoxes[object?.id] || object?.box)
  const style = normalizeLetteringStyle(object?.style, object?.type)
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
    zIndex: 10 + (Number(object?.zIndex) || 0),
    fontFamily: letteringFontFamily(style.fontFamily),
    fontSize: `clamp(6px, ${style.fontSize / 3}cqh, 34px)`,
    fontWeight: style.fontWeight,
    textAlign: style.textAlign,
    writingMode: style.textDirection === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
    transform: `rotate(${style.rotation + (object.type === 'sfx' ? -7 : 0)}deg)`
  }
}

function panelElementTag() {
  return props.editableLettering ? 'div' : props.interactive ? 'button' : 'div'
}

function letteringElementTag() {
  return props.editableLettering ? 'button' : 'span'
}

function letteringTailTarget(object) {
  const target = transientLetteringTargets[object?.id] || object?.tailTarget
  if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.y))) return null
  return { x: Number(target.x), y: Number(target.y) }
}

function letteringTailStyle(object) {
  const target = letteringTailTarget(object)
  const [x, y, width, height] = normalizeBox(object?.box)
  if (!target) return { display: 'none' }
  return {
    left: `${((target.x - x) / width) * 100}%`,
    top: `${((target.y - y) / height) * 100}%`
  }
}

function letteringTailPoints(object) {
  const target = letteringTailTarget(object)
  const [x, y, width, height] = normalizeBox(object?.box)
  if (!target) return ''
  const tx = ((target.x - x) / width) * 100
  const ty = ((target.y - y) / height) * 100
  const dx = tx - 50
  const dy = ty - 50
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy))
  const nx = -dy / length * 7
  const ny = dx / length * 7
  return `50,50 ${50 + nx},${50 + ny} ${tx},${ty} ${50 - nx},${50 - ny}`
}

function startLetteringDrag(event, panel, object) {
  if (!props.editableLettering || event.button !== 0) return
  const element = event.currentTarget
  const stage = element.closest('.comic-page-preview__panel')
  if (!stage) return
  event.preventDefault()
  event.stopPropagation()
  const box = normalizeBox(object.box)
  transientLetteringBoxes[object.id] = [...box]
  letteringDrag = {
    pointerId: event.pointerId,
    element,
    stage,
    panelId: panel.id,
    objectId: object.id,
    startBox: [...box],
    startX: event.clientX,
    startY: event.clientY,
    mode: event.target.closest('[data-lettering-tail]') ? 'tail' : event.target.closest('[data-lettering-resize]')?.dataset.letteringResize || 'move',
    startTarget: object.tailTarget ? { ...object.tailTarget } : { x: box[0] + box[2] / 2, y: box[1] + box[3] }
  }
  emit('select-panel', panel.id)
  element.setPointerCapture?.(event.pointerId)
}

function moveLetteringDrag(event) {
  if (!letteringDrag || letteringDrag.pointerId !== event.pointerId) return
  const rect = letteringDrag.stage.getBoundingClientRect()
  const dx = (event.clientX - letteringDrag.startX) / Math.max(1, rect.width)
  const dy = (event.clientY - letteringDrag.startY) / Math.max(1, rect.height)
  const [x, y, width, height] = letteringDrag.startBox
  if (letteringDrag.mode === 'tail') {
    transientLetteringTargets[letteringDrag.objectId] = {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1, letteringDrag.startTarget.x),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1, letteringDrag.startTarget.y)
    }
    return
  }
  let nextBox
  if (letteringDrag.mode === 'move') {
    nextBox = [
      clamp(x + dx, 0, 1 - width, x),
      clamp(y + dy, 0, 1 - height, y),
      width,
      height
    ]
  } else {
    const minWidth = 0.12
    const minHeight = 0.08
    let left = x
    let top = y
    let right = x + width
    let bottom = y + height
    if (letteringDrag.mode.includes('w')) left = Math.min(right - minWidth, Math.max(0, x + dx))
    if (letteringDrag.mode.includes('e')) right = Math.max(left + minWidth, Math.min(1, x + width + dx))
    if (letteringDrag.mode.includes('n')) top = Math.min(bottom - minHeight, Math.max(0, y + dy))
    if (letteringDrag.mode.includes('s')) bottom = Math.max(top + minHeight, Math.min(1, y + height + dy))
    nextBox = [left, top, right - left, bottom - top]
  }
  transientLetteringBoxes[letteringDrag.objectId] = nextBox.map(roundUnit)
}

function finishLetteringDrag(event) {
  if (!letteringDrag || letteringDrag.pointerId !== event.pointerId) return
  const drag = letteringDrag
  const box = normalizeBox(transientLetteringBoxes[drag.objectId] || drag.startBox).map(roundUnit)
  drag.element.releasePointerCapture?.(event.pointerId)
  letteringDrag = null
  if (drag.mode === 'tail') {
    const target = transientLetteringTargets[drag.objectId] || drag.startTarget
    emit('update-lettering-tail', { panelId: drag.panelId, objectId: drag.objectId, tailTarget: target })
  } else {
    emit('update-lettering-box', { panelId: drag.panelId, objectId: drag.objectId, box })
  }
  queueMicrotask(() => {
    delete transientLetteringBoxes[drag.objectId]
    delete transientLetteringTargets[drag.objectId]
  })
}

function cancelLetteringDrag(event) {
  if (!letteringDrag || letteringDrag.pointerId !== event.pointerId) return
  const objectId = letteringDrag.objectId
  letteringDrag = null
  delete transientLetteringBoxes[objectId]
  delete transientLetteringTargets[objectId]
}

function normalizeLetteringStyle(input = {}, type = 'speech') {
  const source = input && typeof input === 'object' ? input : {}
  return {
    fontFamily: ['display', 'kai', 'serif', 'sans', 'rounded', 'mono'].includes(source.fontFamily) ? source.fontFamily : 'display',
    fontSize: Math.min(72, Math.max(10, Number(source.fontSize) || (type === 'sfx' ? 32 : 22))),
    fontWeight: [400, 600, 800].includes(Number(source.fontWeight)) ? Number(source.fontWeight) : type === 'sfx' ? 800 : 600,
    textAlign: ['left', 'center', 'right'].includes(source.textAlign) ? source.textAlign : type === 'caption' ? 'left' : 'center',
    textDirection: source.textDirection === 'vertical' ? 'vertical' : 'horizontal',
    rotation: Math.min(180, Math.max(-180, Number(source.rotation) || 0))
  }
}

function letteringFontFamily(value) {
  return {
    display: '"LXGW WenKai", "Songti SC", serif',
    kai: 'KaiTi, "STKaiti", serif',
    serif: '"Songti SC", "STSong", serif',
    sans: '"Microsoft YaHei", "Segoe UI", sans-serif',
    rounded: '"Yuanti SC", "Microsoft YaHei", sans-serif',
    mono: '"SFMono-Regular", Consolas, monospace'
  }[value]
}

function normalizeBox(box) {
  const values = Array.isArray(box) ? box.map(Number) : []
  const width = clamp(values[2], 0.12, 0.8, 0.38)
  const height = clamp(values[3], 0.08, 0.6, 0.2)
  return [
    clamp(values[0], 0, 1 - width, 0.56),
    clamp(values[1], 0, 1 - height, 0.08),
    width,
    height
  ]
}

function clamp(value, min, max, fallback) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function roundUnit(value) {
  return Math.round(Number(value) * 10000) / 10000
}

</script>

<template>
  <section
    class="comic-page-preview"
    :class="[
      `comic-page-preview--${page?.layout || 'strip-4'}`,
      { 'is-compact': compact, 'is-interactive': interactive, 'is-single': page?.panels?.length === 1 }
    ]"
    :style="pageStyle(page)"
    :aria-label="page?.title || '漫画页预览'"
  >
    <component
      :is="panelElementTag()"
      v-for="panel in page?.panels || []"
      :key="panel.id"
      :type="interactive && !editableLettering ? 'button' : undefined"
      class="comic-page-preview__panel"
      :class="{ active: activePanelId === panel.id }"
      :style="panelStyle(page, panel)"
      :aria-disabled="interactive && !editableLettering ? 'false' : undefined"
      :tabindex="interactive ? 0 : -1"
      @click="interactive && $emit('select-panel', panel.id)"
    >
      <img
        v-if="selectedTake(panel)"
        :src="selectedTake(panel).data"
        :alt="`第 ${panel.order} 格`"
        :style="imageStyle(page, panel, selectedTake(panel))"
        @load="rememberImageSize($event, selectedTake(panel))"
      />
      <span v-else class="comic-page-preview__placeholder">
        <strong>{{ panel.order }}</strong>
        <span>等待画面</span>
      </span>

      <component
        :is="letteringElementTag()"
        v-for="object in panel.letteringObjects || []"
        :key="object.id"
        :type="editableLettering ? 'button' : undefined"
        class="comic-page-preview__lettering"
        :class="[`is-${object.type}`, { 'is-editable': editableLettering }]"
        :style="letteringStyle(object)"
        :title="editableLettering ? '拖动文字框，拖拽控制点调整大小' : undefined"
        @pointerdown="startLetteringDrag($event, panel, object)"
        @pointermove="moveLetteringDrag"
        @pointerup="finishLetteringDrag"
        @pointercancel="cancelLetteringDrag"
      >
        <svg
          v-if="editableLettering && ['speech', 'thought'].includes(object.type) && letteringTailTarget(object)"
          class="comic-page-preview__lettering-tail"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon :points="letteringTailPoints(object)" />
        </svg>
        <i
          v-if="editableLettering && ['speech', 'thought'].includes(object.type)"
          class="comic-page-preview__lettering-tail-handle"
          :style="letteringTailStyle(object)"
          data-lettering-tail="true"
          title="拖动尾巴指向画面"
          aria-hidden="true"
        ></i>
        <span class="comic-page-preview__lettering-text">{{ object.text }}</span>
        <i
          v-for="handle in editableLettering ? letteringResizeHandles : []"
          :key="handle"
          class="comic-page-preview__lettering-handle"
          :class="`is-${handle}`"
          :data-lettering-resize="handle"
          aria-hidden="true"
        ></i>
      </component>
      <span class="comic-page-preview__index" aria-hidden="true">{{ panel.order }}</span>
    </component>
  </section>
</template>

<style scoped>
.comic-page-preview {
  position: relative;
  width: min(100%, 920px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-ink, var(--text-primary)) 28%, var(--border));
  background: color-mix(in srgb, var(--archive-paper, var(--bg-secondary)) 92%, white 8%);
  box-shadow: 0 14px 32px rgb(20 24 32 / 0.12);
}

.comic-page-preview__panel {
  position: absolute;
  container-type: size;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--archive-ink, var(--text-primary)) 72%, transparent);
  border-radius: 2px;
  background: var(--bg-primary);
  color: var(--text-primary);
  text-align: left;
}

.comic-page-preview.is-interactive .comic-page-preview__panel { cursor: pointer; }
.comic-page-preview__panel.active { outline: 3px solid color-mix(in srgb, var(--accent) 74%, transparent); outline-offset: -3px; }
.comic-page-preview__panel img { width: 100%; height: 100%; display: block; object-fit: contain; transform-origin: center; }
.comic-page-preview__placeholder { width: 100%; height: 100%; display: grid; align-content: center; justify-items: center; gap: 8px; padding: 12px; background: color-mix(in srgb, var(--archive-paper-soft, var(--bg-secondary)) 82%, transparent); color: var(--text-muted); text-align: center; }
.comic-page-preview__placeholder strong { font-family: var(--font-display); font-size: 24px; }
.comic-page-preview__placeholder span { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; font-size: 11px; line-height: 1.5; }
.comic-page-preview__lettering { position: absolute; min-width: 0; min-height: 0; display: grid; place-items: center; margin: 0; padding: 3px 5px; overflow: hidden; border: 1px solid rgb(32 36 42 / 0.82); border-radius: 50%; background: rgb(255 255 255 / 0.94); color: #20242a; box-shadow: 0 1px 5px rgb(0 0 0 / 0.16); line-height: 1.3; }
.comic-page-preview__lettering.is-thought { border-style: dashed; border-radius: 46%; }
.comic-page-preview__lettering.is-caption { place-items: start; border-radius: 2px; text-align: left; }
.comic-page-preview__lettering.is-sfx { border: 0; background: transparent; box-shadow: none; color: #fff; font-size: 14px; font-weight: 800; text-shadow: -1px -1px 0 #20242a, 1px -1px 0 #20242a, -1px 1px 0 #20242a, 1px 1px 0 #20242a; transform: rotate(-7deg); }
.comic-page-preview__lettering-text { width: 100%; max-height: 100%; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 6; }
.comic-page-preview__lettering-tail { position: absolute; z-index: -1; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.comic-page-preview__lettering-tail polygon { fill: rgb(255 255 255 / 0.94); stroke: rgb(32 36 42 / 0.82); stroke-width: 1.2; vector-effect: non-scaling-stroke; }
.comic-page-preview__lettering-tail-handle { position: absolute; z-index: 3; width: 10px; height: 10px; margin: -5px; border: 1px solid rgb(32 36 42 / 0.82); border-radius: 50%; background: var(--accent); box-shadow: 0 1px 3px rgb(0 0 0 / 0.24); cursor: crosshair; }
.comic-page-preview__lettering.is-editable { overflow: visible; cursor: grab; touch-action: none; }
.comic-page-preview__lettering.is-editable:active { cursor: grabbing; }
.comic-page-preview__lettering-handle { position: absolute; z-index: 2; width: 10px; height: 10px; display: none; border: 1px solid rgb(32 36 42 / 0.82); border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.24); }
.comic-page-preview__lettering.is-editable:hover .comic-page-preview__lettering-handle,
.comic-page-preview__lettering.is-editable:focus .comic-page-preview__lettering-handle { display: block; }
.comic-page-preview__lettering-handle.is-nw { left: -5px; top: -5px; cursor: nwse-resize; }
.comic-page-preview__lettering-handle.is-n { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
.comic-page-preview__lettering-handle.is-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.comic-page-preview__lettering-handle.is-e { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.comic-page-preview__lettering-handle.is-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.comic-page-preview__lettering-handle.is-s { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
.comic-page-preview__lettering-handle.is-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.comic-page-preview__lettering-handle.is-w { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.comic-page-preview__index { position: absolute; left: 5px; bottom: 4px; z-index: 3; color: rgb(255 255 255 / 0.88); font-size: 9px; text-shadow: 0 1px 3px rgb(0 0 0 / 0.9); }

.comic-page-preview.is-compact { width: 100%; box-shadow: none; }
.comic-page-preview.is-compact .comic-page-preview__placeholder { padding: 5px; }
.comic-page-preview.is-compact .comic-page-preview__placeholder strong { font-size: 16px; }
.comic-page-preview.is-compact .comic-page-preview__placeholder span { display: none; }
.comic-page-preview.is-compact .comic-page-preview__lettering { padding: 2px 3px; font-size: 7px; }
.comic-page-preview.is-compact .comic-page-preview__lettering.is-sfx { font-size: 10px; }
</style>
