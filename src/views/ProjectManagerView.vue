<template>
  <div class="project-manager">
    <aside class="project-manager__side">
      <header class="project-manager__side-head">
        <strong>{{ tr('本地项目') }}</strong>
        <button type="button" :aria-label="tr('刷新列表')" @click="refresh">{{ tr('刷新') }}</button>
      </header>
      <p v-if="!projects.length" class="project-manager__empty">{{ tr('还没有打开过本地项目文件夹。用右侧「新建项目」或「打开本地项目」开始。') }}</p>
      <ul class="project-manager__list">
        <li v-for="project in projects" :key="project.projectId" :class="{ 'is-active': isActiveProject(project) }">
          <div class="project-manager__item-head">
            <button type="button" class="project-manager__item-name" @click="enterProject(project)">
              <strong>{{ project.name }}</strong>
              <small>{{ project.rootPath }}</small>
            </button>
            <details class="project-manager__item-menu">
              <summary :aria-label="tr('项目操作')">⋮</summary>
              <div class="project-manager__menu-body">
                <button v-if="project.bookId" type="button" @click="enterProject(project)">{{ tr('进入写作') }}</button>
                <button type="button" @click="startBind(project)">{{ project.bookId ? tr('换绑书稿') : tr('绑定书稿') }}</button>
                <button v-if="project.bookId" type="button" @click="unbind(project)">{{ tr('解除绑定') }}</button>
                <button type="button" class="is-danger" @click="remove(project)">{{ tr('从列表移除') }}</button>
              </div>
            </details>
          </div>
          <div class="project-manager__item-meta">
            <span class="project-manager__badge">{{ project.kind }}</span>
            <span>{{ boundBookName(project) }}</span>
            <span v-if="project.lastSyncAt">{{ tr('同步于 {time}', { time: formatTime(project.lastSyncAt) }) }}</span>
          </div>
          <div v-if="binding?.projectId === project.projectId" class="project-manager__bind">
            <select v-model="bindBookId">
              <option value="" disabled>{{ tr('选择要绑定的书') }}</option>
              <option v-for="book in books" :key="book.id" :value="book.id">{{ book.title || book.name }}</option>
            </select>
            <button type="button" :disabled="!bindBookId || busy" @click="confirmBind">{{ tr('绑定') }}</button>
            <button type="button" @click="binding = null">{{ tr('取消') }}</button>
          </div>
        </li>
      </ul>
    </aside>

    <main class="project-manager__main">
      <h1>{{ tr('项目管理') }}</h1>
      <p class="project-manager__intro">{{ tr('项目是磁盘上的普通文件夹（含 .pinax 标记），可整体拷贝迁移；与书稿绑定后自动同步正文/世界书/日志。') }}</p>

      <section class="project-manager__action" data-test="pm-create">
        <h2>{{ tr('新建项目') }}</h2>
        <p>{{ tr('在指定位置创建项目文件夹，并新建一本绑定它的书。') }}</p>
        <div class="project-manager__form">
          <label>{{ tr('书名') }}<input v-model.trim="createForm.title" maxlength="120" type="text" :placeholder="tr('输入书名')"></label>
          <label>{{ tr('位置') }}<input v-model.trim="createForm.root" type="text" :placeholder="tr('例如 D:\\Projects（绝对路径）')" spellcheck="false"></label>
          <label>{{ tr('类型') }}
            <select v-model="createForm.kind">
              <option value="novel">{{ tr('小说') }}</option>
              <option value="screenplay">{{ tr('剧本') }}</option>
              <option value="generic">{{ tr('通用') }}</option>
            </select>
          </label>
          <button type="button" :disabled="!canCreate || busy" @click="createProject">{{ tr('创建并开始写作') }}</button>
        </div>
      </section>

      <section class="project-manager__action" data-test="pm-open">
        <h2>{{ tr('打开本地项目') }}</h2>
        <p>{{ tr('把一个已有的 pinax 项目文件夹（含 .pinax 标记）加入列表并绑定。') }}</p>
        <div class="project-manager__form">
          <label>{{ tr('文件夹路径') }}<input v-model.trim="openForm.root" type="text" :placeholder="tr('例如 D:\\Projects\\雾海航志')" spellcheck="false"></label>
          <button type="button" :disabled="!openForm.root || busy" @click="openProject">{{ tr('打开') }}</button>
        </div>
        <p v-if="openResult" class="project-manager__note" role="status">
          {{ tr('已打开：{name}', { name: openResult.name }) }} —
          <button v-if="openResult.bookId" type="button" @click="enterProject(openResult)">{{ tr('进入写作') }}</button>
          <template v-else>{{ tr('尚未绑定书稿，用左列「绑定书稿」选择一本书。') }}</template>
        </p>
      </section>

      <section class="project-manager__action" data-test="pm-import">
        <h2>{{ tr('导入书稿') }}</h2>
        <p>{{ tr('从文件或文件夹导入为一本书；配置默认位置后会自动创建项目并绑定。') }}</p>
        <AuthoringManuscriptImport v-if="importOpen" @close="importOpen = false" @import="onImported" />
        <button v-else type="button" @click="importOpen = true">{{ tr('选择文件或文件夹导入') }}</button>
      </section>
    </main>
  </div>
</template>

<script setup>
import { tr, uiLocale } from '../i18n/index.js'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthoringManuscriptImport from '../components/authoring/AuthoringManuscriptImport.vue'
import { createWritingBookRecord, loadWritingBooks, saveWritingBooksDurable, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import {
  bindLocalProject, getLocalMirrorSettings,
  listLocalProjects, removeLocalProject, setLocalMirrorSettings
} from '../services/localMirrorSettings.js'

const router = useRouter()
const projects = ref([])
const books = ref([])
const busy = ref(false)
const binding = ref(null)
const bindBookId = ref('')
const openResult = ref(null)
const importOpen = ref(false)
const createForm = ref({ title: '', root: '', kind: 'novel' })
const openForm = ref({ root: '' })

const canCreate = computed(() => Boolean(createForm.value.title && createForm.value.root))

onMounted(async () => {
  books.value = loadWritingBooks()
  const settings = getLocalMirrorSettings()
  createForm.value.root = settings.defaultCreateRoot
  openForm.value.root = settings.defaultReadRoot
  if (router.currentRoute.value.query.tab === 'import') importOpen.value = true
  await refresh()
})

async function refresh() {
  projects.value = await listLocalProjects()
}

function isActiveProject(project) {
  const route = router.currentRoute.value
  return route.query.bookId && project.bookId === route.query.bookId
}

function boundBookName(project) {
  if (!project.bookId) return tr('未绑定书稿')
  const book = books.value.find((item) => item.id === project.bookId)
  return book ? (book.title || book.name) : tr('书稿已删除')
}

function formatTime(value) {
  return new Date(value).toLocaleString(uiLocale.value)
}

function enterProject(project) {
  if (!project.bookId) return
  void router.push({ name: 'authoring', query: { bookId: project.bookId } })
}

function startBind(project) {
  binding.value = project
  bindBookId.value = project.bookId || ''
}

async function confirmBind() {
  if (!binding.value || !bindBookId.value) return
  busy.value = true
  try {
    await bindLocalProject(binding.value.projectId, bindBookId.value)
    binding.value = null
    await refresh()
  } finally {
    busy.value = false
  }
}

async function unbind(project) {
  busy.value = true
  try {
    await bindLocalProject(project.projectId, null)
    await refresh()
  } finally {
    busy.value = false
  }
}

async function remove(project) {
  if (!window.confirm(tr('从列表移除「{name}」？磁盘上的项目文件夹不会被删除。', { name: project.name }))) return
  busy.value = true
  try {
    await removeLocalProject(project.projectId)
    await refresh()
  } finally {
    busy.value = false
  }
}

async function createProject() {
  busy.value = true
  try {
    const book = createWritingBookRecord({ title: createForm.value.title, manuscriptLanguage: uiLocale.value.startsWith('en') ? 'en' : 'zh-Hans' })
    book.chapters = [{
      id: `${Date.now()}-chapter-1`, title: tr('第一章'), content: '', contentFormat: 'md',
      outlineItems: [], wordCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }]
    const response = await fetch('/api/localmirror/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: createForm.value.root.replace(/[\\/]+$/, '') + '/' + (createForm.value.title), name: createForm.value.title, kind: createForm.value.kind, bookId: book.id })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) return
    setLocalMirrorSettings({ defaultCreateRoot: createForm.value.root })
    const saved = loadWritingBooks()
    saveWritingBooksDurable([...saved, book])
    await refresh()
    void router.push({ name: 'authoring', query: { bookId: book.id } })
  } finally {
    busy.value = false
  }
}

async function openProject() {
  busy.value = true
  try {
    const response = await fetch('/api/localmirror/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: openForm.value.root })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) return
    openResult.value = body.entry
    await refresh()
  } finally {
    busy.value = false
  }
}

function onImported(book) {
  void router.push({ name: 'authoring', query: { bookId: book.id } })
}

const unsubscribeBooks = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
onBeforeUnmount(() => {
  unsubscribeBooks?.()
})
</script>

<style scoped>
.project-manager {
  display: grid;
  grid-template-columns: minmax(280px, 380px) 1fr;
  min-height: 100%;
}

.project-manager__side {
  border-right: 1px solid var(--border);
  padding: 20px;
  overflow: auto;
}

.project-manager__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.project-manager__side-head strong { font-size: 15px; }
.project-manager__side-head button { min-height: 30px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }

.project-manager__empty { color: var(--text-secondary); font-size: 13px; line-height: 1.6; }

.project-manager__list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.project-manager__list li { border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
.project-manager__list li.is-active { border-color: var(--accent); }

.project-manager__item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.project-manager__item-name { display: grid; gap: 3px; border: 0; background: none; color: var(--text-primary); text-align: start; font: inherit; cursor: pointer; padding: 0; }
.project-manager__item-name small { color: var(--text-muted); font-size: 11px; word-break: break-all; }

.project-manager__item-menu { position: relative; }
.project-manager__item-menu summary { min-width: 30px; min-height: 30px; display: grid; place-items: center; border-radius: 6px; color: var(--text-secondary); cursor: pointer; list-style: none; }
.project-manager__item-menu summary::-webkit-details-marker { display: none; }
.project-manager__menu-body { position: absolute; right: 0; z-index: 6; display: grid; min-width: 150px; margin-top: 4px; padding: 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-popover, var(--bg-secondary)); box-shadow: 0 10px 30px color-mix(in srgb, var(--archive-ink) 20%, transparent); }
.project-manager__menu-body button { min-height: 34px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--text-primary); font: inherit; text-align: start; cursor: pointer; }
.project-manager__menu-body button:hover { background: var(--nav-hover); }
.project-manager__menu-body button.is-danger { color: var(--danger); }

.project-manager__item-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; color: var(--text-secondary); font-size: 12px; }
.project-manager__badge { padding: 1px 8px; border: 1px solid var(--border); border-radius: 999px; font-size: 11px; }

.project-manager__bind { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.project-manager__bind select, .project-manager__bind button { min-height: 34px; border: 1px solid var(--border); border-radius: 7px; padding: 0 10px; background: var(--bg-primary); color: var(--text-primary); font: inherit; cursor: pointer; }
.project-manager__bind button:disabled { opacity: 0.5; cursor: default; }

.project-manager__main { padding: 28px 36px; overflow: auto; }
.project-manager__main h1 { margin: 0 0 8px; font: 700 24px/1.3 var(--font-sans); }
.project-manager__intro { margin: 0 0 26px; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }

.project-manager__action { margin-bottom: 30px; padding: 20px; border: 1px solid var(--border); border-radius: 12px; }
.project-manager__action h2 { margin: 0 0 4px; font: 650 17px/1.4 var(--font-sans); }
.project-manager__action > p { margin: 0 0 14px; color: var(--text-secondary); font-size: 13px; }
.project-manager__form { display: grid; gap: 12px; max-width: 520px; }
.project-manager__form label { display: grid; gap: 5px; color: var(--text-secondary); font-size: 12px; font-weight: 600; }
.project-manager__form input, .project-manager__form select { min-height: 38px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; padding: 7px 11px; background: var(--bg-primary); color: var(--text-primary); font: inherit; }
.project-manager__form button { justify-self: start; min-height: 40px; padding: 0 18px; border: 1px solid var(--accent); border-radius: 8px; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
.project-manager__form button:disabled { opacity: 0.45; cursor: default; }

.project-manager__note { margin: 10px 0 0; color: var(--text-secondary); font-size: 13px; }
.project-manager__note button { border: 0; background: none; color: var(--accent); font: inherit; cursor: pointer; padding: 0; }

@media (max-width: 900px) {
  .project-manager { grid-template-columns: 1fr; }
  .project-manager__side { border-right: 0; border-bottom: 1px solid var(--border); }
  .project-manager__main { padding: 20px 16px; }
}
</style>
