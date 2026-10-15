<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WorldbookCreationWorkspace from '../../pages/WorldbookCreationWorkspace.vue'

const props = defineProps({ bookId: { type: String, required: true }, fileMode: { type: Boolean, default: false } })
const emit = defineEmits(['close', 'completed'])
const dialog = ref(null)
const workspace = ref(null)
let previousFocus = null

onMounted(() => {
  previousFocus = document.activeElement
  dialog.value.showModal()
  dialog.value.querySelector('.source-dialog-close')?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  dialog.value?.close()
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})
function requestClose() { workspace.value?.requestClose() }
function onBackdropClick(event) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose()
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="source-import-dialog" aria-labelledby="source-import-heading" @cancel.prevent="requestClose" @click="onBackdropClick">
      <WorldbookCreationWorkspace ref="workspace" embedded :book-id="props.bookId" :file-mode="props.fileMode" @close="emit('close')" @completed="emit('completed', $event)" />
    </dialog>
  </Teleport>
</template>

<style scoped>
.source-import-dialog { width: min(600px, calc(100vw - 48px)); max-width: none; max-height: min(760px, calc(100dvh - 80px)); margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--hairline-soft); border-radius: 18px; background: var(--surface-workbench); color: var(--text-primary); box-shadow: 0 24px 80px rgb(0 0 0 / 24%); }
.source-import-dialog::backdrop { background: rgb(0 0 0 / 35%); backdrop-filter: blur(5px); }
@media (max-width: 760px) { .source-import-dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 32px); border-radius: 16px; } }
@media (prefers-reduced-motion: no-preference) { .source-import-dialog[open] { animation: source-dialog-enter 140ms ease-out; } @keyframes source-dialog-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } } }
</style>
