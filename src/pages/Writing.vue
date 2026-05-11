<template>
  <div class="writing-page" @click="onGlobalClick">
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
      <!-- 左侧边栏：目录 -->
      <aside class="sidebar chapters-sidebar" :style="{ width: leftWidth + 'px' }" v-if="selectedBookId">
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
            <button class="delete-btn" @click.stop="deleteChapter(chapter.id)" title="删除章节">×</button>
          </div>
          <div v-if="chapters.length === 0" class="empty-hint">
            暂无章节，点击 + 添加
          </div>
        </div>
      </aside>

      <!-- 可拉伸分隔栏 -->
      <div
        class="resize-handle"
        v-if="selectedBookId"
        @mousedown="startResize($event, 'left')"
      ></div>

      <!-- 右侧边栏：书籍 -->
      <aside class="sidebar books-sidebar" :style="{ width: rightWidth + 'px' }">
        <div class="sidebar-header">
          <span class="sidebar-title">书籍</span>
          <button class="add-btn btn-new" @click="createNewBook" title="新建书籍">
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
            <button class="delete-btn" @click.stop="deleteBook(book.id)" title="删除书籍">×</button>
          </div>
          <div v-if="books.length === 0" class="empty-hint">
            暂无书籍，点击上方 + 新建
          </div>
        </div>
      </aside>

      <!-- 右侧分隔栏 -->
      <div class="resize-handle" @mousedown="startResizeRight"></div>

      <!-- 主编辑区 -->
      <main class="editor-main">
        <template v-if="!selectedBookId">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" class="empty-icon">
              <path d="M6 6h18v36H6V6zm24 0h12v36H30V6zM12 12h6v4h-6v-4zm0 8h12v4H12v-4zm0 8h10v4H12v-4z"/>
            </svg>
            <p class="empty-title">选择或创建书籍</p>
            <p class="empty-desc">从右侧选择一本书籍开始写作</p>
            <button class="btn-primary" @click="createNewBook">新建书籍</button>
          </div>
        </template>

        <template v-else-if="!selectedChapterId">
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" class="empty-icon">
              <path d="M8 8h32v32H8V8zm4 4v24h24V12H12zm4 4h16v2H16v-2zm0 6h16v2H16v-2zm0 6h10v2H16v-2z"/>
            </svg>
            <p class="empty-title">选择或创建章节</p>
            <p class="empty-desc">从左侧目录中选择一个章节开始编辑</p>
            <button class="btn-primary" @click="createNewChapter">新建章节</button>
          </div>
        </template>

        <template v-else>
          <div class="editor-header">
            <!-- 编辑工具栏 -->
            <div class="editor-toolbar">
              <button class="tool-btn" @click="autoFormat" title="一键排版">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M1 2h12v1.5H1V2zm0 4h12v1.5H1V6zm0 4h8v1.5H1v-1.5z"/>
                </svg>
                排版
              </button>
              <button class="tool-btn" @click="insertSeparator" title="插入分隔线">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M1 7h12" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="7" cy="7" r="2" fill="currentColor"/>
                </svg>
                分隔
              </button>
              <button class="tool-btn" :class="{ active: showFontPanel }" @click.stop="showFontPanel = !showFontPanel" title="字体">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M2 2h10v2H2V2zm1 3h8v7H3V5zm0 0l2 6h4l2-6"/>
                </svg>
                字体
              </button>

              <!-- 字体面板 -->
              <div class="font-panel" v-if="showFontPanel" @click.stop>
                <div class="fp-row">
                  <span class="fp-label">字体</span>
                  <select class="fp-select" v-model="editorFont">
                    <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
                    <option value="'SimSun', serif">宋体</option>
                    <option value="'KaiTi', serif">楷体</option>
                    <option value="'STHeiti', sans-serif">黑体</option>
                    <option value="'MingLiU', serif">细明体</option>
                    <option value="system-ui, sans-serif">系统默认</option>
                  </select>
                </div>
                <div class="fp-row">
                  <span class="fp-label">大小</span>
                  <div class="fp-size-btns">
                    <button class="fp-btn" @click="adjustFontSize(-1)" title="缩小">A-</button>
                    <span class="fp-size-val">{{ editorFontSize }}</span>
                    <button class="fp-btn" @click="adjustFontSize(1)" title="放大">A+</button>
                  </div>
                </div>
                <div class="fp-row">
                  <span class="fp-label">样式</span>
                  <div class="fp-btns">
                    <button :class="['fp-btn', { active: editorBold }]" @click="editorBold = !editorBold" title="加粗">
                      <strong>B</strong>
                    </button>
                    <button :class="['fp-btn', { active: editorItalic }]" @click="editorItalic = !editorItalic" title="斜体">
                      <em>I</em>
                    </button>
                    <button :class="['fp-btn', { active: editorUnderline }]" @click="editorUnderline = !editorUnderline" title="下划线">
                      <u>U</u>
                    </button>
                  </div>
                </div>
              </div>
              <button class="tool-btn" :class="{ active: showNameGen }" @click.stop="showNameGen = !showNameGen" title="随机取名">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M7 1a3 3 0 100 6 3 3 0 000-6zm-5 12l1-4h8l1 4H2z"/>
                </svg>
                取名
              </button>

              <!-- 取名面板 -->
              <div class="name-gen-panel" v-if="showNameGen" @click.stop>
                <div class="ng-row">
                  <span class="ng-label">类型</span>
                  <div class="ng-btns">
                    <button :class="['ng-btn', { active: nameType === 'character' }]" @click="nameType = 'character'">人物</button>
                    <button :class="['ng-btn', { active: nameType === 'place' }]" @click="nameType = 'place'">地点</button>
                  </div>
                </div>
                <div class="ng-row">
                  <span class="ng-label">风格</span>
                  <div class="ng-btns">
                    <button :class="['ng-btn', { active: nameStyle === 'western' }]" @click="nameStyle = 'western'">西方</button>
                    <button :class="['ng-btn', { active: nameStyle === 'ancient' }]" @click="nameStyle = 'ancient'">古风</button>
                    <button :class="['ng-btn', { active: nameStyle === 'modern' }]" @click="nameStyle = 'modern'">现代</button>
                  </div>
                </div>
                <div class="ng-row" v-if="nameType === 'character'">
                  <span class="ng-label">姓氏</span>
                  <input v-model="fixedSurname" class="ng-input ng-sm" placeholder="可留空" />
                </div>
                <div class="ng-row" v-if="nameType === 'character'">
                  <span class="ng-label">名字</span>
                  <input v-model="fixedGivenName" class="ng-input ng-sm" placeholder="可留空" />
                </div>
                <button class="tool-btn" style="width:100%;justify-content:center;margin-top:8px" @click="doGenerateName">
                  生成
                </button>
                <div class="ng-results" v-if="generatedNames.length > 0">
                  <div class="ng-result-item" v-for="(item, idx) in generatedNames" :key="idx" @click="selectName(item)">
                    <span v-if="typeof item === 'string'">{{ item }}</span>
                    <span v-else class="ng-name-pair">{{ item.en }}<span class="ng-cn">{{ item.cn }}</span></span>
                  </div>
                </div>
              </div>
              <button class="tool-btn" :class="{ active: showFindReplace }" @click.stop="showFindReplace = !showFindReplace" title="查找替换">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M5 1a4 4 0 014 4c0 1.5-.8 2.8-2 3.5l3 3-1.5 1.5-3-3A4 4 0 115 1zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
                </svg>
                查找
              </button>
            </div>

            <!-- 查找替换栏 -->
            <div class="find-replace-bar" v-if="showFindReplace" @click.stop>
              <input
                v-model="findText"
                class="find-input"
                placeholder="查找..."
                @keydown.enter="findNext"
              />
              <button class="tool-btn sm" @click="findPrev">↑</button>
              <button class="tool-btn sm" @click="findNext">↓</button>
              <span class="find-count" v-if="findResults.length > 0">{{ findCurrent + 1 }}/{{ findResults.length }}</span>
              <span class="find-count" v-else-if="findText">无匹配</span>
              <div class="fr-divider"></div>
              <input
                v-model="replaceText"
                class="find-input"
                placeholder="替换为..."
              />
              <button class="tool-btn sm" @click="replaceOne">单处</button>
              <button class="tool-btn sm" @click="replaceAll">全部</button>
              <button class="tool-btn sm close" @click="showFindReplace = false">×</button>
            </div>

            <div class="title-row">
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
          </div>

          <textarea
            v-model="editorContent"
            class="editor-textarea"
            :style="{
              fontFamily: editorFont,
              fontSize: editorFontSize,
              fontWeight: editorBold ? 'bold' : 'normal',
              fontStyle: editorItalic ? 'italic' : 'normal',
              textDecoration: editorUnderline ? 'underline' : 'none'
            }"
            placeholder="开始写作..."
            @input="onContentChange"
            ref="textareaRef"
            @keydown="onEditorKeydown"
            @contextmenu.prevent="showContextMenu"
            @mouseup="updateSelectionStyle"
          ></textarea>
          <div v-if="hasSelection" class="selection-toolbar" :style="selectionToolbarStyle">
            <button class="fp-btn" :class="{ active: editorBold }" @click="applyStyleToSelection('bold')" title="加粗">B</button>
            <button class="fp-btn" :class="{ active: editorItalic }" @click="applyStyleToSelection('italic')" title="斜体">I</button>
            <button class="fp-btn" :class="{ active: editorUnderline }" @click="applyStyleToSelection('underline')" title="下划线">U</button>
            <div class="fp-divider"></div>
            <select class="fp-select sm" v-model="selectionFont" @change="applyFontToSelection">
              <option value="">字体</option>
              <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
              <option value="'SimSun', serif">宋体</option>
              <option value="'KaiTi', serif">楷体</option>
              <option value="'STHeiti', sans-serif">黑体</option>
            </select>
            <button class="fp-btn" @click="adjustSelectionFont(-1)" title="缩小">A-</button>
            <span class="fp-size-val">{{ selectionFontSize }}</span>
            <button class="fp-btn" @click="adjustSelectionFont(1)" title="放大">A+</button>
          </div>

      <!-- 右键菜单 -->
      <div
        v-if="contextMenu.show"
        class="context-menu"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @click.stop
      >
        <button class="ctx-item" @click="ctxAction('undo')" :disabled="!canUndo">撤销</button>
        <button class="ctx-item" @click="ctxAction('redo')" :disabled="!canRedo">重做</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item" @click="ctxAction('cut')" :disabled="!selectedText">剪切</button>
        <button class="ctx-item" @click="ctxAction('copy')" :disabled="!selectedText">复制</button>
        <button class="ctx-item" @click="ctxAction('paste')">粘贴</button>
        <button class="ctx-item" @click="ctxAction('delete')" :disabled="!selectedText">删除</button>
        <div class="ctx-divider"></div>
        <button class="ctx-item" @click="ctxAction('selectAll')">全选</button>
      </div>
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

const leftWidth = ref(220)
const rightWidth = ref(240)
const resizing = ref(null)
const minWidth = 150
const selectedText = ref('')
const canUndo = ref(false)
const canRedo = ref(false)
const contextMenu = ref({ show: false, x: 0, y: 0 })
const editorFont = ref("'Microsoft YaHei', sans-serif")
const showFindReplace = ref(false)
const findText = ref('')
const replaceText = ref('')
const findResults = ref([])
const findCurrent = ref(0)
const showNameGen = ref(false)
const nameType = ref('character')
const nameStyle = ref('chinese')
const fixedSurname = ref('')
const fixedGivenName = ref('')
const generatedNames = ref([])
const showFontPanel = ref(false)
const editorFontSize = ref('16px')
const editorBold = ref(false)
const editorItalic = ref(false)
const editorUnderline = ref(false)
const fontApplyMode = ref('global')
const hasSelection = ref(false)
const selectionFontSize = ref('16px')
const selectionFont = ref('')
const selectionToolbarStyle = ref({ top: '100px', left: '100px' })

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

function deleteChapter(chapterId) {
  chapters.value = chapters.value.filter(c => c.id !== chapterId)
  if (selectedChapterId.value === chapterId) {
    selectedChapterId.value = chapters.value.length > 0 ? chapters.value[0].id : null
    if (selectedChapterId.value) {
      selectChapter(selectedChapterId.value)
    } else {
      currentChapterTitle.value = ''
      editorContent.value = ''
    }
  }
  saveChapters()
}

function deleteBook(bookId) {
  books.value = books.value.filter(b => b.id !== bookId)
  saveBooks()
  if (selectedBookId.value === bookId) {
    selectedBookId.value = books.value.length > 0 ? books.value[0].id : null
    if (selectedBookId.value) {
      selectBook(selectedBookId.value)
    } else {
      chapters.value = []
      selectedChapterId.value = null
      currentChapterTitle.value = ''
      editorContent.value = ''
    }
  }
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

// 一键排版：规范段落分隔
function autoFormat() {
  let text = editorContent.value
  // 替换多个换行为双换行（段落分隔）
  text = text.replace(/\n{3,}/g, '\n\n')
  // 移除行首行尾多余空格
  text = text.split('\n').map(line => line.trim()).join('\n')
  // 移除全角空格
  text = text.replace(/　/g, ' ').trim()
  editorContent.value = text
  onContentChange()
}

// 插入分隔线
function insertSeparator() {
  const ta = textareaRef.value
  if (!ta) return
  const pos = ta.selectionStart
  const before = editorContent.value.substring(0, pos)
  const after = editorContent.value.substring(pos)
  const sep = before && !before.endsWith('\n') ? '\n\n—— · ——\n\n' : '—— · ——\n\n'
  editorContent.value = before + sep + after
  nextTick(() => {
    ta.selectionStart = ta.selectionEnd = pos + sep.length
    ta.focus()
  })
  onContentChange()
}

// 随机取名
function doGenerateName() {
  // 中文字符池
  const charPool = '瑾言清晚长风昭华知意逾白屿森念卿知行听澜挽棠墨深绾绾晏礼言蹊如故未歇星野映之清欢妄惊鸿云深瑶霜露璃萤雪'
  const ancientCharPool = '寻欢孤城吹雪小凤留香浪中棠十一郎不凡清扬我行问天慕白未央紫轩飞羽寒江孤鸿寒烟凝蝶落霞凌霜白露秋璃夏萤冬雪云浅萧默'

  generatedNames.value = []

  if (nameType.value === 'place') {
    const places = {
      western: ['Willowbrook', 'Ironforge', 'Silvermoon', 'DragonSpine', 'Stormwind', 'Darkwood', 'Brightport', 'Goldshire', 'Misty Valley', 'Sunnyridge', 'CrystalLake', 'Ravencliff', 'Thornwood', 'Stonehaven', 'Duskwood'],
      ancient: ['长安城', '洛阳城', '扬州城', '成都府', '苏州城', '杭州城', '汴京城', '金陵城', '燕京城', '临安府', '襄阳城', '荆州城', '泉州城', '广州城', '福州城'],
      modern: ['朝阳区', '海淀区', '浦东新区', '天河区', '南山区', '江汉区', '玄武区', '西城区', '东城区', '西湖区', '静安区', '黄浦区', '南开区', '和平区', '江岸区']
    }
    const list = places[nameStyle.value] || places.modern
    for (let i = 0; i < 5; i++) {
      generatedNames.value.push(list[Math.floor(Math.random() * list.length)])
    }
    generatedNames.value = [...new Set(generatedNames.value)]
    return
  }

  const hasSurname = fixedSurname.value.trim()
  const hasGivenName = fixedGivenName.value.trim()

  if (nameStyle.value === 'western') {
    const firstNames = ['Oliver', 'Emma', 'Liam', 'Sophia', 'Noah', 'Isabella', 'James', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia', 'Mason', 'Harper', 'Ethan', 'Evelyn', 'Alexander', 'Abigail', 'Henry', 'Emily', 'William', 'Ava', 'Michael', 'Ella', 'Daniel', 'Scarlett', 'Matthew', 'Grace', 'Sebastian', 'Chloe', 'Jack', 'Victoria', 'Owen', 'Aria', 'Luke', 'Lily', 'Dylan', 'Hannah', 'Gabriel', 'Zoey']
    const lastNames = ['Anderson', 'Thompson', 'White', 'Mitchell', 'Clark', 'Roberts', 'Taylor', 'Martinez', 'Harris', 'Robinson', 'Lee', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Lopez', 'Hill', 'Scott', 'Green', 'Adams', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins']
    const firstCn = ['奥利弗', '艾玛', '利亚姆', '索菲亚', '诺亚', '伊莎贝拉', '詹姆斯', '米娅', '本杰明', '夏洛特', '卢卡斯', '艾米莉亚', '梅森', '哈珀', '伊桑', '伊芙琳', '亚历山大', '阿比盖尔', '亨利', '艾米丽', '威廉', '艾娃', '迈克尔', '艾拉', '丹尼尔', '斯嘉丽', '马修', '格蕾丝', '塞巴斯蒂安', '克洛伊', '杰克', '维多利亚', '欧文', '艾瑞亚', '卢克', '莉莉', '迪伦', '汉娜', '加布里埃尔', '佐伊']
    const lastCn = ['安德森', '汤普森', '怀特', '米切尔', '克拉克', '罗伯茨', '泰勒', '马丁内斯', '哈里斯', '鲁宾逊', '李', '沃克', '霍尔', '艾伦', '扬', '金', '赖特', '洛佩兹', '希尔', '斯科特', '格林', '亚当斯', '贝克', '纳尔逊', '卡特', '米切尔', '佩雷斯', '罗伯茨', '特纳', '菲利普斯', '坎贝尔', '帕克', '埃文斯', '爱德华兹', '柯林斯']

    // 尝试匹配用户输入
    let fixedFirst = null, fixedLast = null
    if (hasGivenName) {
      const idx = firstCn.indexOf(fixedGivenName.value.trim())
      if (idx >= 0) fixedFirst = firstNames[idx]
      else fixedFirst = fixedGivenName.value.trim()
    }
    if (hasSurname) {
      const idx = lastCn.indexOf(fixedSurname.value.trim())
      if (idx >= 0) fixedLast = lastNames[idx]
      else fixedLast = fixedSurname.value.trim()
    }

    const seen = new Set()
    for (let i = 0; i < 8 && seen.size < 8; i++) {
      let f = fixedFirst || firstNames[Math.floor(Math.random() * firstNames.length)]
      let l = fixedLast || lastNames[Math.floor(Math.random() * lastNames.length)]
      let enName = f + ' ' + l
      if (seen.has(enName)) continue
      seen.add(enName)
      let fIdx = firstNames.indexOf(f)
      let lIdx = lastNames.indexOf(l)
      let cnName = (fIdx >= 0 ? firstCn[fIdx] : f) + '·' + (lIdx >= 0 ? lastCn[lIdx] : l)
      generatedNames.value.push({ en: enName, cn: cnName })
    }
  } else {
    // 算法化生成中文姓名
    const surnames = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧', '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕', '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎', '余', '潘', '杜', '戴', '夏', '钟', '汪', '田', '任', '姜', '范', '方', '石', '姚', '谭', '廖', '邹', '熊', '金', '陆', '郝', '孔', '白', '崔', '康', '毛', '邱', '秦', '江', '史', '顾', '侯', '邵', '孟', '龙', '万', '段', '漕', '钱', '汤', '尹', '黎', '易', '常', '武', '乔', '贺', '赖', '龚', '文']
    const pool = nameStyle.value === 'ancient' ? ancientCharPool : charPool

    const seen = new Set()
    const getName = () => {
      let surname = hasSurname ? fixedSurname.value.trim() : surnames[Math.floor(Math.random() * surnames.length)]
      let given = hasGivenName ? fixedGivenName.value.trim() : ''
      if (!given) {
        // 随机生成1-2个汉字的名字
        const len = Math.random() < 0.6 ? 1 : 2
        for (let i = 0; i < len; i++) {
          given += pool[Math.floor(Math.random() * pool.length)]
        }
      }
      return surname + given
    }

    for (let i = 0; i < 20 && seen.size < 10; i++) {
      const name = getName()
      if (seen.has(name)) continue
      seen.add(name)
      generatedNames.value.push(name)
    }
  }
}

function selectName(item) {
  const ta = textareaRef.value
  if (!ta) return
  const pos = ta.selectionStart
  const name = typeof item === 'string' ? item : item.en
  editorContent.value = editorContent.value.substring(0, pos) + name + editorContent.value.substring(pos)
  nextTick(() => {
    ta.selectionStart = ta.selectionEnd = pos + name.length
    ta.focus()
  })
  onContentChange()
  showNameGen.value = false
  generatedNames.value = []
}

// 查找下一个
function findNext() {
  if (!findText.value) return
  if (findResults.value.length === 0) {
    searchFind()
  }
  if (findResults.value.length > 0) {
    findCurrent.value = (findCurrent.value + 1) % findResults.value.length
    highlightFind()
  }
}

// 更新选区状态
function updateSelectionStyle() {
  const ta = textareaRef.value
  if (!ta) return
  hasSelection.value = ta.selectionStart !== ta.selectionEnd
  if (hasSelection.value) {
    const rect = ta.getBoundingClientRect()
    selectionToolbarStyle.value = {
      top: (rect.top + 30) + 'px',
      left: (rect.left + 50) + 'px'
    }
  }
}

function toggleStyle(style) {
  if (style === 'bold') editorBold.value = !editorBold.value
  else if (style === 'italic') editorItalic.value = !editorItalic.value
  else if (style === 'underline') editorUnderline.value = !editorUnderline.value
}

function applyStyleToSelection(style) {
  const ta = textareaRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  if (start === end) return

  const selText = editorContent.value.substring(start, end)

  // 检查是否已经应用了样式，若已应用则移除
  let prefix = '', suffix = '', pattern = ''
  if (style === 'bold') { prefix = '**'; suffix = '**'; pattern = '\\*\\*(.+?)\\*\\*' }
  else if (style === 'italic') { prefix = '*'; suffix = '*'; pattern = '\\*(.+?)\\*' }
  else if (style === 'underline') { prefix = '<u>'; suffix = '</u>'; pattern = '<u>(.+?)</u>' }

  const regex = new RegExp(pattern)
  const match = selText.match(regex)
  let newText
  if (match && match[0] === selText) {
    // 已应用，移除样式
    newText = match[1]
  } else {
    // 未应用，添加样式
    newText = prefix + selText + suffix
  }

  editorContent.value = editorContent.value.substring(0, start) + newText + editorContent.value.substring(end)
  nextTick(() => {
    ta.selectionStart = start
    ta.selectionEnd = start + newText.length
    ta.focus()
  })
  onContentChange()
}

function applyFontToSelection() {
  // 字体应用到选区
}

function adjustSelectionFont(delta) {
  const sizes = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24]
  const current = parseInt(selectionFontSize.value)
  const idx = sizes.indexOf(current)
  const newIdx = Math.max(0, Math.min(sizes.length - 1, idx + delta))
  selectionFontSize.value = sizes[newIdx] + 'px'
}

function adjustFontSize(delta) {
  const sizes = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30]
  const currentStr = editorFontSize.value
  const current = parseInt(currentStr.replace('px', ''))
  const idx = sizes.indexOf(current)
  const newIdx = Math.max(0, Math.min(sizes.length - 1, idx + delta))
  editorFontSize.value = sizes[newIdx] + 'px'
  onContentChange()
}

// 查找上一个
function findPrev() {
  if (!findText.value) return
  if (findResults.value.length === 0) {
    searchFind()
  }
  if (findResults.value.length > 0) {
    findCurrent.value = (findCurrent.value - 1 + findResults.value.length) % findResults.value.length
    highlightFind()
  }
}

// 执行搜索
function searchFind() {
  findResults.value = []
  findCurrent.value = 0
  if (!findText.value) return
  const regex = new RegExp(findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  let match
  while ((match = regex.exec(editorContent.value)) !== null) {
    findResults.value.push(match.index)
  }
}

// 高亮当前匹配并滚动
function highlightFind() {
  nextTick(() => {
    const ta = textareaRef.value
    if (!ta || findResults.value.length === 0) return
    const pos = findResults.value[findCurrent.value]
    ta.selectionStart = pos
    ta.selectionEnd = pos + findText.value.length
    ta.focus()
  })
}

// 替换一处
function replaceOne() {
  if (!findText.value || findResults.value.length === 0) return
  const pos = findResults.value[findCurrent.value]
  editorContent.value = editorContent.value.substring(0, pos) + replaceText.value + editorContent.value.substring(pos + findText.value.length)
  searchFind()
  onContentChange()
}

// 替换全部
function replaceAll() {
  if (!findText.value) return
  const regex = new RegExp(findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
  editorContent.value = editorContent.value.replace(regex, replaceText.value)
  findResults.value = []
  findCurrent.value = 0
  onContentChange()
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

function onEditorKeydown(e) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart
    const end = ta.selectionEnd
    editorContent.value = editorContent.value.substring(0, start) + '\t' + editorContent.value.substring(end)
    nextTick(() => {
      ta.selectionStart = ta.selectionEnd = start + 1
    })
  }
}

function showContextMenu(e) {
  const ta = e.target
  selectedText.value = ta.value.substring(ta.selectionStart, ta.selectionEnd)
  const rect = ta.getBoundingClientRect()
  contextMenu.value = {
    show: true,
    x: Math.min(e.clientX, rect.right - 160),
    y: Math.min(e.clientY, rect.bottom - 10)
  }
}

function ctxAction(action) {
  const ta = textareaRef.value
  if (!ta) return
  ta.focus()
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const before = editorContent.value.substring(0, start)
  const after = editorContent.value.substring(end)
  const sel = selectedText.value

  switch (action) {
    case 'undo': document.execCommand('undo'); break
    case 'redo': document.execCommand('redo'); break
    case 'cut':
      document.execCommand('cut')
      selectedText.value = ''
      break
    case 'copy':
      document.execCommand('copy')
      break
    case 'paste':
      navigator.clipboard.readText().then(text => {
        editorContent.value = before + text + after
        onContentChange()
      })
      break
    case 'delete':
      editorContent.value = before + after
      onContentChange()
      break
    case 'selectAll':
      ta.select()
      break
  }
  contextMenu.value.show = false
}

// 点击其他区域关闭右键菜单
function onGlobalClick() {
  contextMenu.value.show = false
  showFontPanel.value = false
  showNameGen.value = false
  showFindReplace.value = false
}

function startResize(e, side) {
  resizing.value = side
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

function startResizeRight(e) {
  resizing.value = 'right'
  document.addEventListener('mousemove', onResizeRight)
  document.addEventListener('mouseup', stopResizeRight)
  e.preventDefault()
}

function onResize(e) {
  if (!resizing.value) return
  if (resizing.value === 'left') {
    const newWidth = Math.max(minWidth, e.clientX)
    leftWidth.value = newWidth
  }
}

function onResizeRight(e) {
  if (resizing.value !== 'right') return
  // 向右拖 = 书籍栏变宽（e.clientX 增大，rightWidth 增大）
  const newWidth = Math.max(minWidth, e.clientX - leftWidth.value - 8)
  rightWidth.value = newWidth
}

function stopResizeRight() {
  resizing.value = null
  document.removeEventListener('mousemove', onResizeRight)
  document.removeEventListener('mouseup', stopResizeRight)
}

function stopResize() {
  resizing.value = null
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
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
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.chapters-sidebar {
  border-right: none;
  min-width: 150px;
}

.books-sidebar {
  width: 240px;
  min-width: 150px;
  border-left: 1px solid var(--border);
  border-right: none;
  display: flex;
  flex-direction: column;
}

/* 可拉伸分隔栏 */
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: var(--accent);
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

.add-btn.prominent {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
}

.add-btn.prominent:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.add-btn.btn-new {
  width: 28px;
  height: 28px;
  background: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
  border-radius: 6px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-btn.btn-new:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: #fff;
}

.add-btn.btn-new svg {
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
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

.chapter-item .delete-btn,
.book-item .delete-btn {
  opacity: 0;
  width: 20px;
  height: 20px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  margin-left: auto;
}

.chapter-item:hover .delete-btn,
.book-item:hover .delete-btn {
  opacity: 1;
}

.chapter-item .delete-btn:hover,
.book-item .delete-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
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
  background: var(--bg-primary);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}

.chapter-title-input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
}

.chapter-title-input::placeholder {
  color: var(--text-muted);
}

.editor-stats {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.stat {
  font-size: 12px;
  color: var(--text-muted);
}

.stat-divider {
  color: var(--border);
}

/* 编辑工具栏 */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 8px;
  flex-shrink: 0;
  position: relative;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  height: 26px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.tool-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-primary);
}

.tool-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.tool-btn.sm {
  padding: 4px 8px;
  height: 24px;
  background: var(--bg-primary);
}

.tool-btn.close {
  color: var(--text-muted);
  background: var(--bg-primary);
}

.tool-btn.close:hover {
  color: var(--danger);
  border-color: var(--danger);
  background: var(--bg-primary);
}

.font-selector {
  height: 26px;
  padding: 0 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.font-selector:focus {
  outline: none;
  border-color: var(--accent);
}

/* 字体面板 */
.font-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  min-width: 180px;
  z-index: 100;
}

.fp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.fp-row:last-child {
  margin-bottom: 0;
}

.fp-label {
  font-size: 11px;
  color: var(--text-muted);
  width: 24px;
  flex-shrink: 0;
}

.fp-select {
  flex: 1;
  height: 24px;
  padding: 0 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
}

.fp-select:focus {
  outline: none;
  border-color: var(--accent);
}

.fp-btns {
  display: flex;
  gap: 3px;
}

.fp-size-btns {
  display: flex;
  align-items: center;
  gap: 4px;
}

.fp-size-val {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: center;
}

.fp-divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}

.fp-select.sm {
  height: 22px;
  font-size: 11px;
  padding: 0 4px;
  min-width: 70px;
}

.selection-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  z-index: 200;
}

.fp-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.fp-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.fp-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

/* 取名面板 */
.name-gen-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  min-width: 180px;
  z-index: 100;
}

.ng-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.ng-row:last-child {
  margin-bottom: 0;
}

.ng-label {
  font-size: 11px;
  color: var(--text-muted);
  width: 24px;
  flex-shrink: 0;
}

.ng-btns {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.ng-btn {
  padding: 3px 7px;
  font-size: 11px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.ng-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ng-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.ng-input {
  flex: 1;
  height: 24px;
  padding: 0 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
}

.ng-input:focus {
  outline: none;
  border-color: var(--accent);
}

.ng-input.ng-sm {
  width: 80px;
  flex: none;
}

.ng-results {
  margin-top: 8px;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.ng-result-item {
  padding: 5px 6px;
  font-size: 12px;
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.ng-result-item:hover {
  background: var(--bg-hover);
}

.ng-result-item:active {
  background: var(--accent-light);
}

.ng-name-pair {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ng-cn {
  font-size: 10px;
  color: var(--text-muted);
}

/* 查找替换栏 */
.find-replace-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.find-input {
  height: 26px;
  padding: 0 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  min-width: 120px;
}

.find-input:focus {
  outline: none;
  border-color: var(--accent);
}

.fr-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

.find-count {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 50px;
  text-align: center;
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

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 0;
  min-width: 150px;
  box-shadow: 0 4px 16px var(--shadow);
  z-index: 1000;
}

.ctx-item {
  display: block;
  width: 100%;
  padding: 8px 16px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}

.ctx-item:hover:not(:disabled) {
  background: var(--bg-hover);
}

.ctx-item:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.ctx-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 0;
}
</style>
