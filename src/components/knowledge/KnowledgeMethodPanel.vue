<template>
  <section class="kb-panel" data-test="knowledge-method-panel" :aria-label="tr('写作方法论知识卡')">
    <div class="kb-pane kb-pane-list">
      <div class="kb-search">
        <input
          class="kb-search-input"
          type="search"
          :value="query"
          :placeholder="tr('检索方法论知识卡（kit 语料）')"
          :aria-label="tr('检索方法论知识卡')"
          @input="query = $event.target.value"
          @keydown.enter="runSearch"
        >
        <button type="button" class="kb-search-go" :disabled="searching || !query.trim()" @click="runSearch">
          {{ searching ? tr('检索中…') : tr('检索') }}
        </button>
      </div>

      <div v-if="searchError" class="kb-error" role="alert">
        <b>{{ tr('知识检索服务不可用') }}</b>
        <span>{{ searchError.message }}</span>
        <code>{{ searchError.code }}</code>
      </div>
      <template v-else-if="hits.length">
        <p class="kb-count" role="status">{{ tr('命中 {count} 张知识卡', { count: hits.length }) }}</p>
        <p class="kb-scope" :class="{ 'is-project': projectHits.length }" data-test="knowledge-scope-note">
          <WorkbenchIcon :name="projectHits.length ? 'compass' : 'worldbook'" :size="13" />
          <span>{{ scopeNote }}</span>
          <code v-if="scopedProject && !projectHits.length">{{ scopedProject }}</code>
        </p>
        <ul class="kb-hits">
          <li v-for="hit in hits" :key="hit.id">
            <button
              type="button"
              class="kb-hit"
              :class="{ on: hit.id === activeRef }"
              data-test="knowledge-card-hit"
              @click="openCard(hit)"
            >
              <span class="kb-hit-title">{{ cardTitleOf(hit) }}</span>
              <span class="kb-hit-meta">
                <span v-if="hit.source === 'project'" class="kb-hit-src" data-test="knowledge-hit-src">{{ tr('本书') }}</span>
                <span v-if="hit.dir" class="kb-hit-dir">{{ hit.dir }}</span>
                <span class="kb-hit-score">{{ tr('score {score}', { score: hit.score }) }}</span>
              </span>
              <span v-if="excerptOf(hit)" class="kb-hit-summary">{{ excerptOf(hit) }}</span>
            </button>
          </li>
        </ul>
      </template>
      <p v-else-if="searched" class="kb-hint">
        {{ tr('无命中') }}
        <span v-if="scopedProject" data-test="knowledge-empty-project-hint">{{ tr('绑定了本地项目时，本书词条要编译过才查得到。重算：在 kit 仓跑 tools/kit-compile.py --project') }} <code>{{ scopedProject }}</code></span>
      </p>
      <p v-else class="kb-hint">{{ tr('检索 kit 仓的写作方法论知识卡。语料与打分都在 kit，本面只读，不写回任何项目文件。') }}</p>
    </div>

    <div class="kb-pane kb-pane-card" data-test="knowledge-card-pane">
      <template v-if="reading">
        <p class="kb-hint" role="status">{{ tr('正在读取知识卡…') }}</p>
      </template>
      <template v-else-if="card">
        <header class="kb-card-head">
          <h2 class="kb-card-title">{{ cardTitle }}</h2>
          <span v-if="card.source === 'project'" class="kb-hit-src" data-test="knowledge-card-src">{{ tr('本书') }}</span>
          <code class="kb-card-ref">{{ card.file || activeRef }}</code>
        </header>
        <div class="kb-card-body" v-html="cardHtml" />
      </template>
      <div v-else class="kb-placeholder">
        <WorkbenchIcon name="compass" :size="30" />
        <p>{{ tr('从左侧选一张知识卡查看全文。') }}</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { tr } from '../../i18n/index.js'
import { marked } from 'marked'
import { sanitizeHtml } from '../../utils/sanitize'
import { readKnowledgeCard, searchKnowledgeCards } from '../../services/worldbook/knowledgeSearchClient.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

/**
 * 知识控制台「方法论」视图（W2-A）：kit kb_search / kb_read 只读消费面。
 * 打分与语料全在 kit 内核（经 /api/knowledge 同源代理），前端不重算、不缓存副本、零写入；
 * 8431 不可达时按代理返回的结构化错误显式提示，不冒充空结果。
 * 双根（kit R2.2）：检索带上当前书绑定的 projectId，kit 把全局语料与本书 RAG 档并池，
 * 命中按 source=global|project 标来源。本书档没参与时不静默——按 kit 返回的 source 如实说明，
 * 并把重算命令交回给人/agent（编译是 kit 侧的确定性动作，前端不 spawn python 写盘）。
 */

const route = useRoute()
const query = ref('')
const hits = ref([])
const searching = ref(false)
const searched = ref(false)
const searchError = ref(null)
const activeRef = ref('')
const card = ref(null)
const reading = ref(false)
// 本轮检索实际带上的项目 id（'' = 没带上，只查了全局根）；读卡片时的回落根以它为准。
const scopedProject = ref('')
let readSequence = 0

const projectHits = computed(() => hits.value.filter((item) => item?.source === 'project'))
const scopeNote = computed(() => {
  if (projectHits.value.length) return tr('其中 {count} 张来自本书的 RAG 档。', { count: projectHits.value.length })
  if (scopedProject.value) return tr('本轮命中全部来自 kit 通用知识库。本书 RAG 档要么没有匹配的卡，要么还没编译。重算：在 kit 仓跑 tools/kit-compile.py --project')
  return tr('这本书还没有绑定本地项目，本轮只查 kit 通用知识库。')
})

const cardTitle = computed(() => {
  const hit = hits.value.find((item) => String(item.id) === activeRef.value)
  return hit ? cardTitleOf(hit) : (activeRef.value || tr('知识卡'))
})

/** kit 的 hit.title 是卡片 id（slug），作者可读的标题在正文首个 `# ` 行里。 */
function cardTitleOf(hit) {
  const heading = String(hit?.excerpt || '').match(/^#\s*(.+)$/mu)
  return (heading?.[1] || hit?.title || hit?.id || '').trim()
}

/** 摘要取 excerpt 去掉标题行后的首段，压成一行。 */
function excerptOf(hit) {
  const lines = String(hit?.excerpt || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const body = lines.find((line) => !line.startsWith('#'))
  return body ? body.replace(/[*_`>|]/g, '').slice(0, 160) : ''
}

/**
 * 卡片引用按命中根取：全局卡用 id（kit knowledge/index.json 有 id→文件映射），本书卡没有那份索引、
 * 它的 `file` 本身就是项目根相对路径（kit kb_read 的项目回落按路径找）。选错就是 404。
 */
function readRefOf(hit) {
  return String(hit?.source === 'project' ? hit?.file || hit?.id : hit?.id || '').trim()
}

/** 卡片正文是带 frontmatter 的 md；frontmatter 是 kit 的机器头，不作为作者可见正文。 */
function stripFrontmatter(text) {
  const value = String(text || '')
  if (!value.startsWith('---')) return value
  const end = value.indexOf('\n---', 3)
  if (end < 0) return value
  return value.slice(end + 4).replace(/^[\r\n]+/, '')
}

const cardHtml = computed(() => sanitizeHtml(marked.parse(stripFrontmatter(card.value?.content), { async: false })))

async function runSearch() {
  const q = query.value.trim()
  if (!q || searching.value) return
  searching.value = true
  searchError.value = null
  const response = await searchKnowledgeCards({ q, bookId: String(route.query.bookId || '') })
  searching.value = false
  searched.value = true
  scopedProject.value = response.ok ? String(response.project || '') : ''
  if (response.ok) {
    hits.value = Array.isArray(response.result?.hits) ? response.result.hits : []
  } else {
    hits.value = []
    searchError.value = response.error
  }
}

async function openCard(hit) {
  const ref = readRefOf(hit)
  if (!ref) return
  activeRef.value = String(hit?.id || '')
  const ticket = ++readSequence
  reading.value = true
  card.value = null
  const response = await readKnowledgeCard({ ref, maxChars: 20000, projectId: scopedProject.value })
  if (ticket !== readSequence) return
  reading.value = false
  if (response.ok) {
    card.value = response.result
  } else {
    searchError.value = response.error
    activeRef.value = ''
  }
}
</script>

<style scoped>
.kb-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.kb-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
.kb-pane-list {
  flex: 0 0 300px;
  gap: 10px;
  padding: 14px;
  border-right: 1px solid var(--hairline-soft);
}
.kb-pane-card {
  flex: 1;
  padding: 20px 26px 48px;
}
.kb-search {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kb-search-input {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}
.kb-search-input:focus {
  outline: none;
  border-color: var(--accent);
}
.kb-search-input::placeholder {
  color: var(--text-muted);
}
.kb-search-go {
  flex-shrink: 0;
  min-height: 34px;
  padding: 4px 14px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.kb-search-go:disabled {
  opacity: 0.55;
  cursor: default;
}
.kb-count,
.kb-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.7;
}
.kb-scope {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: -4px 0 0;
  padding: 7px 9px;
  border: 1px solid var(--hairline-soft);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11.5px;
  line-height: 1.6;
}
.kb-scope svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.kb-scope code {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  font-family: var(--font-mono);
  font-size: 11px;
}
.kb-scope.is-project {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--accent);
}
.kb-error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--warning);
  border-radius: 6px;
  color: var(--warning);
  font-size: 12px;
  line-height: 1.6;
}
.kb-error code {
  font-family: var(--font-mono);
  font-size: 11px;
}
.kb-hits {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.kb-hit {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: background 140ms ease;
}
.kb-hit:hover {
  background: var(--bg-hover);
}
.kb-hit.on {
  border-color: var(--accent);
  background: var(--accent-light);
}
.kb-hit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.kb-hit-title {
  font-size: 13px;
  font-weight: 600;
}
.kb-hit-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
}
.kb-hit-dir {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-family: var(--font-mono);
}
.kb-hit-src {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-light);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}
.kb-hit-score {
  color: var(--text-muted);
  font-size: 11px;
}
.kb-hit-summary {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.kb-card-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--hairline-soft);
}
.kb-card-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
}
.kb-card-ref {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.kb-card-body {
  max-width: 720px;
  font-size: 14px;
  line-height: 1.85;
}
.kb-card-body :deep(h2) {
  margin: 1.6em 0 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--hairline-soft);
  font-size: 16px;
}
.kb-card-body :deep(h3) {
  margin: 1.4em 0 0.4em;
  font-size: 15px;
}
.kb-card-body :deep(p) {
  margin: 0.6em 0;
}
.kb-card-body :deep(ul),
.kb-card-body :deep(ol) {
  margin: 0.6em 0;
  padding-left: 1.6em;
}
.kb-card-body :deep(blockquote) {
  margin: 0.8em 0;
  padding: 6px 14px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
}
.kb-card-body :deep(code) {
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.kb-card-body :deep(pre) {
  overflow-x: auto;
  padding: 12px 14px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.kb-card-body :deep(table) {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  font-size: 12.5px;
}
.kb-card-body :deep(th),
.kb-card-body :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--hairline-soft);
  text-align: left;
}
.kb-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  margin: 14vh auto 0;
  color: var(--text-muted);
  text-align: center;
  font-size: 13px;
}
@media (max-width: 760px) {
  .kb-panel {
    flex-direction: column;
    overflow-y: auto;
  }
  .kb-pane-list {
    flex: 0 0 auto;
    border-right: 0;
    border-bottom: 1px solid var(--hairline-soft);
  }
  .kb-pane-card {
    padding: 16px 14px 40px;
  }
}
</style>
