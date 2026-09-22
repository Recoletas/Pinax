<script setup>
import { computed, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { tr, uiLocale } from '../../i18n/index.js'

const props = defineProps({
  projectNodes: { type: Array, default: () => [] }, projectEdges: { type: Array, default: () => [] },
  projectConflicts: { type: Array, default: () => [] }, projectFilter: { type: String, default: 'all' },
  chapters: { type: Array, default: () => [] }, explorations: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] }, focusProjectNodeId: { type: String, default: '' },
  chapterTitle: { type: String, default: '' }, selectedText: { type: String, default: '' }
})
const emit = defineEmits(['add', 'update', 'remove', 'move', 'insert', 'filter', 'open-project-chapter', 'open-project-exploration', 'open-dual', 'history', 'toggle-pin', 'close'])
const FILTERS = [{ key: 'all', label: '全部' }, { key: 'unfiled', label: '未编排' }, { key: 'causes', label: '人物线' }, { key: 'foreshadows', label: '伏笔' }]
const STATUS_LABELS = { exploring: '推演中', planned: '已计划', drafted: '已成稿', fulfilled: '已兑现', parked: '已搁置' }
const EDGE_LABELS = { causes: '因果', foreshadows: '伏笔', alternative: '另一种可能', parallel: '并行' }
const query = ref('')
const selectedKind = ref('')
const selectedId = ref('')
const creating = ref(false)
const editing = ref(false)
const filterOpen = ref(false)
const collapsedGroups = ref(new Set())
const title = ref('')
const content = ref('')
const confirmDeleteId = ref('')

const projectNodeById = computed(() => new Map(props.projectNodes.map((node) => [String(node.id), node])))
const selectedProjectNode = computed(() => selectedKind.value === 'project' ? projectNodeById.value.get(selectedId.value) || null : null)
const selectedItemIndex = computed(() => selectedKind.value === 'chapter' ? props.items.findIndex((item) => String(item.id) === selectedId.value) : -1)
const selectedItem = computed(() => props.items[selectedItemIndex.value] || null)
const filteredProjectNodes = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return props.projectNodes.filter((node) => {
    if (props.projectFilter === 'unfiled' && node.chapterRefs?.length) return false
    if (['causes', 'foreshadows'].includes(props.projectFilter) && !props.projectEdges.some((edge) => edge.kind === props.projectFilter && (edge.fromNodeId === node.id || edge.toNodeId === node.id))) return false
    return !needle || `${node.title || ''} ${node.intent || ''}`.toLocaleLowerCase().includes(needle)
  })
})
const filteredItems = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  return props.items.filter((item) => !needle || `${item.title || ''} ${item.content || ''}`.toLocaleLowerCase().includes(needle))
})
const selectedRelations = computed(() => {
  if (!selectedProjectNode.value) return []
  return props.projectEdges.filter((edge) => String(edge.fromNodeId) === selectedId.value || String(edge.toNodeId) === selectedId.value).map((edge) => {
    const peerId = String(edge.fromNodeId) === selectedId.value ? edge.toNodeId : edge.fromNodeId
    return { ...edge, peer: projectNodeById.value.get(String(peerId)) }
  })
})
const editorCount = computed(() => content.value.length)

function statusLabel(status) { return tr(STATUS_LABELS[status] || '未标记') }
function selectProject(node) { selectedKind.value = 'project'; selectedId.value = String(node.id); creating.value = false; editing.value = false; title.value = node.title || ''; content.value = node.intent || '' }
function selectItem(item) { selectedKind.value = 'chapter'; selectedId.value = String(item.id); creating.value = false; editing.value = false; title.value = item.title || ''; content.value = item.content || '' }
function startCreate(fromSelection = false) { selectedKind.value = 'chapter'; selectedId.value = ''; creating.value = true; editing.value = true; title.value = ''; content.value = fromSelection ? props.selectedText.trim() : '' }
function toggleGroup(name) { const next = new Set(collapsedGroups.value); if (next.has(name)) next.delete(name); else next.add(name); collapsedGroups.value = next }
function beginEdit() { if (selectedItem.value) { title.value = selectedItem.value.title || ''; content.value = selectedItem.value.content || ''; editing.value = true } }
function save() { if (!content.value.trim()) return; if (creating.value) emit('add', { title: title.value.trim(), content: content.value.trim() }); else if (selectedItem.value) emit('update', selectedItem.value.id, { title: title.value.trim(), content: content.value.trim() }); creating.value = false; editing.value = false }
function removeSelected() { if (!selectedItem.value) return; if (confirmDeleteId.value !== selectedItem.value.id) { confirmDeleteId.value = selectedItem.value.id; return }; emit('remove', selectedItem.value.id); selectedId.value = ''; selectedKind.value = ''; confirmDeleteId.value = '' }
function relationLabel(edge) { return tr(EDGE_LABELS[edge.kind] || '关联') }
function chapterById(id) { return props.chapters.find((chapter) => String(chapter.id) === String(id)) || null }
function explorationById(id) { return props.explorations.find((document) => String(document.id) === String(id)) || null }
function chapterLabel(id) {
  const chapter = chapterById(id)
  if (!chapter) return tr('已移除章节')
  const index = props.chapters.indexOf(chapter) + 1
  const number = uiLocale.value === 'en' ? index : index === 1 ? '一' : index === 2 ? '二' : index
  return `${tr('第{number}章', { number })}${chapter.title ? ` ${chapter.title}` : ''}`
}
function directoryExcerpt(value) { return String(value || '').replace(/\s+/g, ' ').trim() || tr('暂无内容') }
function selectInitial() { const project = props.projectNodes[0]; const item = props.items[0]; if (project) selectProject(project); else if (item) selectItem(item) }

watch(() => props.focusProjectNodeId, (id) => { const node = projectNodeById.value.get(String(id || '')); if (node) selectProject(node) }, { immediate: true })
watch(() => [props.projectNodes.map((node) => node.id).join('|'), props.items.map((item) => item.id).join('|')], () => {
  const exists = selectedKind.value === 'project' ? selectedProjectNode.value : selectedKind.value === 'chapter' ? selectedItem.value : false
  if (!exists && !creating.value) selectInitial()
}, { immediate: true })
</script>

<template>
  <section class="outline-workbench">
    <main class="outline-editor">
      <header class="outline-editor__head">
        <input v-if="editing" v-model="title" :aria-label="tr('大纲标题')" :placeholder="tr('大纲标题')" />
        <h2 v-else>{{ selectedProjectNode?.title || selectedItem?.title || (creating ? tr('新章纲') : tr('总纲')) }}</h2>
        <div><span class="outline-mode" :title="tr('当前为文本模式')">{{ tr('文本模式⌄') }}</span><button type="button" :title="tr('历史版本')" @click="emit('history')"><WorkbenchIcon name="undo-extension" :size="17" /></button></div>
      </header>
      <div v-if="creating || selectedItem || selectedProjectNode" class="outline-editor__body authoring-outline-detail" :class="{ 'is-project-detail': selectedProjectNode }">
        <div class="outline-editor__toolbar">
          <span>{{ selectedProjectNode ? `${tr('总纲')} · ${statusLabel(selectedProjectNode.status)}` : `${chapterTitle || tr('当前章节')} · ${tr('章纲')}` }}</span>
          <div class="authoring-outline-detail__primary"><button v-if="selectedItem && !editing" type="button" @click="emit('insert', selectedItem)">{{ tr('插入正文') }}</button><button v-if="selectedItem && !editing" type="button" @click="beginEdit">{{ tr('编辑') }}</button><button v-if="editing" type="button" class="primary" @click="save">{{ tr('保存') }}</button><button v-if="selectedItem && !editing" type="button" class="danger" @click="removeSelected">{{ confirmDeleteId === selectedItem.id ? tr('确认删除') : tr('删除') }}</button></div>
        </div>
        <textarea v-if="editing" v-model="content" autofocus :placeholder="tr('写下关键动作、转折和必须兑现的信息')"></textarea>
        <article v-else class="outline-prose">{{ content || tr('还没有写下这个节点的内容。') }}</article>
        <section v-if="selectedProjectNode && selectedRelations.length" class="outline-relations"><h3>{{ tr('叙事关系') }}</h3><button v-for="edge in selectedRelations" :key="edge.id" type="button" @click="edge.peer && selectProject(edge.peer)"><small>{{ relationLabel(edge) }}</small><span>{{ edge.peer?.title || tr('已移除节点') }}</span></button></section>
        <section v-if="selectedProjectNode?.chapterRefs?.length" class="outline-relations authoring-outline-project-links"><h3>{{ tr('关联章节') }}</h3><button v-for="chapterId in selectedProjectNode.chapterRefs" :key="chapterId" type="button" :disabled="!chapterById(chapterId)" @click="emit('open-project-chapter', chapterId)"><span>{{ chapterLabel(chapterId) }}</span><small>{{ chapterById(chapterId) ? tr('打开 ›') : tr('引用已失效') }}</small></button></section>
        <section v-if="selectedProjectNode?.explorationRefs?.length" class="outline-relations authoring-outline-project-links"><h3>{{ tr('推演草稿') }}</h3><button v-for="reference in selectedProjectNode.explorationRefs" :key="reference.documentId" type="button" :disabled="!explorationById(reference.documentId)" @click="emit('open-project-exploration', reference.documentId)"><span>{{ explorationById(reference.documentId)?.title || tr('推演草稿已移除') }}</span><small>{{ explorationById(reference.documentId) ? tr('打开 ›') : tr('引用已失效') }}</small></button></section>
        <div v-if="selectedItem && !editing" class="outline-order"><button type="button" :disabled="selectedItemIndex === 0" @click="emit('move', selectedItemIndex, -1)">{{ tr('上移') }}</button><button type="button" :disabled="selectedItemIndex === items.length - 1" @click="emit('move', selectedItemIndex, 1)">{{ tr('下移') }}</button></div>
        <footer>{{ editorCount }}/20000</footer>
      </div>
      <div v-else class="outline-empty"><h2>{{ tr('使用说明') }}</h2><p>{{ tr('新建总纲或章纲，梳理故事目标、转折和需要兑现的信息。') }}</p><button type="button" @click="startCreate(false)">{{ tr('建立第一个章纲') }}</button></div>
    </main>
    <aside class="outline-directory">
      <div class="outline-window-controls"><button type="button" :title="tr('固定大纲工作台')" @click="emit('toggle-pin')">⌖</button><button type="button" :title="tr('关闭大纲工作台')" @click="emit('close')">×</button></div>
      <div class="outline-search"><WorkbenchIcon name="search" :size="16" /><input v-model="query" type="search" :placeholder="tr('大纲')" :aria-label="tr('搜索大纲')" /></div>
      <div class="outline-actions"><button type="button" class="primary" @click="startCreate(false)">{{ tr('新建') }}</button><button type="button" @click="startCreate(true)">{{ tr('提取') }}</button></div>
      <header><strong>{{ tr('目录') }}</strong><button type="button" :title="tr('筛选大纲')" :class="{ active: filterOpen }" @click="filterOpen = !filterOpen">{{ tr('筛选') }}</button></header>
      <div v-if="filterOpen" class="outline-filters"><button v-for="filter in FILTERS" :key="filter.key" type="button" :class="{ active: projectFilter === filter.key }" @click="emit('filter', filter.key)">{{ tr(filter.label) }}</button></div>
      <section v-if="projectConflicts.length" class="outline-conflicts"><strong>{{ tr('待整理') }}</strong><div v-for="conflict in projectConflicts" :key="conflict.fingerprint" class="authoring-outline-conflict-chapters"><span>{{ conflict.title || tr('同名旧章纲') }}</span><button v-for="occurrence in conflict.occurrences || []" :key="occurrence.chapterId" type="button" :disabled="!chapterById(occurrence.chapterId)" @click="emit('open-project-chapter', occurrence.chapterId)">{{ chapterLabel(occurrence.chapterId) }}</button></div></section>
      <section class="outline-directory__group"><h3><button type="button" :aria-expanded="(!collapsedGroups.has('project')).toString()" @click="toggleGroup('project')"><span class="catalog-folder-caret" :class="{ open: !collapsedGroups.has('project') }">›</span><WorkbenchIcon name="folder" :size="17" /><span>{{ tr('总纲') }}</span></button></h3><template v-if="!collapsedGroups.has('project')"><button v-for="node in filteredProjectNodes" :key="node.id" type="button" class="authoring-outline-row is-project" :class="{ active: selectedKind === 'project' && selectedId === String(node.id) }" @click="selectProject(node)"><strong>{{ node.title || tr('总纲') }}</strong><small>{{ directoryExcerpt(node.intent) }}</small></button></template></section>
      <section class="outline-directory__group"><h3><button type="button" :aria-expanded="(!collapsedGroups.has('chapter')).toString()" @click="toggleGroup('chapter')"><span class="catalog-folder-caret" :class="{ open: !collapsedGroups.has('chapter') }">›</span><WorkbenchIcon name="folder" :size="17" /><span>{{ tr('章纲') }}</span></button></h3><template v-if="!collapsedGroups.has('chapter')"><button v-for="item in filteredItems" :key="item.id" type="button" class="authoring-outline-row" :class="{ active: selectedKind === 'chapter' && selectedId === String(item.id) }" @click="selectItem(item)"><strong>{{ item.title || tr('未命名章纲') }}</strong><small>{{ directoryExcerpt(item.content) }}</small></button></template></section>
      <p v-if="!filteredProjectNodes.length && !filteredItems.length" class="outline-directory__empty">{{ tr('没有匹配的大纲。') }}</p>
    </aside>
  </section>
</template>

<style scoped>
.outline-workbench{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(160px,1fr);min-height:100%;height:100%;background:var(--surface-workbench-raised)}button{border:0;background:transparent;color:var(--text-secondary);font:inherit;cursor:pointer}.primary{background:var(--accent-primary,var(--accent,#1677ff))!important;color:white!important}.danger{color:var(--signal-danger,#a04b3c)!important}
.outline-editor{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid var(--border-subtle)}.outline-editor__head{display:flex;min-height:54px;align-items:center;justify-content:space-between;gap:12px;padding:4px 14px}.outline-editor__head h2{margin:0;color:var(--text-primary);font-size:17px;font-weight:500}.outline-editor__head>div{display:flex;align-items:center;gap:6px}.outline-editor__head button{padding:6px}.outline-mode{color:var(--text-primary);font-size:12px}.outline-editor__head input{min-width:0;flex:1;border:0;border-bottom:1px solid var(--accent-primary,var(--accent,#1677ff));background:transparent;color:var(--text-primary);font:500 17px/1.5 var(--font-body);outline:0}
.outline-editor__body{display:flex;position:relative;flex:1;min-height:0;flex-direction:column;padding:0 14px 36px;overflow:auto}.outline-editor__toolbar{display:flex;min-height:38px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-subtle);color:var(--text-secondary);font-size:11px}.outline-editor__toolbar div{display:flex;gap:4px}.outline-editor__toolbar button{padding:4px 7px;border-radius:3px}.outline-editor__toolbar button:hover{background:var(--surface-workbench-muted)}.outline-editor__body>textarea{box-sizing:border-box;min-height:360px;flex:1;resize:none;padding:17px 0;border:0;background:transparent;color:var(--text-primary);font:15px/2 var(--font-writing);outline:0}.outline-prose{min-height:260px;padding:17px 0;color:var(--text-primary);font:15px/2 var(--font-writing);white-space:pre-wrap}.outline-editor__body>footer{position:sticky;bottom:-36px;padding-top:10px;text-align:right;color:var(--text-secondary);font-size:11px}.outline-relations{padding:12px 0;border-top:1px dashed var(--border-subtle)}.outline-relations h3{margin:0 0 6px;color:var(--text-secondary);font-size:11px;font-weight:500}.outline-relations button{display:grid;width:100%;grid-template-columns:auto 1fr;gap:8px;padding:6px 0;text-align:left}.outline-relations small{color:var(--accent-primary)}.outline-relations span{color:var(--text-primary)}.outline-order{display:flex;gap:8px;padding-top:10px}.outline-order button{padding:4px 8px;border:1px solid var(--border-subtle);border-radius:3px}.outline-empty{padding:28px 18px;color:var(--text-secondary);line-height:1.8}.outline-empty h2{color:var(--text-primary)}.outline-empty button{color:var(--accent-primary)}
.outline-directory{min-width:0;overflow:auto;padding:6px 10px 12px}.outline-window-controls{display:flex;height:28px;align-items:center;justify-content:flex-end;gap:3px}.outline-window-controls button{width:26px;height:26px;font-size:18px}.outline-search{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;height:38px;padding:0 10px;border:1px solid var(--border-subtle);border-radius:4px;background:var(--surface-workbench-muted);color:var(--text-secondary)}.outline-search input{min-width:0;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit}.outline-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0 14px}.outline-actions button{height:36px;border:1px solid var(--border-subtle);border-radius:4px;color:var(--text-primary)}.outline-directory>header{display:flex;align-items:center;justify-content:space-between}.outline-directory>header button{font-size:11px}.outline-directory>header button.active{color:var(--accent-primary,var(--accent,#1677ff))}.outline-filters{display:flex;gap:8px;overflow:auto;padding:8px 0}.outline-filters button{font-size:10px;white-space:nowrap}.outline-filters button.active{color:var(--accent-primary,var(--accent,#1677ff));font-weight:600}.outline-directory__group h3{margin:12px 0 5px;font-size:13px;font-weight:500}.outline-directory__group h3 button{display:flex;width:100%;min-height:30px;align-items:center;gap:6px;padding:0 6px;color:var(--text-primary);text-align:left}.catalog-folder-caret{display:inline-block;width:10px;color:var(--text-secondary);font-size:15px;transform-origin:center;transition:transform var(--motion-fast,120ms)}.catalog-folder-caret.open{transform:rotate(90deg)}.outline-directory__group>button{display:grid;width:100%;min-height:42px;gap:2px;padding:6px 12px 6px 27px;border-radius:4px;text-align:left}.outline-directory__group>button.active{background:color-mix(in srgb,var(--accent-primary,var(--accent,#1677ff)) 19%,var(--surface-workbench-raised))}.outline-directory__group strong,.outline-directory__group small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.outline-directory__group strong{color:var(--text-primary);font-size:13px}.outline-directory__group small{color:var(--text-secondary);font-size:10px}.outline-directory__empty{padding:18px 6px;color:var(--text-secondary);font-size:11px}
.outline-editor__head h2,.outline-editor__head input{font-size:var(--authoring-catalog-title-size,17px)}.outline-mode{font-size:var(--authoring-catalog-control-size,14px)}.outline-editor__toolbar{font-size:var(--authoring-catalog-meta-size,10px)}.outline-editor__body>textarea,.outline-prose{font-size:var(--authoring-catalog-body-size,14px)}.outline-search input,.outline-actions button{font-size:var(--authoring-catalog-control-size,14px)}.outline-directory>header{font-size:var(--authoring-catalog-directory-title-size,14px)}.outline-directory>header button,.outline-filters button{font-size:var(--authoring-catalog-meta-size,10px)}.outline-directory__group h3{font-size:var(--authoring-catalog-folder-size,13px)}.outline-directory__group h3 button{font-size:inherit}.outline-directory__group strong{font-size:var(--authoring-catalog-entry-size,13px)}.outline-directory__group small{font-size:var(--authoring-catalog-meta-size,10px)}
.outline-directory__group h3{margin:6px 0 0}
.outline-directory__group h3 button{min-height:34px;padding-inline:4px}
.outline-directory__group>button{display:grid;min-height:40px;grid-template-columns:minmax(0,1fr) minmax(0,44%);align-items:center;gap:7px;padding:0 10px 0 36px;font-size:var(--authoring-catalog-entry-size,13px)}
.outline-directory__group strong{display:block;font:inherit}
.outline-directory__group small{display:block;overflow:hidden;color:var(--text-secondary);font-size:var(--authoring-catalog-meta-size,10px);font-weight:400;text-overflow:ellipsis;white-space:nowrap}
.outline-editor__head{flex-wrap:wrap;gap:6px 12px}
.outline-editor__head h2{min-width:0;flex:1;overflow-wrap:break-word}
.outline-editor__head>div{flex:0 0 auto}
.outline-editor__toolbar{flex-wrap:wrap;gap:6px 10px;padding-block:6px}
.outline-editor__toolbar>span{min-width:0;overflow-wrap:break-word}
.outline-editor__toolbar div{flex-wrap:wrap}
.outline-filters{flex-wrap:wrap;overflow:visible;gap:6px 12px}
.outline-actions button{height:auto;min-height:36px;padding:6px 8px}
.outline-relations button{grid-template-columns:auto minmax(0,1fr)}
.outline-relations span{min-width:0;overflow-wrap:break-word}
@media(max-width:720px){.outline-workbench{grid-template-columns:1fr;grid-template-rows:minmax(0,42%) minmax(0,58%)}.outline-directory{order:-1;max-height:none;border-bottom:1px solid var(--border-subtle)}.outline-editor{border-right:0}}
.outline-conflicts{margin:8px 0;padding:8px;border-left:2px solid var(--signal-warning,#b1812c);background:var(--surface-workbench-muted);font-size:10px}.outline-conflicts>div{display:grid;gap:2px;margin-top:5px}.outline-conflicts span{color:var(--text-primary)}.outline-conflicts button{text-align:left;font-size:10px}
</style>
