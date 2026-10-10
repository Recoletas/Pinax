<script setup>
// 文档阅读器页面（W1-B v1；W2-D 接共享工作区头）：项目文件夹里的大纲/剧本/任意 md-json 的只读版面。零写入。
// 头部不自制：与知识控制台/世界地图同用 SettingsWorkspaceHeader，书身份、资料/地图/知识分区导航与
// 正文/助手回程全部来自共享件，本页不持第二套导航状态（只读声明在 DocumentReader 的来源栏）。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { loadWritingBooks } from '../services/writing/writingBooksRepository.js'
import SettingsWorkspaceHeader from '../components/workbench/SettingsWorkspaceHeader.vue'
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import SettingsReturnToManuscript from '../components/workbench/SettingsReturnToManuscript.vue'
import DocumentReader from '../components/documents/DocumentReader.vue'

const route = useRoute()
const bookId = computed(() => (typeof route.query?.bookId === 'string' ? route.query.bookId : ''))
const book = computed(() => loadWritingBooks().find((item) => String(item.id) === bookId.value) || null)
</script>

<template>
  <div class="documents-page" data-test="documents-page">
    <SettingsWorkspaceHeader>
      <SettingsContextBar :project-label="book?.title || ''" project-locked>
        <template #actions>
          <SettingsReturnToManuscript :worldbook-id="book?.worldbookId || ''" />
        </template>
      </SettingsContextBar>
    </SettingsWorkspaceHeader>
    <div class="documents-page__body">
      <DocumentReader :book-id="bookId" />
    </div>
  </div>
</template>

<style scoped>
.documents-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}
.documents-page__body {
  flex: 1;
  width: 100%;
  min-height: 0;
}
</style>
