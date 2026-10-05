<template>
  <div class="authoring-welcome">
    <LibrarySidebar :books="books" :recent-book-id="recentBook?.id || ''" @settings="settings.open" />
    <main class="library-main">
      <section class="library-heading" aria-labelledby="library-title">
        <div><h1 id="library-title">{{ tr('我的作品') }}</h1><p v-if="!books.length">{{ tr('从第一本书开始，把想法写成故事。') }}</p></div>
        <router-link v-if="recentBook" class="library-return" data-test="welcome-continue-book" :to="{ name: 'authoring', query: { bookId: recentBook.id } }"><WorkbenchIcon name="pencil" :size="21" /><span><small>{{ tr('继续最近的书稿') }}</small><strong>{{ recentBook.title || tr('未命名书稿') }}</strong></span><WorkbenchIcon name="arrow-right" :size="20" /></router-link>
      </section>
      <LibraryQuickActions @backup="settings.open('storage')" />
      <template v-if="books.length">
        <div class="library-toolbar">
          <h2 class="library-section-title">{{ tr('全部作品') }}<span>{{ books.length }}</span></h2>
          <label class="library-search"><WorkbenchIcon name="search" :size="18" /><input ref="searchInput" v-model="search" type="search" :placeholder="tr(&quot;搜索书名&quot;)" :aria-label="tr(&quot;搜索书名&quot;)"></label>
          <div class="library-view-controls"><select v-model="sort" :aria-label="tr(&quot;书稿排序&quot;)"><option value="updated">{{ tr('最近修改') }}</option><option value="title">{{ tr('书名排序') }}</option><option value="created">{{ tr('最近创建') }}</option></select><div class="library-view-toggle" role="group" :aria-label="tr(&quot;书库视图&quot;)"><button type="button" :aria-pressed="view === 'grid'" @click="view = 'grid'"><WorkbenchIcon name="grid" :size="16" />{{ tr('书架') }}</button><button type="button" :aria-pressed="view === 'list'" @click="view = 'list'"><WorkbenchIcon name="list" :size="16" />{{ tr('列表') }}</button></div></div>
        </div>
        <p v-if="search.trim()" class="library-results" role="status">{{ tr('找到 {length} 本书稿', { length: visibleBooks.length }) }}</p>
        <section v-if="visibleBooks.length" class="library-books" :class="{ 'is-list': view === 'list' }" :aria-label="tr(&quot;书稿&quot;)"><BookLibraryCard v-for="book in visibleBooks" :key="book.id" :book="book" data-test="library-book" /></section>
        <div v-else class="library-no-results"><h2>{{ tr('没有找到这本书') }}</h2><p>{{ tr('试试其他书名，或清除搜索查看全部作品。') }}</p><button type="button" class="library-button" @click="clearSearch">{{ tr('清除搜索') }}</button></div>
      </template>
      <section v-else class="library-empty" aria-labelledby="library-empty-title"><span class="library-empty__label">{{ tr('你的第一份书稿') }}</span><h2 id="library-empty-title">{{ tr('空白的一页，') }}<br>{{ tr('是故事的开始。') }}</h2><p>{{ tr('新建一本书直接写正文，或导入已有的 TXT / Markdown。') }}<br>{{ tr('不必先搭建世界，也不用先配置 AI。') }}</p><ol><li><strong>{{ tr('写下第一场') }}</strong><span>{{ tr('从眼前正在发生的事开始。') }}</span></li><li><strong>{{ tr('放入人物') }}</strong><span>{{ tr('需要时，再补充角色和设定。') }}</span></li><li><strong>{{ tr('试一条岔路') }}</strong><span>{{ tr('推演另一种走法，决定是否写回。') }}</span></li></ol></section>
      <footer class="library-footer"><WorkbenchIcon name="archive" :size="16" /><p>{{ tr('作品保存在当前浏览器，暂不跨设备同步。') }}<button type="button" @click="settings.open('storage')">{{ tr('导出备份') }}</button></p></footer>
    </main>
    <SettingsPopup v-if="settings.isOpen.value" />
  </div>
</template>

<script setup>
import { tr, uiLocale } from '../i18n/index.js'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useSettingsPopup } from '../composables/useSettingsPopup.js'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import SettingsPopup from '../components/workbench/SettingsPopup.vue'
import BookLibraryCard from '../components/authoring/BookLibraryCard.vue'
import LibrarySidebar from '../components/authoring/LibrarySidebar.vue'
import LibraryQuickActions from '../components/authoring/LibraryQuickActions.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import { useWorkspaceTabsStore } from '../stores/workspaceTabsStore.js'
const settings = useSettingsPopup()
const workspaceTabs = useWorkspaceTabsStore()
const books = ref(loadWritingBooks())
const search = ref('')
const searchInput = ref(null)
const sort = ref('updated')
const view = ref('grid')
const timestamp = (book, field) => Date.parse(book[field] || book.createdAt) || 0
const recentBook = computed(() => {
  const index = new Map(books.value.map(book => [String(book.id), book]))
  const recentTab = workspaceTabs.tabs
    .filter(tab => tab.scope === 'project' && index.has(String(tab.projectId)))
    .reduce((latest, tab) => !latest || Number(tab.lastActiveAt || 0) > Number(latest.lastActiveAt || 0) ? tab : latest, null)
  return index.get(String(recentTab?.projectId || ''))
    || [...books.value].sort((a, b) => timestamp(b, 'updatedAt') - timestamp(a, 'updatedAt'))[0]
})
const visibleBooks = computed(() => {
  const term = search.value.trim().toLocaleLowerCase(uiLocale.value)
  return books.value.filter(book => (book.title || tr('未命名书稿')).toLocaleLowerCase(uiLocale.value).includes(term)).sort((a, b) => {
    if (sort.value === 'title') return (a.title || '').localeCompare(b.title || '', uiLocale.value, { numeric: true })
    const field = sort.value === 'created' ? 'createdAt' : 'updatedAt'
    return timestamp(b, field) - timestamp(a, field)
  })
})
const stopBooks = subscribeWritingBooks(({ books: nextBooks }) => { books.value = Array.isArray(nextBooks) ? nextBooks : [] })
async function clearSearch() { search.value = ''; await nextTick(); searchInput.value?.focus() }
onBeforeUnmount(() => { stopBooks(); settings.close() })
</script>

<style scoped>
.authoring-welcome { display: flex; flex: 1; min-height: 0; overflow: hidden; color: var(--text-primary); background: var(--surface-workbench-muted); font: 15px/1.5 var(--font-sans); }
.library-main { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; margin: 8px 12px 12px 0; padding: 32px clamp(28px, 3.5vw, 64px) 28px; border-radius: 20px; background: var(--surface-workbench); }
.library-heading { display: flex; align-items: center; justify-content: space-between; gap: 30px; }
.library-heading h1 { margin: 8px 0 10px; font-size: 28px; font-weight: 500; letter-spacing: -.025em; }
.library-heading p { color: var(--archive-ink-soft); font-size: 15px; margin: 0; line-height: 1.7; }
.library-return { display: flex; align-items: center; gap: 12px; max-width: 340px; padding: 12px 16px; border: 0; border-radius: 16px; background: var(--surface-workbench-muted); color: var(--text-primary); text-decoration: none; transition: background .16s ease; }
.library-return > span { min-width: 0; }
.library-return svg { flex-shrink: 0; color: var(--archive-olive); }
.library-return small { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.library-return strong { display: block; font-size: 15px; font-weight: 500; max-width: 230px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.library-toolbar { display: flex; align-items: center; gap: 16px; margin: 0 0 28px; padding-top: 0; border-top: 0; }
.library-section-title { margin: 0 auto 0 0; font-size: 20px; font-weight: 500; white-space: nowrap; }
.library-section-title span { font-size: 14px; font-weight: 400; color: var(--archive-ink-soft); margin-left: 8px; }
.library-search { display: flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid transparent; border-radius: 12px; background: var(--surface-workbench-muted); color: var(--text-secondary); }
.library-search input { min-width: 0; width: 150px; border: 0; background: transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--archive-ink); min-height: 42px; }
.library-view-controls { display: flex; align-items: center; gap: 14px; }
.library-view-controls select { min-height: 42px; border: 0; border-radius: 12px; background: transparent; color: var(--archive-ink-soft); font: inherit; font-size: 14px; padding: 8px; }
.library-view-toggle { display: flex; border: 0; border-radius: 12px; background: var(--surface-workbench-muted); padding: 3px; }
.library-view-toggle button { display: flex; align-items: center; gap: 6px; border: 0; border-radius: 10px; background: transparent; color: var(--archive-ink-soft); padding: 7px 12px; min-height: 36px; font: inherit; font-size: 14px; cursor: pointer; }
.library-view-toggle button[aria-pressed="true"] { color: var(--text-primary); background: var(--surface-workbench); box-shadow: 0 1px 3px var(--shadow); }
.library-books { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 190px)); gap: 32px 36px; padding: 0 0 40px; min-height: 380px; align-content: start; }
.library-books :deep(.book-card__open) { display: none; }
.library-books.is-list { grid-template-columns: 1fr; gap: 0; }
.is-list :deep(.book-card) { display: flex; align-items: center; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--hairline-soft); }
.is-list :deep(.book-card__cover) { width: 54px; height: 81px; flex: 0 0 54px; padding: 6px; }
.is-list :deep(.book-card__imprint) { display: none; }
.is-list :deep(.book-card__cover strong) { font-size: 9px; margin: 0; }
.is-list :deep(.book-card__details) { min-width: 0; }
.is-list :deep(.book-card__details h3) { margin-top: 0; }
.is-list :deep(.book-card__open) { display: block; margin: 0 0 0 auto; white-space: nowrap; font-size: 14px; }
.library-results { color: var(--archive-ink-soft); font-size: 15px; }
.library-button { min-height: 40px; border: 0; padding: 10px 18px; background: var(--surface-workbench-raised); color: var(--archive-ink); border-radius: 12px; font: inherit; cursor: pointer; }
.library-no-results { padding: 56px 0 72px; text-align: center; }
.library-no-results p { color: var(--archive-ink-soft); }
.library-empty { padding: 40px 0; background: transparent; }
.library-empty__label { color: var(--archive-olive); font-size: 14px; }
.library-empty h2 { margin: 18px 0; font: 500 32px/1.4 var(--font-sans); letter-spacing: -.02em; }
.library-empty > p { color: var(--archive-ink-soft); line-height: 1.9; font-size: 15px; }
.library-empty ol { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 28px 0 0; margin: 32px 0 0; list-style: none; border-top: 1px solid var(--hairline-soft); }
.library-empty li { display: grid; gap: 10px; }
.library-empty li span { color: var(--archive-ink-soft); font-size: 14px; line-height: 1.7; }
.library-footer { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--hairline-soft); padding-top: 16px; margin-top: 16px; color: var(--text-secondary); font-size: 12px; }
.library-footer p { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; line-height: 1.7; }
.library-footer button { color: var(--archive-olive); border: 0; background: none; font: inherit; min-height: 36px; cursor: pointer; }
.authoring-welcome :deep(:is(a, button, input, select, summary):focus-visible) { outline: 2px solid var(--archive-olive); outline-offset: 3px; }
@media (max-width: 1179px) { .library-toolbar { flex-wrap: wrap; } .library-section-title { width: 100%; } .library-search { margin-right: auto; } .library-return { max-width: 230px; padding-left: 16px; } .library-return strong { max-width: 150px; } }
@media (max-width: 820px) {
  .authoring-welcome { flex-direction: column; overflow-y: auto; }
  .library-main { flex: 0 0 auto; overflow-y: visible; margin: 0 8px 8px; border-radius: 20px; padding: 28px 24px; }
  .library-books { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 30px; }
  .library-empty ol { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .library-main { padding: 26px 16px; }
  .library-heading { align-items: flex-start; flex-direction: column; gap: 18px; }
  .library-heading h1 { font-size: 26px; }
  .library-return { max-width: none; padding: 12px 14px; width: 100%; }
  .library-return > span { flex: 1; }
  .library-return strong { max-width: 250px; }
  .library-toolbar { gap: 14px 8px; }
  .library-search { flex: 1 1 100%; }
  .library-search input { width: 100%; }
  .library-view-controls { width: 100%; justify-content: space-between; gap: 12px; }
  .library-view-controls select { max-width: 160px; padding: 4px; font-size: 14px; }
  .library-view-toggle button { font-size: 14px; padding: 7px 10px; }
  .library-view-toggle button svg { display: none; }
  .library-books { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 22px; }
  .library-books :deep(.book-card__cover strong) { font-size: 21px; }
  .is-list :deep(.book-card__cover strong) { font-size: 9px; }
  .is-list :deep(.book-card) { gap: 14px; }
  .library-empty { padding: 24px 0; }
  .library-empty h2 { font-size: 30px; }
}
@media (max-width: 760px), (pointer: coarse) {
  .library-search input, .library-view-controls select, .library-view-toggle button, .library-button, .library-footer button { min-height: 44px; }
}
</style>
