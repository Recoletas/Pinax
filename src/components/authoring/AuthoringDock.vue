<template>
  <!-- 约束：根元素永远挂载（无任何 v-if 卸载路径），显隐交给 .writing-inspector 既有 :not(.is-open) 规则。 -->
  <aside
    v-show="true"
    ref="dockRef"
    class="writing-inspector authoring-dock"
    @keydown.esc.capture="onDockEsc"
    :class="{ 'is-open': open, 'is-pinned': pinned, 'is-assistant': activeTool === 'ai' && !panelOpen, 'is-rehearsal': activeTool === 'rehearsal', 'is-catalog-workbench': ['outline','characters','worldbook'].includes(activeTool), 'is-dual': dualActive }"
    :aria-label="tr(&quot;写作检查器&quot;)"
    :style="dockWidthStyle"
  >
    <header class="writing-inspector__head">
      <div>
        <strong>{{ panelOpen ? label : tr('工作台') }}</strong>
        <small v-if="enLocale && ['worldbook', 'scene', 'collaboration'].includes(activeTool)" class="writing-inspector__locale-note" :title="tr('此工具部分界面目前仅中文')">{{ tr('部分翻译') }}</small>
        <span v-if="activeTool === 'annotations' && annotationCount > 0" class="writing-inspector__head-count">{{ tr('{openAnnotationCount} 条待处理', { openAnnotationCount: annotationCount }) }}</span>
      </div>
      <div class="writing-inspector__head-actions">
        <button v-if="!panelOpen" type="button" class="writing-inspector__memory-link" @click="emit('open-memory')">{{ tr('记忆与历史') }}</button>
        <button v-if="activeTool === 'rehearsal'" type="button" class="writing-inspector__manuscript-btn" :aria-label="tr(&quot;回到正文&quot;)" :title="tr(&quot;回到正文&quot;)" @click="emit('manuscript')">{{ tr('正文') }}</button>
        <button type="button" class="writing-inspector__icon-btn" :class="{ active: pinned }" :aria-pressed="pinned.toString()" :title="tr(&quot;固定检查器&quot;)" @click="emit('toggle-pin')"><WorkbenchIcon name="pin" :size="15" /></button>
        <button type="button" class="writing-inspector__icon-btn" :title="tr(&quot;关闭检查器&quot;)" @click="emit('close')"><WorkbenchIcon name="close" :size="15" /></button>
      </div>
    </header>

    <div class="authoring-dock__tabs" role="tablist" :aria-label="tr('工作台分区')">
      <!-- 约束：任一时刻 DOM 至多一个 data-authoring-tool="ai"——dock 关闭时会话 tab 摘掉属性，由收起徽标补位。 -->
      <button type="button" role="tab" :aria-selected="dockTab === 'session'" :class="{ 'is-active': dockTab === 'session' }" :data-authoring-tool="open ? 'ai' : null" :aria-label="tr('助手')" @click="selectTab('session')">
        <span>{{ tr('会话') }}</span>
        <span v-if="unread" class="authoring-dock__unread" aria-hidden="true"></span>
      </button>
      <button type="button" role="tab" :aria-selected="dockTab === 'run'" :class="{ 'is-active': dockTab === 'run' }" @click="selectTab('run')">{{ tr('执行') }}</button>
      <button type="button" role="tab" :aria-selected="dockTab === 'tools'" :class="{ 'is-active': dockTab === 'tools' }" @click="selectTab('tools')">{{ tr('工具') }}</button>
      <button type="button" role="tab" :aria-selected="dockTab === 'agent'" :class="{ 'is-active': dockTab === 'agent' }" @click="selectTab('agent')">{{ tr('Agent') }}</button>
    </div>

    <!-- 约束：会话段 v-show 常驻、绝不卸载——助手 SSE/输入/UI 状态靠它保命。 -->
    <div v-show="dockTab === 'session'" class="writing-inspector__body writing-inspector__body--assistant" data-authoring-inspector="ai"><slot name="session" /></div>

    <div v-if="dockTab === 'run' && !panelOpen" class="authoring-dock__section">
      <slot name="run">
        <AuthoringRunLog :project-id="projectId" />
      </slot>
    </div>
    <div v-if="dockTab === 'tools' && !panelOpen" class="authoring-dock__section">
      <slot name="tools">
        <p class="authoring-dock__empty">{{ tr('本会话工具的可用性管理将在这里显示。') }}</p>
      </slot>
    </div>
    <div v-if="dockTab === 'agent' && !panelOpen" class="authoring-dock__section">
      <slot name="agent">
        <p class="authoring-dock__empty">{{ tr('模型、预设与运行历史将在这里显示。') }}</p>
      </slot>
    </div>

    <!-- 工具临时面板：同格叠放盖住段区，header/tabs 保持可点；收起权交给父组件（panel-close）。 -->
    <div v-if="panelOpen" class="authoring-dock__panel">
      <div class="authoring-dock__panel-bar">
        <strong>{{ label }}</strong>
        <button type="button" class="authoring-dock__panel-close" :title="tr('返回会话')" @click="dockTab = 'session'; emit('panel-close')"><WorkbenchIcon name="close" :size="14" /><span>{{ tr('收起') }}</span></button>
      </div>
      <slot name="panel" />
    </div>

    <span class="authoring-dock__resizer" :class="{ 'is-active': resizing }" aria-hidden="true" @pointerdown="startResize"></span>
  </aside>

  <!-- 收起态徽标：与 dock 内的会话 tab 互斥，保证 data-authoring-tool="ai" 唯一。
       点击先归位会话段再重开：否则带着上次的 dockTab 重开会落在工具面板/空段上。 -->
  <button v-if="!open" type="button" class="authoring-dock__reopen" data-authoring-tool="ai" :aria-label="tr('助手')" :title="tr('打开工作台')" @click="dockTab = 'session'; emit('reopen')">
    <WorkbenchIcon name="assistant" :size="18" />
    <span v-if="unread" class="authoring-dock__unread" aria-hidden="true"></span>
  </button>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { clampDockWidth, loadDockPreferences, saveDockPreferences } from '../../composables/useAuthoringDockPreferences.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

// 预算：Authoring.vue imports 顶格 125，「执行」段渲染沉进 dock run 槽默认值；
// 异步导入保持 run tab 首点才加载组件（dock 自身不在 structure-budget 限额表内）。
const AuthoringRunLog = defineAsyncComponent(() => import('./AuthoringRunLog.vue'))

const props = defineProps({
  activeTool: { type: String, required: true },
  open: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  inspectorTab: { type: String, default: 'comments' },
  dualActive: { type: Boolean, default: false },
  label: { type: String, default: '' },
  annotationCount: { type: Number, default: 0 },
  unread: { type: Boolean, default: false },
  enLocale: { type: Boolean, default: false },
  projectId: { type: [String, Number], default: '' }
})
const emit = defineEmits(['close', 'toggle-pin', 'open-memory', 'reopen', 'panel-close', 'manuscript', 'mark-read'])

const dockTab = ref('session')
// dual 的面板本体在正文区（AuthoringDualPane），dock 整体让位（.is-dual 隐藏），不开空 overlay。
const panelOpen = computed(() => props.activeTool !== 'ai' && props.activeTool !== 'dual')

// 拖宽仅桌面生效；981 断点与 .writing-inspector 既有覆盖层断点对齐。
const desktopQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(min-width: 981px)')
  : null
const dockWidth = ref(loadDockPreferences().width)
const resizing = ref(false)

// 关闭态不注入宽度变量：窄屏覆盖层宽度仍由既有断点规则决定。
const dockWidthStyle = computed(() => (props.open && dockWidth.value ? { '--writing-dock-width': dockWidth.value + 'px' } : {}))

let resizePointerId = null
// 拖拽期间 dock 右缘固定（rail 列宽恒定），以起始右缘为锚算宽度，避免浮点漂移。
let resizeAnchorRight = 0

// 换书后 dockTab 停在 run/tools/agent 时，会话段被 v-show 藏住、新项目对话不可见：
// 项目身份一变就归位会话段。（工具面板进出不改 dockTab——那由用户的 tab 选择主导。）
watch(() => props.projectId, () => {
  dockTab.value = 'session'
})

// 列模板变量写在宿主网格（.wall__main）上：CSS 变量不向上继承，aside 自身的
// width var 只能让格子里的自己变窄，顶不开列上的 clamp 硬顶。
const dockRef = ref(null)
function applyHostWidth() {
  const host = dockRef.value?.closest('.wall__main')
  if (!host) return
  if (props.open && dockWidth.value) host.style.setProperty('--writing-dock-width', dockWidth.value + 'px')
  else host.style.removeProperty('--writing-dock-width')
}
watch([dockWidth, () => props.open], applyHostWidth)
onMounted(applyHostWidth)

function selectTab(tab) {
  dockTab.value = tab
  // 面板 overlay 开着时点任何 tab 都先收面板：否则高亮切了、内容仍被 overlay 盖住。
  if (panelOpen.value) emit('panel-close')
  // 点进会话即视为已读：tab 栏在 workspace 根元素的 markRead 命中区之外，得显式发信号。
  if (tab === 'session' && props.unread) emit('mark-read')
}

function onDockEsc(event) {
  // overlay 开着时 Esc 只收面板回会话段，并拦下冒泡（document 级 Esc 会关整个 dock）。
  if (!panelOpen.value) return
  event.stopPropagation()
  dockTab.value = 'session'
  emit('panel-close')
}

function startResize(event) {
  if (!desktopQuery?.matches) return
  // catalog 加宽列有自己的 clamp（520-600），拖了会出缝且值静默落盘：禁用。
  if (['outline', 'characters', 'worldbook'].includes(props.activeTool)) return
  event.preventDefault()
  resizePointerId = event.pointerId
  resizeAnchorRight = event.currentTarget.closest('.authoring-dock').getBoundingClientRect().right
  resizing.value = true
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  window.addEventListener('pointercancel', onResizeEnd)
}

function onResizeMove(event) {
  if (event.pointerId !== resizePointerId) return
  dockWidth.value = clampDockWidth(resizeAnchorRight - event.clientX)
}

function onResizeEnd(event) {
  if (event.pointerId !== resizePointerId) return
  resizePointerId = null
  resizing.value = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
  saveDockPreferences({ width: dockWidth.value })
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
})
</script>
