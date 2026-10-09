<template>
  <div v-if="panel.isOpen.value" class="project-info__overlay" @click.self="panel.close()">
    <section class="project-info" role="dialog" aria-modal="true" aria-labelledby="project-info-title" @keydown.esc.stop.prevent="panel.close()">
      <header class="project-info__head">
        <div>
          <span class="project-info__kicker">{{ modeLabel }}</span>
          <h2 id="project-info-title">{{ tr('项目资料') }}</h2>
        </div>
        <button class="project-info__close" type="button" :aria-label="tr('关闭')" @click="panel.close()">×</button>
      </header>

      <div class="project-info__body">
        <label class="project-info__field">
          <span>{{ tr('书名') }}</span>
          <input ref="titleInput" v-model.trim="form.title" maxlength="120" type="text" :placeholder="tr('输入书名')" :disabled="panel.mode.value === 'attach'" data-test="project-info-title">
        </label>

        <label class="project-info__field">
          <span>{{ tr('简介（可选）') }}</span>
          <textarea v-model.trim="form.description" rows="2" :placeholder="tr('一句话述说这本书想写什么')" :disabled="panel.mode.value === 'attach'"></textarea>
        </label>


        <label class="project-info__field">
          <span>{{ tr('世界书绑定') }}</span>
          <select v-model="form.worldbookId" :disabled="worldbookSelectLocked">
            <option value="">{{ tr('暂不绑定') }}</option>
            <option v-for="worldbook in worldbooks" :key="worldbook.id" :value="worldbook.id">{{ worldbook.name || worldbook.id }}</option>
          </select>
          <small v-if="worldbookSelectLocked">{{ tr('已锚定的世界书换绑需迁移现场锚点，请到「设定」页操作。') }}</small>
        </label>

        <label class="project-info__field">
          <span>{{ tr('项目类型') }}</span>
          <select v-model="form.kind">
            <option value="novel">{{ tr('小说') }}</option>
            <option value="screenplay">{{ tr('剧本') }}</option>
            <option value="generic">{{ tr('通用') }}</option>
          </select>
        </label>

        <label class="project-info__field">
          <span>{{ tr('项目文件夹位置') }}<template v-if="panel.mode.value === 'import-project'">（{{ tr('必填') }}）</template></span>
          <div class="project-info__rootrow">
            <input v-model.trim="form.root" type="text" :placeholder="tr('留空则在「文档\\Pinax」下创建')" spellcheck="false" data-test="project-info-root">
            <button type="button" class="project-info__browse" data-test="project-info-browse" :disabled="browsing" @click="onBrowseClick">{{ browsing ? tr('系统选择器已打开…') : tr('浏览…') }}</button>
          </div>
          <small>{{ panel.mode.value === 'import-project' ? tr('指向磁盘上的项目文件夹（含 .pinax 标记则直接打开；否则按类型新建并回读正文/章节）') : tr('每本书都会有一个本地项目文件夹（含 .pinax 标记），正文/世界书/日志自动同步其中，可整体拷贝迁移。') }}</small>
        </label>

        <FolderBrowserModal v-if="browserOpen" @close="browserOpen = false" @select="onFolderSelected" />

        <p v-if="boundNote" class="project-info__note" role="status">{{ boundNote }}</p>
        <p v-if="error" class="project-info__error" role="alert">{{ error }}</p>
      </div>

      <footer class="project-info__foot">
        <button type="button" class="project-info__secondary" @click="panel.close()">{{ tr('取消') }}</button>
        <button type="button" class="project-info__primary" data-test="project-info-confirm" :disabled="busy || !form.title" @click="confirm">
          {{ busy ? tr('正在创建…') : confirmLabel }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import FolderBrowserModal from './FolderBrowserModal.vue'
import { useProjectInfoPanel } from '../../composables/useProjectInfoPanel.js'
import { useRouter } from 'vue-router'
import { createWritingBookRecord, loadWritingBooks, saveWritingBooksDurable, updateWritingBook } from '../../services/writing/writingBooksRepository.js'
import { createImportedWritingBook } from '../../services/writing/writingManuscriptImport.js'
import { getLocalMirrorSettings, setLocalMirrorSettings, listLocalProjects, pickFolderNative } from '../../services/localMirrorSettings.js'
import { useWorldStore } from '../../stores/worldStore.js'

// 面板宿主注入导航回调：useProjectInfoPanel 因此不再静态依赖 router
// （那会构成 useProjectInfoPanel → router → AuthoringWelcomeView → Authoring → 本模块的 4 连环）。
const router = useRouter()
const panel = useProjectInfoPanel({ navigate: (createdBook) => router.push({ name: 'authoring', query: { bookId: createdBook.id } }) })
const worldStore = useWorldStore()
const emit = defineEmits(['saved'])

const titleInput = ref(null)
const busy = ref(false)
const error = ref('')
const worldbooks = computed(() => worldStore.worldbooksIndex || [])
const form = ref({ title: '', description: '', manuscriptLanguage: '', worldbookId: '', kind: 'novel', root: '' })
const boundProject = ref(null)
const browserOpen = ref(false)
const browsing = ref(false)

/** 浏览：首选 Windows 原生文件夹选择对话框（服务端同机拉起）；不可用回落内置文件夹浏览器。 */
async function onBrowseClick() {
  if (browsing.value) return
  browsing.value = true
  error.value = ''
  try {
    const picked = await pickFolderNative(form.value.root || '')
    if (picked) onFolderSelected(picked)
    return // picked=null 是用户在系统对话框里点了取消：保持原值，不催开内置浏览器
  } catch (nativeError) {
    if (nativeError?.code === 'NATIVE_PICKER_TIMEOUT') return
    browserOpen.value = true // 原生不可用（非 Windows/无 powershell）→ 回落内置浏览器
  } finally {
    browsing.value = false
  }
}

function onFolderSelected(selectedPath) {
  form.value.root = String(selectedPath || '').trim()
  browserOpen.value = false
  if (panel.mode.value === 'import-project' && !form.value.title.trim()) {
    const name = selectedPath.split(/[\\/]/).filter(Boolean).pop()
    if (name) form.value.title = name
  }
  titleInput.value?.focus()
}

const modeLabel = computed(() => ({ create: tr('新建作品'), edit: tr('编辑项目'), attach: tr('导入完成 · 选择本地位置'), 'import-project': tr('导入项目 · 指向本地文件夹') }[panel.mode.value] || tr('项目资料')))
const confirmLabel = computed(() => (panel.mode.value === 'edit' ? tr('保存') : panel.mode.value === 'import-project' ? tr('导入项目') : tr('创建并开始写作')))
const worldbookSelectLocked = computed(() => panel.mode.value === 'edit' && Boolean(panel.book.value?.worldbookId))
const boundNote = computed(() => {
  if (!boundProject.value) return ''
  return tr('已绑定本地项目：{path}', { path: boundProject.value.rootPath })
})

async function preload() {
  error.value = ''
  boundProject.value = null
  try { await worldStore.loadWorldbooksIndex() } catch { /* 世界书索引不可用时不阻塞表单 */ }
  const current = panel.book.value
  if (panel.mode.value === 'create' || panel.mode.value === 'import-project') {
    form.value = { title: '', description: '', manuscriptLanguage: '', worldbookId: '', kind: 'novel', root: panel.mode.value === 'import-project' ? '' : getLocalMirrorSettings().defaultCreateRoot }
    return
  }
  form.value = {
    title: current?.title || '',
    description: current?.description || '',
    manuscriptLanguage: current?.manuscriptLanguage || '',
    worldbookId: current?.worldbookId || '',
    kind: 'novel',
    root: ''
  }
  try {
    const projects = await listLocalProjects()
    boundProject.value = projects.find((project) => project.bookId === current?.id) || null
    if (boundProject.value) {
      form.value.kind = boundProject.value.kind || 'novel'
      form.value.root = boundProject.value.rootPath
    }
  } catch { /* 注册表不可读时不阻塞表单 */ }
}

watch(() => panel.isOpen.value, async (open) => {
  if (!open) return
  await preload()
  await nextTick()
  if (panel.mode.value !== 'attach') titleInput.value?.focus()
})

onMounted(() => { void preload() })

function buildBookPayload() {
  return {
    title: form.value.title,
    description: form.value.description,
    manuscriptLanguage: form.value.manuscriptLanguage,
    worldbookId: form.value.worldbookId || ''
  }
}

async function createProjectAndBind(createdBook) {
  const payload = { name: form.value.title, kind: form.value.kind, bookId: createdBook.id }
  if (form.value.root) payload.path = form.value.root.replace(/[\\/]+$/, '') + '/' + form.value.title
  const response = await fetch('/api/localmirror/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.ok !== true) {
    // 重名/目录非空是最常见失败：服务端 message 面向运维（提 /projects/open），对作者要翻译成人话。
    if (body?.error === 'ERR_DIR_NOT_EMPTY') {
      error.value = tr('同名项目文件夹已存在——请换一个书名，或在「导入项目」模式里选择该文件夹。')
      return false
    }
    error.value = tr('项目文件夹创建失败：{message}（书已创建，可稍后在「修改项目配置」里重试绑定）', { message: body?.message || response.status })
    return false
  }
  return true
}

/** 导入项目：指向的文件夹有 .pinax 标记 → 直接打开绑定；否则按类型新建。随后回读 正文/*.md 建书稿章节。 */
async function confirmImportProject() {
  const projectPath = form.value.root.replace(/[\\/]+$/, '')
  // 探测：是 pinax 项目 → open；否则 → create（服务端会因目录非空而失败时给出明确报错）
  let opened = null
  try {
    const response = await fetch('/api/localmirror/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath })
    })
    const body = await response.json().catch(() => null)
    if (response.ok && body?.ok) opened = body
  } catch { /* 探测失败按 create 处理 */ }

  if (!opened) {
    const response = await fetch('/api/localmirror/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath, name: form.value.title || projectPath.split(/[\\/]/).pop(), kind: form.value.kind, bookId: null })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.ok !== true) {
      error.value = tr('项目导入失败：{message}', { message: body?.message || response.status })
      return
    }
    opened = body
  }

  // 回读 正文/*.md 为章节（反向导入）
  let chapters = []
  try {
    const contentResponse = await fetch('/api/localmirror/projects/import-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath })
    })
    const contentBody = await contentResponse.json().catch(() => null)
    if (contentResponse.ok && contentBody?.ok) chapters = contentBody.chapters || []
  } catch { /* 回读失败不阻塞导入——项目已绑定，正文可稍后再导 */ }

  const created = createImportedWritingBook({
    title: form.value.title || opened.manifest.name,
    chapters: chapters.length ? chapters : [{ title: form.value.manuscriptLanguage === 'en' ? 'Chapter 1' : '第一章', content: '' }],
    manuscriptLanguage: form.value.manuscriptLanguage
  })
  if (!created.ok) {
    error.value = tr('没有可以导入的章节。')
    return
  }
  const saved = loadWritingBooks()
  if (!saveWritingBooksDurable([...saved, created.book]).ok) {
    error.value = tr('书稿未能保存，请检查浏览器存储空间。')
    return
  }
  const bindResponse = await fetch('/api/localmirror/projects/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: opened.manifest.projectId, bookId: created.book.id })
  })
  const bindBody = await bindResponse.json().catch(() => null)
  if (!bindResponse.ok || bindBody?.ok !== true) {
    // 书稿本体已保存进 localStorage，只是本地项目绑定失败——面板留着让用户看到原因。
    error.value = tr('书稿已创建，但本地项目绑定失败：{message}（可稍后在「修改项目配置」里重试）', { message: bindBody?.message || bindResponse.status })
    return
  }
  emit('saved', created.book)
  panel.finishCreated(created.book)
}

async function confirm() {
  if (busy.value || !form.value.title) return
  busy.value = true
  try {
    if (panel.mode.value === 'edit') {
      const current = panel.book.value
      const updated = updateWritingBook(current.id, (draft) => {
        draft.title = form.value.title
        draft.description = form.value.description
      })
      if (!updated.ok) {
        error.value = tr('保存失败：书稿不存在。')
        return
      }
      if (form.value.manuscriptLanguage && form.value.manuscriptLanguage !== current.manuscriptLanguage) {
        updateWritingBook(current.id, (draft) => { draft.manuscriptLanguage = form.value.manuscriptLanguage })
      }
      if (boundProject.value) {
        const updateResponse = await fetch('/api/localmirror/projects/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: boundProject.value.projectId, name: form.value.title, kind: form.value.kind })
        })
        const updateBody = await updateResponse.json().catch(() => null)
        if (!updateResponse.ok || updateBody?.ok !== true) {
          // 书稿侧已保存，别假装成功：面板开着显示同步失败原因。
          error.value = tr('书稿已保存，但本地项目信息同步失败：{message}', { message: updateBody?.message || updateResponse.status })
          return
        }
      }
      panel.close()
      emit('saved', updated.book)
      return
    }
    // create / import-project / attach：建书（attach 用已有书）+ 本地项目 + 绑定
    if (panel.mode.value === 'import-project') {
      if (!form.value.root.trim()) {
        error.value = tr('导入项目需要指向项目文件夹（点「浏览…」选择）。')
        return
      }
      await confirmImportProject()
      return
    }
    let created = panel.book.value
    if (panel.mode.value === 'create') {
      created = createWritingBookRecord(buildBookPayload())
      created.chapters = [{
        id: `${Date.now()}-chapter-1`, title: form.value.manuscriptLanguage === 'en' ? 'Chapter 1' : '第一章', content: '', contentFormat: 'md',
        outlineItems: [], wordCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }]
      const saved = loadWritingBooks()
      if (!saveWritingBooksDurable([...saved, created]).ok) {
        error.value = tr('书稿未能保存，请检查浏览器存储空间。')
        return
      }
    }
    if (!created) {
      error.value = tr('缺少要绑定的书。')
      return
    }
    const projectOk = await createProjectAndBind(created)
    if (projectOk) setLocalMirrorSettings({ enabled: true })
    if (panel.mode.value === 'attach' && !projectOk) return
    emit('saved', created)
    panel.finishCreated(created)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.project-info__overlay {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--archive-ink) 46%, transparent);
}

.project-info {
  width: min(560px, 100%);
  max-height: min(720px, calc(var(--app-viewport-height, 100vh) - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-panel, var(--surface-raised));
  color: var(--text-primary);
  box-shadow: 0 24px 70px color-mix(in srgb, var(--archive-ink) 24%, transparent);
}

.project-info__head,
.project-info__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
}
.project-info__head { border-bottom: 1px solid var(--border); }
.project-info__head h2 { margin: 2px 0 0; font: 700 19px/1.3 var(--font-sans); }
.project-info__kicker { color: var(--text-secondary); font-size: 11px; letter-spacing: 0.1em; }
.project-info__close { width: 40px; height: 40px; border: 0; background: transparent; color: var(--text-secondary); font-size: 22px; cursor: pointer; }

.project-info__body { min-height: 0; overflow: auto; padding: 18px 20px; display: grid; gap: 14px; }
.project-info__field { display: grid; gap: 5px; color: var(--text-secondary); font-size: 12px; font-weight: 600; }
.project-info__field input,
.project-info__field select,
.project-info__field textarea {
  box-sizing: border-box; min-height: 38px; border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 11px; background: var(--bg-primary); color: var(--text-primary); font: inherit;
}
.project-info__field textarea { resize: vertical; }
.project-info__field small { font-weight: 400; font-size: 11px; line-height: 1.5; color: var(--text-muted); }
.project-info__field input:disabled, .project-info__field select:disabled { opacity: 0.55; }

.project-info__rootrow { display: flex; align-items: stretch; }
.project-info__rootrow input { flex: 1; min-width: 0; border-radius: 8px 0 0 8px; }
.project-info__browse { flex: none; min-height: 38px; padding: 0 14px; border: 1px solid var(--border); border-left: 0; border-radius: 0 8px 8px 0; background: var(--bg-secondary, transparent); color: var(--text-primary); font: inherit; cursor: pointer; }
.project-info__browse:hover { background: var(--nav-hover); }

.project-info__note, .project-info__error { margin: 0; font-size: 12px; line-height: 1.55; }
.project-info__note { color: var(--text-secondary); word-break: break-all; }
.project-info__error { color: var(--danger); }

.project-info__foot { border-top: 1px solid var(--border); }
.project-info__primary,
.project-info__secondary { min-height: 40px; padding: 0 16px; border-radius: 8px; font: inherit; cursor: pointer; }
.project-info__secondary { border: 1px solid var(--border); background: transparent; color: var(--text-primary); }
.project-info__primary { border: 1px solid var(--accent); background: var(--accent); color: #fff; }
.project-info__primary:disabled { opacity: 0.45; cursor: default; }

@media (max-width: 640px) {
  .project-info__overlay { align-items: end; padding: 0; }
  .project-info { max-height: calc(var(--app-viewport-height, 100vh) - 36px); border-radius: 10px 10px 0 0; }
}
</style>
