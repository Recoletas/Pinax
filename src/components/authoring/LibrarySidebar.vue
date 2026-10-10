<script setup>
import { tr } from '../../i18n/index.js'
import { ref, watch } from 'vue'
import { loadWritingSidebarPreferences, saveWritingSidebarPreferences } from '../../composables/useWritingSidebarPreferences.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import WorkspaceProjectNavigation from '../workbench/WorkspaceProjectNavigation.vue'
const props = defineProps({ books: { type: Array, default: () => [] }, recentBookId: { type: [String, Number], default: '' } })
defineEmits(['settings'])
const baseUrl = import.meta.env.BASE_URL
const selectedBookId = ref('')
const manuallySelectedBook = ref(false)
const expanded = ref(false)
// W-A：桌面侧栏整体收起（Obsidian 对齐），默认展开，偏好持久化 writing_sidebar_preferences_v1。
const collapsed = ref(loadWritingSidebarPreferences().collapsed)
watch([() => props.books, () => props.recentBookId], ([books, recentId]) => {
  const hasBook = id => books.some(book => String(book.id) === String(id))
  if (manuallySelectedBook.value && hasBook(selectedBookId.value)) return
  manuallySelectedBook.value = false
  selectedBookId.value = hasBook(recentId) ? String(recentId) : String(books[0]?.id || '')
}, { immediate: true })
function selectBook(value) {
  const requested = String(value)
  if (!props.books.some(book => String(book.id) === requested)) return
  selectedBookId.value = requested
  manuallySelectedBook.value = true
}
function toggleCollapsed() {
  collapsed.value = !collapsed.value
  saveWritingSidebarPreferences({ collapsed: collapsed.value })
}
</script>

<template>
  <aside id="library-sidebar" class="library-sidebar workspace-sidebar" :class="{ 'is-expanded': expanded, 'is-collapsed': collapsed }" :aria-label="tr(&quot;首页导航&quot;)" data-test="library-sidebar">
    <div class="library-sidebar__brand"><img :src="`${baseUrl}pinax-icon-192.png`" alt=""><strong>Pinax</strong><button type="button" class="library-sidebar__collapse" :aria-controls="'library-sidebar'" :aria-expanded="collapsed ? 'false' : 'true'" :aria-label="tr(collapsed ? '展开侧栏' : '收起侧栏')" :title="tr(collapsed ? '展开侧栏' : '收起侧栏')" data-test="library-sidebar-collapse" @click="toggleCollapsed"><WorkbenchIcon name="panel-left" :size="18" /></button><button type="button" class="library-sidebar__toggle" :aria-expanded="expanded" :aria-label="tr(expanded ? '收起功能导航' : '展开功能导航')" @click="expanded = !expanded"><WorkbenchIcon name="menu" :size="20" /></button></div>
    <nav class="library-sidebar__nav">
      <WorkspaceProjectNavigation v-if="books.length" :book-id="selectedBookId" current="home" @select-book="selectBook" />
      <router-link v-else class="workspace-nav-item library-sidebar__utility library-sidebar__current" to="/" aria-current="page"><WorkbenchIcon name="library" :size="21" /><span>{{ tr('我的作品') }}</span></router-link>
      <div class="library-sidebar__tools" data-test="library-sidebar-tools"><div class="library-sidebar__group"><router-link class="workspace-nav-item library-sidebar__utility" :to="{ name: 'experience' }"><WorkbenchIcon name="adventure" :size="20" /><span>{{ tr('跑团与冒险') }}</span></router-link><router-link class="workspace-nav-item library-sidebar__utility" :to="{ name: 'online-experience' }"><WorkbenchIcon name="collaboration" :size="20" /><span>{{ tr('联机房间') }}</span><small>{{ tr('试验') }}</small></router-link></div><div class="library-sidebar__bottom"><button class="workspace-nav-item library-sidebar__utility" type="button" @click="$emit('settings', 'memory')"><WorkbenchIcon name="history" :size="20" /><span>{{ tr('记忆与历史') }}</span></button><button class="workspace-nav-item library-sidebar__utility" type="button" @click="$emit('settings', 'storage')"><WorkbenchIcon name="backup" :size="20" /><span>{{ tr('备份与恢复') }}</span></button><router-link class="workspace-nav-item library-sidebar__utility" to="/docs/README"><WorkbenchIcon name="help" :size="20" /><span>{{ tr('帮助中心') }}</span></router-link><button class="workspace-nav-item library-sidebar__utility" type="button" @click="$emit('settings', 'ai')"><WorkbenchIcon name="settings" :size="20" /><span>{{ tr('偏好与模型') }}</span></button></div></div>
    </nav>
    <p class="library-sidebar__local">{{ tr('本地工作区') }}</p>
  </aside>
  <button v-if="collapsed" type="button" class="library-sidebar__reopen" aria-controls="library-sidebar" :aria-label="tr('展开侧栏')" :title="tr('展开侧栏')" data-test="library-sidebar-reopen" @click="toggleCollapsed"><WorkbenchIcon name="panel-left" :size="18" /></button>
</template>

<style scoped>
.library-sidebar { width: var(--workspace-sidebar-width, 256px); flex: 0 0 var(--workspace-sidebar-width, 256px); min-height: 0; overflow: hidden; background: var(--surface-workbench-muted); border-right: 0; display: flex; flex-direction: column; padding: 18px 0 12px; font: 14px/1.5 var(--font-sans); }
.library-sidebar__brand { display: flex; flex: none; align-items: center; gap: 10px; padding: 0 16px 16px; }
.library-sidebar__brand img { width: 28px; height: 28px; border-radius: 0; }
.library-sidebar__brand strong { font-size: 20px; font-weight: 500; letter-spacing: -.02em; color: var(--text-primary); }
.library-sidebar__nav { display: flex; min-height: 0; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto; scrollbar-width: thin; }
.library-sidebar__nav > :deep(.workspace-project-nav) { flex: none; }
.library-sidebar.workspace-sidebar .library-sidebar__nav .library-sidebar__utility { display: flex; box-sizing: border-box; align-items: center; gap: 12px; min-width: 0; min-height: 40px; width: 100%; padding: 8px 16px; border: 0; border-radius: 0; box-shadow: none; background: transparent; text-decoration: none; color: var(--nav-fg); font: inherit; font-size: 14px; text-align: start; cursor: pointer; transition: background-color .12s ease, color .12s ease; }
.library-sidebar__utility > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.library-sidebar__utility > svg { flex: none; width: 18px; height: 18px; }
.library-sidebar__utility > small { flex: none; margin-inline-start: auto; font-size: 12px; }
.library-sidebar.workspace-sidebar .library-sidebar__nav .library-sidebar__utility.library-sidebar__current { background: var(--nav-selected-secondary, var(--nav-selected)); color: var(--nav-fg-selected); font-weight: 500; }
.library-sidebar.workspace-sidebar .library-sidebar__nav .library-sidebar__utility:hover:not(:disabled) { background: var(--nav-hover); color: var(--archive-ink); }
.library-sidebar__utility:disabled { opacity: .45; cursor: default; }
.library-sidebar__utility:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.library-sidebar__group, .library-sidebar__bottom { flex: none; }
.library-sidebar__bottom { padding-top: 8px; border-top: 1px solid var(--hairline-soft); }
/* W-A：跑团/联机 + 记忆/备份/帮助/偏好并为一个底部工具组，margin-top: auto 贴到「本地工作区」页脚上方。 */
.library-sidebar__tools { flex: none; margin-top: auto; }
.library-sidebar__local { flex: none; margin: 12px 16px 0; font-size: 12px; color: var(--archive-ink-soft); }
.library-sidebar__toggle { display: none; }
.library-sidebar__collapse { display: grid; place-items: center; flex: none; margin-inline-start: auto; width: 32px; height: 32px; border: 0; border-radius: 0; background: transparent; color: var(--archive-ink-soft); cursor: pointer; }
.library-sidebar__collapse:hover { background: var(--nav-hover); color: var(--archive-ink); }
.library-sidebar__collapse:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
/* W-A：收起态（仅桌面）——侧栏完全隐藏，左缘留 48px 热区展开钮，与创作台 dock 徽标钮同语义。 */
.library-sidebar__reopen { display: none; }
@media (min-width: 821px) {
  .library-sidebar.is-collapsed { display: none; }
  .library-sidebar__reopen { display: grid; place-items: center; flex: none; align-self: stretch; width: 48px; padding: 0; border: 0; border-radius: 0; background: var(--surface-workbench-muted); color: var(--archive-ink-soft); cursor: pointer; }
  .library-sidebar__reopen:hover { background: var(--nav-hover); color: var(--archive-ink); }
  .library-sidebar__reopen:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
}
@media (max-width: 820px) {
  .library-sidebar { width: 100%; padding: 10px 0; border-right: 0; border-bottom: 1px solid var(--hairline-soft); flex: none; overflow: visible; }
  .library-sidebar__brand { padding: 0 16px; }
  .library-sidebar__brand img { width: 26px; height: 26px; }
  .library-sidebar__brand strong { font-size: 20px; }
  .library-sidebar__local { display: none; }
  .library-sidebar__collapse { display: none; }
  .library-sidebar__toggle { display: grid; flex: none; place-items: center; margin-inline-start: auto; width: 44px; height: 44px; border: 0; border-radius: 0; background: transparent; color: inherit; cursor: pointer; }
  .library-sidebar__toggle:hover { background: var(--nav-hover); }
  .library-sidebar__toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .library-sidebar__nav { display: none; max-height: 55dvh; padding-top: 12px; }
  .is-expanded .library-sidebar__nav { display: flex; }
}
@media (max-width: 760px), (pointer: coarse) {
  .library-sidebar.workspace-sidebar .library-sidebar__nav .library-sidebar__utility { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .library-sidebar.workspace-sidebar .library-sidebar__nav .library-sidebar__utility { transition: none; }
}
</style>
