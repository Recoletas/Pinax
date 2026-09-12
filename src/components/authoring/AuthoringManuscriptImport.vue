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
          @click="fileInput?.click()"
          @dragover.prevent
          @drop.prevent="handleDrop"
        >
          <strong>选择一份书稿</strong>
          <span>或把 .txt / .md 文件拖到这里</span>
          <small>UTF-8 编码，最大 2 MB；选择文件不会立即写入。</small>
        </button>
        <input ref="fileInput" class="manuscript-import__file" type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" @change="handleFileInput">
        <p v-if="error" class="manuscript-import__error" role="alert">{{ error }}</p>
      </div>

      <div v-else class="manuscript-import__review">
        <div class="manuscript-import__field">
          <label for="manuscript-book-title">书名</label>
          <input id="manuscript-book-title" ref="titleInput" v-model="bookTitle" maxlength="120" type="text">
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
        </div>

        <ol class="manuscript-import__chapters" aria-label="待导入章节">
          <li v-for="(chapter, index) in draftChapters" :key="`${mode}-${index}`">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <input v-model="chapter.title" :aria-label="`第 ${index + 1} 章标题`" maxlength="120" type="text">
              <p>{{ excerpt(chapter.content) }}</p>
            </div>
          </li>
        </ol>

        <p v-if="error" class="manuscript-import__error" role="alert">{{ error }}</p>
      </div>

      <footer class="manuscript-import__foot">
        <p>确认后会新建一本书，不覆盖现有书稿。正文保存在当前浏览器。</p>
        <div>
          <button v-if="parsed" type="button" class="manuscript-import__secondary" @click="reset">重新选择</button>
          <button type="button" class="manuscript-import__secondary" @click="emit('close')">取消</button>
          <button v-if="parsed" type="button" class="manuscript-import__primary" data-test="manuscript-import-confirm" :disabled="!canConfirm" @click="confirmImport">创建书稿</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  buildSingleChapterPreview,
  createImportedWritingBook,
  parseManuscriptText,
  validateManuscriptFile
} from '../../services/writing/writingManuscriptImport.js'

const emit = defineEmits(['close', 'import'])

const dialog = ref(null)
const closeButton = ref(null)
const fileInput = ref(null)
const titleInput = ref(null)
const parsed = ref(null)
const bookTitle = ref('')
const mode = ref('auto')
const draftChapters = ref([])
const error = ref('')

const autoChapters = computed(() => parsed.value?.chapters || [])
const canConfirm = computed(() => Boolean(
  bookTitle.value.trim()
  && draftChapters.value.length
  && draftChapters.value.every((chapter) => chapter.title.trim())
))

function cloneChapters(chapters) {
  return chapters.map((chapter) => ({ title: chapter.title, content: chapter.content }))
}

watch(mode, (value) => {
  if (!parsed.value) return
  draftChapters.value = cloneChapters(value === 'single' ? buildSingleChapterPreview(parsed.value) : autoChapters.value)
})

async function readFile(file) {
  error.value = ''
  const valid = validateManuscriptFile(file)
  if (!valid.ok) {
    error.value = valid.message
    return
  }
  try {
    const text = await file.text()
    const result = parseManuscriptText({ text, filename: file.name })
    if (!result.ok) {
      error.value = result.message
      return
    }
    parsed.value = result
    bookTitle.value = result.title
    mode.value = 'auto'
    draftChapters.value = cloneChapters(result.chapters)
    await nextTick()
    titleInput.value?.focus()
    titleInput.value?.select()
  } catch (readError) {
    error.value = readError?.message || '文件读取失败，请重新选择。'
  }
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
  const text = String(content || '').replace(/[#>*_`\[\]()~-]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  return text ? text.slice(0, 88) : '空章节'
}

function reset() {
  parsed.value = null
  bookTitle.value = ''
  draftChapters.value = []
  error.value = ''
  nextTick(() => fileInput.value?.focus())
}

function confirmImport() {
  if (!canConfirm.value) return
  const result = createImportedWritingBook({ title: bookTitle.value, chapters: draftChapters.value })
  if (!result.ok) {
    error.value = result.reason === 'title-required' ? '请填写书名。' : '没有可以导入的章节。'
    return
  }
  emit('import', result.book)
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [...(dialog.value?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])]
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
.manuscript-import__chapters { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
.manuscript-import__chapters li { display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.manuscript-import__chapters li > span { padding-top: 11px; color: var(--text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
.manuscript-import__chapters li > div { min-width: 0; }
.manuscript-import__chapters p { overflow: hidden; margin: 5px 2px 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.manuscript-import__error { margin: 12px 0 0; color: var(--danger); font-size: 13px; }

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
  .manuscript-import__foot { align-items: stretch; flex-direction: column; }
  .manuscript-import__foot p { max-width: none; }
  .manuscript-import__foot > div { display: grid; grid-template-columns: 1fr 1fr; }
  .manuscript-import__foot .manuscript-import__primary { grid-column: 1 / -1; order: -1; min-height: 44px; }
}
</style>
