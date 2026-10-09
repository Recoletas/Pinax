<script setup>
// 文档阅读器页面（W1-B v1，settings/documents，§5-4 裁定独立「文档」页）：
// 项目文件夹里的大纲/剧本/任意 md-json 的只读版面。零写入。
import { tr } from '../i18n/index.js'
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import DocumentReader from '../components/documents/DocumentReader.vue'

const route = useRoute()
const router = useRouter()

const bookId = computed(() => (typeof route.query?.bookId === 'string' ? route.query.bookId : ''))

function goBack() {
  const from = route.query?.from
  if (from && String(from).startsWith('/')) router.push(String(from))
  else router.back()
}
</script>

<template>
  <div class="documents-page" data-test="documents-page">
    <header class="documents-page__head">
      <button type="button" class="documents-page__back" data-test="documents-back" @click="goBack">
        <WorkbenchIcon name="arrow-left" :size="16" />
        <span>{{ tr('返回工作区') }}</span>
      </button>
      <div class="documents-page__brand">
        <span>{{ tr('文档') }}</span>
      </div>
      <span class="documents-page__caption">{{ tr('项目文件 · 只读') }}</span>
    </header>
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
.documents-page__head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 0 auto;
  padding: 10px 20px;
  border-bottom: 1px solid var(--hairline-soft);
  background: var(--surface-raised);
}
.documents-page__back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: background 140ms ease, color 140ms ease;
}
.documents-page__back:hover,
.documents-page__back:focus-visible {
  background: var(--bg-hover);
  color: var(--text-primary);
  outline: none;
}
.documents-page__brand {
  display: flex;
  align-items: baseline;
  font-size: 14px;
  font-weight: 700;
}
.documents-page__caption {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 12px;
}
.documents-page__body {
  flex: 1;
  width: 100%;
  min-height: 0;
}
@media (max-width: 720px) {
  .documents-page__head {
    gap: 10px;
    padding: 10px 12px;
  }
  .documents-page__caption {
    display: none;
  }
}
</style>
