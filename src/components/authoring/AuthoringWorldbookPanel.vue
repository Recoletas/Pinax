<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import AuthoringSettingAiReview from './AuthoringSettingAiReview.vue'
import { buildAuthoringSettingContext } from '../../services/authoring/authoringSettingContext.js'

const props = defineProps({
  worldbook: { type: Object, default: null }, selectedText: { type: String, default: '' },
  sceneProjection: { type: Object, default: null }, contextLedger: { type: [Array, Object], default: null },
  annotations: { type: Array, default: () => [] }, document: { type: Object, default: null },
  caretContext: { type: Object, default: null }, focusEntryId: { type: String, default: '' },
  candidateEntryIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['bind', 'create', 'update', 'remove', 'open-full', 'toggle-pin', 'close'])
const ENTRY_TYPES = [
  ['general', '通用'], ['lore', '背景'], ['location', '地点'], ['organization', '组织'],
  ['event', '事件'], ['item', '物品'], ['quest', '任务'], ['rule', '规则'], ['style', '文风'], ['forbidden', '禁则']
]
const query = ref('')
const directoryMode = ref('contextual')
const typeFilter = ref('all')
const selectedId = ref('')
const aiReviewOpen = ref(false)
const collapsedFolders = ref(new Set())
const contentInput = ref(null)
const draft = reactive({ name: '', type: 'general', content: '', keysText: '', group: '', mode: 'selective' })
let hydrating = false
let saveTimer = null

const nonCharacterEntries = computed(() => (props.worldbook?.entries || []).filter((entry) => entry?.type !== 'character'))
const selectedEntry = computed(() => nonCharacterEntries.value.find((entry) => String(entry.id) === selectedId.value) || null)
const settingContext = computed(() => buildAuthoringSettingContext({
  worldbook: props.worldbook, document: props.document, caretContext: props.caretContext,
  sceneProjection: props.sceneProjection, contextLedger: props.contextLedger, annotations: props.annotations
}))
const contextualEntries = computed(() => {
  const ids = new Set(settingContext.value.groups.flatMap((group) => group.items)
    .filter((item) => item.type !== 'character').map((item) => String(item.id)))
  return nonCharacterEntries.value.filter((entry) => ids.has(String(entry.id)))
})
const visibleEntries = computed(() => {
  const source = directoryMode.value === 'contextual' ? contextualEntries.value : nonCharacterEntries.value
  const needle = query.value.trim().toLocaleLowerCase()
  return source.filter((entry) => (typeFilter.value === 'all' || entry.type === typeFilter.value)
    && (!needle || `${entry.name || ''} ${entry.content || ''} ${(entry.keys || []).join(' ')}`.toLocaleLowerCase().includes(needle)))
})
const groupedEntries = computed(() => {
  const groups = new Map()
  for (const entry of visibleEntries.value) {
    const group = String(entry.injection?.group || '').trim() || '设定'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push(entry)
  }
  return [...groups.entries()].map(([name, entries]) => ({ name, entries }))
})
function loadDraft(entry) {
  hydrating = true
  Object.assign(draft, {
    name: entry?.name || '', type: entry?.type || 'general', content: entry?.content || '',
    keysText: (entry?.keys || []).join('、'), group: entry?.injection?.group || '', mode: entry?.injection?.mode || 'selective'
  })
  hydrating = false
  nextTick(resizeContent)
}
function resizeContent() {
  const element = contentInput.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.max(180, Math.ceil(element.scrollHeight))}px`
}
function directoryExcerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim() || '暂无内容'
}
function selectEntry(entry) {
  if (!entry?.id) return
  flushSave()
  selectedId.value = String(entry.id)
  aiReviewOpen.value = false
  loadDraft(entry)
}
function entryPayload() {
  const entry = selectedEntry.value
  if (!entry || !draft.name.trim()) return null
  return {
    name: draft.name.trim(), type: draft.type,
    keys: [...new Set([draft.name.trim(), ...draft.keysText.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean)])],
    content: draft.content,
    injection: { ...(entry.injection || {}), mode: draft.mode, group: draft.group.trim() || null }
  }
}
function flushSave() {
  clearTimeout(saveTimer)
  saveTimer = null
  const payload = entryPayload()
  if (payload) emit('update', selectedEntry.value.id, payload, { silent: true })
}
function scheduleSave() {
  if (hydrating || !selectedEntry.value) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 500)
}
function startCreate() {
  flushSave()
  const seed = props.selectedText.trim().slice(0, 28)
  emit('create', {
    name: seed || '新设定', type: 'general', keys: seed ? [seed] : [], content: '',
    injection: { mode: 'selective', probability: 100, cooldown: 0, depth: 1, excludeRecursion: false, group: '设定' }
  })
}
function toggleFolder(name) {
  const next = new Set(collapsedFolders.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  collapsedFolders.value = next
}
function requestRemove() {
  if (!selectedEntry.value || !window.confirm(`确定删除设定「${selectedEntry.value.name || '未命名设定'}」？`)) return
  clearTimeout(saveTimer)
  saveTimer = null
  emit('remove', selectedEntry.value.id)
}
function applyAiCandidate(candidate) {
  Object.assign(draft, {
    name: candidate.name || draft.name, type: candidate.type || draft.type,
    content: candidate.content || draft.content, keysText: (candidate.keys || []).join('、'),
    group: candidate.injection?.group || draft.group, mode: candidate.injection?.mode || draft.mode
  })
  nextTick(() => { resizeContent(); flushSave() })
}

watch(draft, scheduleSave, { deep: true, flush: 'sync' })
watch(nonCharacterEntries, (entries) => {
  if (selectedEntry.value) return
  const preferred = entries.find((entry) => String(entry.id) === String(props.focusEntryId || '')) || entries[0]
  if (preferred) selectEntry(preferred)
}, { immediate: true })
watch(() => props.focusEntryId, (id) => {
  const target = nonCharacterEntries.value.find((entry) => String(entry.id) === String(id || ''))
  if (target) selectEntry(target)
})
watch(() => props.worldbook?.id, () => {
  selectedId.value = ''
  query.value = ''
  directoryMode.value = 'contextual'
  typeFilter.value = 'all'
})
onBeforeUnmount(flushSave)
</script>

<template>
  <section class="authoring-setting-workbench">
    <main class="setting-sheet">
      <template v-if="worldbook && selectedEntry">
        <header class="setting-sheet__head">
          <input v-model="draft.name" aria-label="设定名称" @blur="flushSave" />
          <button type="button" class="setting-ai" :aria-pressed="aiReviewOpen.toString()" @click="aiReviewOpen = !aiReviewOpen">AI 补全</button>
          <button type="button" class="setting-delete" aria-label="删除设定" title="删除设定" @click="requestRemove"><WorkbenchIcon name="trash" :size="15" /></button>
        </header>
        <AuthoringSettingAiReview v-model:open="aiReviewOpen" :worldbook="worldbook" :entry="selectedEntry" @apply="applyAiCandidate" />
        <div class="setting-sheet__scroll">
          <!-- A2-1：内容优先；触发词/注入归"用于AI的规则"折叠；类型/分组归对象属性 -->
          <label class="setting-content"><span>内容</span><textarea ref="contentInput" v-model="draft.content" @input="resizeContent(); scheduleSave()" @blur="flushSave"></textarea></label>
          <div class="setting-object-row">
            <label><span>类型</span><select v-model="draft.type" @change="flushSave"><option v-for="item in ENTRY_TYPES" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label>
            <label><span>分组</span><input v-model="draft.group" placeholder="可选" @blur="flushSave" /></label>
          </div>
          <details class="setting-ai-rules">
            <summary>用于 AI 的规则</summary>
            <div class="setting-ai-rules__body">
              <label><span>触发词</span><input v-model="draft.keysText" placeholder="用顿号分隔" @blur="flushSave" /></label>
              <label><span>进入上下文</span><select v-model="draft.mode" @change="flushSave"><option value="selective">命中触发词时</option><option value="constant">始终</option></select></label>
            </div>
          </details>
        </div>
      </template>
      <div v-else-if="worldbook" class="setting-empty"><strong>还没有设定</strong><button type="button" @click="startCreate">新建设定</button></div>
      <div v-else class="setting-empty">
        <strong>从第一条设定开始</strong>
        <p>新建时会自动为这本书建立资料库；也可以关联已有资料库。</p>
        <button type="button" @click="startCreate">新建设定</button>
        <button type="button" @click="emit('bind')">关联已有资料库</button>
      </div>
    </main>
    <aside class="setting-directory">
      <div class="catalog-window-controls"><button type="button" title="固定设定工作台" @click="emit('toggle-pin')">⌖</button><button type="button" title="关闭设定工作台" @click="emit('close')">×</button></div>
      <div class="setting-directory__search-row"><div class="catalog-search"><WorkbenchIcon name="search" :size="16" /><input v-model="query" type="search" placeholder="设定" aria-label="搜索设定" /></div><button type="button" class="setting-create" aria-label="新建设定" @click="startCreate"><WorkbenchIcon name="bookmark-plus" :size="15" /><span>新建</span></button></div>
      <nav class="setting-directory__modes" aria-label="设定目录范围"><button type="button" :class="{ active: directoryMode === 'contextual' }" @click="directoryMode = 'contextual'">当前落笔处</button><button type="button" :class="{ active: directoryMode === 'all' }" @click="directoryMode = 'all'">全部</button></nav>
      <select v-model="typeFilter" class="setting-type-filter" aria-label="筛选设定类型"><option value="all">全部类型</option><option v-for="item in ENTRY_TYPES" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select>
      <section v-for="group in groupedEntries" :key="group.name" class="setting-directory__group">
        <h3><button type="button" :aria-expanded="(!collapsedFolders.has(group.name)).toString()" @click="toggleFolder(group.name)"><span class="catalog-folder-caret" :class="{ open: !collapsedFolders.has(group.name) }">›</span><WorkbenchIcon name="folder" :size="17" /><span>{{ group.name }}</span></button></h3>
        <template v-if="!collapsedFolders.has(group.name)"><button v-for="entry in group.entries" :key="entry.id" type="button" :class="{ active: selectedId === String(entry.id) }" @click="selectEntry(entry)"><span>{{ entry.name || '未命名设定' }}</span><small>{{ directoryExcerpt(entry.content) }}</small></button></template>
      </section>
      <div v-if="!groupedEntries.length" class="setting-directory__empty">{{ directoryMode === 'contextual' ? '当前落笔处没有命中的设定' : '没有匹配的设定' }}</div>
      <button class="setting-open-full" type="button" @click="emit('open-full', selectedEntry?.id)">高级管理</button>
    </aside>
  </section>
</template>

<style scoped>
.authoring-setting-workbench{display:grid;grid-template-columns:minmax(300px,1.35fr) minmax(210px,.95fr);min-height:100%;height:100%;background:var(--surface-workbench-raised)}
button{border:0;background:transparent;color:var(--text-secondary);font:inherit;cursor:pointer}.primary{background:var(--accent-primary,var(--accent,#1677ff))!important;color:#fff!important}
.setting-sheet{position:relative;display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--border-subtle)}.setting-sheet__head{display:flex;min-height:62px;align-items:center;gap:12px;padding:8px 16px}.setting-sheet__head input{min-width:0;flex:1;border:0;background:transparent;color:var(--text-primary);font:600 17px/1.5 var(--font-body);outline:0}.setting-sheet__head input:focus{box-shadow:inset 0 -1px var(--accent-primary)}.setting-ai{color:var(--accent-primary);font-size:11px}.setting-delete{width:28px;height:28px}.setting-sheet__scroll{flex:1;min-height:0;overflow:auto;padding:7px 16px 32px}.setting-sheet__scroll label{display:grid;gap:7px;padding:14px 0;border-bottom:1px dashed var(--border-subtle)}.setting-sheet__scroll label>span{color:var(--text-secondary);font-size:12px}.setting-sheet__scroll input,.setting-sheet__scroll textarea,.setting-sheet__scroll select{box-sizing:border-box;width:100%;border:0;outline:0;background:transparent;color:var(--text-primary);font:14px/1.8 var(--font-body)}.setting-sheet__scroll textarea{min-height:180px;overflow:hidden;resize:none}.setting-sheet__scroll input:focus,.setting-sheet__scroll textarea:focus,.setting-sheet__scroll select:focus{box-shadow:inset 0 -1px var(--accent-primary)}.setting-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.setting-object-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:10px 0 4px}
.setting-ai-rules{border-top:1px dashed var(--border-subtle);margin-top:4px;padding-top:2px}
.setting-ai-rules summary{color:var(--text-secondary);font:500 12px/1 var(--font-sans);cursor:pointer;padding:10px 0;list-style:none;user-select:none}
.setting-ai-rules summary::before{content:'› ';display:inline-block;transition:transform 120ms}
.setting-ai-rules[open] summary::before{transform:rotate(90deg)}
.setting-ai-rules__body{display:grid;gap:7px;padding-bottom:10px}.setting-empty{display:grid;place-content:center;gap:10px;height:100%;color:var(--text-secondary);text-align:center}.setting-empty button{color:var(--accent-primary)}
.setting-directory{display:flex;min-width:0;min-height:0;flex-direction:column;overflow:auto;padding:6px 12px 12px}.catalog-window-controls{display:flex;height:28px;align-items:center;justify-content:flex-end;gap:3px}.catalog-window-controls button{width:28px;height:28px;border-radius:5px;font-size:18px}.catalog-window-controls button:hover{background:color-mix(in srgb,var(--text-primary) 6%,transparent);color:var(--text-primary)}.setting-directory__search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:9px}.catalog-search{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;height:36px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--surface-workbench-muted);color:var(--text-secondary)}.catalog-search input{min-width:0;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit}.setting-create{display:inline-flex;min-width:72px;height:36px;align-items:center;justify-content:center;gap:5px;padding:0 10px;border-radius:6px!important;background:color-mix(in srgb,var(--accent-primary,var(--accent,#1677ff)) 10%,transparent)!important;color:var(--accent-primary,var(--accent,#1677ff))!important;font-size:12px!important;font-weight:560}.setting-create:hover{background:color-mix(in srgb,var(--accent-primary,var(--accent,#1677ff)) 16%,transparent)!important}.setting-directory__modes{display:flex;border-bottom:1px solid var(--border-subtle)}.setting-directory__modes button{min-height:34px;flex:1;border-bottom:2px solid transparent}.setting-directory__modes button.active{border-bottom-color:var(--accent-primary);color:var(--text-primary)}.setting-type-filter{height:32px;margin-top:7px;border:0;border-bottom:1px solid var(--border-subtle);outline:0;background:transparent;color:var(--text-secondary)}.setting-directory__group h3{margin:10px 0 5px;font-size:13px;font-weight:500}.setting-directory__group h3 button{display:flex;width:100%;min-height:30px;align-items:center;gap:6px;padding:0 6px;color:var(--text-primary);text-align:left}.catalog-folder-caret{display:inline-block;width:10px;color:var(--text-secondary);font-size:15px;transform-origin:center;transition:transform var(--motion-fast,120ms)}.catalog-folder-caret.open{transform:rotate(90deg)}.setting-directory__group>button{display:grid;width:100%;min-height:38px;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;padding:0 12px 0 27px;border-radius:5px;text-align:left;color:var(--text-primary)}.setting-directory__group>button:hover{background:color-mix(in srgb,var(--text-primary) 5%,transparent)}.setting-directory__group>button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.setting-directory__group>button small{color:var(--text-secondary);font-size:10px}.setting-directory__group>button.active{background:color-mix(in srgb,var(--accent-primary,var(--accent,#1677ff)) 10%,var(--surface-workbench-raised));box-shadow:inset 2px 0 var(--accent-primary,var(--accent,#1677ff));font-weight:600}.setting-directory__empty{padding:24px 5px;color:var(--text-secondary);font-size:11px;line-height:1.6}.setting-open-full{margin-top:auto;padding:12px 4px 2px;text-align:left;color:var(--accent-primary);font-size:11px}
.setting-sheet__head input{font-size:var(--authoring-catalog-title-size,17px)}.setting-ai{font-size:var(--authoring-catalog-meta-size,10px)}.setting-sheet__scroll label>span{font-size:var(--authoring-catalog-label-size,12px)}.setting-sheet__scroll input,.setting-sheet__scroll textarea,.setting-sheet__scroll select{font-size:var(--authoring-catalog-body-size,14px)}.catalog-search input,.setting-directory__modes button,.setting-type-filter{font-size:var(--authoring-catalog-control-size,14px)}.setting-directory__group h3{font-size:var(--authoring-catalog-folder-size,13px)}.setting-directory__group h3 button{font-size:inherit}.setting-directory__group>button{font-size:var(--authoring-catalog-entry-size,13px)}.setting-directory__group>button small,.setting-open-full{font-size:var(--authoring-catalog-meta-size,10px)}
.setting-directory__group h3{margin:6px 0 0}
.setting-directory__group h3 button{min-height:34px;padding-inline:4px}
.setting-directory__group>button{display:grid;min-height:40px;grid-template-columns:minmax(0,1fr) minmax(0,44%);align-items:center;gap:7px;padding-inline:36px 10px;overflow:hidden;white-space:nowrap}
.setting-directory__group>button small{overflow:hidden;color:var(--text-secondary);font-size:var(--authoring-catalog-meta-size,10px);font-weight:400;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:720px){.authoring-setting-workbench{grid-template-columns:1fr;grid-template-rows:minmax(0,42%) minmax(0,58%)}.setting-directory{order:-1;border-bottom:1px solid var(--border-subtle)}.setting-sheet{border-right:0}}
@media(pointer:coarse){.catalog-window-controls button,.setting-delete,.setting-create{min-width:44px;min-height:44px}.setting-directory__group>button{min-height:44px}.setting-directory__search-row{grid-template-columns:minmax(0,1fr) 44px}}
</style>
