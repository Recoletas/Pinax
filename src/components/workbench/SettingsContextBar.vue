<template>
  <header class="settings-context-bar" data-test="settings-context-bar" :data-worldbook-id="selectedId" :data-worldbook-name="activeWorldbook?.name || ''" :data-project-locked="projectLocked">
    <div class="context-main">
      <span class="context-kicker">{{ tr(projectLocked ? (projectIdentity ? '当前作品' : '关联资料') : '世界书') }}</span>
      <select
        v-if="projectLocked && projectIdentity"
        class="context-worldbook-select context-book-select"
        data-test="settings-book-switcher"
        :value="currentBookId"
        :disabled="disabled || switchingBook"
        :aria-label="tr('切换作品')"
        :title="projectLabel || tr('切换作品')"
        @focus="refreshBooks"
        @change="switchBook"
      >
        <option v-if="!books.some(book => String(book.id) === currentBookId)" :value="currentBookId" disabled>{{ projectLabel || tr('当前作品') }}</option>
        <option v-for="book in books" :key="book.id" :value="String(book.id)">{{ book.title || tr('未命名书稿') }}</option>
      </select>
      <select
        v-else-if="worldbooksIndex.length"
        class="context-worldbook-select"
        :value="selectedId"
        :disabled="disabled || projectLocked"
        :aria-label="tr(projectLocked ? '当前书稿关联的世界书（回工作台更换关联）' : '选择当前世界书')"
        :title="projectLocked ? tr('世界书由《{book}》的关联决定；回工作台可更换关联', { book: projectLabel }) : ''"
        @change="onChange"
      >
        <option v-for="worldbook in worldbooksIndex" :key="worldbook.id" :value="worldbook.id">
          {{ worldbook.name }}
        </option>
      </select>
      <strong v-else class="context-worldbook-empty">{{ activeWorldbook?.name || tr(emptyLabel) }}</strong>
      <span v-if="routeMismatchNotice" class="context-mismatch" role="status" :title="tr(routeMismatchNotice)">{{ tr(routeMismatchNotice) }}</span>
    </div>

    <div v-if="showMeta" class="context-meta" :aria-label="tr('设定页信息')">
      <span class="context-meta-item"><i aria-hidden="true"></i>{{ metaLabel }}</span>
      <span class="context-meta-divider" aria-hidden="true"></span>
      <span class="context-meta-item">{{ tr(saveLabel) }}</span>
    </div>

    <slot name="actions" />
  </header>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { tr } from '../../i18n/index.js'

const props = defineProps({
  worldbooksIndex: { type: Array, default: () => [] },
  activeWorldbook: { type: Object, default: null },
  modelValue: { type: [String, Number], default: '' },
  metaLabel: { type: String, default: '' },
  saveLabel: { type: String, default: '自动保存' },
  emptyLabel: { type: String, default: '尚未选择世界书' },
  showMeta: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // 项目模式：选择器切换作品，世界书由所选书稿的关联决定。
  projectLabel: { type: String, default: '' },
  projectLocked: { type: Boolean, default: false },
  projectIdentity: { type: Boolean, default: true },
  routeMismatchNotice: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'change'])

const route = useRoute()
const router = useRouter()
const books = ref(loadWritingBooks())
const switchingBook = ref(false)
const currentBookId = computed(() => String(route.query.bookId || ''))
function refreshBooks() { books.value = loadWritingBooks() }
async function switchBook(event) {
  const requested = String(event.target.value)
  refreshBooks()
  const book = books.value.find(item => String(item.id) === requested)
  if (!book || requested === currentBookId.value) {
    event.target.value = currentBookId.value
    return
  }
  switchingBook.value = true
  try {
    // Retain the settings section, never carry another book's entry/place/return locator.
    const query = { bookId: requested }
    if (book.worldbookId) query.worldbookId = String(book.worldbookId)
    await router.push({ name: route.name, query })
  } finally {
    event.target.value = currentBookId.value
    switchingBook.value = false
  }
}

const selectedId = computed(() => String(props.modelValue || props.activeWorldbook?.id || ''))
const metaLabel = computed(() => props.metaLabel || tr('世界书 {count} 本', { count: props.worldbooksIndex.length }))

function onChange(event) {
  const value = event.target.value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.settings-context-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  min-height: var(--workspace-toolbar-height, 52px);
  padding: 6px 20px;
  flex-shrink: 0;
}
.context-main, .context-meta { display: flex; align-items: center; min-width: 0; }
.context-main { flex: 1; gap: 8px; }
.context-kicker { color: var(--text-secondary); font: 12px/1.4 var(--font-sans); white-space: nowrap; }
.context-worldbook-select, .context-worldbook-empty {
  max-width: min(42vw, 380px);
  min-width: 0;
  color: var(--text-primary);
  font: 500 14px/1.5 var(--font-sans);
}
.context-worldbook-select {
  box-sizing: border-box;
  height: var(--workspace-control-height, 36px);
  min-height: var(--workspace-control-height, 36px);
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--workspace-radius, 10px);
  background: transparent;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease;
}
.context-worldbook-select:hover:not(:disabled) { background: var(--surface-workbench-muted); }
.context-worldbook-select:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; background: var(--surface-workbench-muted); }
.context-worldbook-select:disabled { cursor: default; opacity: .65; }
.context-book-select { flex: 1; width: 100%; text-overflow: ellipsis; }
.context-worldbook-empty { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.context-mismatch { max-width: 30vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: 12px/1.4 var(--font-sans); }
.context-meta { gap: 10px; color: var(--text-secondary); font: 12px/1.4 var(--font-sans); white-space: nowrap; }
.context-meta-divider { width: 3px; height: 3px; border-radius: 50%; background: var(--text-muted); }
.context-meta-item i { display: inline-block; width: 5px; height: 5px; margin-right: 6px; border-radius: 50%; background: var(--success); }
@media (max-width: 760px), (pointer: coarse) { .context-worldbook-select { height: 44px; min-height: 44px; } }
@media (max-width: 760px) { .settings-context-bar { padding: 6px 12px; gap: 8px; } .context-worldbook-select { max-width: 100%; } .context-kicker { display: none; } .context-meta-divider, .context-meta-item:last-child { display: none; } }
@media (prefers-reduced-motion: reduce) { .context-worldbook-select { transition: none; } }
</style>
