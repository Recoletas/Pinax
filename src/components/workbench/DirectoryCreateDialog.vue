<script setup>
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { tr } from '../../i18n/index.js'
import { useWorldStore, readWorldbookSnapshot } from '../../stores/worldStore.js'
import { ensureBookWorldbook, resolveBookSourceContext } from '../../services/worldbook/worldbookProjectSources.js'
import { SETTING_TYPES } from '../../services/worldbook/settingWorkspaceModel.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
const ImportDialog = defineAsyncComponent(() => import('../worldbook/WorldbookSourceImportDialog.vue'))
const props = defineProps({ request: { type: Object, required: true } })
const emit = defineEmits(['close', 'created'])
const store = useWorldStore()
const dialog = ref(null)
const nameInput = ref(null)
const name = ref('')
const type = ref(props.request.initialType || 'general')
const busy = ref(false)
const error = ref('')
const duplicateName = ref('')
watch(name, () => { duplicateName.value = ''; error.value = '' })
const target = { ...props.request }
let disposed = false
let submitted = false
let previousFocus
// The modal belongs to the captured project; browser back must not unload an import.
function guard() { error.value = tr('请先完成或关闭当前窗口，再切换内容。'); return false }
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)
onMounted(async () => {
  previousFocus = document.activeElement
  if (target.type === 'entry') { dialog.value?.showModal(); await nextTick(); nameInput.value?.focus() }
})
onBeforeUnmount(() => { disposed = true; dialog.value?.close(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
function close() { if (!busy.value) emit('close') }
async function create() {
  if (busy.value || !name.value.trim()) return
  busy.value = true; error.value = ''
  try {
    const context = target.bookId
      ? await ensureBookWorldbook({ bookId: target.bookId, worldStore: store })
      : { ok: Boolean(readWorldbookSnapshot(target.worldbookId)), worldbookId: target.worldbookId }
    if (!context.ok) throw new Error(tr('无法准备本书设定库，请检查作品关联后重试。'))
    if (disposed) return
    const current = target.bookId ? resolveBookSourceContext(target.bookId) : context
    if (!current.ok || current.worldbookId !== context.worldbookId || target.worldbookId && target.worldbookId !== context.worldbookId) throw new Error(tr('作品的设定库关联已变化，请重新打开。'))
    const matches = readWorldbookSnapshot(context.worldbookId)?.entries?.filter(entry => entry.name === name.value.trim()) || []
    if (matches.length && duplicateName.value !== name.value.trim()) { duplicateName.value = name.value.trim(); error.value = tr('已有同名设定。继续会创建独立条目，不会覆盖原件。'); return }
    const entry = await store.addEntry(context.worldbookId, { name: name.value.trim(), type: type.value, content: '', keys: [] })
    if (!disposed) { submitted = true; emit('created', [{ type: 'entry', bookId: target.bookId, worldbookId: context.worldbookId, id: String(entry.id) }]) }
  } catch (cause) { if (!disposed) error.value = cause.message || tr('新建设定失败，输入已保留。') }
  finally { if (!submitted) busy.value = false }
}
function imported(payload) {
  if (payload?.bookId !== target.bookId) { emit('close'); return }
  emit('created', (payload.addedSources || []).map(source => ({ type: 'source', bookId: target.bookId, worldbookId: payload.worldbookId, id: String(source.id), contentHash: source.contentHash || '' })))
}
</script>
<template>
  <ImportDialog v-if="target.type === 'import'" :book-id="target.bookId" @close="emit('close')" @completed="imported" />
  <Teleport v-else to="body">
    <dialog ref="dialog" class="directory-create-dialog" aria-labelledby="directory-create-title" @cancel.prevent="close">
      <form @submit.prevent="create">
        <header><h2 id="directory-create-title">{{ tr('新建设定') }}</h2><button type="button" :disabled="busy" :aria-label="tr('关闭')" @click="close"><WorkbenchIcon name="close" :size="18" /></button></header>
        <label>{{ tr('名称') }}<input ref="nameInput" v-model="name" :disabled="busy" maxlength="160" required autocomplete="off" /></label>
        <label>{{ tr('类型') }}<select v-model="type" :aria-label="tr('类型')" :disabled="busy"><option v-for="item in SETTING_TYPES" :key="item.value" :value="item.value">{{ tr(item.label) }}</option></select></label>
        <p class="directory-create-location">{{ tr('保存到') }}：{{ target.path || tr('设定') }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <footer><button type="button" class="control-secondary" :disabled="busy" @click="close">{{ tr('取消') }}</button><button type="submit" class="control-primary" :disabled="busy || !name.trim()">{{ busy ? tr('正在创建…') : duplicateName ? tr('同名新建') : tr('创建') }}</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>
<style scoped>
.directory-create-dialog { width: min(380px, calc(100vw - 32px)); box-sizing: border-box; margin: auto; max-height: calc(100dvh - 32px); overflow-y: auto; padding: 24px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench); color: var(--text-primary); box-shadow: var(--shadow-workbench-float); }
.directory-create-dialog::backdrop { background: rgb(0 0 0 / 35%); }
header, footer { display: flex; align-items: center; gap: 12px; }
header { margin-bottom: 20px; }
h2 { flex: 1; margin: 0; font: 600 17px var(--font-sans); }
header button { border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; }
label { display: grid; gap: 8px; margin-block: 16px; font: 13px var(--font-sans); }
input, select { width: 100%; box-sizing: border-box; min-height: 38px; padding: 8px 10px; border: 1px solid var(--hairline-soft); border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
.directory-create-location { color: var(--text-muted); font-size: 12px; overflow-wrap: anywhere; }
footer { justify-content: flex-end; margin-top: 24px; }
footer button { padding: 8px 16px; cursor: pointer; }
</style>
