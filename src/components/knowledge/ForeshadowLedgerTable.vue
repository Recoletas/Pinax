<template>
  <section class="flt knowledge-tables" data-test="foreshadow-ledger-table" :aria-label="tr('伏笔台账')">
    <header class="flt-toolbar">
      <b class="flt-title">{{ tr('伏笔台账') }}</b>
      <span class="flt-sub">{{ tr('结算链的机器可读台账：状态只认 未回收 / 已回收 / 作废') }}</span>
      <button
        v-if="ledgerEntry"
        type="button"
        class="primary-btn small"
        data-test="flt-add"
        :disabled="Boolean(draft)"
        @click="startDraft"
      >{{ tr('＋ 登记一条伏笔') }}</button>
    </header>

    <p v-if="notice" class="flt-notice" :class="{ 'is-error': noticeIsError }" role="status" data-test="flt-notice">{{ notice }}</p>

    <div v-if="!ledgerEntry" class="flt-empty" data-test="flt-unbound">
      <span>{{ tr('这本书的世界书里还没有伏笔台账。建立后，章回结算写台账时会复用同一条目。') }}</span>
      <button type="button" class="primary-btn small" data-test="flt-create" @click="createLedger">{{ tr('建立伏笔台账') }}</button>
    </div>

    <div v-else class="flt-scroll">
      <table class="flt-table">
        <thead>
          <tr>
            <th class="flt-col flt-col-fid">{{ tr('fid') }}</th>
            <th class="flt-col flt-col-content">{{ tr('内容') }}</th>
            <th class="flt-col">{{ tr('埋点') }}</th>
            <th class="flt-col">{{ tr('预定回收') }}</th>
            <th class="flt-col flt-col-status">{{ tr('状态') }}</th>
            <th class="flt-col flt-col-action">{{ tr('操作') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="draft" class="flt-row is-draft" data-test="flt-draft-row">
            <td class="flt-cell"><input v-model.trim="draft.fid" class="text-input" data-test="flt-draft-fid" :placeholder="tr('如 F01')" :aria-label="tr('fid')" /></td>
            <td class="flt-cell"><input v-model.trim="draft.content" class="text-input" data-test="flt-draft-content" :placeholder="tr('埋了什么')" :aria-label="tr('内容')" /></td>
            <td class="flt-cell"><input v-model.trim="draft.plantedAt" class="text-input" :placeholder="tr('第几章/哪一幕')" :aria-label="tr('埋点')" /></td>
            <td class="flt-cell"><input v-model.trim="draft.dueBy" class="text-input" :placeholder="tr('打算在哪收')" :aria-label="tr('预定回收')" /></td>
            <td class="flt-cell">
              <select v-model="draft.status" class="select-input" :aria-label="tr('状态')">
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </td>
            <td class="flt-cell flt-cell-action">
              <button type="button" class="primary-btn small" data-test="flt-draft-save" @click="commitDraft">{{ tr('落盘') }}</button>
              <button type="button" class="ghost-btn small" data-test="flt-draft-cancel" @click="draft = null">{{ tr('取消') }}</button>
            </td>
          </tr>
          <tr v-for="row in rows" :key="row.fid" class="flt-row" :data-fid="row.fid">
            <td class="flt-cell flt-cell-fid" :title="tr('fid 是台账主键，改编号请另起一行再删旧行')">
              <span class="flt-fid">{{ row.fid }}</span>
            </td>
            <td v-for="field in TEXT_FIELDS" :key="`${row.fid}-${field.key}`" class="flt-cell">
              <input
                v-if="isEditing(row.fid, field.key)"
                v-model="draftText"
                class="text-input flt-editor"
                type="text"
                data-test="flt-editor"
                @blur="commitCell(row, field.key)"
                @keydown.enter.prevent="commitCell(row, field.key)"
                @keydown.esc="cancelEdit"
              />
              <button
                v-else
                type="button"
                :class="['flt-cell-btn', { 'is-empty': !row[field.key] }]"
                :data-test="field.test"
                :disabled="saving"
                @click="startEditCell(row, field.key)"
              >{{ row[field.key] || tr('点击填写') }}</button>
            </td>
            <td class="flt-cell">
              <select
                class="select-input flt-status"
                :value="row.status"
                data-test="flt-status"
                :aria-label="tr('状态')"
                @change="commitStatus(row, $event.target.value)"
              >
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </td>
            <td class="flt-cell flt-cell-action">
              <template v-if="armFid === row.fid">
                <button type="button" class="danger-btn small" data-test="flt-delete-yes" @click="confirmRemove(row)">{{ tr('确认删除') }}</button>
                <button type="button" class="ghost-btn small" data-test="flt-delete-no" @click="armFid = ''">{{ tr('留着') }}</button>
              </template>
              <button v-else type="button" class="ghost-btn small flt-delete-btn" data-test="flt-delete" @click="armRemove(row)">{{ tr('删行') }}</button>
            </td>
          </tr>
          <tr v-if="!rows.length && !draft" class="flt-row">
            <td class="flt-cell flt-cell-blank" :colspan="6">{{ tr('台账还是空的：点上方「＋ 登记一条伏笔」就能落第一行。') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { tr } from '../../i18n/index.js'
import { useWorldStore } from '../../stores/worldStore'
import {
  FORESHADOW_STATUSES,
  foreshadowLedgerEntryDraft,
  isForeshadowLedgerEntry,
  parseForeshadowLedger,
  removeForeshadowLedgerRow,
  updateForeshadowLedger
} from '../../services/worldbook/settlementService.js'
import './KnowledgeTableControls.css'

/**
 * 伏笔台账表（W3-A-2 第二张表）。行不是世界书条目，而是**结算链已有的那份台账条目正文里的表格行**：
 * 真源仍是 `extra.auxRole='foreshadow-ledger'` 条目的 content（`伏笔/台账.md` 同款骨架），
 * 解析与写回全部复用 settlementService 的 parse / upsert / remove 三个纯函数，表格不发明第二套行格式。
 * fid 是主键，因此表内只读它、不改它（改主键=删旧行＋加新行，会连带丢掉回收历史）；
 * 状态三值 open|paid|retired 由 settlement 定义，界面只翻标签，不增删档位。
 * 写链与人物表同一条 durable 接缝（失败回滚＋世界书文件双写），零新存储源。
 */

const props = defineProps({
  worldbook: { type: Object, default: null }
})

const worldStore = useWorldStore()

const STATUS_OPTIONS = [
  { value: 'open', label: tr('未回收') },
  { value: 'paid', label: tr('已回收') },
  { value: 'retired', label: tr('作废') }
]

/** 可在表里直接改的文本列（fid 主键与 status 枚举各有专门格子，不在这里） */
const TEXT_FIELDS = [
  { key: 'content', test: 'flt-content-cell' },
  { key: 'plantedAt', test: 'flt-plant-cell' },
  { key: 'dueBy', test: 'flt-due-cell' }
]

const notice = ref('')
const noticeIsError = ref(false)
const saving = ref(false)
const draft = ref(null)
const armFid = ref('')
const editing = ref({ fid: '', field: '' })
const draftText = ref('')

const ledgerEntry = computed(() => (Array.isArray(props.worldbook?.entries) ? props.worldbook.entries : [])
  .find((entry) => isForeshadowLedgerEntry(entry)) || null)
const rows = computed(() => parseForeshadowLedger(ledgerEntry.value?.content))

function flash(message, isError = false) {
  notice.value = message
  noticeIsError.value = isError
}

function isEditing(fid, field) {
  return editing.value.fid === fid && editing.value.field === field
}

/** 唯一写入口：整张表就是一次 content 覆写，失败由 durable 接缝回滚 */
async function writeRows(nextText) {
  const entry = ledgerEntry.value
  const worldbookId = String(props.worldbook?.id || '')
  if (!entry || !worldbookId || nextText === String(entry.content || '')) return false
  saving.value = true
  try {
    await worldStore.updateEntry(worldbookId, entry.id, { content: nextText })
    await worldStore.loadWorldbooksIndex()
    flash(tr('已写入这本书的世界书文件'))
    return true
  } catch (error) {
    flash(tr('保存失败，内容未改动：{reason}', { reason: String(error?.message || tr('世界书写入失败')) }), true)
    return false
  } finally {
    saving.value = false
  }
}

async function createLedger() {
  const worldbookId = String(props.worldbook?.id || '')
  if (!worldbookId || saving.value) return
  saving.value = true
  try {
    await worldStore.addEntry(worldbookId, foreshadowLedgerEntryDraft())
    await worldStore.loadWorldbooksIndex()
    flash(tr('伏笔台账已建立（与章回结算共用同一条目）'))
  } catch (error) {
    flash(tr('建立失败：{reason}', { reason: String(error?.message || tr('世界书写入失败')) }), true)
  } finally {
    saving.value = false
  }
}

function startDraft() {
  draft.value = { fid: '', content: '', plantedAt: '', dueBy: '', status: 'open' }
}

function commitDraft() {
  const row = draft.value
  if (!row) return
  const fid = String(row.fid || '').trim()
  if (!fid) {
    flash(tr('fid 是台账主键，先给个编号（例如 F01）'), true)
    return
  }
  // upsert 的语义是同 fid 原位替换：拿它新增会静默改掉已有行，所以这里先拦住
  if (rows.value.some((item) => item.fid === fid)) {
    flash(tr('台账里已经有 {fid} 这一行了：要改它就点那一格，要另起一条请换个编号', { fid }), true)
    return
  }
  writeRows(updateForeshadowLedger(String(ledgerEntry.value?.content || ''), row)).then((ok) => {
    if (ok) draft.value = null
  })
}

function commitStatus(row, value) {
  if (!FORESHADOW_STATUSES.includes(String(value))) return
  void writeRows(updateForeshadowLedger(String(ledgerEntry.value?.content || ''), { ...row, status: value }))
}

function commitCell(row, field) {
  if (!isEditing(row.fid, field)) return
  const next = draftText.value.trim()
  editing.value = { fid: '', field: '' }
  draftText.value = ''
  if (next === String(row[field] ?? '')) return
  void writeRows(updateForeshadowLedger(String(ledgerEntry.value?.content || ''), { ...row, [field]: next }))
}

function armRemove(row) {
  if (saving.value) return
  armFid.value = row.fid
  flash(tr('再点一次「确认删除」就把 {fid} 这一行从台账摘掉；伏笔本体若已写进条目正文，需要你另去那条里处理', { fid: row.fid }))
}

function confirmRemove(row) {
  armFid.value = ''
  const next = removeForeshadowLedgerRow(String(ledgerEntry.value?.content || ''), row.fid)
  if (next === String(ledgerEntry.value?.content || '')) {
    flash(tr('没有匹配的台账行，未写入'), true)
    return
  }
  void writeRows(next)
}

function startEditCell(row, field) {
  if (saving.value) return
  editing.value = { fid: row.fid, field }
  draftText.value = String(row[field] ?? '')
  nextTick(() => document.querySelector('[data-test="flt-editor"]')?.focus())
}

function cancelEdit() {
  editing.value = { fid: '', field: '' }
  draftText.value = ''
}
</script>

<style scoped>
.flt {
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

.flt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.flt-title {
  font-size: 14px;
}

.flt-sub {
  flex: 1;
  min-width: 200px;
  color: var(--text-muted);
  font-size: 12px;
}

.flt-notice {
  margin: 0;
  padding: 0 14px;
  font-size: 12px;
  color: var(--text-secondary);
}

.flt-notice.is-error {
  color: var(--warning);
}

.flt-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 14px;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.flt-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 0 14px;
}

.flt-table {
  width: max(100%, 860px);
  border-collapse: collapse;
  table-layout: fixed;
}

.flt-col {
  width: 150px;
  text-align: left;
}

.flt-col-fid { width: 96px; }
.flt-col-content { width: auto; }
.flt-col-status { width: 120px; }
.flt-col-action { width: 132px; }

.flt-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

/* fid 列在表体是钉住的（.flt-cell-fid，z-index 2），表头首格也一起钉左并压过它：
   不然纵向滚动时钉住的格子会从表头底下透出来，横向滚动时表头又跟不上首列。 */
.flt-table thead th:first-child {
  left: 0;
  z-index: 3;
}

.flt-cell {
  padding: 6px 10px;
  border-bottom: 1px solid var(--hairline-soft, var(--border));
  vertical-align: top;
  word-break: break-word;
}

.flt-cell-fid {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--bg-primary);
  padding-left: 14px;
  box-shadow: inset -1px 0 0 var(--border);
  font-variant-numeric: tabular-nums;
}

.flt-fid {
  font-weight: 600;
}

.flt-cell-blank {
  color: var(--text-muted);
  font-size: 12px;
}

.flt-editor {
  width: 100%;
}

/* 格子里的按钮形态与人物表同源，见 KnowledgeTableControls.css */

.flt-row.is-draft .flt-cell {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.flt-status {
  width: 100%;
}

.flt-cell-action .ghost-btn,
.flt-cell-action .danger-btn,
.flt-cell-action .primary-btn {
  display: block;
  width: 100%;
  margin-top: 4px;
}

.flt-cell-action .ghost-btn:first-child,
.flt-cell-action .danger-btn:first-child,
.flt-cell-action .primary-btn:first-child {
  margin-top: 0;
}
</style>
