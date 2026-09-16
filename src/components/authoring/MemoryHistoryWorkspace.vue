<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository'
import { listMemoryCandidates, confirmMemoryCandidate, rejectMemoryCandidate, updateMemoryCandidate } from '../../services/memory/memoryCandidates'
import { commitMemorySnapshot, flushMemoryHistory, readMemoryHistory, memoryHistoryHealth, historicalCandidatePatch } from '../../services/memory/memoryHistoryStore'

const route = useRoute()
const books = loadWritingBooks()
const items = ref([])
const selectedScope = ref('')
const mode = ref('pending')
const limit = ref(30)
const history = ref([])
const selectedId = ref('')
const busy = ref(false)
const error = ref('')
const feedback = ref('')
const draft = ref('')
const storyTime = ref('')
const statuses = { pending: '待审阅', active: '已确认', stale: '已归档', rejected: '已拒绝' }
const scopeKey = item => JSON.stringify([item.scope, item.scopeId || ''])
const scopes = computed(() => [...new Map([
  ...books.map(book => [JSON.stringify(['project', book.id]), { key: JSON.stringify(['project', book.id]), label: book.title || '未命名书稿' }]),
  ...items.value.map(item => [scopeKey(item), {
  key: scopeKey(item),
  label: item.scope === 'global-author' ? '作者偏好' : item.scope === 'project'
    ? books.find(book => book.id === item.scopeId)?.title || `未关联作品 · ${item.scopeId || '缺少归属'}`
    : `会话 · ${item.scopeId || '缺少归属'}`
}])]).values()])
const filtered = computed(() => items.value.filter(item => scopeKey(item) === selectedScope.value && item.status === mode.value))
const selected = computed(() => items.value.find(item => item.id === selectedId.value && scopeKey(item) === selectedScope.value))
const health = ref({ pending: 0, error: '' })

function reload() {
  items.value = listMemoryCandidates()
  health.value = memoryHistoryHealth()
}

async function initialize() {
  busy.value = true
  error.value = ''
  try {
    reload()
    if (!commitMemorySnapshot(items.value)) throw new Error('本地存储不足，旧记忆尚未迁移，请先备份')
    await flushMemoryHistory()
  } catch (cause) { error.value = cause.message }
  finally {
    reload()
    const preferred = scopes.value.find(scope => scope.key === JSON.stringify(['project', String(route.query.bookId || '')]))
    if (!selectedScope.value) selectedScope.value = preferred?.key || scopes.value[0]?.key || ''
    busy.value = false
  }
}

function changeScope() { selectedId.value = ''; history.value = []; limit.value = 30; feedback.value = '' }

async function inspect(item) {
  busy.value = true
  error.value = ''
  selectedId.value = item.id
  draft.value = item.content
  storyTime.value = item.metadata?.storyTime?.label || ''
  history.value = []
  try {
    await flushMemoryHistory()
    history.value = await readMemoryHistory({ candidateId: item.id, scope: item.scope, scopeId: item.scopeId })
  } catch (cause) { error.value = cause.message }
  finally { busy.value = false; health.value = memoryHistoryHealth() }
}

async function apply(action) {
  error.value = ''
  feedback.value = ''
  try {
    const result = action()
    if (!result) throw new Error('未能保存：请检查来源引用、来源版本和本地存储空间')
    reload()
    feedback.value = '已保存；修订保留在历史中。'
    if (selected.value) await inspect(selected.value)
  } catch (cause) { error.value = cause.message }
}

function saveDraft() {
  if (!selected.value || !draft.value.trim()) return
  const item = selected.value
  return apply(() => updateMemoryCandidate(item.id, {
    content: draft.value.trim(), status: 'pending', authority: 'derived', syncStatus: 'local-only',
    metadata: { ...item.metadata, storyTime: storyTime.value.trim()
      ? { precision: 'label', label: storyTime.value.trim() } : { precision: 'unknown' } }
  }))
}

function restore(row) {
  if (!selected.value || row.candidateId !== selected.value.id || scopeKey(row.after) !== selectedScope.value) return
  return apply(() => updateMemoryCandidate(selected.value.id, historicalCandidatePatch(row)))
}

onMounted(initialize)
</script>

<template>
  <div class="memory-workspace" aria-label="记忆与历史">
    <p>按作品审阅记忆。AI 提炼先保留为候选，确认后才参与记忆召回；修改或恢复旧版本后需要重新确认。</p>
    <p class="memory-workspace__hint">历史从此次升级开始记录。旧记录仅保留迁移时快照，故事中发生的时间不由电脑时间推断。完整工作区 ZIP 包含历史数据库。</p>
    <p v-if="error" role="alert">{{ error }} <button :disabled="busy" @click="initialize">重试归档</button></p>
    <p v-else-if="health.pending" role="status">{{ health.pending }} 次修订尚在本地恢复队列。</p>
    <p v-if="feedback" role="status">{{ feedback }}</p>
    <div class="memory-workspace__controls">
      <label>归属 <select v-model="selectedScope" :disabled="busy" @change="changeScope"><option v-for="scope in scopes" :key="scope.key" :value="scope.key">{{ scope.label }}</option></select></label>
      <label>状态 <select v-model="mode" :disabled="busy" @change="changeScope"><option v-for="(label, key) in statuses" :key="key" :value="key">{{ label }}</option></select></label>
    </div>
    <p v-if="!filtered.length && !busy">此范围内没有{{ statuses[mode] }}记忆。</p>
    <article v-for="item in filtered.slice(0, limit)" :key="item.id" class="memory-workspace__item">
      <p>{{ item.content }}</p>
      <small v-if="!item.sourceRefs?.length">缺少原文来源，不能作为作品事实确认。</small>
      <div class="memory-workspace__controls">
        <button :disabled="busy" @click="inspect(item)">查看来源与修订</button>
        <button v-if="item.status === 'pending'" :disabled="busy || (item.scope !== 'global-author' && (!item.sourceRefs?.length || !item.sourceRevision))" @click="apply(() => confirmMemoryCandidate(item.id))">确认</button>
        <button v-if="item.status === 'pending'" :disabled="busy" @click="apply(() => rejectMemoryCandidate(item.id))">拒绝</button>
      </div>
      <section v-if="selected?.id === item.id" class="memory-workspace__detail" aria-label="事实修订详情">
        <p>来源引用：{{ item.sourceRefs?.join('、') || '未记录' }}；来源版本：{{ item.sourceRevision || '未知' }}</p>
        <label>记忆内容<textarea v-model="draft" :disabled="busy" rows="3" /></label>
        <label>故事时间（可留空，例如“庆历三年冬”）<input v-model="storyTime" :disabled="busy" maxlength="160"></label>
        <button :disabled="busy || !draft.trim()" @click="saveDraft">保存为待确认修订</button>
        <ol aria-label="修订历史">
          <li v-for="row in history" :key="row.id">
            <strong>{{ row.operation === 'legacy-baseline' ? '旧记录迁移快照' : statuses[row.after.status] }}</strong>
            <small> · 记录于 {{ new Date(row.recordedAt).toLocaleString() }} · 故事时间：{{ row.storyTime?.label || '未知' }}</small>
            <p>{{ row.after.content }}</p>
            <button :disabled="busy" @click="restore(row)">以此版本创建待确认修订</button>
          </li>
        </ol>
      </section>
    </article>
    <button v-if="filtered.length > limit" @click="limit += 30">显示更多</button>
  </div>
</template>

<style scoped>
.memory-workspace { font-size: 16px; line-height: 1.7; color: var(--text-primary); }
.memory-workspace p { margin: 8px 0; overflow-wrap: anywhere; }
.memory-workspace__hint, small { color: var(--text-secondary); }
.memory-workspace__controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.memory-workspace__item { padding: 16px 0; border-bottom: 1px solid var(--border); }
.memory-workspace button, select, input, textarea { font: inherit; color: var(--text-primary); background: var(--bg-primary); border: 1px solid var(--border); border-radius: 3px; padding: 8px; max-width: 100%; }
.memory-workspace button { min-height: 44px; cursor: pointer; }
.memory-workspace button:disabled { opacity: .5; cursor: default; }
.memory-workspace__detail { display: grid; gap: 12px; padding-top: 12px; }
.memory-workspace__detail label { display: grid; gap: 4px; }
.memory-workspace textarea { width: 100%; box-sizing: border-box; resize: vertical; }
.memory-workspace ol { padding-left: 22px; }
.memory-workspace li { padding: 10px 0; }
</style>
