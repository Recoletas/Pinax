<script setup>
// 文档阅读器（W1-B v1）：项目文件列表 + 版面预览双栏（390 单列堆叠）。
// 双只读数据轨：本地文件夹（File System Access / webkitdirectory 回落）与
// 服务器注册项目（既有 GET 端点 /projects → /book → /rules）。
// 零写入：本组件只发 GET、只用 read 模式句柄、不写任何 localStorage。
import { computed, onMounted, ref, shallowRef } from 'vue'
import { tr } from '../../i18n/index.js'
import { marked } from 'marked'
import { sanitizeHtml } from '../../utils/sanitize'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import DocumentFileList from './DocumentFileList.vue'
import ScriptDocumentView from './ScriptDocumentView.vue'
import OutlineStructureView from './OutlineStructureView.vue'
import LexiconStructureView from './LexiconStructureView.vue'
import { analyzeScriptDocument, detectScriptFormat } from '../../services/documents/scriptFormat.js'
import { buildOutlineView, parseOutlineJsonText } from '../../services/documents/outlineView.js'
import {
  entriesFromFileList, fetchLocalProjects, fetchProjectBook, fetchProjectLexicon, fetchProjectRules,
  isFileSystemAccessAvailable, parseLexiconJsonText, pickProjectDirectory, walkDocumentFiles
} from '../../services/documents/documentReader.js'

const props = defineProps({
  bookId: { type: String, default: '' }
})

const projects = ref([])
const selectedProjectId = ref('')
const serverBook = shallowRef(null)
const serverRules = shallowRef(null)
const serverLexicon = shallowRef(null)
const serverLoading = ref(false)
const serverError = ref('')
const localFolderName = ref('')
const localEntries = ref([])
const localLoading = ref(false)
const localError = ref('')
const selectedKey = ref('')
const preview = shallowRef(null)
const previewError = ref('')
const folderInput = ref(null)
const unboundNotice = ref('')
const localTextCache = new Map()

const fsAccessAvailable = isFileSystemAccessAvailable()
const activeSource = computed(() => (localEntries.value.length || localFolderName.value ? 'local' : (selectedProjectId.value ? 'server' : 'none')))
const selectedProjectName = computed(() => {
  const project = projects.value.find((item) => String(item.projectId) === String(selectedProjectId.value))
  return project ? (project.rootPath || project.name || '') : ''
})

function renderMarkdown(text) {
  return sanitizeHtml(marked.parse(String(text ?? ''), { async: false }))
}

function rootLabel(path) {
  const segments = String(path || '').split('/').filter(Boolean)
  return segments.length > 1 ? segments.slice(0, -1).join('/') : tr('根目录')
}

const fileGroups = computed(() => {
  if (activeSource.value === 'local') {
    const groups = new Map()
    for (const entry of localEntries.value) {
      const key = rootLabel(entry.path)
      if (!groups.has(key)) groups.set(key, { key, label: key, entries: [] })
      groups.get(key).entries.push({
        key: `local:${entry.path}`,
        label: entry.name,
        sub: entry.ext === 'json' ? 'JSON' : 'MD',
        kind: entry.ext,
        icon: entry.ext === 'json' ? 'markdown' : 'document'
      })
    }
    return Array.from(groups.values())
  }
  if (activeSource.value === 'server') {
    const groups = []
    const book = serverBook.value?.book
    const outlineWarning = (serverBook.value?.warnings || []).find((warning) => String(warning).includes('outline.json')) || ''
    groups.push({
      key: 'outline',
      label: tr('大纲'),
      entries: [{
        key: 'server:outline',
        label: tr('大纲结构（outline.json）'),
        sub: book ? `${book.outline?.nodes?.length || 0}/${book.outline?.edges?.length || 0}` : '',
        kind: 'json',
        icon: 'outline',
        warning: outlineWarning
      }]
    })
    // 词汇表虚拟项（W1.5）：固定入口，数据来自 /api/localmirror/lexicon；端点读不到时隐藏。
    if (serverLexicon.value) {
      const lexicon = serverLexicon.value.lexicon
      groups.push({
        key: 'lexicon',
        label: tr('词汇表'),
        entries: [{
          key: 'server:lexicon',
          label: tr('词汇表（词汇表.json）'),
          sub: serverLexicon.value.exists ? `${(lexicon?.banned || []).length}/${(lexicon?.own || []).length}/${(lexicon?.canon || []).length}` : '',
          kind: 'json',
          icon: 'outline'
        }]
      })
    }
    groups.push({
      key: 'chapters',
      label: tr('正文'),
      entries: (book?.chapters || []).map((chapter, index) => ({
        key: `server:chapter:${chapter.id || index}`,
        label: chapter.title || tr('未命名章节'),
        kind: 'md',
        icon: 'document',
        payload: { view: 'markdown', text: chapter.content || '', title: chapter.title || tr('未命名章节') }
      }))
    })
    groups.push({
      key: 'explorations',
      label: tr('构思'),
      entries: (book?.explorations || []).map((doc, index) => ({
        key: `server:exploration:${doc.id || index}`,
        label: doc.title || tr('未命名构思'),
        kind: 'md',
        icon: 'document',
        payload: { view: 'markdown', text: doc.content || '', title: doc.title || tr('未命名构思') }
      }))
    })
    groups.push({
      key: 'rules',
      label: tr('约束'),
      entries: (serverRules.value?.files || []).map((file) => ({
        key: `server:rule:${file.id}`,
        label: file.name || file.id,
        kind: 'md',
        icon: 'document',
        payload: { view: 'markdown', text: file.content || '', title: file.name || file.id }
      }))
    })
    return groups.filter((group) => group.entries.length)
  }
  return []
})

const previewTitle = computed(() => preview.value?.title || '')

function resetPreview() {
  selectedKey.value = ''
  preview.value = null
  previewError.value = ''
}

async function loadServerProject(projectId) {
  selectedProjectId.value = projectId
  if (projectId) unboundNotice.value = ''
  localFolderName.value = ''
  localEntries.value = []
  localError.value = ''
  resetPreview()
  if (!projectId) {
    serverBook.value = null
    serverRules.value = null
    serverLexicon.value = null
    return
  }
  const project = projects.value.find((item) => String(item.projectId) === String(projectId))
  serverLoading.value = true
  serverError.value = ''
  try {
    const [book, rules, lexicon] = await Promise.all([
      fetchProjectBook(project?.rootPath || ''),
      fetchProjectRules(project?.rootPath || ''),
      fetchProjectLexicon(project?.rootPath || '')
    ])
    serverBook.value = book
    serverRules.value = rules
    serverLexicon.value = lexicon
    if (!book) {
      serverError.value = tr('无法读取该项目文件夹（需要本机部署的只读接口）。可改用「打开本地文件夹」。')
    }
  } finally {
    serverLoading.value = false
  }
  const first = fileGroups.value.flatMap((group) => group.entries)[0]
  if (first) void selectEntry(first)
}

async function openLocalFolder() {
  if (fsAccessAvailable) {
    try {
      const handle = await pickProjectDirectory()
      if (!handle) return
      localLoading.value = true
      try {
        const walked = await walkDocumentFiles(handle)
        localTextCache.clear()
        localFolderName.value = handle.name || ''
        localEntries.value = walked.entries
        localError.value = walked.truncated ? tr('文件较多，仅展示前 500 个 .md/.json。') : ''
      } finally {
        localLoading.value = false
      }
    } catch (error) {
      localError.value = tr('读取失败：{message}', { message: error?.message || '' })
    }
  } else {
    folderInput.value?.click()
  }
  selectedProjectId.value = ''
  serverBook.value = null
  serverRules.value = null
  serverLexicon.value = null
  serverError.value = ''
  resetPreview()
}

async function handleFolderInput(event) {
  const files = event.target?.files
  event.target.value = ''
  if (!files?.length) return
  const walked = entriesFromFileList(files)
  localTextCache.clear()
  localFolderName.value = String(files[0].webkitRelativePath || files[0].name).split('/')[0] || ''
  localEntries.value = walked.entries
  localError.value = walked.truncated ? tr('文件较多，仅展示前 500 个 .md/.json。') : ''
  selectedProjectId.value = ''
  serverBook.value = null
  serverRules.value = null
  serverLexicon.value = null
  serverError.value = ''
  resetPreview()
}

function classifyMarkdown(text) {
  const detection = detectScriptFormat(text)
  if (detection.isScript) {
    return { view: 'script', lines: analyzeScriptDocument(text) }
  }
  return { view: 'markdown', html: renderMarkdown(text), raw: text }
}

async function selectEntry(entry) {
  if (!entry || entry.disabled) return
  selectedKey.value = entry.key
  previewError.value = ''
  preview.value = { view: 'loading' }
  try {
    if (entry.key.startsWith('local:')) {
      const path = entry.key.slice(6)
      let text = localTextCache.get(path)
      if (typeof text !== 'string') {
        const localEntry = localEntries.value.find((item) => item.path === path)
        if (!localEntry) throw new Error('entry not found')
        text = await localEntry.read()
        localTextCache.set(path, text)
      }
      const title = localFolderName.value ? `${localFolderName.value}/${path}` : path
      if (!text.trim()) {
        preview.value = { view: 'empty', title }
        return
      }
      if (entry.kind === 'json') {
        // 词汇表检测（pinax-lexicon@1）优先于 outline：标记命中即走结构视图（W1.5）。
        const lexiconParsed = parseLexiconJsonText(text)
        if (lexiconParsed.ok) {
          preview.value = { view: 'lexicon', lexicon: lexiconParsed.lexicon, warning: lexiconParsed.warning, title }
          return
        }
        const parsed = parseOutlineJsonText(text)
        if (parsed.ok) {
          preview.value = { view: 'outline', view_: parsed.view, warning: parsed.warning, title }
        } else {
          preview.value = { view: 'json', text, title, warning: parsed.warning }
        }
        return
      }
      preview.value = { title, ...classifyMarkdown(text) }
      return
    }
    if (entry.payload) {
      preview.value = { ...entry.payload }
      return
    }
    if (entry.key === 'server:outline') {
      const outline = serverBook.value?.book?.outline || { nodes: [], edges: [] }
      preview.value = {
        view: 'outline',
        view_: buildOutlineView(outline?.nodes, outline?.edges),
        warning: entry.warning || '',
        title: tr('大纲结构（outline.json）')
      }
      return
    }
    if (entry.key === 'server:lexicon') {
      const lexicon = serverLexicon.value
      preview.value = {
        view: 'lexicon',
        lexicon: lexicon?.exists ? (lexicon.lexicon || { format: '', project: '', banned: [], own: [], canon: [] }) : null,
        warning: (lexicon?.warnings || []).join(' '),
        title: tr('词汇表（词汇表.json）')
      }
      return
    }
    preview.value = { view: 'empty', title: entry.label }
  } catch (error) {
    preview.value = null
    previewError.value = tr('读取失败：{message}', { message: error?.message || '' })
  }
}

onMounted(async () => {
  projects.value = await fetchLocalProjects()
  if (props.bookId) {
    const matched = projects.value.find((item) => String(item.bookId || '') === String(props.bookId))
    // 本书没有绑定项目时不加载任何项目：拿别的书的项目文件冒充本书，正是「文档页归属混乱」的根因。
    if (matched) await loadServerProject(String(matched.projectId))
    else unboundNotice.value = tr('当前作品还没有绑定项目文件夹，文档阅读器不替你猜一个项目。')
    return
  }
  // 无书上下文（直接敲 URL）：只有一个候选项目时不算猜，多候选留给用户选。
  if (projects.value.length === 1) await loadServerProject(String(projects.value[0].projectId))
})
</script>

<template>
  <div class="doc-reader" data-test="doc-reader">
    <div class="doc-reader__source-bar">
      <label class="doc-reader__source-field">
        <span>{{ tr('服务器项目') }}</span>
        <select
          :value="selectedProjectId"
          data-test="doc-source-select"
          @change="loadServerProject($event.target.value)"
        >
          <option value="">{{ tr('选择项目…') }}</option>
          <option v-for="project in projects" :key="project.projectId" :value="String(project.projectId)">
            {{ project.name || project.projectId }}{{ project.bookId ? '' : tr('（未绑定书稿）') }}
          </option>
        </select>
      </label>
      <button type="button" class="doc-reader__open-folder" data-test="doc-open-folder" @click="openLocalFolder">
        <WorkbenchIcon name="folder" :size="15" />
        <span>{{ tr('打开本地文件夹') }}</span>
      </button>
      <input
        ref="folderInput"
        type="file"
        class="doc-reader__folder-input"
        webkitdirectory
        :aria-label="tr('打开本地文件夹')"
        @change="handleFolderInput"
      >
      <p v-if="localFolderName || selectedProjectName" class="doc-reader__source-caption" data-test="doc-source-caption">
        {{ localFolderName || selectedProjectName }}
      </p>
      <p class="doc-reader__mode" data-test="doc-mode-readonly">{{ tr('项目文件 · 只读') }}</p>
    </div>

    <p v-if="!fsAccessAvailable" class="doc-reader__env-hint">{{ tr('当前浏览器不支持文件夹直读，将使用文件列表选择。') }}</p>

    <div class="doc-reader__layout">
      <aside class="doc-reader__pane-list">
        <DocumentFileList
          :groups="fileGroups"
          :active-key="selectedKey"
          :loading="serverLoading || localLoading"
          @select="selectEntry"
        />
        <p v-if="serverError" class="doc-reader__pane-hint doc-reader__pane-hint--warn" role="status">{{ serverError }}</p>
        <p v-else-if="localError" class="doc-reader__pane-hint doc-reader__pane-hint--warn" role="status">{{ localError }}</p>
        <p v-else-if="unboundNotice" class="doc-reader__pane-hint" role="status" data-test="doc-unbound-project">{{ unboundNotice }}</p>
        <p v-else-if="activeSource === 'server'" class="doc-reader__pane-hint">{{ tr('kit 编号目录（如 02-编剧/剧本.md）与 大纲.md 请用「打开本地文件夹」读取。') }}</p>
        <p v-else-if="activeSource === 'none'" class="doc-reader__pane-hint">{{ tr('选择服务器项目，或打开本地项目文件夹，浏览其中的 .md/.json。') }}</p>
      </aside>

      <main class="doc-reader__pane-preview" data-test="doc-preview">
        <template v-if="preview?.view === 'loading'">
          <p class="doc-reader__preview-hint" role="status">{{ tr('正在读取…') }}</p>
        </template>
        <template v-else-if="previewError">
          <p class="doc-reader__preview-hint doc-reader__preview-hint--warn" role="alert">{{ previewError }}</p>
        </template>
        <template v-else-if="preview?.view === 'script'">
          <ScriptDocumentView :lines="preview.lines" :title="previewTitle" />
        </template>
        <template v-else-if="preview?.view === 'outline'">
          <OutlineStructureView :view="preview.view_" :warning="preview.warning" :title="previewTitle" />
        </template>
        <template v-else-if="preview?.view === 'lexicon'">
          <LexiconStructureView :lexicon="preview.lexicon" :warning="preview.warning" :title="previewTitle" />
        </template>
        <template v-else-if="preview?.view === 'markdown'">
          <article class="doc-reader__markdown" data-test="doc-markdown">
            <h1 v-if="previewTitle" class="doc-reader__md-title">{{ previewTitle }}</h1>
            <div v-html="preview.html" />
          </article>
        </template>
        <template v-else-if="preview?.view === 'json'">
          <article class="doc-reader__json" data-test="doc-json">
            <h1 v-if="previewTitle" class="doc-reader__md-title">{{ previewTitle }}</h1>
            <p v-if="preview.warning" class="doc-reader__preview-hint doc-reader__preview-hint--warn">{{ preview.warning }}</p>
            <pre>{{ preview.text }}</pre>
          </article>
        </template>
        <template v-else-if="preview?.view === 'empty'">
          <p class="doc-reader__preview-hint" data-test="doc-empty">{{ tr('空文件。') }}</p>
        </template>
        <template v-else>
          <div class="doc-reader__placeholder" data-test="doc-placeholder">
            <WorkbenchIcon name="document" :size="30" />
            <h2>{{ tr('文档阅读器') }}</h2>
            <p>{{ tr('项目里的大纲、剧本与任意 .md/.json 都会在这里获得只读版面。') }}</p>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.doc-reader {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.doc-reader__source-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex: 0 0 auto;
  padding: 10px 16px;
  border-bottom: 1px solid var(--hairline-soft);
  background: var(--surface-raised);
}
.doc-reader__source-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.doc-reader__source-field > span {
  flex: none;
  color: var(--text-secondary);
  font-size: 12.5px;
}
.doc-reader__source-field select {
  max-width: min(46vw, 320px);
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
}
.doc-reader__open-folder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  transition: background 140ms ease;
}
.doc-reader__open-folder:hover,
.doc-reader__open-folder:focus-visible {
  background: var(--bg-hover);
  outline: none;
}
.doc-reader__folder-input {
  display: none;
}
.doc-reader__source-caption {
  margin: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 只读声明贴着来源栏右端：本页零写入，读者需要一眼确认这一点。 */
.doc-reader__mode {
  margin-inline: auto 0;
  flex: none;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}
.doc-reader__env-hint {
  margin: 0;
  padding: 6px 16px;
  border-bottom: 1px solid var(--hairline-soft);
  color: var(--text-muted);
  font-size: 12px;
}
.doc-reader__layout {
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 0;
}
.doc-reader__pane-list {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 0 0 264px;
  min-width: 0;
  border-right: 1px solid var(--hairline-soft);
}
.doc-reader__pane-list > :first-child {
  flex: 1;
}
.doc-reader__pane-hint {
  margin: 0;
  padding: 10px 14px;
  border-top: 1px solid var(--hairline-soft);
  color: var(--text-muted);
  font-size: 11.5px;
  line-height: 1.6;
}
.doc-reader__pane-hint--warn {
  color: var(--warning);
}
.doc-reader__pane-preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 26px 32px 56px;
}
.doc-reader__preview-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}
.doc-reader__preview-hint--warn {
  color: var(--warning);
}
.doc-reader__markdown,
.doc-reader__json {
  max-width: 720px;
  margin-inline: auto;
  font-size: 14px;
  line-height: 1.85;
}
.doc-reader__md-title {
  margin: 0 0 14px;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.35;
}
.doc-reader__markdown :deep(h2) {
  margin: 1.6em 0 0.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--hairline-soft);
  font-size: 16px;
}
.doc-reader__markdown :deep(h3) {
  margin: 1.4em 0 0.4em;
  font-size: 15px;
}
.doc-reader__markdown :deep(p) {
  margin: 0.6em 0;
}
.doc-reader__markdown :deep(ul),
.doc-reader__markdown :deep(ol) {
  margin: 0.6em 0;
  padding-left: 1.6em;
}
.doc-reader__markdown :deep(blockquote) {
  margin: 0.8em 0;
  padding: 6px 14px;
  border-left: 3px solid var(--accent);
  background: var(--accent-light);
}
.doc-reader__markdown :deep(code) {
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  font-family: var(--font-mono);
  font-size: 0.9em;
}
.doc-reader__markdown :deep(pre) {
  overflow-x: auto;
  padding: 12px 14px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-family: var(--font-mono);
  font-size: 12.5px;
}
.doc-reader__markdown :deep(pre code) {
  padding: 0;
  background: transparent;
}
.doc-reader__markdown :deep(table) {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  font-size: 12.5px;
}
.doc-reader__markdown :deep(th),
.doc-reader__markdown :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--hairline-soft);
  text-align: left;
}
.doc-reader__markdown :deep(a) {
  color: var(--accent);
}
.doc-reader__json pre {
  overflow-x: auto;
  padding: 14px 16px;
  border: 1px solid var(--hairline-soft);
  border-radius: 6px;
  background: var(--bg-primary);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
}
.doc-reader__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 380px;
  margin: 12vh auto 0;
  color: var(--text-muted);
  text-align: center;
}
.doc-reader__placeholder h2 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 600;
}
.doc-reader__placeholder p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
}

/* 390 单列堆叠：来源栏换行、文件列表压到预览上方 */
@media (max-width: 720px) {
  .doc-reader__source-bar {
    padding: 8px 12px;
  }
  .doc-reader__source-field {
    flex: 1 1 100%;
  }
  .doc-reader__source-field select {
    flex: 1;
    max-width: none;
    min-width: 0;
  }
  .doc-reader__layout {
    flex-direction: column;
    overflow-y: auto;
  }
  .doc-reader__pane-list {
    flex: none;
    max-height: 42vh;
    border-right: 0;
    border-bottom: 1px solid var(--hairline-soft);
    overflow-y: visible;
  }
  .doc-reader__pane-preview {
    flex: none;
    padding: 18px 16px 48px;
    overflow: visible;
  }
}
@media (prefers-reduced-motion: reduce) {
  .doc-reader * { transition: none; }
}
</style>
