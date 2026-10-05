<template>
  <div
    v-if="visible"
    class="settings-return-authoring"
    role="group"
    :aria-label="tr('作品导航')"
  >
    <button type="button" class="settings-return-authoring__action" data-test="settings-return-authoring" :aria-label="tr('回到正文')" :title="tr('回到正文')" @click="openAuthoring()"><WorkbenchIcon name="arrow-left" :size="17" /><span>{{ tr('正文') }}</span></button>
    <button type="button" class="settings-return-authoring__action" data-test="settings-open-assistant" :aria-label="tr('写作助手')" :title="tr('写作助手')" @click="openAuthoring('assistant')"><WorkbenchIcon name="message-square" :size="17" /><span>{{ tr('助手') }}</span></button>
  </div>
</template>

<script setup>
// 正文和助手共用同书 Authoring 标签。显式展示意图覆盖旧 view，
// 原章/选区/滚动仍由 Authoring 的 volatile ledger 恢复。
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceTabsStore } from '../../stores/workspaceTabsStore'
import { loadWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { openOrFocusWorkspaceTab } from '../../services/workspace/workspaceRouteAdapter.js'

const props = defineProps({
  worldbookId: { type: String, default: '' }
})

const route = useRoute()
const router = useRouter()
const workspaceTabsStore = useWorkspaceTabsStore()

const bookId = computed(() => String(route.query.bookId || ''))
const visible = computed(() => Boolean(bookId.value))

async function openAuthoring(view = '') {
  const wanted = bookId.value
  if (!wanted) return
  const tab = workspaceTabsStore.tabs.find((item) => (
    item.scope === 'project' && item.surface === 'authoring' && String(item.projectId) === wanted
  ))
  const storedChapterId = tab?.route?.query?.chapterId || tab?.restoreState?.chapterId
  const book = loadWritingBooks().find(item => String(item.id) === wanted)
  const chapterId = typeof storedChapterId === 'string'
    && book?.chapters?.some(chapter => String(chapter.id) === storedChapterId) ? storedChapterId : ''
  const bookContext = workspaceTabsStore.bookIndex?.[wanted]
  // 标签被关闭过时，由 Authoring 恢复本书最近章节；绝不沿用另一书的定位。
  await openOrFocusWorkspaceTab(workspaceTabsStore, router, {
    scope: 'project',
    surface: 'authoring',
    projectId: wanted,
    worldbookId: String(bookContext ? (bookContext.worldbookId || '') : props.worldbookId)
  }, {
    route: {
      name: 'authoring',
      query: { bookId: wanted, ...(chapterId ? { chapterId } : {}), ...(view === 'assistant' ? { view } : {}) }
    }
  })
}
</script>

<style scoped>
.settings-return-authoring { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; }
.settings-return-authoring__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  gap: 6px;
  min-width: var(--workspace-control-height, 36px);
  min-height: var(--workspace-control-height, 36px);
  padding: 6px 8px;
  border: 0;
  border-radius: var(--workspace-radius, 10px);
  background: transparent;
  color: var(--text-secondary);
  font: 500 13px/1.4 var(--font-sans);
  cursor: pointer;
  white-space: nowrap;
  transition: color .16s ease, background .16s ease;
}
.settings-return-authoring__action:hover { color: var(--text-primary); background: var(--nav-hover); }
.settings-return-authoring__action:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 760px), (pointer: coarse) { .settings-return-authoring__action { min-width: 44px; min-height: 44px; } }
@media (min-width: 761px) and (max-width: 1100px) { .settings-return-authoring__action span { display: none; } }
@media (max-width: 760px) { .settings-return-authoring__action > svg { display: none; } }
@media (prefers-reduced-motion: reduce) { .settings-return-authoring__action { transition: none; } }
</style>
