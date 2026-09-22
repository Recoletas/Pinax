<template>
  <router-link class="book-card" :to="{ name: 'authoring', query: { bookId: book.id } }" :aria-label="tr('打开《{value0}》', { value0: book.title || '未命名书稿' })">
    <div class="book-card__cover" aria-hidden="true">
      <strong>{{ book.title || tr('未命名书稿') }}</strong>
      <span class="book-card__imprint">{{ tr('PINAX · 原创书稿') }}</span>
    </div>
    <div class="book-card__details">
      <h3 :title="book.title">{{ book.title || tr('未命名书稿') }}</h3>
      <p>{{ tr('{value} 章', { value: book.chapters?.length || 0 }) }}<span aria-hidden="true">·</span>{{ tr('{value} 字', { value: wordCount.toLocaleString(uiLocale) }) }}</p>
      <span class="book-card__date">{{ modifiedLabel }}</span>
    </div>
    <span class="book-card__open" aria-hidden="true">{{ tr('打开书稿 ↗') }}</span>
  </router-link>
</template>

<script setup>
import { tr, uiLocale } from '../../i18n/index.js'
import { countWritingText } from '../../../shared/writingTextMetrics.js'
import { getChapterMarkdown } from '../../services/writing/writingDocumentSchema.js'
import { computed } from 'vue'
const props = defineProps({ book: { type: Object, required: true } })
const wordCount = computed(() => (props.book.chapters || []).reduce((sum, chapter) => {
  const count = countWritingText(getChapterMarkdown(chapter), props.book.manuscriptLanguage)
  return sum + (Number.isFinite(count) ? Math.max(0, count) : 0)
}, 0))
const modifiedLabel = computed(() => {
  const date = new Date(props.book.updatedAt || props.book.createdAt)
  return Number.isNaN(date.getTime()) ? tr('修改时间未知') : tr('{value0} 修改', { value0: date.toLocaleDateString(uiLocale.value) })
})
</script>

<style scoped>
.book-card { display: block; min-width: 0; color: var(--archive-ink); text-decoration: none; }
.book-card__cover { aspect-ratio: 2 / 3; padding: 22px; display: flex; flex-direction: column; background: url('/pinax-cover-fold.png') center / cover; border-radius: 3px 6px 6px 3px; color: #f6f3ea; box-shadow: 0 3px 8px #10223720; }
.book-card__imprint { font-size: 10px; letter-spacing: .12em; margin-top: 10px; color: inherit; opacity: .75; }
.book-card__cover strong { flex-shrink: 0; margin: 0; font: 600 25px/1.35 var(--font-serif); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.book-card__details h3 { margin: 18px 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 20px; font-weight: 600; }
.book-card__details p { margin: 0 0 8px; font-size: 16px; color: var(--archive-ink-soft); }
.book-card__details p span { padding: 0 6px; }
.book-card__date { font-size: 14px; color: var(--archive-ink-soft); }
.book-card__open { display: block; margin-top: 14px; color: var(--archive-olive); font-size: 15px; }
.book-card:hover .book-card__cover { box-shadow: 0 6px 18px #10223735; }
.book-card:focus-visible { outline: 2px solid var(--archive-olive); outline-offset: 6px; border-radius: 4px; }
@media (max-width: 520px) {
  .book-card__cover { padding: 16px; }
  .book-card__cover strong { font-size: 22px; }
}
</style>
