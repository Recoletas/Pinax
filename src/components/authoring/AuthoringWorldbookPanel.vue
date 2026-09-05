<script setup>
import { computed, ref, watch } from 'vue'
import AuthoringSettingContext from './AuthoringSettingContext.vue'
import AuthoringSettingDetail from './AuthoringSettingDetail.vue'
import { buildAuthoringSettingContext, buildAuthoringSettingDetail } from '../../services/authoring/authoringSettingContext.js'
const props = defineProps({
  worldbook: { type: Object, default: null }, selectedText: { type: String, default: '' }, dual: Boolean,
  writingUnit: { type: Object, default: null }, sceneProjection: { type: Object, default: null },
  contextLedger: { type: [Array, Object], default: null }, annotations: { type: Array, default: () => [] },
  document: { type: Object, default: null }, caretContext: { type: Object, default: null },
  focusEntryId: { type: String, default: '' },
  candidateEntryIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['bind', 'open-full', 'open-dual', 'annotate', 'toggle-dual', 'locate-mention'])
const query = ref('')
const type = ref('all')
const mode = ref('contextual')
const returnMode = ref('contextual')
const selectedId = ref('')
const settingContext = computed(() => buildAuthoringSettingContext({
  worldbook: props.worldbook, document: props.document, caretContext: props.caretContext,
  sceneProjection: props.sceneProjection, contextLedger: props.contextLedger, annotations: props.annotations
}))
const entries = computed(() => {
  const q = query.value.trim().toLocaleLowerCase()
  return (props.worldbook?.entries || []).filter((entry) => {
    if (type.value !== 'all' && entry.type !== type.value) return false
    return !q || `${entry.name || ''} ${entry.content || ''} ${(entry.keys || []).join(' ')}`.toLocaleLowerCase().includes(q)
  })
})
const types = computed(() => [...new Set((props.worldbook?.entries || []).map((entry) => entry.type || 'general'))])
const contextItems = computed(() => settingContext.value.groups.flatMap((group) => group.items))
const candidateEntries = computed(() => props.candidateEntryIds
  .map((id) => (props.worldbook?.entries || []).find((entry) => String(entry?.id) === String(id)))
  .filter(Boolean))
const selectedItem = computed(() => {
  const contextual = contextItems.value.find((item) => item.id === selectedId.value)
  if (contextual) return contextual
  const entry = (props.worldbook?.entries || []).find((item) => String(item.id) === selectedId.value)
  return buildAuthoringSettingDetail(entry, props.document, props.caretContext)
})
function selectItem(id) { returnMode.value = mode.value === 'detail' ? returnMode.value : mode.value; selectedId.value = id; mode.value = 'detail' }
function browse() { mode.value = 'browse' }
function back() { mode.value = returnMode.value || 'contextual'; if (!props.dual) selectedId.value = '' }
watch(() => props.worldbook?.id, () => { mode.value = 'contextual'; returnMode.value = 'contextual'; selectedId.value = ''; query.value = ''; type.value = 'all' })
watch(() => props.focusEntryId, (id) => { if (id) selectItem(String(id)) })
watch(() => props.candidateEntryIds.join('|'), () => {
  if (candidateEntries.value.length > 1) {
    mode.value = 'ambiguity'
    selectedId.value = ''
  }
})
</script>

<template>
  <section class="authoring-worldbook-panel" :class="{ 'is-dual': dual }">
    <template v-if="worldbook">
      <div class="authoring-worldbook-index" :class="{ 'is-detail': mode === 'detail' }">
        <section v-if="mode === 'ambiguity' && candidateEntries.length > 1" class="authoring-setting-ambiguity" aria-label="选择同名设定来源">
          <header><strong>选择对应的资料</strong><span>正文中的名称匹配到 {{ candidateEntries.length }} 条设定</span></header>
          <button v-for="entry in candidateEntries" :key="entry.id" type="button" @click="selectItem(String(entry.id))">
            <span><strong>{{ entry.name || '未命名设定' }}</strong><small>{{ entry.type || 'general' }}</small></span>
            <em>{{ String(entry.content || entry.text || '暂无说明').replace(/\s+/g, ' ').slice(0, 56) }}</em>
          </button>
        </section>
        <AuthoringSettingContext v-else-if="mode === 'contextual' || (dual && mode === 'detail' && returnMode === 'contextual')" :context="settingContext" :selected-id="selectedId" @select="selectItem" @browse="browse" />
        <section v-else-if="mode === 'browse' || (dual && mode === 'detail' && returnMode === 'browse')" class="authoring-setting-browser">
          <header><button type="button" @click="mode = 'contextual'">← 当前落笔处</button><strong>设定目录</strong></header>
          <div class="authoring-worldbook-tools"><input v-model="query" type="search" placeholder="搜索当前世界书" aria-label="搜索设定" /></div>
          <div class="authoring-worldbook-filter"><button type="button" :class="{ active: type === 'all' }" @click="type = 'all'">全部</button><button v-for="item in types" :key="item" type="button" :class="{ active: type === item }" @click="type = item">{{ item }}</button></div>
          <button v-for="entry in entries" :key="entry.id" type="button" class="authoring-setting-directory-row" :class="{ active: selectedId === String(entry.id) }" @click="selectItem(String(entry.id))"><span><strong>{{ entry.name || '未命名设定' }}</strong><small>{{ entry.type || 'general' }}</small></span><span>›</span></button>
          <div v-if="!entries.length" class="writing-inspector__empty">没有匹配的设定。</div>
        </section>
        <AuthoringSettingDetail v-if="mode === 'detail'" class="authoring-setting-detail-inline" :item="selectedItem" show-back show-dual :selected-text="selectedText" @back="back" @locate="emit('locate-mention', $event)" @annotate="emit('annotate', $event)" @open-full="emit('open-full', $event)" @open-dual="emit('open-dual', $event?.id)" />
      </div>
      <AuthoringSettingDetail v-if="dual" class="authoring-worldbook-detail" :item="selectedItem" show-dual :selected-text="selectedText" @locate="emit('locate-mention', $event)" @annotate="emit('annotate', $event)" @open-full="emit('open-full', $event)" @open-dual="emit('open-dual', $event?.id)" />
    </template>
    <div v-else class="writing-inspector__empty"><p>当前书稿尚未关联世界书。</p><button type="button" @click="emit('bind')">关联世界书</button></div>
  </section>
</template>

<style>
.authoring-worldbook-panel { display:grid; grid-template-columns:minmax(0,1fr); min-height:100%; }
.authoring-worldbook-panel.is-dual { grid-template-columns:minmax(236px, 43%) minmax(280px,1fr); }
.authoring-worldbook-index { min-width:0; }
.authoring-worldbook-detail { min-width:0; border-left:1px solid var(--border-subtle); }
.authoring-worldbook-panel.is-dual .authoring-setting-detail-inline { display:none; }
.authoring-setting-ambiguity { padding:4px 8px 20px; }
.authoring-setting-ambiguity>header { display:grid; gap:3px; padding:0 0 13px; border-bottom:1px solid var(--border-subtle); }
.authoring-setting-ambiguity>header strong { color:var(--text-primary); font-size:14px; }
.authoring-setting-ambiguity>header span { color:var(--text-secondary); font-size:11px; line-height:1.5; }
.authoring-setting-ambiguity>button { display:grid; width:100%; gap:4px; padding:12px 2px; border-bottom:1px solid color-mix(in srgb,var(--border-subtle) 70%,transparent); text-align:left; }
.authoring-setting-ambiguity>button>span { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.authoring-setting-ambiguity>button strong { color:var(--text-primary); font-size:13px; }
.authoring-setting-ambiguity>button small { color:var(--text-secondary); font-size:10px; }
.authoring-setting-ambiguity>button em { overflow:hidden; color:var(--text-secondary); font-size:11px; font-style:normal; line-height:1.5; text-overflow:ellipsis; white-space:nowrap; }
.authoring-worldbook-tools { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; padding-bottom:8px; }
.authoring-worldbook-tools input { min-width:0; height:30px; padding:0 9px; border:1px solid var(--border-subtle); border-radius:3px; outline:0; background:var(--surface-workbench-muted); color:var(--text-primary); }
button { border:0; background:transparent; color:var(--text-secondary); cursor:pointer; }
button:hover:not(:disabled),button.active { color:var(--text-primary); }
.authoring-worldbook-tools button { padding:0 8px; border-left:1px solid var(--border-subtle); }
.authoring-worldbook-filter { display:flex; gap:10px; min-height:32px; overflow-x:auto; border-bottom:1px solid var(--border-subtle); }
.authoring-worldbook-filter button { flex:0 0 auto; padding:0; font-size:11px; }
.authoring-worldbook-filter button.active { border-bottom:2px solid var(--accent-primary); }
.authoring-worldbook-filter .open-full { margin-left:auto; }
.authoring-worldbook-entry { padding:12px 4px; border-bottom:1px solid var(--border-subtle); }
.authoring-worldbook-entry header { display:flex; align-items:baseline; gap:7px; }
.authoring-worldbook-entry strong { color:var(--text-primary); font-size:13px; }
.authoring-worldbook-entry small { color:var(--text-secondary); font-size:10px; }
.authoring-worldbook-entry p { display:-webkit-box; margin:5px 0 0; overflow:hidden; color:var(--text-secondary); font-size:12px; line-height:1.55; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.authoring-worldbook-entry footer { display:flex; margin-top:7px; }
.authoring-worldbook-entry footer button { padding:0; font-size:11px; color:var(--accent-primary); }
.authoring-worldbook-entry footer button:disabled { color:var(--text-secondary); opacity:.45; cursor:not-allowed; }
.authoring-setting-context__lead,.authoring-setting-browser>header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:4px 8px 16px; border-bottom:1px solid var(--border-subtle); }
.authoring-setting-context__lead div { display:grid; gap:3px; }
.authoring-setting-context__lead strong,.authoring-setting-browser>header strong { font-size:14px; color:var(--text-primary); }
.authoring-setting-context__lead span { font-size:12px; line-height:1.5; color:var(--text-secondary); }
.authoring-setting-context__lead button,.authoring-setting-browser>header button { padding:2px 0; font-size:12px; color:var(--accent-primary); }
.authoring-setting-group { padding-top:16px; }
.authoring-setting-group>header { display:flex; justify-content:space-between; padding:0 9px 8px; color:var(--text-secondary); font-size:12px; font-weight:600; }
.authoring-setting-row,.authoring-setting-directory-row { display:grid; width:100%; grid-template-columns:2px minmax(0,1fr) auto; gap:11px; align-items:center; min-height:66px; padding:11px 9px; border-bottom:1px solid color-mix(in srgb,var(--border-subtle) 72%,transparent); text-align:left; }
.authoring-setting-row:hover,.authoring-setting-row.active,.authoring-setting-directory-row:hover,.authoring-setting-directory-row.active { background:color-mix(in srgb,var(--accent-primary) 6%,transparent); }
.authoring-setting-row__signal { align-self:stretch; background:color-mix(in srgb,var(--accent-primary) 70%,transparent); }
.authoring-setting-row__body { display:grid; min-width:0; gap:2px; }
.authoring-setting-row strong,.authoring-setting-directory-row strong { font-size:13px; color:var(--text-primary); }
.authoring-setting-row small,.authoring-setting-directory-row small { margin-left:6px; font-size:11px; color:var(--text-secondary); }
.authoring-setting-row__body>span { overflow:hidden; color:var(--text-secondary); font-size:12px; line-height:1.45; text-overflow:ellipsis; white-space:nowrap; }
.authoring-setting-row__arrow { color:var(--text-secondary); }
.authoring-setting-empty,.authoring-setting-detail--empty { padding:28px 8px; color:var(--text-secondary); }
.authoring-setting-empty strong,.authoring-setting-detail--empty strong { color:var(--text-primary); font-size:13px; }
.authoring-setting-empty p,.authoring-setting-detail--empty p { font-size:11px; line-height:1.6; }
.authoring-setting-empty button { padding:0; color:var(--accent-primary); }
.authoring-setting-browser .authoring-worldbook-tools { padding:10px 0 6px; }
.authoring-setting-directory-row { grid-template-columns:minmax(0,1fr) auto; }
.authoring-setting-directory-row>span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.authoring-setting-detail { padding:4px 20px 24px; }
.authoring-setting-detail__head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:flex-start; padding:2px 0 16px; border-bottom:1px solid var(--border-subtle); }
.authoring-setting-detail__back { padding:5px 5px 0 0; }
.authoring-setting-detail__identity { min-width:0; }
.authoring-setting-detail__identity>span { font-size:11px; color:var(--accent-primary); }
.authoring-setting-detail__head h3 { margin:3px 0 0; overflow:hidden; color:var(--text-primary); font-size:18px; text-overflow:ellipsis; white-space:nowrap; }
.authoring-setting-detail__open { padding:5px 0; font-size:12px; color:var(--accent-primary); }
.authoring-setting-detail__head-actions { display:flex; align-items:center; gap:12px; }
.authoring-setting-detail__content { padding:18px 0 20px; color:var(--text-primary); font-size:14px; line-height:1.8; white-space:pre-wrap; }
.authoring-setting-detail__content p { margin:0; }
.authoring-setting-detail__section { padding:15px 0; border-top:1px solid color-mix(in srgb,var(--border-subtle) 72%,transparent); }
.authoring-setting-detail__section>header { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:9px; }
.authoring-setting-detail__section h4 { margin:0; color:var(--text-primary); font-size:12px; font-weight:650; }
.authoring-setting-detail__section header>span { color:var(--text-secondary); font-size:11px; }
.authoring-setting-detail__section p { margin:0; color:var(--text-secondary); font-size:12px; line-height:1.6; }
.authoring-setting-detail__current>button { display:grid; width:100%; gap:7px; padding:10px 0 2px 12px; border-left:2px solid color-mix(in srgb,var(--accent-primary) 58%,transparent); text-align:left; }
.authoring-setting-detail__current>button span { color:var(--text-primary); font-size:13px; line-height:1.65; }
.authoring-setting-detail__current>button small { color:var(--accent-primary); font-size:11px; }
.authoring-setting-detail__trail>button { display:grid; width:100%; grid-template-columns:64px minmax(0,1fr) auto; gap:8px; padding:9px 2px; border-top:1px solid color-mix(in srgb,var(--border-subtle) 55%,transparent); text-align:left; }
.authoring-setting-detail__trail>button small { color:var(--text-secondary); font-size:10px; }
.authoring-setting-detail__trail>button span { overflow:hidden; color:var(--text-primary); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.authoring-setting-detail__trail>button b { color:var(--accent-primary); font-weight:400; }
.authoring-setting-detail__trail>p { padding-top:7px; }
.authoring-setting-detail__meta { padding:13px 0; border-top:1px solid var(--border-subtle); color:var(--text-secondary); font-size:12px; }
.authoring-setting-detail__meta summary { cursor:pointer; }
.authoring-setting-detail__meta div { display:grid; grid-template-columns:54px minmax(0,1fr); gap:10px; padding-top:10px; }
.authoring-setting-detail__meta p { margin:0; color:var(--text-primary); line-height:1.55; }
.authoring-setting-detail__actions { display:grid; padding-top:16px; }
.authoring-setting-detail__actions button { min-height:36px; border-top:1px solid var(--border-subtle); color:var(--accent-primary); font-size:12px; text-align:left; }
.authoring-setting-detail__actions button:disabled { color:var(--text-secondary); opacity:.5; }
@media (max-width:1100px) { .authoring-worldbook-panel.is-dual { grid-template-columns:minmax(0,1fr); } .authoring-worldbook-panel.is-dual .authoring-worldbook-detail { display:none; } .authoring-worldbook-panel.is-dual .authoring-setting-detail-inline { display:block; } .authoring-worldbook-panel.is-dual .authoring-worldbook-index.is-detail>.authoring-setting-context,.authoring-worldbook-panel.is-dual .authoring-worldbook-index.is-detail>.authoring-setting-browser { display:none; } }
</style>
