<template>
  <div class="manuscript-import__overlay" @click.self="emit('close')">
    <section ref="dialog" class="manuscript-import" role="dialog" aria-modal="true" aria-labelledby="manuscript-import-title" @keydown="onKeydown">
      <header class="manuscript-import__head">
        <div>
          <span class="manuscript-import__kicker">带着旧稿开始</span>
          <h2 id="manuscript-import-title">导入 TXT / Markdown</h2>
        </div>
        <button ref="closeButton" class="manuscript-import__close" type="button" aria-label="关闭导入" @click="emit('close')">×</button>
      </header>

      <div v-if="!parsed" class="manuscript-import__pick">
        <button
          class="manuscript-import__dropzone"
          type="button"
          data-test="manuscript-file-picker"
          :aria-busy="reading ? 'true' : null"
          @click="fileInput?.click()"
          @dragover.prevent
          @drop.prevent="handleDrop"
        >
          <template v-if="reading">
            <strong>正在读取《{{ readingName }}》…</strong>
            <span>读取完成后可以继续改名或调整拆章方式。</span>
          </template>
          <template v-else>
            <strong>选择一份书稿</strong>
            <span>或把 .txt / .md 文件拖到这里</span>
            <small>支持常见中文编码，最大 5 MB；选择文件不会立即写入。</small>
          </template>
        </button>
        <input ref="fileInput" class="manuscript-import__file" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" @change="handleFileInput">
        <p v-if="error" class="manuscript-import__error" role="alert">{{ error }}</p>
      </div>

      <div v-else class="manuscript-import__review">
        <div class="manuscript-import__field">
          <label for="manuscript-book-title">书名</label>
          <input id="manuscript-book-title" ref="titleInput" v-model="bookTitle" maxlength="120" type="text" data-test="manuscript-book-title" @input="authorTitleEdited = true">
        </div>

        <fieldset class="manuscript-import__mode">
          <legend>怎样建立章节</legend>
          <label>
            <input v-model="mode" type="radio" value="auto">
            <span><strong>按标题拆章</strong><small>{{ parsed.detected ? `已识别 ${autoChapters.length} 章` : '没有识别到章节标题，将作为一章' }}</small></span>
          </label>
          <label>
            <input v-model="mode" type="radio" value="single">
            <span><strong>整篇作为一章</strong><small>保留原文，不自动拆分</small></span>
          </label>
        </fieldset>

        <div class="manuscript-import__summary">
          <span>{{ parsed.filename }}</span>
          <span>{{ parsed.charCount.toLocaleString('zh-CN') }} 字符</span>
          <span>{{ draftChapters.length }} 章</span>
          <span>{{ encodingName }}</span>
        </div>

        <details ref="encodingTools" class="manuscript-import__encoding-tools" data-test="manuscript-import-encoding-tools" :open="Boolean(encodingWarning)">
          <summary>识别不对？调整编码</summary>
          <div class="manuscript-import__encoding-body">
            <label>
              <span>改用编码</span>
              <select v-model="selectedEncoding" @change="reparseEncoding">
                <option value="auto">自动识别</option>
                <option v-for="candidate in encodingOptions" :key="candidate" :value="candidate">{{ candidate.toUpperCase() }}</option>
              </select>
            </label>
            <p v-if="encodingWarning" role="status">{{ encodingWarning }}</p>
          </div>
        </details>

        <div v-if="rebuildNotice" class="manuscript-import__rebuild" role="status" data-test="manuscript-import-rebuild-notice">
          <p>{{ rebuildNotice }}</p>
          <button type="button" @click="undoRebuild">撤销本次改动</button>
        </div>

        <ol class="manuscript-import__chapters" aria-label="待导入章节">
          <li v-for="(chapter, index) in draftChapters" :key="`${mode}-${index}`">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <input v-model="chapter.title" :aria-label="`第 ${index + 1} 章标题`" maxlength="120" type="text" @input="recordChapterEdit(chapter)">
              <p>{{ excerpt(chapter.content) }}</p>
            </div>
          </li>
        </ol>

        <p v-if="error" ref="errorLine" class="manuscript-import__error" role="alert" tabindex="-1" data-test="manuscript-import-error">{{ error }}</p>
      </div>

      <footer class="manuscript-import__foot">
        <p>确认后会新建一本书，不覆盖现有书稿。正文保存在当前浏览器。</p>
        <div>
          <button v-if="parsed" type="button" class="manuscript-import__secondary" @click="reset">重新选择</button>
          <button type="button" class="manuscript-import__secondary" @click="emit('close')">取消</button>
          <button v-if="parsed" type="button" class="manuscript-import__primary" data-test="manuscript-import-confirm" :disabled="!canConfirm || confirming" @click="confirmImport">{{ confirming ? '正在创建…' : '创建书稿' }}</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  buildSingleChapterPreview,
  createImportedWritingBook,
  decodeManuscriptBytes,
  parseManuscriptText,
  validateManuscriptFile
} from '../../services/writing/writingManuscriptImport.js'

const emit = defineEmits(['close', 'import'])

const dialog = ref(null)
const closeButton = ref(null)
const fileInput = ref(null)
const titleInput = ref(null)
const errorLine = ref(null)
const encodingTools = ref(null)
const parsed = ref(null)
const bookTitle = ref('')
const mode = ref('auto')
const draftChapters = ref([])
const error = ref('')
const fileBytes = ref(null)
const selectedEncoding = ref('auto')
const encodingInfo = ref(null)

// 读取是一次有身份的操作:换选文件或关闭对话框都会作废还在路上的旧读取,
// 旧结果只能丢弃,不能覆盖新选择或复活已关闭的预览。
let readSequence = 0
const reading = ref(false)
const readingName = ref('')

// 作者改动与识别结果分开对待:书名一旦手改就不再被重解析覆盖;
// 章名手改按"章节内容"记账,内容对应关系还在就保留,变了才丢弃并给出撤销。
const authorTitleEdited = ref(false)
const chapterTitleEdits = ref(new Map())
const confirming = ref(false)
const rebuildNotice = ref('')
const previewSnapshot = ref(null)

const autoChapters = computed(() => parsed.value?.chapters || [])
const canConfirm = computed(() => Boolean(
  bookTitle.value.trim()
  && draftChapters.value.length
  && draftChapters.value.every((chapter) => chapter.title.trim())
))
const encodingName = computed(() => {
  const name = encodingInfo.value?.encoding
  if (!name) return ''
  return `${name.toUpperCase()}${['high', 'manual'].includes(encodingInfo.value.confidence) ? '' : ' · 请抽查'}`
})
const encodingWarning = computed(() => encodingInfo.value?.warnings?.[0] || '')
const encodingOptions = computed(() => {
  const candidates = (encodingInfo.value?.candidates || []).map((item) => item.encoding)
  return [...new Set(['utf-8', 'gb18030', 'big5', 'utf-16le', 'utf-16be', ...candidates])]
})

function contentKey(content) {
  const text = String(content || '')
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0
  return `${text.length}:${hash}`
}

function cloneChapters(chapters) {
  return chapters.map((chapter) => ({ title: chapter.title, content: chapter.content }))
}

function recordChapterEdit(chapter) {
  const next = new Map(chapterTitleEdits.value)
  next.set(contentKey(chapter.content), String(chapter.title || ''))
  chapterTitleEdits.value = next
}

// 重建章列表(换模式/换编码)时应用手改;返回被丢弃的数量,让预览诚实说明。
function rebuildChapters(source, { notify } = { notify: true }) {
  const edits = chapterTitleEdits.value
  let applied = 0
  let dropped = 0
  const usedKeys = new Set()
  draftChapters.value = cloneChapters(source).map((chapter) => {
    const key = contentKey(chapter.content)
    if (edits.has(key) && !usedKeys.has(key)) {
      usedKeys.add(key)
      applied += 1
      return { ...chapter, title: edits.get(key) }
    }
    return chapter
  })
  dropped = edits.size - applied
  if (notify && edits.size && dropped > 0) {
    rebuildNotice.value = dropped === edits.size
      ? `当前拆分方式下没有章节与手改章名对应；切回原方式会自动恢复这 ${dropped} 个章名。`
      : `有 ${dropped} 个手改章名不再对应识别出的章节内容；其余 ${applied} 个已保留。`
    return
  }
  if (!dropped) rebuildNotice.value = ''
}

function snapshotPreview() {
  previewSnapshot.value = {
    parsed: parsed.value,
    encodingInfo: encodingInfo.value,
    selectedEncoding: selectedEncoding.value,
    mode: mode.value,
    bookTitle: bookTitle.value,
    chapters: cloneChapters(draftChapters.value)
  }
}

function undoRebuild() {
  const snapshot = previewSnapshot.value
  if (!snapshot) { rebuildNotice.value = ''; return }
  parsed.value = snapshot.parsed
  encodingInfo.value = snapshot.encodingInfo
  selectedEncoding.value = snapshot.selectedEncoding
  mode.value = snapshot.mode
  bookTitle.value = snapshot.bookTitle
  draftChapters.value = snapshot.chapters
  rebuildNotice.value = ''
  previewSnapshot.value = null
  nextTick(() => titleInput.value?.focus())
}

watch(mode, (value) => {
  if (!parsed.value) return
  snapshotPreview()
  rebuildChapters(value === 'single' ? buildSingleChapterPreview(parsed.value) : autoChapters.value)
})

function clearAuthorEdits() {
  authorTitleEdited.value = false
  chapterTitleEdits.value = new Map()
  rebuildNotice.value = ''
  previewSnapshot.value = null
}

async function readFile(file) {
  const ticket = ++readSequence
  error.value = ''
  const valid = validateManuscriptFile(file)
  if (!valid.ok) {
    error.value = valid.message
    return
  }
  reading.value = true
  readingName.value = file.name
  try {
    const bytes = await file.arrayBuffer()
    if (ticket !== readSequence) return
    selectedEncoding.value = 'auto'
    const decoded = decodeManuscriptBytes(bytes)
    if (ticket !== readSequence) return
    if (!decoded.ok) {
      error.value = decoded.message
      return
    }
    const result = parseManuscriptText({ text: decoded.text, filename: file.name })
    if (ticket !== readSequence) return
    if (!result.ok) {
      error.value = result.message
      return
    }
    clearAuthorEdits()
    parsed.value = result
    encodingInfo.value = decoded
    bookTitle.value = result.title
    mode.value = 'auto'
    draftChapters.value = cloneChapters(result.chapters)
    await nextTick()
    titleInput.value?.focus()
    titleInput.value?.select()
  } catch (readError) {
    if (ticket === readSequence) error.value = readError?.message || '文件读取失败，请重新选择。'
  } finally {
    if (ticket === readSequence) {
      reading.value = false
      readingName.value = ''
    }
  }
}

function reparseEncoding() {
  if (!fileBytes.value || !parsed.value) return
  error.value = ''
  const decoded = decodeManuscriptBytes(fileBytes.value, selectedEncoding.value)
  if (!decoded.ok) {
    error.value = decoded.message
    nextTick(() => encodingTools.value?.$el?.querySelector('select')?.focus())
    return
  }
  const result = parseManuscriptText({ text: decoded.text, filename: parsed.value.filename })
  if (!result.ok) {
    error.value = result.message
    return
  }
  snapshotPreview()
  parsed.value = result
  encodingInfo.value = decoded
  if (!authorTitleEdited.value) bookTitle.value = result.title
  rebuildChapters(result.chapters)
}

function handleFileInput(event) {
  const file = event.target?.files?.[0]
  event.target.value = ''
  if (file) void readFile(file)
}

function handleDrop(event) {
  const file = event.dataTransfer?.files?.[0]
  if (file) void readFile(file)
}

function excerpt(content) {
  const text = String(content || '').replace(/[#>*_`()~-]+|\[|\]/gu, ' ').replace(/\s+/gu, ' ').trim()
  return text ? text.slice(0, 88) : '空章节'
}

function reset() {
  readSequence += 1
  parsed.value = null
  bookTitle.value = ''
  draftChapters.value = []
  error.value = ''
  fileBytes.value = null
  selectedEncoding.value = 'auto'
  encodingInfo.value = null
  reading.value = false
  readingName.value = ''
  clearAuthorEdits()
  nextTick(() => fileInput.value?.focus())
}

function confirmImport() {
  if (confirming.value || !canConfirm.value) return
  const result = createImportedWritingBook({ title: bookTitle.value, chapters: draftChapters.value })
  if (!result.ok) {
    error.value = result.reason === 'title-required' ? '请填写书名。' : '没有可以导入的章节。'
    nextTick(() => (result.reason === 'title-required' ? titleInput.value?.focus() : errorLine.value?.focus()))
    return
  }
  confirming.value = true
  let responded = false
  emit('import', result.book, (ok) => {
    responded = true
    if (ok) return
    confirming.value = false
    error.value = '导入未能保存：浏览器存储空间不足。预览仍保留，可重试或先清理浏览器存储。'
    nextTick(() => errorLine.value?.focus())
  })
  if (!responded) confirming.value = false
}

function onKeydown(event) {
  // IME 组合中的 Esc/Enter 属于输入法行为,不触发对话框快捷键。
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [...(dialog.value?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary:not(:disabled)') || [])]
    .filter((element) => element.offsetParent !== null)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  nextTick(() => closeButton.value?.focus())
})

onBeforeUnmount(() => {
  readSequence += 1
})
</script>

<style scoped>
.manuscript-import__overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--archive-ink) 46%, transparent);
}

.manuscript-import {
  width: min(720px, 100%);
  max-height: min(760px, calc(var(--app-viewport-height, 100vh) - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-panel, var(--surface-raised));
  color: var(--text-primary);
  box-shadow: 0 24px 70px color-mix(in srgb, var(--archive-ink) 24%, transparent);
}

.manuscript-import__head,
.manuscript-import__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 22px;
}

.manuscript-import__head { border-bottom: 1px solid var(--border); }
.manuscript-import__head h2 { margin: 2px 0 0; font: 700 22px/1.25 var(--font-sans); }
.manuscript-import__kicker { color: var(--text-secondary); font-size: 11px; letter-spacing: 0.12em; }

.manuscript-import__close {
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
}

.manuscript-import__pick,
.manuscript-import__review {
  min-height: 0;
  overflow: auto;
  padding: 22px;
}

.manuscript-import__dropzone {
  width: 100%;
  min-height: 240px;
  display: grid;
  place-content: center;
  gap: 8px;
  border: 1px dashed color-mix(in srgb, var(--archive-olive) 55%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--archive-paper-soft) 64%, var(--surface-panel));
  color: var(--text-primary);
  text-align: center;
  cursor: pointer;
}

.manuscript-import__dropzone[aria-busy='true'] { cursor: progress; }
.manuscript-import__dropzone strong { font-size: 17px; }
.manuscript-import__dropzone span { color: var(--text-secondary); }
.manuscript-import__dropzone small { margin-top: 14px; color: var(--text-muted, var(--text-secondary)); }
.manuscript-import__file { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.manuscript-import__review { display: grid; gap: 18px; }
.manuscript-import__field { display: grid; gap: 7px; }
.manuscript-import__field label,
.manuscript-import__mode legend { color: var(--text-secondary); font-size: 12px; font-weight: 650; }
.manuscript-import input[type='text'] {
  width: 100%;
  min-height: 42px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
}

.manuscript-import__mode { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; padding: 0; border: 0; }
.manuscript-import__mode legend { grid-column: 1 / -1; margin-bottom: 7px; }
.manuscript-import__mode label {
  min-height: 58px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
}
.manuscript-import__mode label:has(input:checked) { border-color: var(--archive-olive); background: color-mix(in srgb, var(--archive-olive) 8%, transparent); }
.manuscript-import__mode span { display: grid; gap: 3px; }
.manuscript-import__mode small { color: var(--text-secondary); line-height: 1.35; }

.manuscript-import__summary { display: flex; flex-wrap: wrap; gap: 8px 18px; color: var(--text-secondary); font-size: 12px; }
.manuscript-import__encoding-tools { border-block: 1px solid var(--border); color: var(--text-secondary); font-size: 12px; }
.manuscript-import__encoding-tools summary { min-height: 40px; display: flex; align-items: center; cursor: pointer; color: var(--text-secondary); }
.manuscript-import__encoding-tools summary:hover { color: var(--text-primary); }
.manuscript-import__encoding-body { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0 10px; line-height: 1.45; }
.manuscript-import__encoding-body label { display: flex; align-items: center; gap: 7px; flex: none; }
.manuscript-import__encoding-body select { min-height: 36px; border: 1px solid var(--border); border-radius: 4px; padding: 0 8px; background: var(--bg-primary); color: var(--text-primary); font: inherit; }
.manuscript-import__rebuild { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 9px 10px; border: 1px solid color-mix(in srgb, var(--archive-olive) 34%, var(--border)); border-radius: 5px; background: color-mix(in srgb, var(--archive-olive) 7%, transparent); color: var(--text-primary); font-size: 12px; line-height: 1.5; }
.manuscript-import__rebuild p { margin: 0; }
.manuscript-import__rebuild button { flex: none; min-height: 32px; padding: 0 8px; border: 0; background: none; color: var(--archive-olive); font: inherit; font-weight: 650; cursor: pointer; }
.manuscript-import__rebuild button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.manuscript-import__chapters { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
.manuscript-import__chapters li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.manuscript-import__chapters li > span { padding-top: 11px; color: var(--text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
.manuscript-import__chapters li > div { min-width: 0; }
.manuscript-import__chapters p { overflow: hidden; margin: 5px 2px 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.manuscript-import__error { margin: 12px 0 0; color: var(--danger); font-size: 13px; }
.manuscript-import__error:focus-visible { outline: 2px solid var(--danger); outline-offset: 3px; }

.manuscript-import__foot { border-top: 1px solid var(--border); }
.manuscript-import__foot p { max-width: 340px; margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.manuscript-import__foot > div { display: flex; gap: 8px; }
.manuscript-import__primary,
.manuscript-import__secondary { min-height: 40px; padding: 0 14px; border-radius: 4px; font: inherit; cursor: pointer; }
.manuscript-import__secondary { border: 1px solid var(--border); background: transparent; color: var(--text-primary); }
.manuscript-import__primary { border: 1px solid var(--archive-olive); background: var(--archive-olive); color: var(--archive-paper-soft); }
.manuscript-import__primary:disabled { opacity: 0.45; cursor: default; }

@media (max-width: 720px) {
  .manuscript-import__overlay { align-items: end; padding: 0; }
  .manuscript-import { max-height: calc(var(--app-viewport-height, 100vh) - 36px); border-radius: 8px 8px 0 0; }
  .manuscript-import__head,
  .manuscript-import__pick,
  .manuscript-import__review,
  .manuscript-import__foot { padding-left: 16px; padding-right: 16px; }
  .manuscript-import__mode { grid-template-columns: 1fr; }
  .manuscript-import__encoding-body { align-items: stretch; flex-direction: column; }
  .manuscript-import__encoding-body label { justify-content: space-between; }
  .manuscript-import__rebuild { align-items: flex-start; flex-direction: column; gap: 6px; }
  .manuscript-import__foot { align-items: stretch; flex-direction: column; }
  .manuscript-import__foot p { max-width: none; }
  .manuscript-import__foot > div { display: grid; grid-template-columns: 1fr 1fr; }
  .manuscript-import__foot .manuscript-import__primary { grid-column: 1 / -1; order: -1; min-height: 44px; }
}
</style>
