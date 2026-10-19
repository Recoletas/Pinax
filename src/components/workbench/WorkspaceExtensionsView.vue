<script setup>
import { computed, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import { useSettingsPopup } from '../../composables/useSettingsPopup.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
const props = defineProps({ resource: { type: Object, required: true } })
const host = useComposableWorkspace()
const workspaceExtensions = host.extensions
const settings = useSettingsPopup()
const error = ref('')
const current = computed(() => { const item = workspaceExtensions.extensions.get(props.resource.extensionId); return item && !item.builtin ? item : null })
const enabled = computed(() => current.value && workspaceExtensions.enabled(current.value.id))
function toggle() { error.value = ''; const result = workspaceExtensions.setEnabled(current.value.id, !enabled.value); if (!result.ok) error.value = result.message }
async function open() {
  const bookId = host.scope.value.bookId
  if (!bookId) { host.hide(); host.directory.setExpanded(false); return }
  if (!await host.directory.prepare() || !await host.prepareOpen('main')) return
  const type = current.value.required ? 'settings-editor' : current.value.views[0].type
  await host.openAt({ type, bookId }, 'main')
}
</script>
<template>
  <article class="workspace-extensions-view" data-test="workspace-extensions-view">
    <template v-if="current">
    <header><WorkbenchIcon :name="current.icon" :size="42" /><div><h1>{{ tr(current.title) }}</h1><p>{{ tr('扩展') }}</p></div></header>
    <p class="extension-description">{{ tr(current.description) }}</p>
    <div class="extension-actions"><button v-if="!current.required" type="button" class="extension-secondary" :aria-label="tr(enabled ? '停用扩展' : '启用扩展')" @click="toggle">{{ tr(enabled ? '停用' : '启用') }}</button><span v-else>{{ tr('工作台基础能力') }}</span><button type="button" class="extension-primary" :disabled="!enabled" @click="open">{{ tr(!host.scope.value.bookId ? '打开作品' : current.required ? '查看设定' : '打开') }}</button></div>
    <p v-if="error" role="alert">{{ tr(error) }}</p>
    <p v-if="!current.required" class="extension-note">{{ tr('停用后不再新开此工作台，已打开的内容和任务保留。') }}</p>
    <section><h2>{{ tr('包含的视图') }}</h2><div v-for="view in current.views.filter(item => !['home', 'extensions'].includes(item.type))" :key="view.type" class="extension-contribution"><WorkbenchIcon :name="view.icon" :size="17" /><span>{{ tr(view.title) }}</span></div></section>
    </template>
    <template v-else>
      <header><WorkbenchIcon name="extensions" :size="32" /><h1>{{ tr('扩展') }}</h1></header>
      <p class="extension-description">{{ tr('暂无已安装扩展。第三方扩展暂未开放。') }}</p>
      <p class="extension-note">{{ tr('写作技法在助手的“参考与技法”中选择。') }}</p>
    </template>
    <footer><button type="button" @click="settings.open('ai')"><WorkbenchIcon name="settings" :size="16" />{{ tr('模型设置') }}</button><button v-if="host.scope.value.bookId" type="button" @click="settings.open('localproject')"><WorkbenchIcon name="sources" :size="16" />{{ tr('项目知识库设置') }}</button></footer>
  </article>
</template>
<style scoped>
.workspace-extensions-view { box-sizing: border-box; width: 100%; max-width: 940px; padding: 40px clamp(20px, 5vw, 64px); color: var(--text-primary); font: 14px/1.7 var(--font-interface); }
header { display: flex; align-items: center; gap: 20px; margin-bottom: 22px; }
header > svg { flex: none; color: var(--text-secondary); }
h1 { margin: 0; font-size: 25px; line-height: 1.5; font-weight: 600; }
header p { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }
.extension-description { margin: 0 0 20px; color: var(--text-secondary); }
.extension-actions { display: flex; align-items: center; gap: 10px; }
.extension-actions > span { margin-inline-end: 4px; color: var(--text-muted); font-size: 12px; }
.extension-actions button { min-height: 34px; padding: 6px 16px; border: 0; border-radius: var(--radius-control); font: inherit; cursor: pointer; }
.extension-primary { background: var(--control-accent-bg); color: var(--control-accent-text); }
.extension-secondary { background: var(--surface-workbench-input); color: var(--text-primary); }
button:disabled { opacity: .45; cursor: default; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.extension-note { margin: 12px 0 0; color: var(--text-muted); font-size: 12px; }
section { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--hairline-soft); }
h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
.extension-contribution { display: inline-flex; align-items: center; gap: 8px; min-width: 130px; margin: 4px 16px 4px 0; color: var(--text-secondary); }
section p { margin: 0 0 12px; color: var(--text-secondary); font-size: 13px; }
.extension-skills { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--text-secondary); font-size: 13px; }
footer { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-top: 32px; }
footer button { display: flex; align-items: center; gap: 7px; padding: 6px 0; border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
footer button:hover { color: var(--accent); }
@media (pointer: coarse) { button { min-height: 44px !important; } }
</style>
