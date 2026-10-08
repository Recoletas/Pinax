<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('本地项目') }}</strong>
      <p>{{ tr('项目是磁盘上的普通文件夹（含 .pinax 标记），可整体拷贝迁移。新建或导入书稿时，项目位置按这个目录预填；绑定与移除在首页书卡右上角操作。') }}</p>
    </div>

    <label class="local-project-field">
      <span>{{ tr('默认目录') }}</span>
      <div class="local-project-field__row">
        <input v-model.trim="defaultCreateRoot" type="text" :placeholder="tr('例如 D:\\Projects（绝对路径）')" spellcheck="false" data-test="local-project-root" @change="save">
        <button type="button" class="local-project-field__browse" data-test="local-project-browse" :disabled="browsing" @click="browse">{{ browsing ? tr('系统选择器已打开…') : tr('浏览…') }}</button>
      </div>
      <small>{{ tr('留空则落在文档目录：{root}', { root: mirrorRoot || tr('读取中…') }) }}</small>
    </label>

    <label class="local-project-field">
      <span>{{ tr('已绑定项目') }}</span>
      <select v-if="projects.length" v-model="selectedProjectId" data-test="local-project-select">
        <option v-for="project in projects" :key="project.projectId" :value="project.projectId">{{ project.name }}<template v-if="!project.bookId"> · {{ tr('未绑定书稿') }}</template></option>
      </select>
      <small v-if="selectedProject" class="local-project-field__path" data-test="local-project-path">{{ selectedProject.rootPath }}</small>
      <small v-else>{{ tr('还没有打开过任何项目文件夹；未绑定的书镜像到文档目录。') }}</small>
    </label>

    <p v-if="error" class="ai-settings-note" role="alert">{{ error }}</p>

    <FolderBrowserModal v-if="browserOpen" @close="browserOpen = false" @select="onFolderSelected" />
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onMounted, ref } from 'vue'
import FolderBrowserModal from './FolderBrowserModal.vue'
import { getLocalMirrorLocation, getLocalMirrorSettings, listLocalProjects, pickFolderNative, setLocalMirrorSettings } from '../../services/localMirrorSettings.js'

const defaultCreateRoot = ref('')
const projects = ref([])
const selectedProjectId = ref('')
const mirrorRoot = ref('')
const browsing = ref(false)
const browserOpen = ref(false)
const error = ref('')

const selectedProject = computed(() => projects.value.find((project) => project.projectId === selectedProjectId.value) || null)

function save() {
  setLocalMirrorSettings({ defaultCreateRoot: defaultCreateRoot.value })
}

function applyRoot(next) {
  defaultCreateRoot.value = String(next || '').trim()
  save()
}

/** 与项目资料面板同一交互：首选系统文件夹对话框，不可用回落内置浏览器。 */
async function browse() {
  if (browsing.value) return
  browsing.value = true
  error.value = ''
  try {
    const picked = await pickFolderNative(defaultCreateRoot.value)
    if (picked) applyRoot(picked)
    return
  } catch (nativeError) {
    if (nativeError?.code === 'NATIVE_PICKER_TIMEOUT') return
    browserOpen.value = true
  } finally {
    browsing.value = false
  }
}

function onFolderSelected(selectedPath) {
  browserOpen.value = false
  applyRoot(selectedPath)
}

onMounted(async () => {
  defaultCreateRoot.value = getLocalMirrorSettings().defaultCreateRoot
  getLocalMirrorLocation().then((body) => { mirrorRoot.value = body.root }).catch(() => {})
  try {
    projects.value = (await listLocalProjects()).slice().sort((a, b) => String(b.lastOpenedAt || '').localeCompare(String(a.lastOpenedAt || '')))
    selectedProjectId.value = projects.value[0]?.projectId || ''
  } catch { /* 注册表不可用时保留空态话术 */ }
})
</script>

<style scoped>
.local-project-field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.local-project-field span {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.local-project-field input,
.local-project-field select {
  box-sizing: border-box;
  min-height: 38px;
  border: 1px solid var(--hairline-soft, var(--border));
  border-radius: var(--radius-control);
  padding: 8px 12px;
  color: var(--text-primary);
  background: var(--surface-workbench-input, var(--bg-secondary));
  font: inherit;
}

.local-project-field__row {
  display: flex;
  align-items: stretch;
}

.local-project-field__row input {
  flex: 1;
  min-width: 0;
  border-radius: var(--radius-control) 0 0 var(--radius-control);
}

.local-project-field__browse {
  flex: none;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--hairline-soft, var(--border));
  border-left: 0;
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
  background: var(--bg-secondary, transparent);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}

.local-project-field__browse:hover {
  background: var(--nav-hover);
}

.local-project-field small {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.local-project-field__path {
  word-break: break-all;
}
</style>
