<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  projectNodes: { type: Array, default: () => [] },
  projectEdges: { type: Array, default: () => [] },
  projectConflicts: { type: Array, default: () => [] },
  projectFilter: { type: String, default: 'all' },
  chapters: { type: Array, default: () => [] },
  explorations: { type: Array, default: () => [] },
  items: { type: Array, default: () => [] },
  dual: Boolean,
  focusProjectNodeId: { type: String, default: '' },
  chapterTitle: { type: String, default: '' }
})
const emit = defineEmits(['add', 'update', 'remove', 'move', 'insert', 'filter', 'open-project-chapter', 'open-project-exploration', 'open-dual'])

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'unfiled', label: '未编排' },
  { key: 'causes', label: '人物线' },
  { key: 'foreshadows', label: '伏笔' }
]

const STATUS_LABELS = Object.freeze({
  exploring: '推演中',
  planned: '已计划',
  drafted: '已成稿',
  fulfilled: '已兑现',
  parked: '已搁置'
})

const EDGE_LABELS = Object.freeze({
  causes: '因果',
  foreshadows: '伏笔',
  alternative: '另一种可能',
  parallel: '并行'
})

const EXPLORATION_STATE_LABELS = Object.freeze({
  proposed: '待选择',
  adopted: '已采用',
  rejected: '已放弃'
})

const EXPLORATION_ROLE_LABELS = Object.freeze({
  alternative: '另一种可能',
  evidence: '旁证',
  viewpoint: '视角稿',
  rehearsal: '预演'
})

const filteredNodes = computed(() => {
  const nodes = props.projectNodes || []
  if (props.projectFilter === 'all') return nodes
  if (props.projectFilter === 'unfiled') return nodes.filter((node) => !node.chapterRefs?.length)
  // causes/foreshadows 筛选：节点被对应 kind 的边连接。
  return nodes.filter((node) => (props.projectEdges || []).some((edge) => (
    edge.kind === props.projectFilter && (edge.fromNodeId === node.id || edge.toNodeId === node.id)
  )))
})
const mode = ref('index')
const selectedId = ref('')
const selectedProjectId = ref('')
const title = ref('')
const content = ref('')
const editing = ref(false)
const editTitle = ref('')
const editContent = ref('')
const confirmDeleteId = ref('')

const selectedIndex = computed(() => props.items.findIndex((item) => item.id === selectedId.value))
const selectedItem = computed(() => props.items[selectedIndex.value] || null)
const selectedProjectNode = computed(() => (
  props.projectNodes.find((node) => node.id === selectedProjectId.value) || null
))
const projectNodeById = computed(() => new Map(props.projectNodes.map((node) => [node.id, node])))
const explorationById = computed(() => new Map(props.explorations.map((document) => [String(document.id), document])))
const selectedProjectRelations = computed(() => {
  const node = selectedProjectNode.value
  if (!node) return []
  return props.projectEdges
    .filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id)
    .map((edge) => {
      const outgoing = edge.fromNodeId === node.id
      const peerId = outgoing ? edge.toNodeId : edge.fromNodeId
      return {
        ...edge,
        direction: outgoing ? '指向' : '来自',
        peerTitle: projectNodeById.value.get(peerId)?.title || '已移除节点'
      }
    })
})
const sourceLabel = computed(() => {
  const item = selectedItem.value
  if (!item) return ''
  if (item.source?.type === 'narrative-asset') return '来自素材'
  if (item.source?.type === 'manual') return '手工章纲'
  return item.assetKind ? '来自叙事素材' : '章节章纲'
})

function openItem(item) {
  selectedId.value = item.id
  selectedProjectId.value = ''
  mode.value = 'detail'
  editing.value = false
  confirmDeleteId.value = ''
}
function openProjectNode(node) {
  if (!node?.id) return
  selectedProjectId.value = node.id
  selectedId.value = ''
  mode.value = 'project-detail'
  editing.value = false
  confirmDeleteId.value = ''
}
function openCreate() {
  selectedId.value = ''
  selectedProjectId.value = ''
  mode.value = 'create'
  title.value = ''
  content.value = ''
}
function submit() {
  if (!content.value.trim()) return
  emit('add', { title: title.value.trim(), content: content.value.trim() })
  title.value = ''
  content.value = ''
  selectedId.value = ''
  selectedProjectId.value = ''
  mode.value = 'index'
}
function beginEdit() {
  if (!selectedItem.value) return
  editTitle.value = selectedItem.value.title || ''
  editContent.value = selectedItem.value.content || ''
  editing.value = true
}
function saveEdit() {
  if (!selectedItem.value || !editContent.value.trim()) return
  emit('update', selectedItem.value.id, { title: editTitle.value.trim(), content: editContent.value.trim() })
  editing.value = false
}
function removeSelected() {
  if (!selectedItem.value) return
  if (confirmDeleteId.value !== selectedItem.value.id) {
    confirmDeleteId.value = selectedItem.value.id
    return
  }
  emit('remove', selectedItem.value.id)
  selectedId.value = ''
  confirmDeleteId.value = ''
  mode.value = 'index'
}
function back() {
  editing.value = false
  confirmDeleteId.value = ''
  selectedId.value = ''
  selectedProjectId.value = ''
  mode.value = 'index'
}

function chapterLabel(chapterId) {
  const index = props.chapters.findIndex((chapter) => String(chapter.id) === String(chapterId))
  if (index < 0) return '已移除章节'
  const chapter = props.chapters[index]
  const ordinal = `第${chineseNumber(index + 1)}章`
  const title = String(chapter.title || '')
    .trim()
    .replace(/^第\s*(?:[零〇一二三四五六七八九十百千万两]+|\d+)\s*章(?:\s*[-—:：·、.]?\s*)?/u, '')
    .trim()
  return title ? `${ordinal} ${title}` : ordinal
}

function chineseNumber(value) {
  const number = Math.max(1, Number(value) || 1)
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (number < 10) return digits[number]
  if (number === 10) return '十'
  if (number < 20) return `十${digits[number % 10]}`
  if (number < 100) return `${digits[Math.floor(number / 10)]}十${digits[number % 10]}`
  return String(number)
}

function relationPeerId(relation) {
  return relation.fromNodeId === selectedProjectNode.value?.id ? relation.toNodeId : relation.fromNodeId
}

function chapterExists(chapterId) {
  return props.chapters.some((chapter) => String(chapter.id) === String(chapterId))
}

function explorationLabel(documentId) {
  return explorationById.value.get(String(documentId))?.title || '推演草稿已移除'
}

function explorationExists(documentId) {
  return explorationById.value.has(String(documentId))
}

function openProjectChapter(chapterId) {
  if (chapterExists(chapterId)) emit('open-project-chapter', chapterId)
}

function openProjectExploration(documentId) {
  if (explorationExists(documentId)) emit('open-project-exploration', documentId)
}

function uniqueConflictOccurrences(conflict) {
  const seen = new Set()
  return (conflict?.occurrences || []).filter((occurrence) => {
    const chapterId = String(occurrence?.chapterId || '')
    if (!chapterId || seen.has(chapterId)) return false
    seen.add(chapterId)
    return true
  })
}

function statusLabel(status) {
  return STATUS_LABELS[status] || '未标记'
}

function relationLabel(relation) {
  return `${relation.direction} · ${EDGE_LABELS[relation.kind] || '关联'}`
}

function explorationStateLabel(state) {
  return EXPLORATION_STATE_LABELS[state] || '待选择'
}

function explorationRoleLabel(role) {
  return EXPLORATION_ROLE_LABELS[role] || '推演'
}

watch(() => props.items.map((item) => item.id), (ids) => {
  if (selectedId.value && !ids.includes(selectedId.value)) back()
}, { deep: true })
watch(() => props.projectNodes.map((node) => node.id), (ids) => {
  if (selectedProjectId.value && !ids.includes(selectedProjectId.value)) back()
}, { deep: true })
watch(() => props.focusProjectNodeId, (nodeId) => {
  const node = props.projectNodes.find((item) => String(item?.id) === String(nodeId || ''))
  if (node) openProjectNode(node)
})
</script>

<template>
  <section class="authoring-outline-panel" :class="{ 'is-dual': dual, 'is-drilled': mode !== 'index' }">
    <div class="authoring-outline-index-pane">
      <!-- Phase 3：项目级大纲线性视图（人物线/伏笔/未编排为筛选，不做画布）。 -->
      <header class="authoring-outline-head">
        <div>
          <strong>项目大纲</strong>
          <span>{{ projectNodes.length }} 个节点 · {{ projectEdges.length }} 条关系 · 未归章 {{ projectNodes.filter((n) => !n.chapterRefs?.length).length }}</span>
        </div>
        <div class="authoring-outline-filters" role="group" aria-label="大纲筛选">
          <button v-for="option in FILTERS" :key="option.key" type="button"
            :class="{ active: projectFilter === option.key }"
            @click="emit('filter', option.key)">{{ option.label }}</button>
        </div>
      </header>
      <div v-if="projectConflicts.length" class="authoring-outline-conflicts" role="status">
        <strong>发现 {{ projectConflicts.length }} 组同名旧章纲</strong>
        <p>它们暂时保持分开；可回到来源章节修改，确认后再编入项目大纲。</p>
        <ol>
          <li v-for="conflict in projectConflicts" :key="conflict.fingerprint">
            <span>{{ conflict.title || '未命名节点' }}</span>
            <span class="authoring-outline-conflict-chapters">
              <button
                v-for="occurrence in uniqueConflictOccurrences(conflict)"
                :key="occurrence.itemId || `${conflict.fingerprint}:${occurrence.chapterId}`"
                type="button"
                :disabled="!chapterExists(occurrence.chapterId)"
                @click="openProjectChapter(occurrence.chapterId)"
              >{{ chapterLabel(occurrence.chapterId) }}</button>
            </span>
          </li>
        </ol>
      </div>
      <ol v-if="filteredNodes.length" class="authoring-outline-list">
        <li v-for="node in filteredNodes" :key="node.id">
          <button type="button" class="authoring-outline-row is-project" :class="{ active: selectedProjectId === node.id }" @click="openProjectNode(node)">
            <span class="authoring-outline-copy">
              <strong>{{ node.title }}</strong>
              <small>{{ node.intent || '还没有写下这个节点的意图' }}</small>
            </span>
            <span class="authoring-outline-meta">
              <small>{{ node.chapterRefs?.length ? `${node.chapterRefs.length} 章` : '未归章' }}</small>
              <small>{{ node.explorationRefs?.length ? `${node.explorationRefs.length} 探索` : '' }}</small>
              <small class="authoring-outline-status">{{ statusLabel(node.status) }} · 详情 ›</small>
            </span>
          </button>
        </li>
      </ol>
      <p v-else class="authoring-outline-empty">项目大纲暂无节点；本章章纲保存后会惰性迁入。</p>
      <header class="authoring-outline-head">
        <div><strong>本章章纲</strong><span>{{ chapterTitle || '当前章节' }} · {{ items.length }} 个节点</span></div>
        <button type="button" @click="openCreate">＋ 新建</button>
      </header>
      <ol v-if="items.length" class="authoring-outline-list">
        <li v-for="(item, index) in items" :key="item.id">
          <button type="button" class="authoring-outline-row" :class="{ active: selectedId === item.id }" @click="openItem(item)">
            <span class="authoring-outline-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="authoring-outline-copy"><strong>{{ item.title || '未命名节点' }}</strong><small>{{ item.content }}</small></span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
      </ol>
      <div v-else class="authoring-outline-empty"><strong>这一章还没有章纲</strong><p>先写下关键动作、转折或必须兑现的信息。</p><button type="button" @click="openCreate">建立第一个节点</button></div>
    </div>

    <div class="authoring-outline-detail-pane">
      <form v-if="mode === 'create'" class="authoring-outline-form" @submit.prevent="submit">
        <header><button type="button" aria-label="返回章纲索引" @click="back">←</button><div><span>新节点</span><h3>补充本章计划</h3></div></header>
        <label><span>标题</span><input v-model="title" placeholder="例如：石柱开始转动" /></label>
        <label><span>要发生什么</span><textarea v-model="content" rows="8" placeholder="写清动作、变化和需要兑现的信息"></textarea></label>
        <footer><button type="submit" :disabled="!content.trim()">加入章纲</button><button type="button" @click="back">取消</button></footer>
      </form>

      <article v-else-if="selectedProjectNode" class="authoring-outline-detail is-project-detail">
        <header>
          <button type="button" class="authoring-outline-back" aria-label="返回大纲索引" @click="back">←</button>
          <div><span>项目节点 · {{ statusLabel(selectedProjectNode.status) }}</span><h3>{{ selectedProjectNode.title }}</h3></div>
        </header>
        <div class="authoring-outline-detail__content">{{ selectedProjectNode.intent || '还没有写下这个节点的意图。' }}</div>

        <section class="authoring-outline-project-section">
          <header><span>叙事关系</span><small>{{ selectedProjectRelations.length }} 条</small></header>
          <ol v-if="selectedProjectRelations.length" class="authoring-outline-project-list">
            <li v-for="relation in selectedProjectRelations" :key="relation.id">
              <small>{{ relationLabel(relation) }}</small>
              <button
                type="button"
                :disabled="!projectNodeById.get(relationPeerId(relation))"
                @click="openProjectNode(projectNodeById.get(relationPeerId(relation)))"
              >
                {{ relation.peerTitle }}
              </button>
            </li>
          </ol>
          <p v-else>还没有连接到其他项目节点。</p>
        </section>

        <section class="authoring-outline-project-section">
          <header><span>关联章节</span><small>{{ selectedProjectNode.chapterRefs?.length || 0 }} 章</small></header>
          <div v-if="selectedProjectNode.chapterRefs?.length" class="authoring-outline-project-links">
            <button
              v-for="chapterId in selectedProjectNode.chapterRefs"
              :key="chapterId"
              type="button"
              :disabled="!chapterExists(chapterId)"
              @click="openProjectChapter(chapterId)"
            >{{ chapterLabel(chapterId) }} <span>打开 ›</span></button>
          </div>
          <p v-else>这个节点还没有编入章节。</p>
        </section>

        <section class="authoring-outline-project-section">
          <header><span>推演草稿</span><small>{{ selectedProjectNode.explorationRefs?.length || 0 }} 篇</small></header>
          <div v-if="selectedProjectNode.explorationRefs?.length" class="authoring-outline-project-links">
            <button
              v-for="reference in selectedProjectNode.explorationRefs"
              :key="reference.documentId"
              type="button"
              :disabled="!explorationExists(reference.documentId)"
              @click="openProjectExploration(reference.documentId)"
            >
              <span>{{ explorationLabel(reference.documentId) }} · {{ explorationRoleLabel(reference.role) }} · {{ explorationStateLabel(reference.state) }}</span>
              <span>{{ explorationExists(reference.documentId) ? '打开 ›' : '引用已失效' }}</span>
            </button>
          </div>
          <p v-else>这个节点还没有关联推演草稿。</p>
        </section>

        <section v-if="selectedProjectNode.sourceRefs?.length" class="authoring-outline-detail__source">
          <span>来源</span><p>{{ selectedProjectNode.sourceRefs.join(' · ') }}</p>
        </section>
        <footer class="authoring-outline-detail__primary"><button type="button" @click="emit('open-dual', selectedProjectNode.id)">在双栏打开</button></footer>
      </article>

      <article v-else-if="selectedItem" class="authoring-outline-detail">
        <header>
          <button type="button" class="authoring-outline-back" aria-label="返回章纲索引" @click="back">←</button>
          <div><span>{{ sourceLabel }} · 节点 {{ selectedIndex + 1 }}/{{ items.length }}</span><h3>{{ selectedItem.title || '未命名节点' }}</h3></div>
        </header>
        <template v-if="editing">
          <div class="authoring-outline-form is-editing">
            <label><span>标题</span><input v-model="editTitle" /></label>
            <label><span>章纲内容</span><textarea v-model="editContent" rows="8"></textarea></label>
            <footer><button type="button" :disabled="!editContent.trim()" @click="saveEdit">保存修改</button><button type="button" @click="editing = false">取消</button></footer>
          </div>
        </template>
        <template v-else>
          <div class="authoring-outline-detail__content">{{ selectedItem.content }}</div>
          <section class="authoring-outline-detail__source"><span>来源</span><p>{{ sourceLabel }}<template v-if="selectedItem.assetKind"> · {{ selectedItem.assetKind }}</template></p></section>
          <footer class="authoring-outline-detail__primary"><button type="button" @click="emit('insert', selectedItem)">插入到当前光标</button><button type="button" @click="beginEdit">编辑节点</button></footer>
          <footer class="authoring-outline-detail__order"><button type="button" :disabled="selectedIndex === 0" @click="emit('move', selectedIndex, -1)">上移</button><button type="button" :disabled="selectedIndex === items.length - 1" @click="emit('move', selectedIndex, 1)">下移</button><button type="button" class="danger" @click="removeSelected">{{ confirmDeleteId === selectedItem.id ? '确认删除' : '删除' }}</button></footer>
        </template>
      </article>
      <div v-else class="authoring-outline-detail-empty"><strong>选择一个章纲节点</strong><p>内容、来源和插入动作会在这里展开。</p></div>
    </div>
  </section>
</template>

<style scoped>
.authoring-outline-panel { display:grid; grid-template-columns:minmax(0,1fr); min-height:100%; }
.authoring-outline-panel.is-dual { grid-template-columns:minmax(226px,42%) minmax(280px,1fr); }
.authoring-outline-index-pane,.authoring-outline-detail-pane { min-width:0; }
.authoring-outline-detail-pane { display:none; border-left:1px solid var(--border-subtle); }
.authoring-outline-panel.is-dual .authoring-outline-detail-pane { display:block; }
.authoring-outline-panel:not(.is-dual).is-drilled .authoring-outline-index-pane { display:none; }
.authoring-outline-panel:not(.is-dual).is-drilled .authoring-outline-detail-pane { display:block; border-left:0; }
.authoring-outline-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:4px 8px 16px; border-bottom:1px solid var(--border-subtle); }
.authoring-outline-head div { display:grid; gap:3px; }
.authoring-outline-head strong { color:var(--text-primary); font-size:14px; }
.authoring-outline-head span { color:var(--text-secondary); font-size:12px; }
button { border:0; background:transparent; color:var(--text-secondary); cursor:pointer; }
button:hover:not(:disabled),button.active { color:var(--text-primary); }
button:disabled { cursor:not-allowed; opacity:.55; }
.authoring-outline-head>button { color:var(--accent-primary); font-size:12px; }
.authoring-outline-head .authoring-outline-filters { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px 10px; }
.authoring-outline-filters button { min-height:28px; padding:0; font-size:11px; }
.authoring-outline-filters button.active { color:var(--accent-primary); text-decoration:underline; text-underline-offset:4px; }
.authoring-outline-conflicts { display:grid; gap:5px; margin:0 8px; padding:12px 0; border-bottom:1px solid var(--border-subtle); color:var(--text-primary); font-size:12px; line-height:1.5; }
.authoring-outline-conflicts>strong { font-size:12px; font-weight:600; }
.authoring-outline-conflicts>p { margin:0; color:var(--text-secondary); font-size:11px; }
.authoring-outline-conflicts ol { display:grid; gap:7px; margin:5px 0 0; padding:0; list-style:none; }
.authoring-outline-conflicts li { display:grid; grid-template-columns:minmax(80px,1fr) minmax(0,1.6fr); align-items:start; gap:10px; }
.authoring-outline-conflict-chapters { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:3px 9px; }
.authoring-outline-conflicts button { min-height:24px; padding:0; color:var(--accent-primary); font-size:11px; text-align:right; }
.authoring-outline-list { margin:0; padding:14px 0 0; list-style:none; }
.authoring-outline-row { display:grid; width:100%; grid-template-columns:28px minmax(0,1fr) auto; gap:10px; align-items:start; padding:12px 9px; border-bottom:1px solid color-mix(in srgb,var(--border-subtle) 72%,transparent); text-align:left; }
.authoring-outline-row:hover,.authoring-outline-row.active { background:color-mix(in srgb,var(--accent-primary) 6%,transparent); }
.authoring-outline-row.active { box-shadow:inset 2px 0 color-mix(in srgb,var(--accent-primary) 70%,transparent); }
.authoring-outline-row.is-project { grid-template-columns:minmax(0,1fr) auto; }
.authoring-outline-meta { display:grid; justify-items:end; gap:2px; color:var(--text-secondary); text-align:right; }
.authoring-outline-status { color:var(--text-primary); }
.authoring-outline-number { padding-top:2px; color:var(--accent-primary); font-size:11px; font-variant-numeric:tabular-nums; }
.authoring-outline-copy { display:grid; min-width:0; gap:4px; }
.authoring-outline-copy strong { overflow:hidden; color:var(--text-primary); font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
.authoring-outline-copy small { display:-webkit-box; overflow:hidden; color:var(--text-secondary); font-size:12px; line-height:1.5; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.authoring-outline-empty,.authoring-outline-detail-empty { padding:30px 12px; color:var(--text-secondary); }
.authoring-outline-empty strong,.authoring-outline-detail-empty strong { color:var(--text-primary); font-size:13px; }
.authoring-outline-empty p,.authoring-outline-detail-empty p { font-size:12px; line-height:1.6; }
.authoring-outline-empty button { padding:0; color:var(--accent-primary); }
.authoring-outline-detail,.authoring-outline-form { padding:4px 20px 24px; }
.authoring-outline-detail>header,.authoring-outline-form>header { display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px; padding:2px 0 16px; border-bottom:1px solid var(--border-subtle); }
.authoring-outline-detail header span,.authoring-outline-form header span { color:var(--accent-primary); font-size:11px; }
.authoring-outline-detail h3,.authoring-outline-form h3 { margin:3px 0 0; color:var(--text-primary); font-size:18px; }
.authoring-outline-back { padding:5px 5px 0 0; }
.authoring-outline-detail__content { padding:20px 0; color:var(--text-primary); font-size:14px; line-height:1.8; white-space:pre-wrap; }
.authoring-outline-detail__source { display:grid; grid-template-columns:52px minmax(0,1fr); gap:10px; padding:13px 0; border-top:1px solid var(--border-subtle); font-size:12px; }
.authoring-outline-detail__source span { color:var(--text-secondary); }
.authoring-outline-detail__source p { margin:0; color:var(--text-primary); }
.authoring-outline-project-section { padding:15px 0; border-top:1px solid var(--border-subtle); }
.authoring-outline-project-section>header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.authoring-outline-project-section>header span { color:var(--text-primary); font-size:12px; font-weight:600; }
.authoring-outline-project-section>header small,.authoring-outline-project-section>p { color:var(--text-secondary); font-size:11px; }
.authoring-outline-project-section>p { margin:9px 0 0; line-height:1.6; }
.authoring-outline-project-list { display:grid; gap:0; margin:8px 0 0; padding:0; list-style:none; }
.authoring-outline-project-list li { display:grid; grid-template-columns:88px minmax(0,1fr); align-items:center; gap:8px; padding:8px 0; border-top:1px solid color-mix(in srgb,var(--border-subtle) 65%,transparent); }
.authoring-outline-project-list small { color:var(--text-secondary); font-size:10px; }
.authoring-outline-project-list button { overflow:hidden; color:var(--text-primary); font-size:12px; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
.authoring-outline-project-links { display:grid; margin-top:8px; }
.authoring-outline-project-links>button { display:flex; min-height:34px; align-items:center; justify-content:space-between; gap:12px; padding:0; border-top:1px solid color-mix(in srgb,var(--border-subtle) 65%,transparent); color:var(--text-primary); font-size:12px; text-align:left; }
.authoring-outline-project-links>button span:last-child { flex:0 0 auto; color:var(--accent-primary); font-size:10px; }
.authoring-outline-detail__primary { display:grid; gap:0; padding-top:16px; }
.authoring-outline-detail__primary button { min-height:38px; border-top:1px solid var(--border-subtle); color:var(--accent-primary); text-align:left; }
.authoring-outline-detail__order { display:flex; gap:14px; padding-top:14px; }
.authoring-outline-detail__order button { padding:0; font-size:11px; }
.authoring-outline-detail__order .danger { margin-left:auto; color:var(--status-error,#b42318); }
.authoring-outline-form { display:grid; gap:16px; }
.authoring-outline-form label { display:grid; gap:6px; color:var(--text-secondary); font-size:12px; }
.authoring-outline-form input,.authoring-outline-form textarea { width:100%; padding:9px 10px; border:1px solid var(--border-subtle); border-radius:3px; outline:0; background:var(--surface-workbench-muted); color:var(--text-primary); font:inherit; line-height:1.6; resize:vertical; }
.authoring-outline-form input:focus,.authoring-outline-form textarea:focus { border-color:var(--accent-primary); }
.authoring-outline-form footer { display:flex; gap:14px; }
.authoring-outline-form footer button:first-child { color:var(--accent-primary); }
.authoring-outline-form.is-editing { padding:18px 0 0; }
@media (max-width:1100px) {
  .authoring-outline-panel.is-dual { grid-template-columns:minmax(0,1fr); }
  .authoring-outline-panel.is-dual .authoring-outline-detail-pane { display:none; border-left:0; }
  .authoring-outline-panel.is-dual.is-drilled .authoring-outline-index-pane { display:none; }
  .authoring-outline-panel.is-dual.is-drilled .authoring-outline-detail-pane { display:block; }
}
@media (max-width:760px) {
  .authoring-outline-head { flex-direction:column; }
  .authoring-outline-filters { justify-content:flex-start; }
  .authoring-outline-filters button,.authoring-outline-conflicts button { min-height:44px; }
  .authoring-outline-conflicts li { grid-template-columns:minmax(0,1fr); gap:2px; }
  .authoring-outline-conflict-chapters { justify-content:flex-start; }
  .authoring-outline-conflicts button { text-align:left; }
}
</style>
