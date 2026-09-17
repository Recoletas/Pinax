<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../../stores/worldStore'
import { loadSourceChunks } from '../../services/worldbook/worldbookSourceArchive'

// N-A：设定区可持续管理的资料面板（NA03/NA04/NA09 基础片）。
// 列表 + 按块加载的全文预览 + 搜索/类型筛选 + 软移除 + 添加入口。
// 归档原件只在预览未命中 chunk 时回退到 contentPreview；不把全文塞进列表。

const props = defineProps({
  worldbook: { type: Object, default: null },
  bookId: { type: String, default: '' },
  initialOpen: { type: Boolean, default: false }
})
const emit = defineEmits(['sources-changed'])

const router = useRouter()
const worldStore = useWorldStore()
const search = ref('')
const kindFilter = ref('all')
const expandedId = ref('')
const previewText = ref('')
const previewLoading = ref(false)
const previewError = ref('')
const busyRemoveId = ref('')
const actionMessage = ref('')
const open = ref(props.initialOpen)

const KIND_LABELS = {
  'text-file': 'TXT', markdown: 'MD', pdf: 'PDF', docx: 'DOCX', epub: 'EPUB', 'pasted-text': '粘贴'
}

const sources = computed(() => (Array.isArray(props.worldbook?.sourceDocuments) ? props.worldbook.sourceDocuments : []))
const kindOptions = computed(() => [...new Set(sources.value.map(source => String(source.kind || 'text-file')))])
const filtered = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  return sources.value.filter(source => (kindFilter.value === 'all' || String(source.kind || 'text-file') === kindFilter.value)
    && (!needle || `${source.title || ''} ${source.contentPreview || source.content || ''}`.toLocaleLowerCase().includes(needle)))
})
const totalChars = computed(() => sources.value.reduce((total, source) => (
  total + Number(source.originalLength || source.normalizedLength || String(source.contentPreview || source.content || '').length)
), 0))

function toggleOpen() {
  open.value = !open.value
}

function addLabel() {
  return props.bookId ? '添加资料' : '添加资料（先选择一本书）'
}

function openAdd() {
  if (!props.bookId) return
  router.push({ name: 'settings-worldbook-create', query: { bookId: props.bookId, mode: 'sources' } })
}

async function togglePreview(source) {
  const id = String(source.id || '')
  if (expandedId.value === id) {
    expandedId.value = ''
    previewText.value = ''
    previewError.value = ''
    return
  }
  expandedId.value = id
  previewText.value = ''
  previewError.value = ''
  previewLoading.value = true
  try {
    const chunkIds = Array.isArray(source.chunkIds) ? source.chunkIds : []
    if (chunkIds.length) {
      // 按块加载：长文不全量进主线程，也避免 2400 字预览冒充全文。
      const chunks = await loadSourceChunks(chunkIds)
      const ordered = [...chunks].sort((a, b) => Number(a?.locator?.start ?? 0) - Number(b?.locator?.start ?? 0))
      previewText.value = ordered.map(chunk => chunk?.text || '').join('\n\n').trim()
    }
    if (!previewText.value) {
      previewText.value = String(source.contentPreview || source.content || '').trim()
      if (previewText.value) previewError.value = '归档块缺失，当前显示导入时预览。'
    }
    if (!previewText.value) previewError.value = '全文不可用：归档已缺失，重新导入可恢复。'
  } catch (error) {
    previewError.value = `全文读取失败：${error?.message || '未知错误'}`
  } finally {
    previewLoading.value = false
  }
}

// 软移除：只从本书资料库列表移出；归档原件与历史证据引用保留，可重新添加。
async function removeSource(source) {
  const id = String(source.id || '')
  if (!id || busyRemoveId.value) return
  busyRemoveId.value = id
  actionMessage.value = ''
  try {
    const remaining = sources.value.filter(source_ => String(source_.id || '') !== id)
    // updateWorldbook resolves to the updated worldbook; failures throw.
    const updated = await worldStore.updateWorldbook(props.worldbook.id, { sourceDocuments: remaining })
    if (!updated?.id) throw new Error('移除失败，请重试')
    if (expandedId.value === id) {
      expandedId.value = ''
      previewText.value = ''
    }
    actionMessage.value = `已移出本书资料库：${source.title || id}（归档原件保留，仍可重新添加）。`
    emit('sources-changed', { removedId: id, remaining: remaining.length })
  } catch (error) {
    actionMessage.value = error?.message || '移除失败，请重试'
  } finally {
    busyRemoveId.value = ''
  }
}
</script>

<template>
  <section class="sources-panel" aria-label="本书资料">
    <button
      type="button"
      class="sources-panel__toggle"
      data-test="sources-panel-toggle"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <strong>资料</strong>
      <span>{{ sources.length }} 份 · {{ totalChars.toLocaleString('zh-CN') }} 字</span>
      <span class="sources-panel__hint">{{ open ? '收起' : '展开管理与预览' }}</span>
    </button>

    <div v-if="open" class="sources-panel__body">
      <div class="sources-panel__controls">
        <input
          v-model="search"
          class="sources-panel__search"
          type="search"
          placeholder="按标题或预览正文搜索"
          aria-label="搜索资料"
        />
        <select v-model="kindFilter" aria-label="按类型筛选">
          <option value="all">全部类型</option>
          <option v-for="kind in kindOptions" :key="kind" :value="kind">{{ KIND_LABELS[kind] || kind }}</option>
        </select>
        <button type="button" class="sources-panel__add" data-test="sources-panel-add" :disabled="!bookId" @click="openAdd">
          {{ addLabel() }}
        </button>
      </div>

      <p v-if="!sources.length" class="sources-panel__empty" data-test="sources-panel-empty">
        本书还没有资料。添加 TXT / Markdown / PDF / DOCX 或粘贴片段后，可在这里预览并按分区提取设定。
      </p>
      <p v-else-if="!filtered.length" class="sources-panel__empty">没有匹配的资料；调整搜索或类型筛选。</p>

      <ul v-else class="sources-panel__list">
        <li v-for="source in filtered" :key="source.id" class="sources-panel__item">
          <div class="sources-panel__row">
            <button type="button" class="sources-panel__title" :aria-expanded="expandedId === String(source.id)" @click="togglePreview(source)">
              {{ source.title || source.id }}
            </button>
            <span class="sources-panel__meta">
              {{ KIND_LABELS[source.kind] || source.kind || 'TXT' }}
              · {{ Number(source.originalLength || source.normalizedLength || String(source.contentPreview || '').length).toLocaleString('zh-CN') }} 字
              <template v-if="source.archiveRef"> · 已归档</template>
              <template v-else> · 未归档</template>
            </span>
            <button
              type="button"
              class="sources-panel__remove"
              :disabled="busyRemoveId === String(source.id)"
              :aria-label="`移出 ${source.title || source.id}`"
              @click="removeSource(source)"
            >
              移出
            </button>
          </div>
          <div v-if="expandedId === String(source.id)" class="sources-panel__preview" aria-label="资料全文预览">
            <p v-if="previewLoading" role="status">全文读取中……</p>
            <template v-else>
              <p v-if="previewError" class="sources-panel__warn" role="status">{{ previewError }}</p>
              <pre>{{ previewText || '（无可显示内容）' }}</pre>
            </template>
          </div>
        </li>
      </ul>

      <p v-if="actionMessage" class="sources-panel__status" role="status">{{ actionMessage }}</p>
    </div>
  </section>
</template>

<style scoped>
.sources-panel { border: 1px solid var(--border, #d4d4d8); border-radius: 6px; margin-bottom: 14px; background: var(--bg-secondary, #fafafa); }
.sources-panel__toggle { display: flex; width: 100%; gap: 10px; align-items: center; padding: 10px 12px; background: transparent; border: 0; cursor: pointer; font: inherit; color: var(--text-primary, #18181b); }
.sources-panel__toggle span { color: var(--text-secondary, #52525b); font-size: 13px; }
.sources-panel__hint { margin-left: auto; }
.sources-panel__body { padding: 0 12px 12px; display: grid; gap: 10px; }
.sources-panel__controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sources-panel__search { flex: 1 1 180px; min-width: 140px; }
.sources-panel__controls input, .sources-panel__controls select, .sources-panel__add { font: inherit; padding: 6px 8px; border: 1px solid var(--border, #d4d4d8); border-radius: 4px; background: var(--bg-primary, #fff); color: var(--text-primary, #18181b); min-height: 36px; }
.sources-panel__add { cursor: pointer; }
.sources-panel__add:disabled { opacity: .5; cursor: default; }
.sources-panel__empty { margin: 0; color: var(--text-secondary, #52525b); font-size: 14px; }
.sources-panel__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sources-panel__row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sources-panel__title { font: inherit; color: var(--text-primary, #18181b); background: transparent; border: 0; padding: 4px 0; cursor: pointer; text-align: left; text-decoration: underline dotted; }
.sources-panel__meta { color: var(--text-secondary, #52525b); font-size: 12px; }
.sources-panel__remove { margin-left: auto; font: inherit; font-size: 12px; padding: 4px 8px; min-height: 28px; border: 1px solid var(--border, #d4d4d8); border-radius: 4px; background: var(--bg-primary, #fff); color: var(--text-secondary, #52525b); cursor: pointer; }
.sources-panel__preview { padding: 8px 10px; border-left: 3px solid var(--border, #d4d4d8); background: var(--bg-primary, #fff); }
.sources-panel__preview pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow-y: auto; font-size: 13px; line-height: 1.6; }
.sources-panel__warn { margin: 0 0 6px; color: var(--text-secondary, #52525b); font-size: 12px; }
.sources-panel__status { margin: 0; font-size: 13px; color: var(--text-secondary, #52525b); }
</style>
