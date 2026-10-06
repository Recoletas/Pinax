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
          <span>{{ tr('作品语言') }}</span>
          <ManuscriptLanguageSelect v-model="form.manuscriptLanguage" :disabled="panel.mode.value === 'edit'" />
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
          <span>{{ tr('项目文件夹位置') }}</span>
          <input v-model.trim="form.root" type="text" :placeholder="tr('留空则在「文档\\Pinax」下创建（绝对路径可自定）')" spellcheck="false" data-test="project-info-root">
          <small>{{ tr('每本书都会有一个本地项目文件夹（含 .pinax 标记），正文/世界书/日志自动同步其中，可整体拷贝迁移。') }}</small>
        </label>

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
import ManuscriptLanguageSelect from '../authoring/ManuscriptLanguageSelect.vue'
import { useProjectInfoPanel } from '../../composables/useProjectInfoPanel.js'
import { createWritingBookRecord, loadWritingBooks, saveWritingBooksDurable, updateWritingBook } from '../../services/writing/writingBooksRepository.js'
import { getLocalMirrorSettings, listLocalProjects } from '../../services/localMirrorSettings.js'
import { useWorldStore } from '../../stores/worldStore.js'

const panel = useProjectInfoPanel()
const worldStore = useWorldStore()
const emit = defineEmits(['saved'])

const titleInput = ref(null)
const busy = ref(false)
const error = ref('')
const worldbooks = computed(() => worldStore.worldbooksIndex || [])
const form = ref({ title: '', description: '', manuscriptLanguage: '', worldbookId: '', kind: 'novel', root: '' })
const boundProject = ref(null)

const modeLabel = computed(() => ({ create: tr('新建作品'), edit: tr('编辑项目'), attach: tr('导入完成 · 选择本地位置') }[panel.mode.value] || tr('项目资料')))
const confirmLabel = computed(() => (panel.mode.value === 'edit' ? tr('保存') : tr('创建并开始写作')))
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
  if (panel.mode.value === 'create') {
    form.value = { title: '', description: '', manuscriptLanguage: '', worldbookId: '', kind: 'novel', root: getLocalMirrorSettings().defaultCreateRoot }
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
    error.value = tr('项目文件夹创建失败：{message}（书已创建，可稍后在「修改项目配置」里重试绑定）', { message: body?.message || response.status })
    return false
  }
  return true
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
        await fetch('/api/localmirror/projects/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: boundProject.value.projectId, name: form.value.title, kind: form.value.kind })
        })
      }
      panel.close()
      emit('saved', updated.book)
      return
    }
    // create / attach：建书（attach 用已有书）+ 建本地项目 + 绑定
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
