<template>
  <section ref="shellRef" class="entry-data-table knowledge-tables" data-test="entry-data-table" :aria-label="tr(tableAriaLabel)">
    <header class="edt-toolbar">
      <b class="edt-title">{{ tr(tableTitle) }}</b>
      <input
        v-model.trim="nameFilter"
        class="text-input edt-filter"
        type="search"
        data-test="edt-name-filter"
        :placeholder="tr(nameInputLabel)"
        :aria-label="tr(nameInputLabel)"
      />
      <label class="edt-axis">
        <span>{{ tr('分组') }}</span>
        <select v-model="groupKey" class="select-input" data-test="edt-group-key">
          <option value="">{{ tr('不分组') }}</option>
          <option value="template">{{ tr('模板') }}</option>
          <option value="tier">{{ tr('档位') }}</option>
          <option value="status">{{ tr('状态') }}</option>
        </select>
      </label>
      <div class="edt-columns-wrap">
        <button
          type="button"
          class="ghost-btn small"
          data-test="edt-columns"
          :aria-expanded="String(columnsOpen)"
          @click="columnsOpen = !columnsOpen"
        >
          {{ tr('字段列') }}
        </button>
        <div v-if="columnsOpen" class="edt-column-panel" data-test="edt-column-panel">
          <label v-for="label in allColumns" :key="label" class="edt-column-item">
            <input type="checkbox" :checked="isColumnShown(label)" @change="toggleColumn(label)" />
            <span>{{ tr(label) }}</span>
          </label>
        </div>
      </div>
      <button type="button" class="primary-btn small" data-test="edt-add-character" @click="addCharacter">
        {{ tr('添加人物') }}
      </button>
    </header>

    <p v-if="notice" class="edt-notice" :class="{ 'is-error': noticeIsError }" role="status" data-test="edt-notice">{{ notice }}</p>

    <div v-if="activeFilterText" class="edt-shared-filter" data-test="edt-shared-filter">
      <span>{{ tr('跟随浏览视图的过滤：') }}<b>{{ activeFilterText }}</b></span>
      <button type="button" class="ghost-btn small" data-test="edt-filter-clear" @click="clearFilters">{{ tr('清除过滤') }}</button>
    </div>

    <div v-if="contentPolicy" class="edt-policy" data-test="edt-policy">
      <span>{{ tr('本表编辑字段的落点：') }}<b>{{ contentPolicy === 'overwrite' ? tr('覆盖条目正文') : tr('只存字段') }}</b></span>
      <button type="button" class="ghost-btn small" data-test="edt-policy-toggle" @click="togglePolicy">
        {{ contentPolicy === 'overwrite' ? tr('改为只存字段') : tr('改为覆盖条目正文') }}
      </button>
    </div>

    <div v-if="pendingEdit" class="edt-ask" role="alertdialog" :aria-label="tr('正文与投影不一致')" data-test="edt-overwrite-ask">
      <p>{{ tr('正文与字段投影对不上（可能有手写内容，也可能还没写正文）。之后在本表改字段，怎么落笔？') }}</p>
      <div class="edt-ask-actions">
        <button type="button" class="ghost-btn" data-test="edt-ask-keep" @click="resolvePolicy(false)">{{ tr('以原文为准（只存字段）') }}</button>
        <button type="button" class="primary-btn" data-test="edt-ask-overwrite" @click="resolvePolicy(true)">{{ tr('覆盖原文（用投影替换）') }}</button>
        <button type="button" class="ghost-btn small" @click="pendingEdit = null">{{ tr('取消') }}</button>
      </div>
    </div>

    <div class="edt-scroll">
      <table v-if="groupedRows.length" class="edt-table" :style="{ width: `max(100%, ${tableMinWidth}px)` }">
        <thead>
          <tr>
            <th class="edt-col edt-col-fixed">{{ tr(nameColumnLabel) }}</th>
            <th class="edt-col edt-col-fixed">{{ tr('模板') }}</th>
            <th class="edt-col edt-col-fixed">{{ tr('档位') }}</th>
            <th class="edt-col edt-col-fixed">{{ tr('状态') }}</th>
            <th class="edt-col edt-col-fixed">{{ tr('必填缺项') }}</th>
            <th v-for="label in shownColumns" :key="label" class="edt-col edt-col-field">
              {{ tr(label) }}
              <button
                type="button"
                class="edt-col-hide"
                :aria-label="tr('隐藏列：{label}', { label: tr(label) })"
                @click="toggleColumn(label)"
              >×</button>
            </th>
            <th class="edt-col edt-col-action">{{ tr('操作') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="group in tableGroups" :key="`g-${group.id}`">
            <tr v-if="group.id" class="edt-group-row">
              <th :colspan="totalColumnCount">{{ groupLabel(group) }} · {{ group.rows.length }}</th>
            </tr>
            <tr v-for="row in group.rows" :key="row.entry.id" class="edt-row" :data-entry-id="row.entry.id">
              <td class="edt-cell edt-cell-name">
                <input
                  v-if="isEditing(row.entry.id, 'name')"
                  v-model="draftText"
                  class="text-input edt-editor"
                  type="text"
                  data-test="edt-editor"
                  @blur="commitEdit(row.entry, 'name')"
                  @keydown.enter.prevent="commitEdit(row.entry, 'name')"
                  @keydown.esc="cancelEdit"
                />
                <button
                  v-else
                  type="button"
                  class="edt-cell-btn is-name"
                  data-test="edt-name-cell"
                  @click="startEdit(row.entry, 'name')"
                >{{ row.entry.name || tr('未命名条目') }}</button>
              </td>
              <td class="edt-cell edt-cell-template" data-test="edt-template">
                <span class="edt-template-text">{{ tr(row.templateLabel) }}</span>
              </td>
              <td class="edt-cell">
                <select
                  class="select-input edt-axis-select"
                  :value="row.entry.tier || ''"
                  data-test="edt-tier-select"
                  :aria-label="tr('档位')"
                  @change="commitAxis(row.entry, 'tier', $event.target.value)"
                >
                  <option value="">{{ tr('跟随类型') }}</option>
                  <option value="core">{{ tr('核心') }}</option>
                  <option value="support">{{ tr('支撑') }}</option>
                  <option value="background">{{ tr('背景') }}</option>
                </select>
              </td>
              <td class="edt-cell">
                <select
                  class="select-input edt-axis-select"
                  :value="row.status"
                  data-test="edt-status-select"
                  :aria-label="tr('状态')"
                  @change="commitAxis(row.entry, 'status', $event.target.value)"
                >
                  <option value="draft">{{ tr('草稿') }}</option>
                  <option value="active">{{ tr('激活') }}</option>
                  <option value="retired">{{ tr('退役') }}</option>
                </select>
              </td>
              <td class="edt-cell edt-cell-missing" data-test="edt-missing">
                <span v-if="row.missing.length" class="edt-missing-list">{{ row.missing.map(tr).join('、') }}</span>
                <span v-else class="edt-cell-blank">—</span>
              </td>
              <td
                v-for="(cell, index) in row.cells"
                :key="`${row.entry.id}-${cell.label}`"
                class="edt-cell edt-cell-field"
                :data-test="`edt-cell-${row.entry.id}-${index}`"
              >
                <textarea
                  v-if="isEditing(row.entry.id, cell.label) && cell.multiline"
                  v-model="draftText"
                  class="text-area edt-editor edt-editor-area"
                  rows="3"
                  data-test="edt-editor"
                  @blur="commitEdit(row.entry, cell.label)"
                  @keydown.ctrl.enter.prevent="commitEdit(row.entry, cell.label)"
                  @keydown.esc="cancelEdit"
                ></textarea>
                <input
                  v-else-if="isEditing(row.entry.id, cell.label)"
                  v-model="draftText"
                  class="text-input edt-editor"
                  type="text"
                  data-test="edt-editor"
                  @blur="commitEdit(row.entry, cell.label)"
                  @keydown.enter.prevent="commitEdit(row.entry, cell.label)"
                  @keydown.esc="cancelEdit"
                />
                <button
                  v-else
                  type="button"
                  :class="['edt-cell-btn', { 'is-empty': !cell.value, 'is-out-of-sync': cell.outOfSync }]"
                  :title="cell.outOfSync ? tr('这一格与正文不一致；改用「覆盖条目正文」把它写进正文') : ''"
                  :disabled="savingId === row.entry.id"
                  @click="startEdit(row.entry, cell.label)"
                >{{ cell.value || tr('点击填写') }}</button>
              </td>
              <td class="edt-cell edt-cell-action">
                <template v-if="deleteArmId === String(row.entry.id)">
                  <button type="button" class="danger-btn small" data-test="edt-delete-yes" @click="confirmDelete(row.entry)">{{ tr('确认删除') }}</button>
                  <button type="button" class="ghost-btn small" data-test="edt-delete-no" @click="disarmDelete">{{ tr('留着') }}</button>
                </template>
                <template v-else>
                  <button type="button" class="ghost-btn small" data-test="edt-open-record" @click="openRecord(row.entry)">
                    {{ tr('展开') }}
                  </button>
                  <button
                    type="button"
                    class="ghost-btn small edt-delete-btn"
                    :aria-label="tr('删除本行：{name}', { name: row.entry.name || tr('未命名条目') })"
                    data-test="edt-delete"
                    :disabled="savingId === row.entry.id"
                    @click="armDelete(row.entry)"
                  >{{ tr('删除') }}</button>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <p v-else class="edt-empty">
        {{ activeFilterText
          ? tr('当前过滤下没有行：清除过滤，或回浏览视图放宽轴就回来了。')
          : (scope === 'all' ? tr('这本书的世界书里还没有词条。') : tr('这本书的世界书里还没有人物条目。')) }}
        <button v-if="scope === 'characters'" type="button" class="ghost-btn small" data-test="edt-add-first" @click="addCharacter">{{ tr('添加人物') }}</button>
      </p>
    </div>

    <Teleport to="body">
      <div v-if="recordEntry" class="edt-record-overlay" @click.self="closeRecord">
        <div class="edt-record knowledge-tables" role="dialog" aria-modal="true" :aria-label="tr(recordKindLabel)" tabindex="-1" @keydown.esc="closeRecord">
          <header class="edt-record-head">
            <span class="panel-kicker">{{ tr('记录') }}</span>
            <h3 class="edt-record-title">{{ recordEntry.name || tr('未命名条目') }}</h3>
          </header>
          <label class="edt-record-name">
            <span>{{ tr(nameColumnLabel) }}</span>
            <input
              class="text-input"
              type="text"
              :value="recordEntry.name"
              data-test="edt-record-name"
              @blur="commitRecordName($event.target.value)"
              @keydown.enter.prevent="commitRecordName($event.target.value)"
            />
          </label>
          <EntryProfileEditor
            :key="`profile-${recordEntry.id}-${recordEntry.metadata?.updatedAt || ''}`"
            :entry="recordEntry"
            :content="recordEntry.content"
            :saving="savingId === recordEntry.id"
            @save="applyProfileSave"
          />
          <footer class="edt-record-actions">
            <button type="button" class="ghost-btn" data-test="edt-record-close" @click="closeRecord">{{ tr('关闭') }}</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { tr, uiLocale } from '../../i18n/index.js'
import { useWorldStore } from '../../stores/worldStore'
import { normalizeNarrativeVoiceProfile } from '../../services/narrativeVoiceProfile'
import EntryProfileEditor from '../worldbook/EntryProfileEditor.vue'
import { entryStatusOf, filterEntries } from '../../services/worldbook/entryBrowserModel.js'
import { setLabeledBlock } from '../../services/worldbook/settlementService.js'
import {
  ENTRY_PROFILE_TEMPLATES,
  getProfileTemplate,
  renameEntryKeys
} from '../../services/worldbook/entryProfileTemplates.js'
import {
  UNBOUND_TEMPLATE_ID,
  cellOutOfSync,
  cellValueOf,
  fieldColumns,
  fieldOf,
  groupEntries,
  hasProfile,
  isCharacterEntry,
  mixedFieldColumns,
  missingLabelsOf,
  profileOf,
  tableEntries
} from '../../services/worldbook/entryTableColumns.js'
import './KnowledgeTableControls.css'

/**
 * 人物多维表格（W3-A v1，用户 2026-10-10 裁定：既是数据库也是表单，能实时改，也是可视化底）。
 * 数据真源仍是「这本书的世界书」——行=character 条目，列=七模板字段并集，写回全部经
 * worldStore 的 durable 接缝（失败回滚 + 世界书文件双写），本页不新增存储、不新增数据形状。
 * 字段格的写语义与编辑台 EntryProfileEditor 同源：profile→正文是单向投影，投影与正文不一致时
 * 由作者裁决一次（覆盖／只存字段），本会话内后续格子沿用该裁决；裁决在策略条上可随时改。
 * 两类格子不问：正文为空（只存字段），以及正文逐字等于改前投影——后者没有手写内容，改格只是
 * 重算投影，直接覆盖。未建档行不给在表里改字段（表格不替作者猜模板），提示先去表单选模板。
 * 模板/字段解析、分组、缺项走 entryTableColumns（纯函数，node 冒烟覆盖）。
 * 显示口径与编辑台有一处刻意差异（记在 entryTableColumns.profileOf）：格子按「已存字段优先、
 * 正文兜底」渲染，作者选「只存字段」时刚敲的值不会被正文旧顶回去，代价是这一格要显式标出
 * 「与正文不一致」——注入读的仍是正文，改用「覆盖条目正文」后标记自然消失。
 */

const props = defineProps({
  worldbook: { type: Object, default: null },
  /** 'characters'=人物表（七模板字段并集）；'all'=全部词条混排（列=模板字段并集∪正文标签并集） */
  scope: { type: String, default: 'characters' },
  /** 与词条墙／图谱同源的一份过滤真相（控制菜单点持有，表格只是消费者） */
  filters: { type: Object, default: () => ({ cat: '', status: '', tier: '' }) }
})

const emit = defineEmits(['update:filters'])

const worldStore = useWorldStore()

const DEFAULT_COLUMNS = ['背景', '性格', '功能位', '当前弧线']
const TEMPLATE_LABELS = Object.fromEntries(ENTRY_PROFILE_TEMPLATES.map((template) => [template.id, template.label]))

const nameFilter = ref('')
const groupKey = ref('')
const columnsOpen = ref(false)
const shownLabels = ref([...DEFAULT_COLUMNS])
const editing = reactive({ entryId: '', label: '' })
const draftText = ref('')
const shellRef = ref(null)
const savingId = ref('')
const notice = ref('')
const noticeIsError = ref(false)
const contentPolicy = ref('')
const pendingEdit = ref(null)
const recordId = ref('')
const deleteArmId = ref('')
let escapeRequested = false

const allColumns = computed(() => (props.scope === 'all'
  ? mixedFieldColumns(tableEntries(props.worldbook, 'all'))
  : fieldColumns()))
const rows = computed(() => {
  const needle = nameFilter.value.trim()
  // 共享轴（分类/状态/档位）先过一遍，判据仍是浏览视图那一份 filterEntries，表格不自定第二套
  const list = filterEntries(tableEntries(props.worldbook, props.scope), props.filters)
  if (!needle) return list
  return list.filter((entry) => String(entry?.name || '').includes(needle))
})
const groupedRows = computed(() => groupEntries(rows.value, groupKey.value))
const shownColumns = computed(() => allColumns.value.filter((label) => shownLabels.value.includes(label)))
const totalColumnCount = computed(() => 5 + shownColumns.value.length + 1)
const nameColumnLabel = computed(() => (props.scope === 'all' ? '条目' : '人物'))
const tableTitle = computed(() => (props.scope === 'all' ? '全部词条' : '人物表'))
// 混排表里一行可能是地点/势力/设定，界面词不能一口咬定「人物」
const tableAriaLabel = computed(() => (props.scope === 'all' ? '词条多维表格' : '人物多维表格'))
const recordKindLabel = computed(() => (props.scope === 'all' ? '条目记录' : '人物记录'))
const nameInputLabel = computed(() => (props.scope === 'all' ? '按名称筛选' : '按姓名筛选'))
/** 共享过滤的人话回显：任一门面改了轴，其余两面都按这一份收窄 */
const activeFilterText = computed(() => {
  const parts = []
  if (props.filters.cat) parts.push(props.filters.cat)
  if (props.filters.status) parts.push({ draft: tr('草稿'), active: tr('激活'), retired: tr('退役') }[props.filters.status] || props.filters.status)
  if (props.filters.tier) parts.push({ core: tr('核心'), support: tr('支撑'), background: tr('背景') }[props.filters.tier] || props.filters.tier)
  return parts.join(' · ')
})
/** 每行的派生值一次算完（正文反解不逐格重复）：界面只读这里，写回后随 store 快照自然重算 */
const tableGroups = computed(() => groupedRows.value.map((group) => ({
  id: group.id,
  rows: group.rows.map((entry) => ({
    entry,
    templateLabel: templateLabelOf(entry),
    status: entryStatusOf(entry),
    missing: missingLabelsOf(entry),
    cells: shownColumns.value.map((label) => ({
      label,
      value: cellValueOf(entry, label),
      multiline: fieldOf(entry, label).multiline,
      outOfSync: cellOutOfSync(entry, label)
    }))
  }))
})))
/** 窄屏下字段列不压缩：表格按列数定最小宽度，超出部分横向滚动（table-layout: fixed 才生效） */
const tableMinWidth = computed(() => 672 + shownColumns.value.length * 180)
/** 记录面板始终按 id 现取现渲染：写回后 store 换新对象，面板不会停在旧正文上 */
const recordEntry = computed(() => (props.worldbook?.entries || [])
  .find((entry) => String(entry?.id) === recordId.value) || null)

function isColumnShown(label) {
  return shownLabels.value.includes(label)
}

function toggleColumn(label) {
  shownLabels.value = isColumnShown(label)
    ? shownLabels.value.filter((item) => item !== label)
    : [...shownLabels.value, label]
}

// 浮层要能像它出现那样消失：点面板外任何地方、或按 Esc，都收起（Esc 在格子编辑中时让给编辑器）
function onShellPointerDown(event) {
  if (!columnsOpen.value) return
  if (event.target?.closest?.('.edt-columns-wrap')) return
  columnsOpen.value = false
}

function onShellKeyDown(event) {
  if (event.key !== 'Escape' || !columnsOpen.value || editing.entryId) return
  columnsOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onShellPointerDown, true)
  document.addEventListener('keydown', onShellKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onShellPointerDown, true)
  document.removeEventListener('keydown', onShellKeyDown)
})

/** 共享过滤的回退口：表格这边不清空别家的状态，只是把同一份真相改回「不收窄」 */
function clearFilters() {
  emit('update:filters', { cat: '', status: '', tier: '' })
}

function isEditing(entryId, label) {
  return editing.entryId === String(entryId) && editing.label === label
}

function flash(message, isError = false) {
  notice.value = message
  noticeIsError.value = isError
}

/** 唯一的写入口：durable 接缝失败会抛错，store 已回滚，界面按派生渲染自然显示旧值 */
async function persist(entry, updates) {
  const worldbookId = String(props.worldbook?.id || '')
  if (!worldbookId || !entry?.id) return false
  savingId.value = entry.id
  try {
    await worldStore.updateEntry(worldbookId, entry.id, updates)
    await worldStore.loadWorldbooksIndex()
    flash(tr('已写入这本书的世界书文件'))
    return true
  } catch (error) {
    flash(tr('保存失败，内容未改动：{reason}', { reason: String(error?.message || tr('世界书写入失败')) }), true)
    return false
  } finally {
    savingId.value = ''
  }
}

function startEdit(entry, label) {
  if (savingId.value) return
  escapeRequested = false
  editing.entryId = String(entry.id)
  editing.label = label
  draftText.value = label === 'name' ? String(entry.name || '') : cellValueOf(entry, label)
  nextTick(() => shellRef.value?.querySelector('[data-test="edt-editor"]')?.focus())
}

function cancelEdit() {
  escapeRequested = true
  editing.entryId = ''
  editing.label = ''
  draftText.value = ''
}

function commitEdit(entry, label) {
  // 提交后编辑器随 v-if 卸载，卸载过程还会补发一次 blur：那一次草案已被清空，
  // 不加这道闸就会把刚写进去的值当成「作者清空了这一格」再写一遍空值。
  if (!isEditing(entry?.id, label)) return
  const draft = draftText.value
  const wasCancelled = escapeRequested
  editing.entryId = ''
  editing.label = ''
  draftText.value = ''
  escapeRequested = false
  if (wasCancelled) return
  applyCellEdit(entry, label, draft)
}

function applyCellEdit(entry, label, rawNext) {
  const next = String(rawNext ?? '').trim()
  if (!entry?.id) return
  if (label === 'name') {
    if (!next || next === String(entry.name || '').trim()) return
    void persist(entry, {
      name: next,
      keys: renameEntryKeys({ keys: entry.keys, previousName: entry.name, nextName: next })
    })
    return
  }
  if (next === cellValueOf(entry, label)) return
  if (!hasProfile(entry)) {
    // 混排表里的未建档非人物行：正文【标签】本身就是这一格的落点，做定位手术原位替换或文末新建。
    // 它不经过 profile→正文投影，也就没有「字段副本与正文对不上」的状态，因此不需要裁决。
    if (!isCharacterEntry(entry)) {
      const current = String(entry.content || '')
      const nextContent = setLabeledBlock(current, label, next)
      if (nextContent === current) return
      void persist(entry, { content: nextContent })
      return
    }
    // 人物行不替作者猜模板（改了会把行悄悄绑成默认模板并谎报缺项）
    flash(tr('这一行还没选模板：点「展开」在表单里选好模板，再回来改字段'), true)
    return
  }
  const profile = profileOf(entry)
  // 先留正文原样的投影：等于正文就说明正文全是字段生成的，没有手写内容，改格可以直接覆盖（不打断）
  const baseline = getProfileTemplate(profile.template).renderToContent(profile)
  profile.values[fieldOf(entry, label).key] = next
  saveProfile(entry, profile, baseline)
}

function commitAxis(entry, field, value) {
  if (!entry?.id) return
  if (String(entry[field] ?? '') === String(value ?? '')) return
  void persist(entry, { [field]: value })
}

/** 与编辑台 applyProfileSave 同一载荷口径：角色声口横切同步写顶层 speechStyle/samples */
function profilePayload(entry, profile, overwrite) {
  const speech = profile.speech || {}
  return {
    profile,
    ...normalizeNarrativeVoiceProfile({
      speechStyle: speech.speechStyle || '',
      samples: Array.isArray(speech.samples) ? speech.samples : []
    }, entry.name),
    ...(overwrite ? { content: getProfileTemplate(profile.template).renderToContent(profile) } : {})
  }
}

function saveProfile(entry, profile, baselineRendered = null) {
  const rendered = getProfileTemplate(profile.template).renderToContent(profile)
  const current = String(entry.content || '').trim()
  // 投影为空或已一致：无需裁决（空投影只存字段；一致投影即原文）
  if (!rendered || rendered === current) {
    void persist(entry, profilePayload(entry, profile, Boolean(rendered) && rendered === current))
    return
  }
  // 正文原本就是这些字段的逐字投影（没有手写内容）：改格只是重算投影，直接覆盖，不打断作者
  if (baselineRendered !== null && baselineRendered === current) {
    void persist(entry, profilePayload(entry, profile, true))
    return
  }
  if (!contentPolicy.value) {
    pendingEdit.value = {
      entryId: String(entry.id),
      profile,
      baselineUpdatedAt: entry.metadata?.updatedAt ?? null
    }
    return
  }
  void persist(entry, profilePayload(entry, profile, contentPolicy.value === 'overwrite'))
}

function togglePolicy() {
  contentPolicy.value = contentPolicy.value === 'overwrite' ? 'fields-only' : 'overwrite'
  flash(contentPolicy.value === 'overwrite' ? tr('之后字段编辑会覆盖条目正文') : tr('之后字段编辑只存字段，不动条目正文'))
}

function resolvePolicy(overwrite) {
  const pending = pendingEdit.value
  pendingEdit.value = null
  if (!pending) return
  contentPolicy.value = overwrite ? 'overwrite' : 'fields-only'
  const entry = (props.worldbook?.entries || []).find((item) => String(item?.id) === pending.entryId)
  // 异步竞争守卫：裁决期间这条被别处改过（updatedAt 变了）就丢弃旧草案，不拿旧上下文覆盖新事实
  if (!entry || (entry.metadata?.updatedAt ?? null) !== pending.baselineUpdatedAt) {
    flash(tr('这条人物刚被改过，这一格的改动已丢弃，请重新编辑'), true)
    return
  }
  void persist(entry, profilePayload(entry, pending.profile, overwrite))
}

async function addCharacter() {
  const worldbookId = String(props.worldbook?.id || '')
  if (!worldbookId || savingId.value) return
  const english = uiLocale.value === 'en'
  const name = english ? 'New character' : '新角色'
  savingId.value = 'new'
  try {
    await worldStore.addEntry(worldbookId, {
      name,
      type: 'character',
      keys: [name],
      content: '',
      injection: {
        mode: 'selective',
        probability: 100,
        cooldown: 0,
        depth: 1,
        excludeRecursion: false,
        group: english ? 'Characters' : '角色'
      }
    })
    await worldStore.loadWorldbooksIndex()
    groupKey.value = ''
    flash(tr('已新建人物，先在表单里选模板'))
  } catch (error) {
    flash(tr('保存失败，内容未改动：{reason}', { reason: String(error?.message || tr('世界书写入失败')) }), true)
  } finally {
    savingId.value = ''
  }
}

// 删行两步制：第一次点只是把这一行装填（界面内确认，不弹系统对话框），第二次才真删。
// 写链与增改同一条 durable 接缝（失败回滚＋世界书文件双写；镜像按整域重渲染，不留 md/graph 孤儿）。
function armDelete(entry) {
  if (savingId.value) return
  deleteArmId.value = String(entry.id || '')
  flash(tr('再点一次「确认删除」就摘掉这一行（条目正文与字段一起删）；结算台账类条目不在表里，不会被误摘'))
}

function disarmDelete() {
  deleteArmId.value = ''
}

async function confirmDelete(entry) {
  const worldbookId = String(props.worldbook?.id || '')
  deleteArmId.value = ''
  if (!worldbookId || !entry?.id || savingId.value) return
  savingId.value = entry.id
  try {
    await worldStore.deleteEntry(worldbookId, entry.id)
    await worldStore.loadWorldbooksIndex()
    if (recordId.value === String(entry.id)) recordId.value = ''
    flash(tr('已删除「{name}」，世界书文件同步更新', { name: String(entry?.name || tr('未命名条目')) }))
  } catch (error) {
    flash(tr('删除失败，内容未改动：{reason}', { reason: String(error?.message || tr('世界书写入失败')) }), true)
  } finally {
    savingId.value = ''
  }
}

function openRecord(entry) {
  recordId.value = String(entry.id || '')
}

function closeRecord() {
  recordId.value = ''
}

function commitRecordName(nextName) {
  const entry = recordEntry.value
  if (!entry) return
  const next = String(nextName ?? '').trim()
  if (!next || next === String(entry.name || '').trim()) return
  void persist(entry, {
    name: next,
    keys: renameEntryKeys({ keys: entry.keys, previousName: entry.name, nextName: next })
  })
}

// 表单侧的保存与格子侧同一条载荷线（profilePayload），区别只在作者已在档案里逐次裁决过
function applyProfileSave({ profile, overwrite }) {
  const entry = recordEntry.value
  if (!entry) return
  void persist(entry, profilePayload(entry, profile, overwrite))
}

// 组头标签（数据值→界面词）与只读浏览器的选项词同一套说法
function groupLabel(group) {
  if (groupKey.value === 'template') {
    return group.id === UNBOUND_TEMPLATE_ID ? tr('未建档') : tr(TEMPLATE_LABELS[group.id] || group.id)
  }
  if (groupKey.value === 'tier') {
    return { core: tr('核心'), support: tr('支撑'), background: tr('背景') }[group.id] || group.id
  }
  return { draft: tr('草稿'), active: tr('激活'), retired: tr('退役') }[group.id] || group.id
}

// 模板列显示词：未建档行不替作者猜模板，与组头标签同一说法
function templateLabelOf(entry) {
  if (!hasProfile(entry)) return '未建档'
  return TEMPLATE_LABELS[String(entry.profile.template).trim()] || '未建档'
}
</script>

<style scoped>
.entry-data-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: 13px/1.6 var(--font-sans);
}

.edt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.edt-title {
  font-size: 14px;
}

.edt-filter {
  width: 160px;
}

.edt-axis {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.edt-axis .select-input {
  min-width: 96px;
}

.edt-columns-wrap {
  position: relative;
}

.edt-column-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 4px 12px;
  width: min(320px, calc(100vw - 48px));
  /* 英文标签会折行，22 项两列在 EN 面比中文高：给到视口相关的上限，避免末尾两项看不见 */
  max-height: min(60vh, 420px);
  overflow: auto;
  padding: 10px 12px;
  /* 浮起的面板在暗面要比所在面更亮：--bg-secondary 在暗色下是「下沉」色（#131314 < 页面 #1b1c1e），
     会把面板压成一块黑洞。raised + float 阴影是 workbench 给浮层定的一对，亮面仍是纯白。 */
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-workbench-raised, var(--bg-secondary));
  box-shadow: var(--shadow-workbench-float, var(--shadow-floating));
}

.edt-column-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 2px 6px;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.edt-column-item:hover {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.edt-notice {
  margin: 0;
  padding: 0 14px;
  font-size: 12px;
  color: var(--text-secondary);
}

.edt-notice.is-error {
  color: var(--warning);
}

.edt-policy,
.edt-shared-filter,
.edt-ask {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0 14px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  font-size: 12px;
}

.edt-ask {
  border-color: color-mix(in srgb, var(--warning) 45%, transparent);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.edt-ask p {
  margin: 0;
  flex: 1;
  min-width: 220px;
}

.edt-ask-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.edt-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  /* 左右内缩刻意不放在这里：钉住的首列必须能盖满整条缝，所以左右 14px 挪进首/末列 */
  padding: 0 0 14px;
}

.edt-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.edt-col {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.edt-col-fixed { width: 108px; }
.edt-col-field { width: 180px; }
/* 操作列两条动作竖排：横排会在 132px 里挤到折行，竖排让「展开／删除」各占一行更好点 */
.edt-col-action { width: 132px; }

.edt-cell-action .ghost-btn,
.edt-cell-action .danger-btn {
  display: block;
  width: 100%;
  margin-top: 4px;
}

.edt-cell-action .ghost-btn:first-child,
.edt-cell-action .danger-btn:first-child {
  margin-top: 0;
}

/* 颜色/描边/焦点由共用控件层（KnowledgeTableControls.css）负责，这里只留排版 */
.edt-col-hide {
  margin-left: 6px;
  padding: 0 4px;
  font: inherit;
}

.edt-group-row th {
  padding: 8px 10px 4px;
  text-align: left;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--text-muted);
  background: var(--bg-secondary);
}

.edt-cell {
  padding: 4px 8px;
  border-bottom: 1px solid var(--hairline-soft, var(--border));
  vertical-align: top;
}

/* 窄屏横向滚动时姓名列钉在左边：滚到字段区还认得出这一行是谁（表头同一列一起钉住）。
   首列多出的左内缩就是原来容器的左右内缩，末列同理，保证整表仍与工具条对齐。 */
.edt-table thead th:first-child,
.edt-cell-name {
  position: sticky;
  left: 0;
  z-index: 2;
  padding-left: 14px;
}

/* 姓名列跟表体同色，表头首格跟表头同色：钉住的两段在横向滚动时各自都不透光 */
.edt-table thead th:first-child {
  z-index: 3;
  background: var(--bg-secondary);
}

.edt-table thead th:last-child,
.edt-table tbody td:last-child {
  padding-right: 14px;
}

.edt-cell-name {
  background: var(--bg-primary);
  box-shadow: inset -1px 0 0 var(--border);
}

/* 格子按钮的形态（占满格子／静默描边／hover 起底／触控 40px）在共用控件层与台账表同源，
   这里只留本表独有的两个状态。 */
/* 已存字段与正文对不上（作者选了「只存字段」）：值照常显示，但显式标记正文还是旧值 */
.edt-cell-btn.is-out-of-sync {
  border-bottom: 1px dashed color-mix(in srgb, var(--warning) 70%, transparent);
}

.edt-cell-btn.is-name {
  font-weight: 600;
}

.edt-editor {
  width: 100%;
  box-sizing: border-box;
}

/* 描边/圆角/底色交给共用控件层（与单行编辑器同一形态），这里只管多行特有的两件事 */
.edt-editor-area {
  display: block;
  min-height: 62px;
  resize: vertical;
}

.edt-cell-blank {
  color: var(--text-muted);
}

.edt-cell-missing {
  font-size: 11px;
}

.edt-missing-list {
  color: var(--warning);
}

.edt-cell-template {
  font-size: 12px;
  color: var(--text-secondary);
}

.edt-axis-select {
  width: 100%;
}

.edt-empty {
  margin: 16px 0 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted);
}

.edt-record-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.edt-record {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
  outline: none;
}

.edt-record-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.edt-record-title {
  margin: 0;
  font-size: 16px;
}

.edt-record-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.edt-record-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 920px) {
  .edt-col-fixed { width: 88px; }
  .edt-toolbar { padding: 8px 10px; }
  .edt-scroll { padding: 0 0 10px; }
  .edt-filter { width: 132px; }
}
</style>
