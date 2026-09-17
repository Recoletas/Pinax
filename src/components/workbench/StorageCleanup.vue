<script setup>
import { ref } from 'vue'
import { previewWritingSnapshotCleanup, cleanWritingSnapshotPreview } from '../../services/writing/writingSnapshots'
const emit = defineEmits(['cleaned'])
const preview = ref(null)
const error = ref('')
const feedback = ref('')
function inspect() {
  error.value = ''; feedback.value = ''
  try { preview.value = previewWritingSnapshotCleanup() } catch { error.value = '读取失败，未改动任何数据。' }
}
function confirm() {
  const result = cleanWritingSnapshotPreview(preview.value)
  if (!result.ok) { error.value = result.reason === 'cleanup-preview-stale' ? '版本已变化，请重新扫描后确认。' : '清理未完成，原数据保留。'; return }
  feedback.value = `已清理 ${result.removed} 份旧自动版本。正文、手动版本和恢复副本未改动；已清理版本只能从此前导出的备份恢复。`
  preview.value = null
  emit('cleaned')
}
</script>

<template>
  <section class="storage-cleanup" aria-label="清理旧自动版本">
    <h3>清理旧自动版本</h3>
    <p>扫描所有作品中 30 天前的自动字数快照。每章最近 3 份、手动版本和操作前保护版本始终保留，不删除作品、媒体或记忆账本。</p>
    <button type="button" class="control-secondary" @click="inspect">扫描可清理版本</button>
    <div v-if="preview" class="storage-cleanup__preview">
      <p v-if="!preview.length">没有符合条件的旧版本。</p>
      <template v-else>
        <p>可清理 {{ preview.length }} 份。删除后无法在应用内撤销，建议先导出完整备份。</p>
        <details><summary>查看清单</summary><ul><li v-for="row in preview" :key="row.id">{{ row.label || '自动版本' }} · {{ new Date(row.createdAt).toLocaleString() }}</li></ul></details>
        <button type="button" class="control-danger" @click="confirm">确认清理这 {{ preview.length }} 份</button>
      </template>
      <button type="button" class="control-quiet" @click="preview = null">取消</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="feedback" role="status">{{ feedback }}</p>
  </section>
</template>

<style scoped>
.storage-cleanup { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); font: 14px/1.65 var(--font-sans); }
h3 { margin: 0; font-size: 15px; }p { color: var(--text-secondary); margin: 8px 0 12px; }.storage-cleanup__preview { margin-top: 12px; }ul { padding-left: 20px; }
</style>
