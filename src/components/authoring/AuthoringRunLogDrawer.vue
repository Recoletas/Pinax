<script setup>
import { defineAsyncComponent, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

// W-B dock 收敛：旧四段 dock 的「执行」tab 退役，运行日志降级为 Agent 面板内
// 的次级入口——默认收起，点开即在助手面板下方展开 AuthoringRunLog（同一挂载、
// 同一 data-test 契约）。AuthoringRunLog 沉到本组件异步加载，Authoring.vue
// 的 import 预算不受影响。
const AuthoringRunLog = defineAsyncComponent(() => import('./AuthoringRunLog.vue'))

const props = defineProps({
  projectId: { type: [String, Number], default: '' }
})

const open = ref(false)
function toggle() {
  open.value = !open.value
}
</script>

<template>
  <section class="authoring-run-log-drawer" :class="{ 'is-open': open }">
    <button type="button" class="authoring-run-log-drawer__toggle" data-test="authoring-run-log-entry"
      :aria-expanded="open.toString()" :aria-controls="open ? 'authoring-run-log-drawer-body' : undefined"
      @click="toggle">
      <WorkbenchIcon name="history" :size="14" />
      <span>{{ tr('运行日志') }}</span>
      <WorkbenchIcon name="chevron-down" :size="14" class="authoring-run-log-drawer__chevron" />
    </button>
    <div v-if="open" id="authoring-run-log-drawer-body" class="authoring-run-log-drawer__body">
      <AuthoringRunLog :project-id="projectId" />
    </div>
  </section>
</template>

<style scoped>
.authoring-run-log-drawer { flex: none; border-top: 1px solid var(--hairline-soft, var(--authoring-hairline)); background: var(--surface-workbench-muted); }
.authoring-run-log-drawer__toggle { display: flex; width: 100%; min-height: 36px; align-items: center; gap: 7px; padding: 6px 14px; border: 0; background: transparent; color: var(--text-secondary); font: 12px/1.4 var(--font-interface, var(--font-sans)); cursor: pointer; }
.authoring-run-log-drawer__toggle:hover { background: var(--nav-hover); color: var(--text-primary); }
.authoring-run-log-drawer__toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.authoring-run-log-drawer__chevron { margin-inline-start: auto; transition: transform 120ms ease; }
.authoring-run-log-drawer:not(.is-open) .authoring-run-log-drawer__chevron { transform: rotate(-90deg); }
.authoring-run-log-drawer__body { max-height: min(300px, 45vh); overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--hairline-soft, var(--authoring-hairline)); }
@media (max-width: 720px) { .authoring-run-log-drawer__toggle { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .authoring-run-log-drawer__chevron { transition: none; } }
</style>
