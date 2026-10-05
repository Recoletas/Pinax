<script setup>
import { tr } from '../../i18n/index.js'
import { computed, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ books: { type: Array, default: () => [] }, recentBookId: { type: [String, Number], default: '' } })
defineEmits(['settings'])
const baseUrl = import.meta.env.BASE_URL
const selectedBookId = ref('')
const manuallySelectedBook = ref(false)
const expanded = ref(false)
watch([() => props.books, () => props.recentBookId], ([books, recentId]) => {
  const hasBook = id => books.some(book => String(book.id) === String(id))
  if (manuallySelectedBook.value && hasBook(selectedBookId.value)) return
  manuallySelectedBook.value = false
  selectedBookId.value = hasBook(recentId) ? String(recentId) : String(books[0]?.id || '')
}, { immediate: true })
function selectBook(event) {
  const requested = String(event.target.value)
  if (!props.books.some(book => String(book.id) === requested)) return
  selectedBookId.value = requested
  manuallySelectedBook.value = true
}
const projectTools = [
  { key: 'manuscript', name: 'authoring', label: '正文', icon: 'writing' },
  { key: 'assistant', name: 'authoring', label: '助手', icon: 'assistant', view: 'assistant' },
  { key: 'settings', name: 'settings-structured', label: '设定', icon: 'worldbook' },
  { key: 'sources', name: 'settings-sources', label: '资料', icon: 'sources' },
  { name: 'settings-world-map', label: '世界地图', icon: 'map' },
  { name: 'materials', label: '灵感素材', icon: 'pin' },
  { name: 'prose-essay', label: '视频与编导', icon: 'canvas' },
  { name: 'comics', label: '漫画制作', icon: 'comics' }
]
const projectTitle = computed(() => props.books.find(book => String(book.id) === selectedBookId.value)?.title || tr('未命名书稿'))
function projectRoute(item) {
  return { name: item.name, query: { bookId: selectedBookId.value, ...(item.view ? { view: item.view } : {}) } }
}
</script>

<template>
  <aside class="library-sidebar workspace-sidebar" :class="{ 'is-expanded': expanded }" :aria-label="tr(&quot;首页导航&quot;)">
    <div class="library-sidebar__brand"><img :src="`${baseUrl}pinax-icon-192.png`" alt=""><div><strong>Pinax</strong><span>{{ tr('让故事成为作品') }}</span></div><button type="button" class="library-sidebar__toggle" :aria-expanded="expanded" :aria-label="tr(expanded ? '收起功能导航' : '展开功能导航')" @click="expanded = !expanded"><WorkbenchIcon name="menu" :size="20" /></button></div>
    <nav class="library-sidebar__nav">
      <router-link class="workspace-nav-item library-sidebar__current" to="/" aria-current="page"><WorkbenchIcon name="library" :size="21" /><span>{{ tr('我的作品') }}</span><small>{{ books.length }}</small></router-link>
      <div class="library-sidebar__group">
        <h2>{{ tr('创作工具') }}</h2>
        <label class="library-sidebar__project"><span>{{ tr('当前作品') }}</span><select :value="selectedBookId" :aria-label="tr(&quot;工具所属作品&quot;)" :title="projectTitle" :disabled="!books.length" @change="selectBook"><option v-if="!books.length" value="">{{ tr('请先新建一本书') }}</option><option v-for="book in books" :key="book.id" :value="String(book.id)">{{ book.title || tr('未命名书稿') }}</option></select></label>
        <template v-for="item in projectTools" :key="item.key || item.name"><router-link class="workspace-nav-item" v-if="selectedBookId" :to="projectRoute(item)" :title="tr(item.label)"><WorkbenchIcon :name="item.icon" :size="20" /><span>{{ tr(item.label) }}</span></router-link><button class="workspace-nav-item" v-else type="button" disabled :title="tr(&quot;新建作品后可使用&quot;)"><WorkbenchIcon :name="item.icon" :size="20" /><span>{{ tr(item.label) }}</span></button></template>
      </div>
      <div class="library-sidebar__group"><h2>{{ tr('故事体验') }}</h2><router-link class="workspace-nav-item" :to="{ name: 'experience' }"><WorkbenchIcon name="adventure" :size="20" /><span>{{ tr('跑团与冒险') }}</span></router-link><router-link class="workspace-nav-item" :to="{ name: 'online-experience' }"><WorkbenchIcon name="collaboration" :size="20" /><span>{{ tr('联机房间') }}</span><small>{{ tr('试验') }}</small></router-link></div>
      <div class="library-sidebar__bottom"><button class="workspace-nav-item" type="button" @click="$emit('settings', 'memory')"><WorkbenchIcon name="history" :size="20" /><span>{{ tr('记忆与历史') }}</span></button><button class="workspace-nav-item" type="button" @click="$emit('settings', 'storage')"><WorkbenchIcon name="backup" :size="20" /><span>{{ tr('备份与恢复') }}</span></button><router-link class="workspace-nav-item" to="/docs/README"><WorkbenchIcon name="help" :size="20" /><span>{{ tr('帮助中心') }}</span></router-link><button class="workspace-nav-item" type="button" @click="$emit('settings', 'ai')"><WorkbenchIcon name="settings" :size="20" /><span>{{ tr('偏好与模型') }}</span></button></div>
    </nav>
    <p class="library-sidebar__local">{{ tr('本地工作区') }}<span>{{ tr('Web 内测') }}</span></p>
  </aside>
</template>

<style scoped>
.library-sidebar { width: var(--workspace-sidebar-width, 256px); flex: 0 0 var(--workspace-sidebar-width, 256px); min-height: 0; overflow: hidden; background: var(--surface-workbench-muted); border-right: 0; display: flex; flex-direction: column; padding: 24px 12px 16px; font: 15px/1.5 var(--font-sans); }
.library-sidebar__brand { display: flex; flex: none; align-items: center; gap: 12px; padding: 0 12px 28px; }
.library-sidebar__brand img { width: 36px; height: 36px; border-radius: 10px; }
.library-sidebar__brand strong { font-size: 22px; font-weight: 500; letter-spacing: -.02em; color: var(--text-primary); }
.library-sidebar__brand span { display: block; color: var(--archive-ink-soft); font-size: 12px; margin-top: 3px; }
.library-sidebar__nav { display: flex; min-height: 0; flex-direction: column; gap: 24px; flex: 1; overflow-y: auto; scrollbar-width: thin; }
.library-sidebar__nav a, .library-sidebar__nav button { display: flex; align-items: center; gap: 12px; min-height: var(--nav-row-height, 40px); width: 100%; padding: 8px 12px; border: 0; border-radius: 12px; background: none; text-decoration: none; color: var(--nav-fg); font: inherit; font-size: 15px; text-align: left; cursor: pointer; transition: background .16s ease, color .16s ease; }
.library-sidebar__nav a > span, .library-sidebar__nav button > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.library-sidebar__nav svg { flex-shrink: 0; width: 18px; height: 18px; }
.library-sidebar__nav small { margin-left: auto; font-size: 12px; }
.library-sidebar__nav .library-sidebar__current { background: var(--nav-selected); color: var(--nav-fg-selected); font-weight: 500; }
.library-sidebar__nav a:hover, .library-sidebar__nav button:not(:disabled):hover { background: var(--nav-hover); color: var(--archive-ink); }
.library-sidebar__nav button:disabled { opacity: .45; cursor: not-allowed; }
.library-sidebar__group h2 { margin: 0 12px 12px; font-size: 12px; font-weight: 500; letter-spacing: normal; color: var(--text-secondary); }
.library-sidebar__project { display: block; margin: 0 8px 12px; padding: 0 4px; }
.library-sidebar__project > span { font-size: 12px; color: var(--archive-ink-soft); }
.library-sidebar__project select { width: 100%; min-width: 0; min-height: 40px; margin-top: 6px; padding: 8px 12px; border: 1px solid var(--hairline-soft); border-radius: 12px; color: var(--text-primary); background: var(--surface-workbench-raised); font: inherit; font-size: 14px; text-overflow: ellipsis; }
.library-sidebar__project select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.library-sidebar__bottom { margin-top: auto; padding-top: 8px; border-top: 0; }
.library-sidebar__local { display: flex; flex: none; justify-content: space-between; margin: 16px 12px 0; font-size: 12px; color: var(--archive-ink-soft); }
.library-sidebar__toggle { display: none; }
@media (max-width: 820px) {
  .library-sidebar { width: 100%; padding: 14px 18px; border-right: 0; border-bottom: 1px solid var(--hairline-soft); flex: none; overflow: visible; }
  .library-sidebar__brand { padding: 0; }
  .library-sidebar__brand img { width: 32px; height: 32px; }
  .library-sidebar__brand strong { font-size: 22px; }
  .library-sidebar__brand span, .library-sidebar__local { display: none; }
  .library-sidebar__toggle { display: grid; place-items: center; margin-left: auto; width: 44px; height: 44px; border: 0; border-radius: 12px; background: none; color: inherit; cursor: pointer; }
  .library-sidebar__toggle:hover { background: var(--nav-hover); }
  .library-sidebar__nav { display: none; max-height: 55dvh; padding-top: 20px; }
  .is-expanded .library-sidebar__nav { display: flex; }
}
@media (max-width: 760px), (pointer: coarse) {
  .library-sidebar__project select, .library-sidebar__nav a, .library-sidebar__nav button { min-height: 44px; }
}
</style>
