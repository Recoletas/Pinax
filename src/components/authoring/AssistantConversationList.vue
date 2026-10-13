<script setup>
import { computed, nextTick, ref, unref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ assistant: { type:Object, required:true }, busy:Boolean })
const emit = defineEmits(['select', 'new', 'deleted'])
const sessions = computed(() => unref(props.assistant.sessions) || [])
const archived = ref(false), renaming = ref(''), title = ref(''), notice = ref(''), data = ref(null)
const visible = computed(() => sessions.value.filter(session => Boolean(session.archived) === archived.value))
const root = ref(null)
watch(() => sessions.value.find(session => session.active)?.sessionId, () => { renaming.value = ''; data.value = null; notice.value = '' })
async function rename(session) { renaming.value = session.sessionId; title.value = session.title; await nextTick(); root.value?.querySelector('input')?.focus() }
function save(session) { if (props.assistant.renameConversation(session.sessionId, title.value)) renaming.value = '' }
function remove(session) { if (window.confirm(tr('删除对话「{title}」？删除后无法恢复。', {title:session.title})) && props.assistant.deleteConversation(session.sessionId)) emit('deleted') }
async function copy(session, field) {
  const details = props.assistant.conversationDetails(session.sessionId)
  if (!details) return
  try { await navigator.clipboard.writeText(field === 'data' ? JSON.stringify(details, null, 2) : String(details[field])); notice.value = tr('已复制') }
  catch { data.value = details; notice.value = tr('无法复制，请在会话详情中手动复制。') }
}
function showData(session) { data.value = props.assistant.conversationDetails(session.sessionId) }
</script>
<template>
  <section ref="root" class="assistant-conversation-list" :aria-label="tr('对话列表')">
    <header><strong>{{ tr('对话') }}</strong><button type="button" :disabled="busy" @click="emit('new')">{{ tr('新建对话') }}</button><button v-if="sessions.some(session => session.archived) || archived" type="button" @click="archived = !archived">{{ tr(archived ? '返回对话' : '已归档') }}</button></header>
    <div v-for="session in visible" :key="session.sessionId" class="assistant-conversation-list__row" :class="{ 'is-active': session.active }">
      <div v-if="renaming === session.sessionId" class="assistant-conversation-list__rename"><input v-model="title" maxlength="80" :aria-label="tr('对话名称')" @keydown.enter.prevent="save(session)" @keydown.esc.stop="renaming = ''" /><button type="button" :disabled="busy || !title.trim()" @click="save(session)">{{ tr('保存') }}</button><button type="button" @click="renaming = ''">{{ tr('取消') }}</button></div>
      <template v-else>
        <button type="button" class="assistant-conversation-list__select" :disabled="busy" :aria-current="session.active ? 'true' : undefined" @click="emit('select', session.sessionId)"><WorkbenchIcon name="message-square" :size="14" /><span>{{ session.title }}</span></button>
        <details class="assistant-conversation-list__menu" @focusout="event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }" @keydown.esc.stop.prevent="event => { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }">
          <summary :aria-label="tr('对话操作')" :title="tr('对话操作')"><WorkbenchIcon name="more" :size="16" /></summary>
          <div class="assistant-conversation-list__options">
            <button type="button" :disabled="busy" @click="rename(session)">{{ tr('重命名') }}</button>
            <button type="button" :disabled="busy" @click="assistant.archiveConversation(session.sessionId, !session.archived)">{{ tr(session.archived ? '取消归档' : '归档') }}</button>
            <button type="button" :disabled="busy" @click="showData(session)">{{ tr('会话详情') }}</button>
            <button type="button" :disabled="busy" @click="copy(session, 'sessionId')">{{ tr('复制会话 ID') }}</button>
            <button type="button" :disabled="busy" @click="copy(session, 'storageKey')">{{ tr('复制存储键') }}</button>
            <button type="button" :disabled="busy" @click="remove(session)">{{ tr('删除对话') }}</button>
          </div>
        </details>
      </template>
    </div>
    <p v-if="!visible.length">{{ tr(archived ? '没有已归档的对话' : '没有对话') }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <details v-if="data" open class="assistant-conversation-list__data"><summary>{{ tr('会话详情') }}</summary><button type="button" @click="copy({sessionId:data.sessionId}, 'data')">{{ tr('复制会话数据') }}</button><button type="button" @click="data = null">{{ tr('关闭') }}</button><pre>{{ JSON.stringify(data, null, 2) }}</pre></details>
  </section>
</template>
<style scoped>
.assistant-conversation-list { min-width:0; color:var(--text-secondary); font:12px/1.5 var(--font-interface); }
.assistant-conversation-list header { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:8px 4px; }
.assistant-conversation-list header strong { margin-inline-end:auto; color:var(--text-primary); font-weight:600; }
.assistant-conversation-list button { border:0; background:transparent; color:inherit; font:inherit; cursor:pointer; border-radius:var(--radius-control); min-height:30px; }
.assistant-conversation-list button:hover { color:var(--text-primary); background:var(--nav-hover); }
.assistant-conversation-list button:focus-visible, .assistant-conversation-list summary:focus-visible { outline:2px solid var(--accent); }
.assistant-conversation-list__row { display:grid; grid-template-columns:minmax(0,1fr) 28px; align-items:start; border-radius:var(--radius-control); }
.assistant-conversation-list__row.is-active { background:var(--nav-selected); color:var(--text-primary); }
.assistant-conversation-list__select { display:flex; min-width:0; gap:8px; align-items:center; text-align:start; padding:7px 6px; }
.assistant-conversation-list__select span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.assistant-conversation-list__menu summary { display:flex; align-items:center; justify-content:center; min-height:34px; cursor:pointer; list-style:none; }
.assistant-conversation-list__menu summary::-webkit-details-marker { display:none; }
.assistant-conversation-list__row:has(details[open]) { grid-template-columns:minmax(0,1fr) 28px; }
.assistant-conversation-list__menu[open] { display:contents; }
.assistant-conversation-list__options { grid-column:1 / -1; display:flex; flex-wrap:wrap; padding:4px; gap:4px; border-top:1px solid var(--hairline-soft); }
.assistant-conversation-list__options button { padding:4px 7px; }
.assistant-conversation-list__rename { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:4px; padding:6px; }
.assistant-conversation-list__rename input { min-width:0; width:100%; border:1px solid var(--hairline-soft); background:var(--surface-workbench-input); color:var(--text-primary); border-radius:var(--radius-control); padding:5px 7px; }
.assistant-conversation-list__data { padding:8px 4px; }
.assistant-conversation-list__data pre { max-height:220px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:11px/1.5 var(--font-mono); }
.assistant-conversation-list p { color:var(--text-muted); font-size:12px; padding:4px; }
@media (max-width:720px), (pointer:coarse) { .assistant-conversation-list button, .assistant-conversation-list__menu summary { min-height:44px; } }
</style>
