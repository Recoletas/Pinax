<script setup>
import { computed, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({ books: { type: Array, default: () => [] } })
defineEmits(['settings'])
const baseUrl = import.meta.env.BASE_URL
const selectedBookId = ref('')
const expanded = ref(false)
watch(() => props.books, books => {
  if (!books.some(book => book.id === selectedBookId.value)) selectedBookId.value = books[0]?.id || ''
}, { immediate: true })
const projectTools = [
  { name: 'settings-structured', label: '人物与设定', icon: 'worldbook' },
  { name: 'settings-sources', label: '参考资料', icon: 'sources' },
  { name: 'settings-world-map', label: '世界地图', icon: 'map' },
  { name: 'materials', label: '灵感素材', icon: 'pin' },
  { name: 'prose-essay', label: '画布与分镜', icon: 'canvas' },
  { name: 'comics', label: '漫画制作', icon: 'comics' }
]
const projectQuery = computed(() => ({ bookId: selectedBookId.value }))
</script>

<template>
  <aside class="library-sidebar workspace-sidebar" :class="{ 'is-expanded': expanded }" aria-label="首页导航">
    <div class="library-sidebar__brand"><img :src="`${baseUrl}pinax-icon-192.png`" alt=""><div><strong>Pinax</strong><span>让故事成为作品</span></div><button type="button" class="library-sidebar__toggle" :aria-expanded="expanded" aria-label="展开功能导航" @click="expanded = !expanded"><WorkbenchIcon name="menu" :size="20" /></button></div>
    <nav class="library-sidebar__nav">
      <router-link class="workspace-nav-item library-sidebar__current" to="/" aria-current="page"><WorkbenchIcon name="library" :size="21" /><span>我的作品</span><small>{{ books.length }}</small></router-link>
      <div class="library-sidebar__group">
        <h2>创作工具</h2>
        <label class="library-sidebar__project"><span>当前作品</span><select v-model="selectedBookId" aria-label="工具所属作品" :disabled="!books.length"><option v-if="!books.length" value="">请先新建一本书</option><option v-for="book in books" :key="book.id" :value="book.id">{{ book.title || '未命名书稿' }}</option></select></label>
        <template v-for="item in projectTools" :key="item.name"><router-link class="workspace-nav-item" v-if="selectedBookId" :to="{ name: item.name, query: projectQuery }"><WorkbenchIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span></router-link><button class="workspace-nav-item" v-else type="button" disabled title="新建作品后可使用"><WorkbenchIcon :name="item.icon" :size="20" /><span>{{ item.label }}</span></button></template>
      </div>
      <div class="library-sidebar__group"><h2>故事体验</h2><router-link class="workspace-nav-item" :to="{ name: 'experience' }"><WorkbenchIcon name="adventure" :size="20" /><span>跑团与冒险</span></router-link><router-link class="workspace-nav-item" :to="{ name: 'online-experience' }"><WorkbenchIcon name="collaboration" :size="20" /><span>联机房间</span><small>试验</small></router-link></div>
      <div class="library-sidebar__bottom"><button class="workspace-nav-item" type="button" @click="$emit('settings', 'memory')"><WorkbenchIcon name="history" :size="20" /><span>记忆与历史</span></button><button class="workspace-nav-item" type="button" @click="$emit('settings', 'storage')"><WorkbenchIcon name="backup" :size="20" /><span>备份与恢复</span></button><router-link class="workspace-nav-item" to="/docs/README"><WorkbenchIcon name="help" :size="20" /><span>帮助中心</span></router-link><button class="workspace-nav-item" type="button" @click="$emit('settings', 'ai')"><WorkbenchIcon name="settings" :size="20" /><span>偏好与模型</span></button></div>
    </nav>
    <p class="library-sidebar__local">本地工作区 <span>Web 内测</span></p>
  </aside>
</template>

<style scoped>
.library-sidebar { width: var(--workspace-sidebar-width, 240px); flex: 0 0 var(--workspace-sidebar-width, 240px); background: var(--archive-paper); border-right: 1px solid var(--archive-paper-strong); display: flex; flex-direction: column; padding: 24px 12px 18px; }
.library-sidebar__brand { display: flex; align-items: center; gap: 12px; padding: 0 14px 30px; }
.library-sidebar__brand img { width: 42px; height: 42px; border-radius: 10px; }
.library-sidebar__brand strong { font-size: 27px; letter-spacing: -.04em; }
.library-sidebar__brand span { display: block; color: var(--archive-ink-soft); font-size: 12px; margin-top: 3px; }
.library-sidebar__nav { display: flex; flex-direction: column; gap: 18px; flex: 1; }
.library-sidebar__nav a, .library-sidebar__nav button { display: flex; align-items: center; gap: 10px; min-height: 36px; width: 100%; padding: 7px 12px; border: 0; border-radius: 5px; background: none; text-decoration: none; color: var(--nav-fg); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.library-sidebar__nav svg { flex-shrink: 0; width: 18px; height: 18px; }
.library-sidebar__nav small { margin-left: auto; font-size: 12px; }
.library-sidebar__nav .library-sidebar__current { background: color-mix(in srgb, var(--archive-olive) 10%, transparent); color: var(--archive-olive); font-weight: 650; }
.library-sidebar__nav a:hover, .library-sidebar__nav button:not(:disabled):hover { background: var(--archive-paper-strong); color: var(--archive-ink); }
.library-sidebar__nav button:disabled { opacity: .45; cursor: not-allowed; }
.library-sidebar__group h2 { margin: 0 14px 10px; font-size: 12px; font-weight: 500; letter-spacing: .08em; color: var(--archive-ink-soft); }
.library-sidebar__project { display: block; margin: 0 12px 10px; }
.library-sidebar__project > span { font-size: 11px; color: var(--archive-ink-soft); }
.library-sidebar__project select { width: 100%; min-height: 36px; margin-top: 5px; padding: 6px 8px; border: 1px solid var(--archive-paper-strong); border-radius: 6px; color: var(--archive-ink); background: var(--archive-paper-soft); font: inherit; font-size: 13px; }
.library-sidebar__project select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.library-sidebar__bottom { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--archive-paper-strong); }
.library-sidebar__local { display: flex; justify-content: space-between; margin: 20px 14px 0; font-size: 11px; color: var(--archive-ink-soft); }
.library-sidebar__toggle { display: none; }
@media (max-width: 820px) {
  .library-sidebar { width: 100%; padding: 14px 18px; border-right: 0; border-bottom: 1px solid var(--archive-paper-strong); flex: none; }
  .library-sidebar__brand { padding: 0; }
  .library-sidebar__brand img { width: 32px; height: 32px; }
  .library-sidebar__brand strong { font-size: 22px; }
  .library-sidebar__brand span, .library-sidebar__local { display: none; }
  .library-sidebar__toggle { display: grid; place-items: center; margin-left: auto; width: 44px; height: 44px; border: 1px solid var(--archive-paper-strong); border-radius: 5px; background: none; color: inherit; }
  .library-sidebar__nav { display: none; padding-top: 24px; }
  .is-expanded .library-sidebar__nav { display: flex; }
}
</style>
