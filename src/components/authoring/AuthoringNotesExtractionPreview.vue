<template>
  <div class="notes-extract" role="region" aria-label="速记提炼候选预览">
    <p class="notes-extract__hint">
      本地规则初筛人物、地点、物品，可能漏识别。请核对原文；候选尚未创建正式设定。
    </p>
    <label class="notes-extract__label">
      原文片段（可缩小范围，不改写）
      <textarea v-model="sourceText" class="notes-extract__textarea"
        rows="4" aria-label="速记文本输入" @select="readSelection" />
    </label>
    <button type="button" class="notes-extract__btn" :disabled="!sourceText.trim() || busy"
      @click="extract">
      {{ busy ? '提炼中…' : '提炼候选' }}
    </button>

    <button type="button" :disabled="!selectedText.trim()" @click="addSelectedCandidate">将所选文字补为候选</button>
    <div v-if="candidates.length" class="notes-extract__results" role="list" aria-label="提炼候选">
      <div v-for="(c, index) in candidates" :key="index" class="notes-extract__card" role="listitem">
        <label class="notes-extract__card-label">标题
          <input v-model="c.name" type="text" class="notes-extract__card-input" :aria-label="'候选标题 ' + (index + 1)" />
        </label>
        <label>类型<select v-model="c.type" aria-label="候选类型"><option v-for="(label, type) in TYPE_LABELS" :key="type" :value="type">{{ label }}</option></select></label>
        <label>关联已有对象（可选）
          <select v-model="c.suggestedRef" aria-label="关联已有对象">
            <option :value="null">不关联</option>
            <option v-for="entry in existingEntries" :key="entry.id" :value="'worldbook-entry:' + entry.id">{{ entry.name }}</option>
          </select>
        </label>
        <blockquote class="notes-extract__card-excerpt">"{{ c.excerpt }}"</blockquote>
        <button type="button" class="notes-extract__card-discard" @click="candidates.splice(index, 1)">丢弃</button>
      </div>
    </div>
    <p v-if="candidates.length" class="notes-extract__notice">候选，尚未创建正式设定。同名仅建议、不自动合并。</p>
    <button v-if="candidates.length" type="button" class="notes-extract__btn is-primary"
      :disabled="busy" @click="saveAsIdea">留作构思</button>
    <button type="button" @click="$emit('close')">收起预览</button>
    <p v-if="savedMessage" class="notes-extract__saved" role="status">{{ savedMessage }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { parseExtractionCandidates } from '../../services/project/notesExtraction/parser.js'
import { createExplorationDocument, getExplorationDocument } from '../../services/writing/authoringDocumentRepository.js'
import { hashText } from '../../services/project/characterIf/contract.js'

const props = defineProps({
  bookId: { type: String, default: '' },
  source: { type: Object, required: true },
  existingEntries: { type: Array, default: () => [] }
})
const emit = defineEmits(['saved', 'close'])

const sourceText = ref(props.source.content || '')
const selectedText = ref('')
const busy = ref(false)
const candidates = ref([])
const savedMessage = ref('')

const TYPE_LABELS = { character: '人物', location: '地点', item: '物品' }
function typeLabel(type) { return TYPE_LABELS[type] || type }
watch(sourceText, () => {
  candidates.value = []
  savedMessage.value = '文本已改变，请重新提炼。'
})
function readSelection(event) {
  selectedText.value = sourceText.value.slice(event.target.selectionStart, event.target.selectionEnd)
}
function addSelectedCandidate() {
  const name = selectedText.value.trim()
  if (!name || name.length > 40) { savedMessage.value = '请只选择简短名称（最多 40 字）。'; return }
  if (!candidates.value.some(c => c.name === name)) candidates.value.push({
    name, type: 'character', excerpt: name, suggestedRef: null
  })
}

async function extract() {
  busy.value = true
  savedMessage.value = ''
  // Explicit local suggestions, not a simulated provider response.
  const text = sourceText.value.trim()
  if (!props.source.content.includes(text)) {
    savedMessage.value = '请保留原文片段；如需改写，请先保存原速记再重新提炼。'
    busy.value = false
    return
  }
  const mock = JSON.stringify({
    candidates: extractSimpleCandidates(text)
  })
  const result = parseExtractionCandidates(mock, {
    sourceText: text, sourceHash: hashText(text), sourceRevision: props.source.revision, requestId: 'local-preview'
  })
  candidates.value = result.candidates
  if (!result.ok) savedMessage.value = '没有识别到可靠名称，可选中原文名称手动补充。'
  busy.value = false
}

function extractSimpleCandidates(text) {
  // 简易分句扫描：找到"X握紧/走进/看到 Y"模式中的名词短语候选。
  const results = []
  const sentences = text.split(/[。！？\n]/).filter(Boolean)
  for (const sentence of sentences) {
    // 提取人名候选（2-4 字中文开头）
    const charMatch = sentence.match(/([\u4e00-\u9fff]{2,4})(?=(握紧|走进|看到|拿着|说|想|走))/)
    if (charMatch) results.push({ name: charMatch[1], type: 'character', excerpt: sentence.slice(0, 30) })
    // 提取地点候选（"X里/X中/X深处"）
    const locMatch = sentence.match(/(?:走进|来到|进入)(?:了)?([\u4e00-\u9fff]{2,6}(?:小屋|房间|大厅|深处|森林|港口))/)
    if (locMatch) results.push({ name: locMatch[1], type: 'location', excerpt: sentence.slice(0, 30) })
    // 提取物品候选（"X戒指/X钥匙/X刀"）
    const itemMatch = sentence.match(/(?:的|了)([\u4e00-\u9fff]{1,2}(?:戒指|钥匙|刀|剑|信|书|册))/)
    if (itemMatch) results.push({ name: itemMatch[1], type: 'item', excerpt: sentence.slice(0, 30) })
  }
  return results
}

async function saveAsIdea() {
  if (!props.bookId || !candidates.value.length || busy.value) return
  const live = getExplorationDocument(props.bookId, props.source.id)
  if (!live || live.revision !== props.source.revision || live.content !== props.source.content ||
      !live.content.includes(sourceText.value.trim())) {
    savedMessage.value = '原速记已改变或删除，请重新打开提炼；候选仍为你保留。'
    return
  }
  const checked = parseExtractionCandidates(JSON.stringify({ candidates: candidates.value }), {
    sourceText: sourceText.value, sourceHash: hashText(sourceText.value), sourceRevision: live.revision
  })
  if (!checked.ok || checked.errors.length || candidates.value.some(c => c.name.trim().length > 40 ||
      (c.suggestedRef && !props.existingEntries.some(entry => c.suggestedRef === 'worldbook-entry:' + entry.id)))) {
    savedMessage.value = '请检查候选名称、重复项和已失效的关联对象。'
    return
  }
  busy.value = true
  const title = `提炼候选 ${new Date().toLocaleTimeString().slice(0, 5)}`
  const content = candidates.value.map((c) => `${c.name}（${typeLabel(c.type)}）："${c.excerpt}"`).join('\n')
  try {
    const result = createExplorationDocument(props.bookId, {
      title, content: content + '\n\n来源：' + props.source.title + ' · revision ' + props.source.revision,
      sourceRefs: ['exploration:' + props.source.id, ...checked.candidates.map(c => c.suggestedRef).filter(Boolean)]
    })
    if (!result.ok) throw new Error('save-failed')
    savedMessage.value = '已留作构思，可在左栏构思区查看。'
    candidates.value = []
    emit('saved', result.document)
  } catch {
    savedMessage.value = '保存失败，请重试。'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.notes-extract textarea, .notes-extract input, .notes-extract select { box-sizing: border-box; min-width: 0; max-width: 100%; }
.notes-extract { display: grid; gap: 10px; }
.notes-extract__hint { margin: 0; font-size: 12.5px; color: var(--text-secondary, #7a746a); }
.notes-extract__label { display: grid; gap: 4px; font-size: 13px; color: var(--text-secondary, #7a746a); }
.notes-extract__textarea { width: 100%; padding: 8px; border: 1px solid var(--border-subtle, #d9d4ca); border-radius: 4px; font: inherit; resize: vertical; background: var(--bg-primary, #fff); color: inherit; }
.notes-extract__btn { padding: 7px 16px; border: 1px solid var(--border-subtle, #d9d4ca); border-radius: 4px; cursor: pointer; font: inherit; background: var(--bg-primary, #fff); color: inherit; }
.notes-extract__btn.is-primary { font-weight: 600; border-color: var(--accent, #2f6f5e); color: var(--accent, #2f6f5e); }
.notes-extract__results { display: grid; gap: 8px; }
.notes-extract__card { padding: 10px; border: 1px solid var(--border-subtle, #d9d4ca); border-radius: 6px; display: grid; gap: 6px; }
.notes-extract__card-label { display: grid; gap: 3px; font-size: 12px; color: var(--text-secondary, #7a746a); }
.notes-extract__card-input { padding: 5px 8px; border: 1px solid var(--border-subtle, #d9d4ca); border-radius: 4px; font: inherit; background: var(--bg-primary, #fff); color: inherit; }
.notes-extract__card-type { margin: 0; font-size: 12px; color: var(--accent, #2f6f5e); }
.notes-extract__card-excerpt { margin: 0; font-size: 13px; color: var(--text-secondary, #7a746a); border-left: 2px solid var(--border-subtle, #d9d4ca); padding-left: 8px; }
.notes-extract__card-discard { background: transparent; border: none; color: var(--deny, #9c3d34); cursor: pointer; font-size: 12px; padding: 0; text-align: start; }
.notes-extract__notice { margin: 0; font-size: 12px; color: var(--warn, #a2652a); }
.notes-extract__saved { margin: 0; font-size: 13px; color: var(--accent, #2f6f5e); }
</style>
