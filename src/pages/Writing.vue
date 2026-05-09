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
              <button class="tool-btn" :class="{ active: showFontPanel }" @click="showFontPanel = !showFontPanel" title="字体">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M2 2h10v2H2V2zm1 3h8v7H3V5zm0 0l2 6h4l2-6"/>
                </svg>
                字体
              </button>

              <!-- 字体面板 -->
              <div class="font-panel" v-if="showFontPanel">
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
                  <select class="fp-select" v-model="editorFontSize">
                    <option value="14px">14px</option>
                    <option value="15px">15px</option>
                    <option value="16px">16px</option>
                    <option value="18px">18px</option>
                    <option value="20px">20px</option>
                    <option value="22px">22px</option>
                  </select>
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
              <button class="tool-btn" :class="{ active: showNameGen }" @click="showNameGen = !showNameGen" title="随机取名">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M7 1a3 3 0 100 6 3 3 0 000-6zm-5 12l1-4h8l1 4H2z"/>
                </svg>
                取名
              </button>

              <!-- 取名面板 -->
              <div class="name-gen-panel" v-if="showNameGen">
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
              <button class="tool-btn" :class="{ active: showFindReplace }" @click="showFindReplace = !showFindReplace" title="查找替换">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M5 1a4 4 0 014 4c0 1.5-.8 2.8-2 3.5l3 3-1.5 1.5-3-3A4 4 0 115 1zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
                </svg>
                查找
              </button>
            </div>

            <!-- 查找替换栏 -->
            <div class="find-replace-bar" v-if="showFindReplace">
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
          ></textarea>

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
  const nameData = {
    character: {
      western: {
        first: ['Oliver', 'Emma', 'Liam', 'Sophia', 'Noah', 'Isabella', 'James', 'Mia', 'Benjamin', 'Charlotte', 'Lucas', 'Amelia', 'Mason', 'Harper', 'Ethan', 'Evelyn', 'Alexander', 'Abigail', 'Henry', 'Emily'],
        last: ['Anderson', 'Thompson', 'White', 'Mitchell', 'Clark', 'Roberts', 'Taylor', 'Martinez', 'Harris', 'Robinson', 'Lee', 'Walker', 'Hall', 'Allen', 'Young'],
        firstCn: ['奥利弗', '艾玛', '利亚姆', '索菲亚', '诺亚', '伊莎贝拉', '詹姆斯', '米娅', '本杰明', '夏洛特', '卢卡斯', '艾米莉亚', '梅森', '哈珀', '伊桑', '伊芙琳', '亚历山大', '阿比盖尔', '亨利', '艾米丽'],
        lastCn: ['安德森', '汤普森', '怀特', '米切尔', '克拉克', '罗伯茨', '泰勒', '马丁内斯', '哈里斯', '鲁宾逊', '李', '沃克', '霍尔', '艾伦', '扬']
      },
      ancient: {
        surname: ['李', '叶', '西门', '沈', '陆', '楚', '铁', '萧', '卓', '风', '任', '向', '曲', '刘', '莫', '定', '方', '冲'],
        givenName: ['寻欢', '孤城', '吹雪', '小凤', '留香', '浪', '中棠', '南孙', '十一郎', '不凡', '清扬', '我行', '问天', '洋', '正风', '大', '闲', '证', '虚', '不戒', '慕白', '未央', '长安', '紫轩', '飞羽', '寒江', '孤鸿', '云中']
      },
      modern: {
        surname: ['张', '王', '李', '刘', '陈', '杨', '赵', '周', '吴', '郑', '孙', '钱', '孙', '周', '吴', '徐', '马', '朱', '胡', '林'],
        givenName: ['伟', '芳', '娜', '洋', '静', '明', '雪', '涛', '晓', '强', '晨', '鹏', '浩', '涛', '鑫', '勇', '艳', '杰', '丽', '敏', '超', '华', '辉', '波', '刚', '峰', '超', '勇', '军']
      }
    },
    place: {
      western: ['Willowbrook', 'Ironforge', 'Silvermoon', 'DragonSpine', 'Stormwind', 'Darkwood', 'Brightport', 'Goldshire', 'Misty Valley', 'Sunnyridge'],
      ancient: ['长安城', '洛阳城', '扬州城', '成都府', '苏州城', '杭州城', '汴京城', '金陵城', '燕京城', '成都府'],
      modern: ['朝阳区', '海淀区', '浦东新区', '天河区', '南山区', '江汉区', '玄武区', '西城区', '东城区', '西湖区']
    }
  }

  generatedNames.value = []

  if (nameType.value === 'place') {
    const placeNames = nameData.place[nameStyle.value] || nameData.place.modern
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * placeNames.length)
      generatedNames.value.push(placeNames[idx])
    }
    generatedNames.value = [...new Set(generatedNames.value)]
    return
  }

  // 人物取名
  const hasSurname = fixedSurname.value.trim()
  const hasGivenName = fixedGivenName.value.trim()
  const seen = new Set()

  if (nameStyle.value === 'western') {
    const first = nameData.character.western.first
    const last = nameData.character.western.last
    const firstCn = nameData.character.western.firstCn
    const lastCn = nameData.character.western.lastCn

    // 如果输入了中文名，尝试找到对应的英文名
    const userGiven = hasGivenName ? fixedGivenName.value.trim() : ''
    const userSurname = hasSurname ? fixedSurname.value.trim() : ''
    let fIdx = -1, lIdx = -1

    if (userGiven) {
      // 尝试在中文名中找
      fIdx = firstCn.indexOf(userGiven)
      if (fIdx < 0) {
        // 尝试在英文名中找
        fIdx = first.indexOf(userGiven)
      }
    }
    if (userSurname) {
      lIdx = lastCn.indexOf(userSurname)
      if (lIdx < 0) {
        lIdx = last.indexOf(userSurname)
      }
    }

    for (let i = 0; i < 5 && generatedNames.value.length < 5; i++) {
      const newFIdx = fIdx >= 0 ? fIdx : Math.floor(Math.random() * first.length)
      const newLIdx = lIdx >= 0 ? lIdx : Math.floor(Math.random() * last.length)
      let enName = first[newFIdx] + ' ' + last[newLIdx]
      if (seen.has(enName)) continue
      seen.add(enName)
      let cnName = firstCn[newFIdx] + '·' + lastCn[newLIdx]
      generatedNames.value.push({ en: enName, cn: cnName })
    }
  } else {
    const data = nameData.character[nameStyle.value]
    const surnames = data.surname
    const givenNames = data.givenName
    for (let i = 0; i < 10 && generatedNames.value.length < 10; i++) {
      let surname = hasSurname ? fixedSurname.value.trim() : surnames[Math.floor(Math.random() * surnames.length)]
      let givenName = hasGivenName ? fixedGivenName.value.trim() : givenNames[Math.floor(Math.random() * givenNames.length)]
      let fullName = surname + givenName
      if (seen.has(fullName)) continue
      seen.add(fullName)
      generatedNames.value.push(fullName)
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
  background: var(--bg-secondary);
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
  padding: 6px 0;
  background: var(--bg-tertiary);
  border-radius: 6px;
  flex-shrink: 0;
  position: relative;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  height: 26px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.tool-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.tool-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tool-btn.sm {
  padding: 4px 8px;
  height: 24px;
}

.tool-btn.close {
  color: var(--text-muted);
}

.tool-btn.close:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.font-selector {
  height: 26px;
  padding: 0 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
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
}

.fp-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.fp-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
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
}

.ng-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.ng-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
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
