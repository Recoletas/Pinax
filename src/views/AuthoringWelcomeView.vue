<template>
  <div class="authoring-welcome">
    <LibrarySidebar :books="books" @settings="settings.open" />
    <main class="library-main">
      <section class="library-heading" aria-labelledby="library-title">
        <div><span class="library-kicker">创作空间</span><h1 id="library-title">我的作品</h1><p>{{ books.length ? '每一个故事，都值得认真写下去。' : '从第一本书开始，把想法写成故事。' }}</p></div>
        <router-link v-if="recentBook" class="library-return" data-test="welcome-continue-book" :to="{ name: 'authoring', query: { bookId: recentBook.id } }"><WorkbenchIcon name="pencil" :size="21" /><span><small>继续最近的书稿</small><strong>{{ recentBook.title || '未命名书稿' }}</strong></span><WorkbenchIcon name="arrow-right" :size="20" /></router-link>
      </section>
      <LibraryQuickActions @backup="settings.open('storage')" />
      <template v-if="books.length">
        <div class="library-toolbar">
          <h2 class="library-section-title">全部作品 <span>{{ books.length }}</span></h2>
          <label class="library-search"><WorkbenchIcon name="search" :size="18" /><input ref="searchInput" v-model="search" type="search" placeholder="搜索书名" aria-label="搜索书名"></label>
          <div class="library-view-controls"><select v-model="sort" aria-label="书稿排序"><option value="updated">最近修改</option><option value="title">书名排序</option><option value="created">最近创建</option></select><div class="library-view-toggle" role="group" aria-label="书库视图"><button type="button" :aria-pressed="view === 'grid'" @click="view = 'grid'"><WorkbenchIcon name="grid" :size="16" />书架</button><button type="button" :aria-pressed="view === 'list'" @click="view = 'list'"><WorkbenchIcon name="list" :size="16" />列表</button></div></div>
        </div>
        <p v-if="search.trim()" class="library-results" role="status">找到 {{ visibleBooks.length }} 本书稿</p>
        <section v-if="visibleBooks.length" class="library-books" :class="{ 'is-list': view === 'list' }" aria-label="书稿"><BookLibraryCard v-for="book in visibleBooks" :key="book.id" :book="book" data-test="library-book" /></section>
        <div v-else class="library-no-results"><h2>没有找到这本书</h2><p>试试其他书名，或清除搜索查看全部作品。</p><button type="button" class="library-button" @click="clearSearch">清除搜索</button></div>
      </template>
      <section v-else class="library-empty" aria-labelledby="library-empty-title"><span class="library-empty__label">你的第一份书稿</span><h2 id="library-empty-title">空白的一页，<br>是故事的开始。</h2><p>新建一本书直接写正文，或导入已有的 TXT / Markdown。<br>不必先搭建世界，也不用先配置 AI。</p><ol><li><strong>写下第一场</strong><span>从眼前正在发生的事开始。</span></li><li><strong>放入人物</strong><span>需要时，再补充角色和设定。</span></li><li><strong>试一条岔路</strong><span>推演另一种走法，决定是否写回。</span></li></ol></section>
      <footer class="library-footer"><WorkbenchIcon name="archive" :size="16" /><p>作品保存在当前浏览器，暂不跨设备同步。<button type="button" @click="settings.open('storage')">导出备份</button></p></footer>
    </main>
    <SettingsPopup v-if="settings.isOpen.value" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useSettingsPopup } from '../composables/useSettingsPopup.js'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import SettingsPopup from '../components/workbench/SettingsPopup.vue'
import BookLibraryCard from '../components/authoring/BookLibraryCard.vue'
import LibrarySidebar from '../components/authoring/LibrarySidebar.vue'
import LibraryQuickActions from '../components/authoring/LibraryQuickActions.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
const settings = useSettingsPopup()
const books = ref(loadWritingBooks())
const search = ref('')
const searchInput = ref(null)
const sort = ref('updated')
const view = ref('grid')
const timestamp = (book, field) => Date.parse(book[field] || book.createdAt) || 0
const recentBook = computed(() => [...books.value].sort((a, b) => timestamp(b, 'updatedAt') - timestamp(a, 'updatedAt'))[0])
const visibleBooks = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('zh-CN')
  return books.value.filter(book => (book.title || '未命名书稿').toLocaleLowerCase('zh-CN').includes(term)).sort((a, b) => {
    if (sort.value === 'title') return (a.title || '').localeCompare(b.title || '', 'zh-CN', { numeric: true })
    const field = sort.value === 'created' ? 'createdAt' : 'updatedAt'
    return timestamp(b, field) - timestamp(a, field)
  })
})
const stopBooks = subscribeWritingBooks(({ books: nextBooks }) => { books.value = Array.isArray(nextBooks) ? nextBooks : [] })
async function clearSearch() { search.value = ''; await nextTick(); searchInput.value?.focus() }
onBeforeUnmount(() => { stopBooks(); settings.close() })
</script>

<style scoped>
.authoring-welcome { display: flex; min-height: calc(var(--app-viewport-height, 100vh) - 49px); color: var(--archive-ink); background: var(--archive-paper-soft); font-size: 17px; }
.library-main { flex: 1; min-width: 0; padding: 32px clamp(28px, 3.5vw, 64px) 28px; }
.library-heading { display: flex; align-items: center; justify-content: space-between; gap: 30px; }
.library-kicker { color: var(--archive-ink-soft); font-size: 13px; letter-spacing: .12em; }
.library-heading h1 { margin: 8px 0 10px; font-size: 30px; font-weight: 600; letter-spacing: -.03em; }
.library-heading p { color: var(--archive-ink-soft); font-size: 16px; margin: 0; line-height: 1.7; }
.library-return { display: flex; align-items: center; gap: 16px; max-width: 340px; padding: 14px 0 14px 26px; border-left: 1px solid var(--archive-paper-strong); color: var(--archive-ink); text-decoration: none; }
.library-return > span { min-width: 0; }
.library-return svg { flex-shrink: 0; color: var(--archive-olive); }
.library-return small { display: block; font-size: 13px; color: var(--archive-ink-soft); margin-bottom: 7px; }
.library-return strong { display: block; font-size: 18px; max-width: 230px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.library-toolbar { display: flex; align-items: center; gap: 16px; margin: 0 0 24px; padding-top: 20px; border-top: 1px solid var(--archive-paper-strong); }
.library-section-title { margin: 0 auto 0 0; font-size: 19px; font-weight: 600; white-space: nowrap; }
.library-section-title span { font-size: 14px; font-weight: 400; color: var(--archive-ink-soft); margin-left: 8px; }
.library-search { display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--archive-paper-strong); border-radius: 5px; color: var(--archive-ink-soft); }
.library-search input { min-width: 0; width: 150px; border: 0; background: transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--archive-ink); min-height: 42px; }
.library-view-controls { display: flex; align-items: center; gap: 14px; }
.library-view-controls select { min-height: 42px; border: 0; background: var(--archive-paper-soft); color: var(--archive-ink-soft); font: inherit; font-size: 14px; padding: 8px; }
.library-view-toggle { display: flex; border: 1px solid var(--archive-paper-strong); border-radius: 5px; padding: 3px; }
.library-view-toggle button { display: flex; align-items: center; gap: 6px; border: 0; border-radius: 3px; background: transparent; color: var(--archive-ink-soft); padding: 7px 12px; min-height: 34px; font: inherit; font-size: 14px; cursor: pointer; }
.library-view-toggle button[aria-pressed="true"] { color: var(--archive-olive); background: color-mix(in srgb, var(--archive-olive) 9%, transparent); }
.library-books { display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 208px)); gap: 36px 38px; padding: 0 0 40px; min-height: 430px; align-content: start; }
.library-books :deep(.book-card__details h3) { font-size: 18px; margin-top: 15px; }
.library-books :deep(.book-card__details p) { font-size: 14px; }
.library-books :deep(.book-card__date) { font-size: 12px; }
.library-books :deep(.book-card__open) { display: none; }
.library-books.is-list { grid-template-columns: 1fr; gap: 0; }
.is-list :deep(.book-card) { display: flex; align-items: center; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--archive-paper-strong); }
.is-list :deep(.book-card__cover) { width: 54px; height: 81px; flex: 0 0 54px; padding: 6px; }
.is-list :deep(.book-card__imprint) { display: none; }
.is-list :deep(.book-card__cover strong) { font-size: 9px; margin: 0; }
.is-list :deep(.book-card__details) { min-width: 0; }
.is-list :deep(.book-card__details h3) { margin-top: 0; }
.is-list :deep(.book-card__open) { display: block; margin: 0 0 0 auto; white-space: nowrap; font-size: 14px; }
.library-results { color: var(--archive-ink-soft); font-size: 15px; }
.library-button { border: 1px solid var(--archive-paper-strong); padding: 12px 18px; background: var(--archive-paper-soft); color: var(--archive-ink); border-radius: 5px; font: inherit; cursor: pointer; }
.library-no-results { padding: 56px 0 72px; text-align: center; }
.library-no-results p { color: var(--archive-ink-soft); }
.library-empty { padding: 40px; background: var(--archive-paper); border-radius: 6px; }
.library-empty__label { color: var(--archive-olive); font-size: 14px; }
.library-empty h2 { margin: 18px 0; font: 600 42px/1.4 var(--font-serif); }
.library-empty > p { color: var(--archive-ink-soft); line-height: 1.9; font-size: 16px; }
.library-empty ol { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 28px 0 0; margin: 32px 0 0; list-style: none; border-top: 1px solid var(--archive-paper-strong); }
.library-empty li { display: grid; gap: 10px; }
.library-empty li span { color: var(--archive-ink-soft); font-size: 14px; line-height: 1.7; }
.library-footer { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--archive-paper-strong); padding-top: 20px; margin-top: 16px; color: var(--archive-ink-soft); font-size: 13px; }
.library-footer p { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; line-height: 1.7; }
.library-footer button { color: var(--archive-olive); border: 0; background: none; font: inherit; min-height: 36px; cursor: pointer; }
.authoring-welcome :deep(:is(a, button, input, select, summary):focus-visible) { outline: 2px solid var(--archive-olive); outline-offset: 3px; }
@media (max-width: 1179px) { .library-toolbar { flex-wrap: wrap; } .library-section-title { width: 100%; } .library-search { margin-right: auto; } .library-return { max-width: 230px; padding-left: 16px; } .library-return strong { max-width: 150px; } }
@media (max-width: 820px) {
  .authoring-welcome { flex-direction: column; }
  .library-main { padding: 28px 24px; }
  .library-books { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 30px; }
  .library-empty ol { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .library-main { padding: 26px 16px; }
  .library-heading { align-items: flex-start; flex-direction: column; gap: 18px; }
  .library-heading h1 { font-size: 30px; }
  .library-return { max-width: none; border-left: 0; border-bottom: 1px solid var(--archive-paper-strong); padding: 0 0 14px; width: 100%; }
  .library-return > span { flex: 1; }
  .library-return strong { max-width: 250px; }
  .library-toolbar { gap: 14px 8px; }
  .library-search { flex: 1; }
  .library-search input { width: 100%; }
  .library-view-controls { gap: 4px; }
  .library-view-controls select { max-width: 96px; padding: 4px; font-size: 13px; }
  .library-view-toggle button { font-size: 13px; padding: 7px 8px; }
  .library-view-toggle button svg { display: none; }
  .library-books { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 22px; }
  .library-books :deep(.book-card__cover strong) { font-size: 21px; }
  .is-list :deep(.book-card__cover strong) { font-size: 9px; }
  .is-list :deep(.book-card) { gap: 14px; }
  .library-empty { padding: 24px; }
  .library-empty h2 { font-size: 34px; }
}
</style>
