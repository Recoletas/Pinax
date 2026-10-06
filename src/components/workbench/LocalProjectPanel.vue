<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('本地项目') }}</strong>
      <p>{{ tr('项目是磁盘上的普通文件夹（含 .pinax 标记），可整体拷贝迁移。配置默认位置后，新建或导入的书会自动在默认位置建项目并绑定。') }}</p>
    </div>

    <label class="local-project-field">
      <span>{{ tr('默认项目新建位置') }}</span>
      <input v-model.trim="defaultCreateRoot" type="text" :placeholder="tr('例如 D:\\Projects（绝对路径）')" spellcheck="false" @change="save" />
      <small>{{ tr('导入或新建书时，将在此目录下创建「书名」项目文件夹并绑定。留空则回落文档目录。') }}</small>
    </label>

    <label class="local-project-field">
      <span>{{ tr('读取位置') }}</span>
      <input v-model.trim="defaultReadRoot" type="text" :placeholder="tr('例如 D:\\Projects（绝对路径）')" spellcheck="false" @change="save" />
      <small>{{ tr('打开已有项目时的预填位置。') }}</small>
    </label>

    <p class="ai-settings-note" role="status" data-test="local-project-registry">
      <template v-if="projects.length">
        <span v-for="project in projects" :key="project.projectId" class="local-project-row">
          {{ tr('已绑定：{name} → {path}', { name: project.name, path: project.rootPath }) }}
        </span>
        <span class="local-project-row">{{ tr('绑定与移除请到首页「项目管理」面板。') }}</span>
      </template>
      <template v-else>{{ tr('还没有打开过任何项目文件夹；未绑定的书镜像到文档目录。') }}</template>
    </p>
    <p v-if="locationNote" class="ai-settings-note" role="status">{{ locationNote }}</p>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { onMounted, ref } from 'vue'
import { getLocalMirrorLocation, getLocalMirrorSettings, listLocalProjects, setLocalMirrorSettings } from '../../services/localMirrorSettings.js'

const defaultCreateRoot = ref('')
const defaultReadRoot = ref('')
const projects = ref([])
const locationNote = ref('')

function save() {
  setLocalMirrorSettings({ defaultCreateRoot: defaultCreateRoot.value, defaultReadRoot: defaultReadRoot.value })
}

onMounted(() => {
  const settings = getLocalMirrorSettings()
  defaultCreateRoot.value = settings.defaultCreateRoot
  defaultReadRoot.value = settings.defaultReadRoot
  listLocalProjects().then((list) => { projects.value = list }).catch(() => {})
  getLocalMirrorLocation().then((body) => { locationNote.value = tr('未绑定书的镜像目录：{root}', { root: body.root }) }).catch(() => {})
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

.local-project-field input {
  box-sizing: border-box;
  min-height: 38px;
  border: 1px solid var(--hairline-soft, var(--border));
  border-radius: var(--radius-control);
  padding: 8px 12px;
  color: var(--text-primary);
  background: var(--surface-workbench-input, var(--bg-secondary));
  font: inherit;
}

.local-project-field small {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.local-project-row {
  display: block;
}
</style>
