<template>
  <button
    v-if="visible"
    type="button"
    class="settings-return-authoring control-quiet"
    data-test="settings-return-authoring"
    @click="returnToManuscript"
  ><WorkbenchIcon name="arrow-left" :size="15" />回到正文</button>
</template>

<script setup>
// 设定三页共用「回到正文」（联动闭环 L4）：只激活既有 Authoring 标签，
// 不重复创建页面实例；原章/选区/滚动的恢复由 Authoring 的 volatile ledger
// watcher 消费（fail-closed），这里不复制恢复逻辑。
import { computed } from 'vue'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceTabsStore } from '../../stores/workspaceTabsStore'
import { activateWorkspaceTab, openOrFocusWorkspaceTab } from '../../services/workspace/workspaceRouteAdapter.js'

const props = defineProps({
  worldbookId: { type: String, default: '' }
})

const route = useRoute()
const router = useRouter()
const workspaceTabsStore = useWorkspaceTabsStore()

const bookId = computed(() => String(route.query.bookId || ''))
const visible = computed(() => Boolean(bookId.value))

async function returnToManuscript() {
  const wanted = bookId.value
  if (!wanted) return
  const tab = workspaceTabsStore.tabs.find((item) => (
    item.scope === 'project' && item.surface === 'authoring' && String(item.projectId) === wanted
  ))
  if (tab) {
    await activateWorkspaceTab(workspaceTabsStore, router, tab.id)
    return
  }
  // Authoring 标签被关闭过：重建一个；章节由 Authoring 自己的最近选择恢复。
  await openOrFocusWorkspaceTab(workspaceTabsStore, router, {
    scope: 'project',
    surface: 'authoring',
    projectId: wanted,
    worldbookId: props.worldbookId || String(workspaceTabsStore.bookIndex?.[wanted]?.worldbookId || '')
  }, {
    route: { name: 'authoring', query: { bookId: wanted } }
  })
}
</script>

<style scoped>
.settings-return-authoring {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.settings-return-authoring:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

@media (max-width: 720px) {
  .settings-return-authoring {
    --control-hit-min: 48px;
    min-height: 44px;
  }
}
</style>
