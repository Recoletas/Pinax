<script setup>
/**
 * N-B×N-A：资料一级页面（settings/sources）。
 *
 * 数据链：route.query.bookId → useSettingsProjectContext() → 项目绑定世界书。
 * 页面持有完整世界书快照，不读取其他项目的全局 active 状态。
 * 导航：SettingsContextBar + SettingsSectionNav + SettingsReturnToManuscript。
 * 底层归档/按书绑定/解析/备份全部复用 N-A 已有实现。
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tr } from '../i18n'
import { useWorldStore } from '../stores/worldStore'
import { useSettingsProjectContext } from '../composables/useSettingsProjectContext'
import WorldbookSourcesPanel from '../components/worldbook/WorldbookSourcesPanel.vue'
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import SettingsWorkspaceHeader from '../components/workbench/SettingsWorkspaceHeader.vue'
import SettingsReturnToManuscript from '../components/workbench/SettingsReturnToManuscript.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'

const route = useRoute()
const worldStore = useWorldStore()
onMounted(() => worldStore.loadWorldbooksIndex())

const bookId = computed(() => String(route.query.bookId || ''))
const worldbooksIndex = computed(() => worldStore.worldbooksIndex)
const { context, worldbook: activeWorldbook, loading: contextLoading, loadError, refresh } = useSettingsProjectContext({ worldStore })
const selectedWorldbookId = computed(() => context.value?.worldbookId || '')
const sourceCount = computed(() => (Array.isArray(activeWorldbook.value?.sourceDocuments) ? activeWorldbook.value.sourceDocuments.length : 0))

const contextLabel = computed(() => context.value?.book?.title || '')

function onWorldbookChange(wbId) {
  if (wbId) {
    void router.push({ name: 'settings-sources', query: { worldbookId: String(wbId) } })
  }
}

function goCreate() {
  router.push({ name: 'settings-worldbook-create', query: { bookId: bookId.value, mode: 'sources', action: 'add' } })
}

// 导入路由器（模板里用）
const router = useRouter()

</script>

<template>
  <div class="settings-page" data-test="settings-sources">
    <SettingsWorkspaceHeader>
      <SettingsContextBar
        :model-value="selectedWorldbookId"
        :worldbooks-index="worldbooksIndex"
        :active-worldbook="activeWorldbook"
        :project-label="contextLabel"
        :project-locked="Boolean(bookId)"
        project-identity
        :route-mismatch-notice="context?.notice || ''"
        @change="onWorldbookChange"
      >
        <template #actions>
          <SettingsReturnToManuscript :worldbook-id="selectedWorldbookId || ''" />
        </template>
      </SettingsContextBar>
    </SettingsWorkspaceHeader>

    <div v-if="contextLoading" class="settings-sources-loading" role="status">{{ tr("正在加载资料…") }}</div>

    <div v-else-if="context?.status === 'missing-book' || loadError" class="settings-sources-empty" role="alert">
      <p>{{ loadError ? tr(loadError) : tr("这本书已不存在。") }}</p>
      <button type="button" class="control-secondary" @click="refresh">{{ tr("重新加载") }}</button>
    </div>

    <div v-else-if="!bookId" class="settings-sources-empty" role="status">
      <p>{{ tr("请先从首页或写作页打开一本书。") }}</p>
      <button type="button" class="control-primary" @click="router.push({ name: 'settings-structured' })">{{ tr("回到设定") }}</button>
    </div>

    <div v-else-if="!activeWorldbook" class="settings-sources-empty" role="status">
      <WorkbenchIcon name="sources" :size="32" />
      <h1>{{ tr("本书的参考资料") }}</h1>
      <p>{{ tr("添加文档或文字片段，写作时随时回来查阅。") }}</p>
      <button type="button" class="control-primary" @click="goCreate"><WorkbenchIcon name="plus" :size="16" />{{ tr("添加资料") }}</button>
    </div>

    <template v-else>
      <header class="settings-sources-head">
        <div class="settings-sources-heading"><h1>{{ tr("参考资料") }} <span class="settings-sources-count">{{ sourceCount }}</span></h1><p>{{ tr("收集本书的参考文档，随时查阅原文。") }}</p></div>
        <button type="button" class="control-primary settings-sources-add" data-test="sources-add" @click="goCreate"><WorkbenchIcon name="plus" :size="17" />{{ tr("添加资料") }}</button>
      </header>
      <div class="settings-sources-body">
        <WorldbookSourcesPanel
          :key="`${bookId}:${selectedWorldbookId}`"
          :worldbook="activeWorldbook"
          :book-id="bookId"
          :initial-open="true"
          standalone
          @sources-changed="refresh"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>

.settings-page { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow-y: auto; background: var(--archive-paper-soft); }

.settings-sources-loading, .settings-sources-empty { display: grid; justify-items: center; gap: 16px; padding: 80px 24px; color: var(--text-secondary); font-size: 14px; text-align: center; }
.settings-sources-empty h1 { margin: 0; font-size: 24px; color: var(--text-primary); }
.settings-sources-empty p { margin: 0; line-height: 1.8; }
.settings-sources-head { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 32px clamp(20px, 3vw, 48px) 24px; }
.settings-sources-heading h1 { display: flex; align-items: center; gap: 12px; margin: 0; font-size: 25px; font-weight: 600; color: var(--text-primary); letter-spacing: -.02em; }
.settings-sources-heading p { margin: 10px 0 0; font-size: 14px; color: var(--text-secondary); line-height: 1.7; }
.settings-sources-count { font-size: 14px; font-weight: 400; color: var(--text-secondary); letter-spacing: 0; }
.settings-sources-add { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; }
.settings-sources-body { padding: 0 clamp(20px, 3vw, 48px) 32px; }
.settings-sources-empty .control-primary { display: inline-flex; align-items: center; gap: 7px; }
@media (max-width: 760px) { .settings-sources-head { padding: 24px 20px 22px; gap: 14px; align-items: flex-start; } .settings-sources-heading h1 { font-size: 22px; } .settings-sources-heading p { font-size: 13px; max-width: 24ch; } }

</style>
