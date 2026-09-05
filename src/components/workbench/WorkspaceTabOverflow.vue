<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

// “全部标签”菜单（计划 Task 4）：标签溢出的确定性入口。
// 桌面是下拉菜单；<760 是覆盖层列表（配合顶栏只显示当前标签）。
const props = defineProps({
  tabs: { type: Array, required: true },
  activeTabId: { type: String, default: '' }
})

const emit = defineEmits(['activate', 'close'])

const open = ref(false)
const triggerRef = ref(null)
const menuRef = ref(null)

const hiddenCount = computed(() => props.tabs.length)

function toggle() {
  open.value = !open.value
}

function onDocumentPointerDown(event) {
  if (!open.value) return
  const target = event.target
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) return
  open.value = false
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    triggerRef.value?.focus()
  }
}

function activate(tabId) {
  open.value = false
  emit('activate', tabId)
}

function close(tabId) {
  emit('close', tabId)
  if (props.activeTabId === tabId) open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div class="ws-overflow">
    <button
      ref="triggerRef"
      class="ws-overflow__trigger"
      type="button"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="menu"
      aria-label="全部标签"
      data-test="workspace-tabs-overflow"
      @click="toggle"
    >
      <WorkbenchIcon name="more" :size="15" />
      <span class="ws-overflow__count">{{ hiddenCount }}</span>
    </button>
    <div
      v-if="open"
      ref="menuRef"
      class="ws-overflow__menu"
      role="menu"
      aria-label="全部标签"
      data-test="workspace-tabs-menu"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="ws-overflow__item"
        :class="{ 'is-active': tab.id === activeTabId }"
        type="button"
        role="menuitem"
        :title="tab.title"
        @click="activate(tab.id)"
      >
        <span class="ws-overflow__item-title">{{ tab.title }}</span>
        <span v-if="tab.dirty" class="ws-overflow__item-dirty" aria-label="有未保存更改"></span>
        <span
          class="ws-overflow__item-close"
          role="button"
          aria-label="关闭"
          tabindex="-1"
          @click.stop="close(tab.id)"
        >×</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ws-overflow {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.ws-overflow__trigger {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 20%, transparent);
  background: transparent;
  color: var(--archive-ink-soft, #4a637d);
  cursor: pointer;
  transition: color var(--motion-fast, 140ms) ease, background-color var(--motion-fast, 140ms) ease;
}

.ws-overflow__trigger:hover {
  color: var(--archive-ink, #0f2236);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 8%, transparent);
}

.ws-overflow__trigger:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 70%, transparent);
  outline-offset: 1px;
}

.ws-overflow__count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.ws-overflow__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  max-width: min(320px, calc(100vw - 24px));
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
  background: var(--archive-paper-soft, #fbfdfe);
  border: 1px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 24%, transparent);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--archive-ink, #0f2236) 12%, transparent);
  z-index: var(--z-workbench-overlay, 180);
}

.ws-overflow__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--archive-ink-soft, #4a637d);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.ws-overflow__item:hover {
  color: var(--archive-ink, #0f2236);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 8%, transparent);
}

.ws-overflow__item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive, #1f4d7a) 70%, transparent);
  outline-offset: -2px;
}

.ws-overflow__item.is-active {
  color: var(--archive-ink, #0f2236);
  font-weight: 600;
}

.ws-overflow__item-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-overflow__item-dirty {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
  background: var(--archive-rose, #a23a4a);
}

.ws-overflow__item-close {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--archive-ink-soft, #4a637d);
  font-size: 14px;
  border-radius: 50%;
}

.ws-overflow__item-close:hover {
  color: var(--archive-ink, #0f2236);
  background: color-mix(in srgb, var(--archive-olive, #1f4d7a) 14%, transparent);
}

/* <760：菜单改为靠近顶栏的覆盖列表，宽度贴合视口。 */
@media (max-width: 759px) {
  .ws-overflow__menu {
    position: fixed;
    top: auto;
    left: 8px;
    right: 8px;
    bottom: 8px;
    max-height: none;
    width: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ws-overflow__trigger,
  .ws-overflow__item {
    transition: none;
  }
}
</style>
