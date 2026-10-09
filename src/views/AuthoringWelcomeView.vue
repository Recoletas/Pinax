<template>
  <div class="authoring-welcome">
    <LibrarySidebar :books="books" :recent-book-id="recentBook?.id || ''" @settings="settings.open" />
    <main class="library-main">
      <section class="library-heading" aria-labelledby="library-title">
        <div><h1 id="library-title">{{ tr('我的作品') }}</h1><p v-if="!books.length">{{ tr('从第一本书开始，把想法写成故事。') }}</p></div>
      </section>
      <p v-if="recent.persistenceNotice" class="library-notice" role="status">{{ tr(recent.persistenceNotice) }}</p>
      <p v-if="openNotice" class="library-notice" role="status">{{ tr(openNotice) }}</p>
      <LibraryQuickActions :empty="!books.length" @backup="settings.open('storage')" />
      <LibraryRecentWork v-if="books.length" :entries="recent.resolvedEntries" :continue-entry="recent.continueEntry" :opening-key="openingKey" @open="openRecent" />
      <template v-if="books.length">
        <div class="library-toolbar">
          <h2 class="library-section-title">{{ tr('全部作品') }}<span>{{ books.length }}</span></h2>
          <label class="library-search"><WorkbenchIcon name="search" :size="18" /><input ref="searchInput" v-model="search" type="search" :placeholder="tr(&quot;搜索书名&quot;)" :aria-label="tr(&quot;搜索书名&quot;)"></label>
          <div class="library-view-controls"><select v-model="sort" :aria-label="tr(&quot;书稿排序&quot;)"><option value="used">{{ tr('最近使用') }}</option><option value="updated">{{ tr('最近修改') }}</option><option value="title">{{ tr('书名排序') }}</option></select><div class="library-view-toggle" role="group" :aria-label="tr(&quot;书库视图&quot;)"><button type="button" :aria-pressed="view === 'grid'" @click="view = 'grid'"><WorkbenchIcon name="grid" :size="16" />{{ tr('书架') }}</button><button type="button" :aria-pressed="view === 'list'" @click="view = 'list'"><WorkbenchIcon name="list" :size="16" />{{ tr('列表') }}</button></div></div>
        </div>
        <p v-if="search.trim()" class="library-results" role="status">{{ tr('找到 {length} 本书稿', { length: visibleBooks.length }) }}</p>
        <section v-if="visibleBooks.length" class="library-books" :class="{ 'is-list': view === 'list' }" :aria-label="tr(&quot;书稿&quot;)"><BookLibraryCard v-for="book in visibleBooks" :key="book.id" :book="book" data-test="library-book" /></section>
        <div v-else class="library-no-results"><h2>{{ tr('没有找到这本书') }}</h2><p>{{ tr('试试其他书名，或清除搜索查看全部作品。') }}</p><button type="button" class="library-button" @click="clearSearch">{{ tr('清除搜索') }}</button></div>
      </template>
      <section v-else class="library-empty" aria-labelledby="library-empty-title"><h2 id="library-empty-title">{{ tr('还没有作品') }}</h2><p>{{ tr('开始写作、和助手构思，或导入已有的 TXT / Markdown 书稿。') }}</p></section>
    </main>
    <SettingsPopup v-if="settings.isOpen.value" />
  </div>
</template>

<script setup>
import { tr, uiLocale } from '../i18n/index.js'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsPopup } from '../composables/useSettingsPopup.js'
import { loadWritingBooks, subscribeWritingBooks } from '../services/writing/writingBooksRepository.js'
import SettingsPopup from '../components/workbench/SettingsPopup.vue'
import BookLibraryCard from '../components/authoring/BookLibraryCard.vue'
import LibrarySidebar from '../components/authoring/LibrarySidebar.vue'
import LibraryQuickActions from '../components/authoring/LibraryQuickActions.vue'
import LibraryRecentWork from '../components/authoring/LibraryRecentWork.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import { useWorkspaceRecentStore } from '../stores/workspaceRecentStore.js'
const settings = useSettingsPopup()
const router = useRouter()
const recent = useWorkspaceRecentStore()
recent.hydrate()
const books = ref(loadWritingBooks())
const search = ref('')
const searchInput = ref(null)
const sort = ref('used')
const view = ref('grid')
const openingKey = ref('')
const openNotice = ref('')
let openSequence = 0
const timestamp = (book, field) => Date.parse(book[field] || book.createdAt) || 0
const recentBook = computed(() => {
  return books.value.find(book => String(book.id) === recent.entries[0]?.bookId)
    || [...books.value].sort((a, b) => timestamp(b, 'updatedAt') - timestamp(a, 'updatedAt'))[0]
})
const visibleBooks = computed(() => {
  const term = search.value.trim().toLocaleLowerCase(uiLocale.value)
  return books.value.filter(book => (book.title || tr('未命名书稿')).toLocaleLowerCase(uiLocale.value).includes(term)).sort((a, b) => {
    if (sort.value === 'title') return (a.title || '').localeCompare(b.title || '', uiLocale.value, { numeric: true })
    if (sort.value === 'used') {
      const used = (recent.bookLastUsedAt[String(b.id)] || 0) - (recent.bookLastUsedAt[String(a.id)] || 0)
      if (used) return used
    }
    return timestamp(b, 'updatedAt') - timestamp(a, 'updatedAt')
  })
})
const stopBooks = subscribeWritingBooks(({ books: nextBooks }) => { books.value = Array.isArray(nextBooks) ? nextBooks : [] })
async function openRecent(entry) {
  const sequence = ++openSequence
  openingKey.value = entry.key
  openNotice.value = ''
  try {
    const resolved = await recent.resolveForOpen(entry)
    if (sequence !== openSequence || router.currentRoute.value.name !== 'welcome') return
    if (!resolved.available || !books.value.some(book => String(book.id) === resolved.bookId)) {
      openNotice.value = resolved.reason === 'lookup-failed' ? '暂时无法读取这个位置，请稍后再试。' : '上次打开的位置已不存在，请选择其他工作。'
      return
    }
    const failure = await router.push(resolved.route)
    if (failure && sequence === openSequence) openNotice.value = '这次没有离开首页，请先处理当前的导航提示。'
  } catch {
    if (sequence === openSequence) openNotice.value = '这个位置暂时无法打开，请稍后再试。'
  } finally {
    if (sequence === openSequence) openingKey.value = ''
  }
}
async function clearSearch() { search.value = ''; await nextTick(); searchInput.value?.focus() }
onBeforeUnmount(() => { openSequence += 1; stopBooks(); settings.close() })
</script>

<style scoped>
.authoring-welcome { display: flex; flex: 1; min-height: 0; overflow: hidden; color: var(--text-primary); background: var(--surface-workbench); font: 15px/1.5 var(--font-sans); }
.library-main { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; margin: 0; padding: 28px clamp(28px, 3.5vw, 64px); border: 0; border-inline-start: 1px solid var(--hairline-soft); border-radius: 0; background: var(--surface-workbench); }
.library-heading { display: flex; align-items: center; justify-content: space-between; gap: 30px; }
.library-heading h1 { margin: 8px 0 10px; font-size: 28px; font-weight: 500; letter-spacing: -.025em; }
.library-heading p { color: var(--archive-ink-soft); font-size: 15px; margin: 0; line-height: 1.7; }
.library-notice { margin: 12px 0; color: var(--signal-warm); font-size: 13px; line-height: 1.7; }
.library-toolbar { display: flex; align-items: center; gap: 16px; margin: 0 0 16px; padding-top: 0; border-top: 0; }
.library-section-title { margin: 0 auto 0 0; font-size: 20px; font-weight: 500; white-space: nowrap; }
.library-section-title span { font-size: 14px; font-weight: 400; color: var(--archive-ink-soft); margin-left: 8px; }
.library-search { display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 0; border-bottom: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; color: var(--text-secondary); }
.library-search input { min-width: 0; width: 150px; border: 0; background: transparent; padding: 10px 0; font: inherit; font-size: 14px; color: var(--archive-ink); min-height: 42px; }
.library-view-controls { display: flex; align-items: center; gap: 14px; }
.library-view-controls select { min-height: 42px; border: 0; border-radius: 0; background: transparent; color: var(--archive-ink-soft); font: inherit; font-size: 14px; padding: 8px; }
.library-view-toggle { display: flex; border: 0; border-radius: 0; background: transparent; padding: 0; }
.library-view-toggle button { display: flex; align-items: center; gap: 6px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--archive-ink-soft); padding: 7px 12px; min-height: 36px; font: inherit; font-size: 14px; cursor: pointer; }
.library-view-toggle button[aria-pressed="true"] { color: var(--text-primary); border-bottom-color: var(--text-primary); background: transparent; box-shadow: none; }
.library-view-toggle button:hover { background: var(--nav-hover); }
.library-books { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 190px)); gap: 28px 32px; padding: 8px 0 24px; align-content: start; }
.library-books :deep(.book-card__open) { display: none; }
.library-books.is-list { grid-template-columns: 1fr; gap: 0; }
.is-list :deep(.book-card) { display: block; min-width: 0; padding: 14px 0; border: 0; border-bottom: 1px solid var(--hairline-soft); border-radius: 0; background: transparent; box-shadow: none; }
.is-list :deep(.book-card__cover), .is-list :deep(.book-card__open) { display: none; }
.is-list :deep(.book-card__details) { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px 24px; min-width: 0; }
.is-list :deep(.book-card__details h3) { min-width: 0; margin: 0; font-size: 15px; }
.is-list :deep(.book-card__details p) { margin: 0; white-space: nowrap; }
.is-list :deep(.book-card__date) { justify-self: end; white-space: nowrap; text-align: end; }
.is-list :deep(.book-card:hover .book-card__details h3) { color: var(--accent); }
.is-list :deep(.book-card:focus-visible) { border-radius: 0; outline-offset: 2px; }
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
.authoring-welcome :deep(:is(a, button, input, select, summary):focus-visible) { outline: 2px solid var(--archive-olive); outline-offset: 3px; }
@media (max-width: 1179px) { .library-toolbar { flex-wrap: wrap; } .library-section-title { width: 100%; } .library-search { margin-right: auto; } .library-return { max-width: 230px; padding-left: 16px; } .library-return strong { max-width: 150px; } }
@media (max-width: 820px) {
  .authoring-welcome { flex-direction: column; overflow-y: auto; }
  .library-main { flex: 0 0 auto; overflow-y: visible; margin: 0; border-inline-start: 0; border-radius: 0; padding: 28px 24px; }
  .library-books { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 30px; }
  .library-empty ol { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .library-main { padding: 26px 16px; }
  .library-heading { align-items: flex-start; flex-direction: column; gap: 18px; }
  .library-heading h1 { font-size: 26px; }
  .library-toolbar { gap: 14px 8px; }
  .library-search { flex: 1 1 100%; }
  .library-search input { width: 100%; }
  .library-view-controls { width: 100%; justify-content: space-between; gap: 12px; }
  .library-view-controls select { max-width: 160px; padding: 4px; font-size: 14px; }
  .library-view-toggle button { font-size: 14px; padding: 7px 10px; }
  .library-view-toggle button svg { display: none; }
  .library-books { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 22px; }
  .library-books :deep(.book-card__cover strong) { font-size: 21px; }
  .library-empty { padding: 24px 0; }
  .library-empty h2 { font-size: 30px; }
}
@media (max-width: 760px), (pointer: coarse) {
  .library-search input, .library-view-controls select, .library-view-toggle button, .library-button { min-height: 44px; }
}
@media (max-width: 760px) {
  .is-list :deep(.book-card__details) { grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 4px 12px; }
  .is-list :deep(.book-card__details h3) { grid-column: 1 / -1; }
  .is-list :deep(.book-card__details p) { white-space: normal; overflow-wrap: anywhere; }
}
</style>
