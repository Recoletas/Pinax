<script setup>
import { computed, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import { useComposableWorkspace } from '../../composables/useComposableWorkspace.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
const host = useComposableWorkspace()
const workspaceExtensions = host.extensions
const query = ref('')
const entries = computed(() => [...workspaceExtensions.extensions.values()].filter(item => `${tr(item.title)} ${tr(item.description)}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))
const selected = computed(() => host.state.views.find(view => view.id === host.state.mainModuleId)?.resource.extensionId || 'pinax.core')
async function select(id) {
  if (!await host.directory.prepare() || !await host.prepareOpen('main')) return
  await host.openAt({ type: 'extensions', bookId: host.scope.value.bookId || '', extensionId: id }, 'main')
  if (host.state.narrow) host.state.directoryOpen = false
}
</script>
<template>
  <section class="workspace-extension-list" aria-label="扩展列表">
    <label><WorkbenchIcon name="search" :size="14" /><input v-model="query" type="search" :aria-label="tr('搜索扩展')" :placeholder="tr('搜索扩展')" /></label>
    <nav><button v-for="item in entries" :key="item.id" type="button" :aria-current="selected === item.id ? 'true' : undefined" @click="select(item.id)"><WorkbenchIcon :name="item.icon" :size="20" /><span>{{ tr(item.title) }}<small v-if="!workspaceExtensions.enabled(item.id)">{{ tr('已停用') }}</small></span></button></nav>
    <p v-if="!entries.length">{{ tr('没有找到扩展') }}</p>
  </section>
</template>
<style scoped>
.workspace-extension-list { padding: 8px 0; color: var(--text-primary); font: 13px/1.5 var(--font-interface); }
label { display: flex; align-items: center; gap: 6px; margin: 0 10px 12px; padding: 5px 8px; border: 1px solid transparent; border-radius: 4px; background: var(--surface-workbench-input); color: var(--text-muted); }
label:focus-within { border-color: var(--accent); }
input { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--text-primary); font: inherit; outline: none; }
button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 10px 16px; border: 0; border-radius: 0; background: transparent; color: var(--text-secondary); font: inherit; text-align: start; cursor: pointer; }
button > svg { flex: none; }
button > span { min-width: 0; }
small { display: block; margin-top: 2px; color: var(--text-muted); font-size: 11px; }
button:hover { background: var(--nav-hover); }
button[aria-current] { background: var(--nav-selected-secondary); color: var(--text-primary); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
p { padding: 0 16px; color: var(--text-muted); }
</style>
