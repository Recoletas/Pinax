<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { tr, formatUiNumber } from '../../i18n'
import { useWorldStore } from '../../stores/worldStore'
import { loadSourceChunks } from '../../services/worldbook/worldbookSourceArchive'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

// N-A：设定区可持续管理的资料面板（NA03/NA04/NA09 基础片）。
// 列表 + 按块加载的全文预览 + 搜索/类型筛选 + 软移除 + 添加入口。
// 归档原件只在预览未命中 chunk 时回退到 contentPreview；不把全文塞进列表。

const props = defineProps({
  worldbook: { type: Object, default: null },
  bookId: { type: String, default: '' },
  initialOpen: { type: Boolean, default: false },
  standalone: { type: Boolean, default: false }
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
  router.push({ name: 'settings-worldbook-create', query: { bookId: props.bookId, mode: 'sources', action: 'add' } })
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
      if (previewText.value) previewError.value = tr("归档块缺失，当前显示导入时预览。")
    }
    if (!previewText.value) previewError.value = tr("全文不可用：归档已缺失，重新导入可恢复。")
  } catch (error) {
    previewError.value = tr('全文读取失败：{reason}', { reason: error?.message || tr('未知错误') })
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
    if (!updated?.id) throw new Error(tr("移除失败，请重试"))
    if (expandedId.value === id) {
      expandedId.value = ''
      previewText.value = ''
    }
    actionMessage.value = tr('已移出本书资料库：{title}（归档原件保留，仍可重新添加）。', { title: source.title || id })
    emit('sources-changed', { removedId: id, remaining: remaining.length })
  } catch (error) {
    actionMessage.value = error?.message || tr("移除失败，请重试")
  } finally {
    busyRemoveId.value = ''
  }
}
</script>

<template>
  <section class="sources-panel" :class="{ 'is-standalone': standalone }" :aria-label="tr(&quot;本书资料&quot;)">
    <button
      v-if="!standalone"
      type="button"
      class="sources-panel__toggle"
      data-test="sources-panel-toggle"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <strong>{{ tr("资料") }}</strong>
      <span>{{ tr('{count} 份 · {chars} 字', { count: sources.length, chars: formatUiNumber(totalChars) }) }}</span>
      <span class="sources-panel__hint">{{ open ? tr("收起") : tr("展开管理与预览") }}</span>
    </button>

    <div v-if="standalone || open" class="sources-panel__body">
      <div class="sources-panel__controls">
        <label class="sources-panel__search-field">
        <WorkbenchIcon name="search" :size="17" />
        <input
          v-model="search"
          class="sources-panel__search"
          type="search"
          :placeholder="tr(&quot;搜索资料名称或内容&quot;)"
          :aria-label="tr(&quot;搜索资料&quot;)"
        />
        </label>
        <select v-model="kindFilter" :aria-label="tr(&quot;按类型筛选&quot;)">
          <option value="all">{{ tr("全部类型") }}</option>
          <option v-for="kind in kindOptions" :key="kind" :value="kind">{{ KIND_LABELS[kind] ? tr(KIND_LABELS[kind]) : kind }}</option>
        </select>
        <button v-if="!standalone" type="button" class="sources-panel__add control-secondary" data-test="sources-panel-add" :disabled="!bookId" @click="openAdd">
          <WorkbenchIcon name="plus" :size="16" />
          {{ tr(addLabel()) }}
        </button>
      </div>

      <div v-if="!sources.length" class="sources-panel__empty" data-test="sources-panel-empty">
        <WorkbenchIcon name="sources" :size="30" />
        <h3>{{ tr("还没有参考资料") }}</h3>
        <p>{{ tr("添加参考文档或文字片段，随时查阅原文。") }}</p>
        <small>{{ tr("支持 TXT、Markdown、PDF、DOCX 与 EPUB") }}</small>
      </div>
      <p v-else-if="!filtered.length" class="sources-panel__empty">{{ tr("没有匹配的资料；调整搜索或类型筛选。") }}</p>

      <ul v-else class="sources-panel__list">
        <li v-for="source in filtered" :key="source.id" class="sources-panel__item" :class="{ 'is-expanded': expandedId === String(source.id) }">
          <div class="sources-panel__row">
            <span class="sources-panel__file-icon"><WorkbenchIcon :name="source.kind === 'markdown' ? 'markdown' : source.kind === 'epub' ? 'book' : 'document'" :size="23" /></span>
            <div class="sources-panel__identity">
            <button type="button" class="sources-panel__title" :aria-expanded="expandedId === String(source.id)" @click="togglePreview(source)">
              {{ source.title || source.id }}
              <WorkbenchIcon name="chevron-down" :size="15" />
            </button>
            <p class="sources-panel__excerpt">{{ source.contentPreview || source.content || tr("点击名称查看原文") }}</p>
            </div>
            <span class="sources-panel__meta">
              <span class="sources-panel__kind">{{ KIND_LABELS[source.kind] ? tr(KIND_LABELS[source.kind]) : source.kind || 'TXT' }}</span>
              <span>{{ tr('{count} 字', { count: formatUiNumber(source.originalLength || source.normalizedLength || String(source.contentPreview || source.content || '').length) }) }}</span>
              <span>{{ source.archiveRef ? tr("已归档") : tr("未归档") }}</span>
            </span>
            <button
              type="button"
              class="sources-panel__remove control-quiet"
              :disabled="busyRemoveId === String(source.id)"
              :aria-label="tr('移出 {title}', { title: source.title || source.id })"
              @click="removeSource(source)"
            >
              <WorkbenchIcon name="unlink" :size="15" />
              {{ tr("移出") }}
            </button>
          </div>
          <div v-if="expandedId === String(source.id)" class="sources-panel__preview" :aria-label="tr(&quot;资料全文预览&quot;)">
            <p v-if="previewLoading" role="status">{{ tr("全文读取中……") }}</p>
            <template v-else>
              <p v-if="previewError" class="sources-panel__warn" role="status">{{ previewError }}</p>
              <pre>{{ previewText || tr("（无可显示内容）") }}</pre>
            </template>
          </div>
        </li>
      </ul>

      <p v-if="actionMessage" class="sources-panel__status" role="status">{{ actionMessage }}</p>
    </div>
  </section>
</template>

<style scoped>

.sources-panel { min-width: 0; margin-bottom: 16px; color: var(--text-primary); border: 1px solid var(--archive-paper-strong); border-radius: 8px; }
.sources-panel.is-standalone { border: 0; border-radius: 0; }
.sources-panel__toggle { display: flex; flex-wrap: wrap; width: 100%; gap: 10px; align-items: center; padding: 12px 16px; background: transparent; border: 0; cursor: pointer; font: inherit; color: inherit; }
.sources-panel__toggle span { color: var(--text-secondary); font-size: 13px; }
.sources-panel__hint { margin-left: auto; }
.sources-panel__body { padding: 0 16px 16px; }
.is-standalone .sources-panel__body { padding: 0; }
.sources-panel__controls { display: flex; gap: 12px; align-items: center; padding-bottom: 20px; }
.sources-panel__search-field { display: flex; align-items: center; gap: 9px; flex: 1; max-width: 440px; min-width: 0; height: 38px; padding: 0 12px; border: 1px solid var(--archive-paper-strong); border-radius: 6px; color: var(--text-secondary); background: var(--bg-primary); }
.sources-panel__search { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; padding: 7px 0; }
.sources-panel__search-field:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.sources-panel__controls select { font: inherit; font-size: 13px; height: 38px; padding: 0 10px; border: 1px solid var(--archive-paper-strong); border-radius: 6px; background: var(--bg-primary); color: var(--text-secondary); }
.sources-panel__add { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; white-space: normal; }
.sources-panel__empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 64px 20px; margin: 0; text-align: center; color: var(--text-secondary); font-size: 14px; }
.sources-panel__empty h3 { margin: 4px 0 0; font-size: 17px; font-weight: 550; color: var(--text-primary); }
.sources-panel__empty p { margin: 0; line-height: 1.8; }
.sources-panel__empty small { font-size: 12px; }
.sources-panel__list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--archive-paper-strong); }
.sources-panel__item { border-bottom: 1px solid var(--archive-paper-strong); }
.sources-panel__row { display: flex; gap: 16px; align-items: center; padding: 18px 8px; }
.sources-panel__file-icon { color: var(--text-secondary); display: grid; place-items: center; width: 38px; height: 44px; flex-shrink: 0; background: var(--archive-paper); border-radius: 5px; }
.sources-panel__identity { flex: 1; min-width: 0; }
.sources-panel__title { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; font: inherit; font-size: 15px; font-weight: 550; line-height: 1.6; color: var(--text-primary); background: transparent; border: 0; padding: 2px 0; cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.sources-panel__title svg { color: var(--text-secondary); }
.is-expanded .sources-panel__title svg { transform: rotate(180deg); }
.sources-panel__title:hover { color: var(--accent); }
.sources-panel__excerpt { margin: 5px 0 0; color: var(--text-secondary); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sources-panel__meta { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px 12px; max-width: 40%; color: var(--text-secondary); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sources-panel__kind { min-width: 42px; font-size: 11px; letter-spacing: .03em; }
.sources-panel__meta > span:nth-child(2) { min-width: 65px; text-align: right; }
.sources-panel__remove { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: 12px; font-size: 12px; }
.sources-panel__preview { margin: 0 8px 20px 62px; padding: 22px 24px; background: var(--archive-paper); border-radius: 6px; }
.sources-panel__preview pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 440px; overflow-y: auto; font-family: inherit; font-size: 15px; line-height: 1.9; color: var(--text-primary); }
.sources-panel__warn, .sources-panel__status { margin: 0 0 12px; color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.sources-panel__status { margin-top: 16px; }
.sources-panel :is(button, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 760px) {
 .sources-panel__controls { gap: 8px; flex-wrap: wrap; }
 .sources-panel__search-field { max-width: none; }
 .sources-panel__row { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 6px 12px; padding: 16px 0; }
 .sources-panel__file-icon { width: 32px; grid-row: 1 / 3; align-self: start; }
 .sources-panel__identity { grid-column: 2; }
 .sources-panel__meta { grid-column: 2; gap: 6px 12px; max-width: none; justify-content: flex-start; }
 .sources-panel__meta > span:nth-child(2) { min-width: 0; text-align: left; }
 .sources-panel__kind { min-width: 0; }
 .sources-panel__remove { grid-column: 3; grid-row: 1 / 3; margin-left: 0; padding-inline: 6px; }
 .sources-panel__remove svg { display: none; }
 .sources-panel__preview { margin: 0 0 16px; padding: 16px; }
}

</style>
