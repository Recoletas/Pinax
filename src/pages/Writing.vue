<template>
  <div class="writing-page">
    <!-- 顶部标题栏 -->
    <header class="title-bar">
      <div class="title-left">
        <button class="icon-btn" @click="goBack" title="返回">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 3.5L8 8L3 12.5V3.5Z"/>
          </svg>
        </button>
        <span class="app-title">写作</span>
      </div>
      <div class="title-center">
        <select v-model="selectedBookId" class="book-selector">
          <option value="">选择书籍...</option>
          <option v-for="book in books" :key="book.id" :value="book.id">
            {{ book.title }}
          </option>
        </select>
      </div>
      <div class="title-right">
        <div class="status-indicator" :class="saveStatus">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusText }}</span>
          <span class="status-divider" v-if="saveStatus !== 'saving'">·</span>
          <span class="status-count" v-if="saveStatus !== 'saving'">{{ wordCount.toLocaleString() }} 字</span>
        </div>
        <button class="icon-btn" @click="createNewBook" title="新建书籍">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2v12M2 8h12"/>
          </svg>
        </button>
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          <span class="theme-icon">
            <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14"/>
            </svg>
          </span>
          <span class="theme-label">{{ isDark ? '暗色' : '亮色' }}</span>
        </button>
      </div>
    </header>

    <div class="content-area">
      <!-- 左侧边栏 -->
      <aside class="sidebar" v-if="selectedBookId">
        <div class="sidebar-header">
          <span class="sidebar-title">目录</span>
          <button class="add-btn" @click="createNewChapter" title="新建章节">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 0v14M0 7h14"/>
            </svg>
          </button>
        </div>
        <div class="chapter-list">
          <div
            v-for="(chapter, index) in chapters"
            :key="chapter.id"
            :class="['chapter-item', { active: selectedChapterId === chapter.id }]"
            @click="selectChapter(chapter.id)"
          >
            <span class="chapter-num">{{ index + 1 }}</span>
            <span class="chapter-title">{{ chapter.title || '无标题章节' }}</span>
            <span class="chapter-words">{{ chapter.wordCount || 0 }}</span>
          </div>
          <div v-if="chapters.length === 0" class="empty-hint">
            暂无章节，点击 + 添加
          </div>
        </div>
      </aside>

      <!-- 书籍列表侧边栏 -->
      <aside class="sidebar books-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">书籍</span>
          <button class="add-btn" @click="createNewBook" title="新建书籍">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 0v14M0 7h14"/>
            </svg>
          </button>
        </div>
        <div class="book-list">
          <div
            v-for="book in books"
            :key="book.id"
            :class="['book-item', { active: selectedBookId === book.id }]"
            @click="selectBook(book.id)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="book-icon">
              <path d="M2 2h5.5v12H2V2zm6 0h6v12H8V2z"/>
            </svg>
            <div class="book-info">
              <span class="book-title">{{ book.title }}</span>
              <span class="book-meta">{{ book.chapters?.length || 0 }} 章</span>
            </div>
          </div>
          <div v-if="books.length === 0" class="empty-hint">
            暂无书籍
          </div>
        </div>
      </aside>

      <!-- 主编辑区 -->
      <main class="editor-main">
        <template v-if="!selectedBookId">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" class="empty-icon">
              <path d="M6 6h18v36H6V6zm24 0h12v36H30V6zM12 12h6v4h-6v-4zm0 8h12v4H12v-4zm0 8h10v4H12v-4z"/>
            </svg>
            <p class="empty-title">选择或创建书籍</p>
            <p class="empty-desc">从左侧选择一本书籍开始写作</p>
            <button class="btn-primary" @click="createNewBook">新建书籍</button>
          </div>
        </template>

        <template v-else-if="!selectedChapterId">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" class="empty-icon">
              <path d="M8 8h32v32H8V8zm4 4v24h24V12H12zm4 4h16v2H16v-2zm0 6h16v2H16v-2zm0 6h10v2H16v-2z"/>
            </svg>
            <p class="empty-title">选择或创建章节</p>
            <p class="empty-desc">从目录中选择一个章节开始编辑</p>
            <button class="btn-primary" @click="createNewChapter">新建章节</button>
          </div>
        </template>

        <template v-else>
          <div class="editor-header">
            <input
              v-model="currentChapterTitle"
              type="text"
              class="chapter-title-input"
              placeholder="章节标题"
              @input="onTitleChange"
            />
            <div class="editor-stats">
              <span class="stat">{{ wordCount.toLocaleString() }} 字</span>
              <span class="stat-divider">|</span>
              <span class="stat">{{ charCount.toLocaleString() }} 字符</span>
            </div>
          </div>
          <textarea
            v-model="editorContent"
            class="editor-textarea"
            placeholder="开始写作..."
            @input="onContentChange"
            ref="textareaRef"
          ></textarea>
        </template>
      </main>
    </div>

    <!-- 新建书籍弹窗 -->
    <div v-if="showNewBookModal" class="modal-overlay" @click.self="showNewBookModal = false">
      <div class="modal">
        <div class="modal-header">
          <h3>新建书籍</h3>
          <button class="modal-close" @click="showNewBookModal = false">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <label class="input-label">书名</label>
          <input
            v-model="newBookTitle"
            type="text"
            class="input"
            placeholder="输入书籍名称"
            ref="newBookInput"
          />
          <label class="input-label">简介（可选）</label>
          <textarea
            v-model="newBookDesc"
            class="input textarea"
            placeholder="输入书籍简介"
          ></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showNewBookModal = false">取消</button>
          <button class="btn-primary" @click="confirmCreateBook" :disabled="!newBookTitle.trim()">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'

const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const books = ref([])
const selectedBookId = ref('')
const chapters = ref([])
const selectedChapterId = ref(null)
const currentChapterTitle = ref('')
const editorContent = ref('')
const showNewBookModal = ref(false)
const newBookTitle = ref('')
const newBookDesc = ref('')
const newBookInput = ref(null)
const textareaRef = ref(null)

const saveStatus = ref('saved')
let saveTimeout = null
let titleTimeout = null

onMounted(() => {
  loadBooks()
})

const charCount = computed(() => editorContent.value.length)

const wordCount = computed(() => {
  if (!editorContent.value) return 0
  const text = editorContent.value.trim()
  if (!text) return 0
  const chineseChars = (text.match(/[一-龥]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  return chineseChars + englishWords
})

const statusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '已保存'
    case 'saving': return '保存中...'
    case 'unsaved': return '未保存'
    default: return ''
  }
})

function goBack() {
  saveCurrentChapter()
  router.push('/')
}

function loadBooks() {
  try {
    const stored = localStorage.getItem('writing_books')
    books.value = stored ? JSON.parse(stored) : []
  } catch (e) {
    books.value = []
  }
}

function saveBooks() {
  localStorage.setItem('writing_books', JSON.stringify(books.value))
}

function selectBook(bookId) {
  saveCurrentChapter()
  selectedBookId.value = bookId
  const book = books.value.find(b => b.id === bookId)
  if (book) {
    chapters.value = book.chapters || []
    if (chapters.value.length > 0) {
      selectChapter(chapters.value[0].id)
    } else {
      selectedChapterId.value = null
      currentChapterTitle.value = ''
      editorContent.value = ''
    }
  }
  saveStatus.value = 'saved'
}

function selectChapter(chapterId) {
  if (selectedChapterId.value && selectedChapterId.value !== chapterId) {
    saveCurrentChapter()
  }
  selectedChapterId.value = chapterId
  const chapter = chapters.value.find(c => c.id === chapterId)
  if (chapter) {
    currentChapterTitle.value = chapter.title || ''
    editorContent.value = chapter.content || ''
  }
}

function createNewBook() {
  showNewBookModal.value = true
  newBookTitle.value = ''
  newBookDesc.value = ''
  nextTick(() => newBookInput.value?.focus())
}

function confirmCreateBook() {
  if (!newBookTitle.value.trim()) return

  const newBook = {
    id: Date.now().toString(),
    title: newBookTitle.value.trim(),
    description: newBookDesc.value.trim(),
    createdAt: new Date().toISOString(),
    chapters: []
  }

  books.value.push(newBook)
  saveBooks()
  selectBook(newBook.id)
  showNewBookModal.value = false
}

function createNewChapter() {
  if (!selectedBookId.value) return

  const newChapter = {
    id: Date.now().toString(),
    title: '',
    content: '',
    wordCount: 0,
    createdAt: new Date().toISOString()
  }

  chapters.value.push(newChapter)
  saveChapters()
  selectChapter(newChapter.id)
}

function saveChapters() {
  const book = books.value.find(b => b.id === selectedBookId.value)
  if (book) {
    book.chapters = chapters.value
    book.updatedAt = new Date().toISOString()
    saveBooks()
  }
}

function saveCurrentChapter() {
  if (!selectedChapterId.value) return

  const chapter = chapters.value.find(c => c.id === selectedChapterId.value)
  if (chapter) {
    chapter.title = currentChapterTitle.value
    chapter.content = editorContent.value
    chapter.wordCount = wordCount.value
    chapter.updatedAt = new Date().toISOString()
    saveChapters()
  }
}

function onTitleChange() {
  saveStatus.value = 'unsaved'
  if (titleTimeout) clearTimeout(titleTimeout)
  titleTimeout = setTimeout(() => {
    saveCurrentChapter()
    saveStatus.value = 'saving'
    setTimeout(() => { saveStatus.value = 'saved' }, 300)
  }, 500)
}

function onContentChange() {
  saveStatus.value = 'unsaved'
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveStatus.value = 'saving'
    saveCurrentChapter()
    setTimeout(() => { saveStatus.value = 'saved' }, 300)
  }, 1000)
}
</script>

<style scoped>
.writing-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  overflow: hidden;
}

/* 标题栏 */
.title-bar {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-shrink: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-left .app-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.title-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.book-selector {
  height: 32px;
  padding: 0 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  min-width: 160px;
}

.book-selector:focus {
  outline: none;
  border-color: var(--accent);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--bg-tertiary);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.status-indicator.saving .status-dot {
  background: var(--warning);
}

.status-indicator.unsaved .status-dot {
  background: var(--danger);
}

.status-text {
  color: var(--text-secondary);
}

.status-divider {
  color: var(--text-muted);
  margin: 0 4px;
}

.status-count {
  color: var(--text-muted);
  font-size: 11px;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.theme-toggle:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}

.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 内容区域 */
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边栏 */
.sidebar {
  width: 200px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.books-sidebar {
  border-right: 1px solid var(--border);
}

.sidebar-header {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.book-list,
.chapter-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.book-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.book-item:hover {
  background: var(--bg-hover);
}

.book-item.active {
  background: var(--accent-light);
}

.book-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.book-item.active .book-icon {
  color: var(--accent);
}

.book-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.book-title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-item.active .book-title {
  color: var(--accent);
}

.book-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.chapter-item:hover {
  background: var(--bg-hover);
}

.chapter-item.active {
  background: var(--accent-light);
}

.chapter-num {
  font-size: 11px;
  color: var(--text-muted);
  width: 20px;
  text-align: right;
  flex-shrink: 0;
}

.chapter-item.active .chapter-num {
  color: var(--accent);
}

.chapter-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-item.active .chapter-title {
  color: var(--accent);
}

.chapter-words {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.empty-hint {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* 主编辑区 */
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.empty-icon {
  opacity: 0.3;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-desc {
  font-size: 13px;
}

.btn-primary {
  margin-top: 8px;
  padding: 8px 20px;
  background: var(--accent);
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.editor-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.chapter-title-input {
  width: 100%;
  background: transparent;
  border: none;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
}

.chapter-title-input::placeholder {
  color: var(--text-muted);
}

.editor-stats {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.stat {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-divider {
  color: var(--border);
}

.editor-textarea {
  flex: 1;
  padding: 24px;
  background: var(--bg-primary);
  border: none;
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
  resize: none;
  outline: none;
  overflow-y: auto;
}

.editor-textarea::placeholder {
  color: var(--text-muted);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  width: 440px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px var(--shadow-md);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
}

.modal-close:hover {
  background: var(--bg-hover);
}

.modal-body {
  padding: 20px;
}

.input-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.input-label:not(:first-child) {
  margin-top: 16px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
}

.input:focus {
  border-color: var(--accent);
}

.input.textarea {
  min-height: 80px;
  resize: vertical;
  line-height: 1.5;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 8px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}

.btn:hover {
  background: var(--bg-hover);
}
</style>
