<template>
  <section class="entry-links-editor" aria-labelledby="entry-links-title">
    <header class="entry-links-head">
      <div>
        <span class="panel-kicker">{{ tr("条目关联") }}</span>
        <h3 id="entry-links-title">{{ tr("关系边（双层落库）") }}</h3>
      </div>
      <span class="entry-links-count">{{ tr("{count} 条关系", { count: rows.length }) }}</span>
    </header>
    <p class="entry-links-hint">
      {{ tr("保存时同步两层：纯引用层（触发条目间链接）与富关系层（类型/立场/暗线/权重）。删除关系同样两层同步。") }}
    </p>

    <datalist id="entry-links-targets">
      <option v-for="candidate in targetOptions" :key="candidate.id" :value="candidate.label">{{ candidate.id }}</option>
    </datalist>

    <div v-if="!rows.length" class="entry-links-empty">{{ tr("暂无关系边，用下方「添加关系」或采纳共现建议。") }}</div>

    <article v-for="(row, index) in rows" :key="index" class="entry-links-row" :class="{ unresolved: !resolveRow(row) }">
      <div class="entry-links-row-main">
        <label>
          {{ tr("目标条目") }}
          <input
            v-model.trim="row.to"
            class="text-input"
            type="text"
            list="entry-links-targets"
            :placeholder="tr('条目名或词条 ID')"
          />
        </label>
        <span class="entry-links-resolve" :class="{ missing: !resolveRow(row) }">
          {{ resolveRow(row) ? resolveRow(row).title : tr("未解析") }}
        </span>
      </div>
      <div class="entry-links-row-attrs">
        <label>
          {{ tr("类型") }}
          <select v-model="row.type" class="select-input">
            <option value="">{{ tr("未指定") }}</option>
            <option v-for="typeValue in typeOptions" :key="typeValue" :value="typeValue">{{ tr(typeValue) }}</option>
            <option v-if="row.type && !typeOptions.includes(row.type)" :value="row.type">{{ tr(row.type) }}</option>
          </select>
        </label>
        <label>
          {{ tr("立场") }}
          <select v-model="row.stance" class="select-input">
            <option value="">{{ tr("未指定") }}</option>
            <option v-for="stance in stances" :key="stance" :value="stance">{{ tr(stance) }}</option>
          </select>
        </label>
        <label class="entry-links-weight">
          {{ tr("权重") }}
          <input v-model.number="row.weight" class="text-input" type="number" min="1" max="99" />
        </label>
        <label class="checkbox-line">
          <input v-model="row.covert" type="checkbox" />
          <span>{{ tr("暗线") }}</span>
        </label>
        <button type="button" class="ghost-btn small" @click="removeRow(index)">{{ tr("删除") }}</button>
      </div>
    </article>

    <div class="entry-links-actions">
      <button type="button" class="ghost-btn" @click="addRow">{{ tr("添加关系") }}</button>
      <button type="button" class="primary-btn" :disabled="saving || !isDirty" @click="saveRows">
        {{ saving ? tr('保存中...') : tr('保存关系（双层同步）') }}
      </button>
      <button v-if="isDirty" type="button" class="ghost-btn small" @click="seedRows">{{ tr("放弃修改") }}</button>
    </div>

    <section class="entry-links-suggest" aria-labelledby="entry-links-suggest-title">
      <h4 id="entry-links-suggest-title">{{ tr("正文共现建议（复核后才写入）") }}</h4>
      <p class="entry-links-hint">{{ tr("扫描正文里出现过的其他条目标题（出现越多权重越高，最多计 3 次）；只有点击采纳才会写入关系。") }}</p>
      <div v-if="!visibleSuggestions.length" class="entry-links-empty">{{ tr("暂无共现建议。") }}</div>
      <article v-for="suggestion in visibleSuggestions" :key="suggestion.to" class="entry-links-suggestion">
        <span class="suggestion-edge">
          {{ tr('{source} ↔ {target}', { source: entryTitle, target: suggestion.toTitle }) }}
        </span>
        <span class="suggestion-evidence">{{ tr('正文出现 {count} 次 · 权重 {weight}', { count: suggestion.count, weight: suggestion.weight }) }}</span>
        <span class="suggestion-actions">
          <button type="button" class="ghost-btn small" @click="adoptSuggestion(suggestion)">{{ tr("采纳") }}</button>
          <button type="button" class="ghost-btn small" @click="ignoreSuggestion(suggestion)">{{ tr("忽略") }}</button>
        </span>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { resolveEntryRef } from '../../services/worldbook/entryBrowserModel.js'
import {
  RELATION_STANCE_VALUES,
  RELATION_TYPE_VALUES,
  applyRelationRows,
  coOccurrenceEdgesForEntry,
  relationRowsFromEntry
} from '../../services/worldbook/entryRelations.js'

const props = defineProps({
  /** 选中条目 */
  entry: { type: Object, required: true },
  /** 全量条目：目标解析（B1 四级兜底）与共现扫描的解析域 */
  entries: { type: Array, default: () => [] },
  /** 当前编辑中的正文（含未保存修改）；共现扫描用 */
  content: { type: String, default: '' },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['save'])

const stances = RELATION_STANCE_VALUES
const rows = ref([])
const ignoredSuggestionIds = ref(new Set())

const entryTitle = computed(() => String(props.entry?.name ?? props.entry?.title ?? props.entry?.id ?? '').trim())
const typeOptions = computed(() => {
  const extra = rows.value
    .map((row) => row.type)
    .filter((type) => type && !RELATION_TYPE_VALUES.includes(type))
  return [...RELATION_TYPE_VALUES, ...new Set(extra)]
})
const targetOptions = computed(() => (Array.isArray(props.entries) ? props.entries : [])
  .filter((candidate) => String(candidate?.id ?? '').trim() && String(candidate?.id ?? '').trim() !== String(props.entry?.id ?? '').trim())
  .map((candidate) => ({
    id: String(candidate.id),
    label: `${candidate.name || candidate.title || candidate.id}`
  })))

function seedRows() {
  rows.value = relationRowsFromEntry(props.entry).map((row) => ({ ...row }))
}

watch(() => props.entry?.id, seedRows, { immediate: true })

const seededJson = computed(() => JSON.stringify(relationRowsFromEntry(props.entry)))
const isDirty = computed(() => JSON.stringify(rows.value.map((row) => ({ ...row }))) !== seededJson.value)

const dirtyRows = computed(() => rows.value.filter((row) => String(row.to ?? '').trim()))

function resolveRow(row) {
  return resolveEntryRef(props.entries, row.to)
}

function addRow() {
  rows.value.push({ to: '', type: '', stance: '', covert: false, weight: 2, src: 'declared' })
}

function removeRow(index) {
  rows.value.splice(index, 1)
}

function saveRows() {
  const payload = applyRelationRows(props.entry, rows.value)
  emit('save', payload)
}

/* ---------- 共现归纳建议（纯前端；只进复核清单，采纳才写入） ---------- */

const liveSuggestions = computed(() => coOccurrenceEdgesForEntry(
  { ...props.entry, content: String(props.content ?? props.entry?.content ?? '') },
  props.entries
))

const visibleSuggestions = computed(() => {
  const rowTargets = new Set(dirtyRows.value.map((row) => String(row.to ?? '').trim()))
  return liveSuggestions.value.filter((suggestion) => !rowTargets.has(suggestion.to) && !ignoredSuggestionIds.value.has(suggestion.to))
})

function adoptSuggestion(suggestion) {
  rows.value.push({
    to: suggestion.to,
    type: '',
    stance: '',
    covert: false,
    weight: suggestion.weight,
    src: 'co-occurrence'
  })
}

function ignoreSuggestion(suggestion) {
  const next = new Set(ignoredSuggestionIds.value)
  next.add(suggestion.to)
  ignoredSuggestionIds.value = next
}

/* ---------- W2·G3 图谱建边对接（GraphCanvas create-edge → 本编辑器走既有契约写回） ---------- */

/**
 * 接收图谱建边结果：fromId 必须是当前编辑条目，toId 是目标条目 id。
 * 命中已有同目标行时原位更新属性（applyRelationRows 按 to 首现去重，盲目追加会丢新属性），
 * 否则追加一条 src='declared' 的行；随后立即走 saveRows 的既有双层写回（emit('save')）。
 * 返回是否受理（父层可据此决定是否提示）。
 */
function createEdge({ fromId, toId, type = '', stance = '', covert = false, weight = 2 } = {}) {
  const selfId = String(props.entry?.id ?? '').trim()
  const targetId = String(toId ?? '').trim()
  if (!selfId || String(fromId ?? '').trim() !== selfId || !targetId || targetId === selfId) return false
  const normalizedWeight = Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 2
  const normalizedStance = stances.includes(stance) ? stance : ''
  const existing = rows.value.find((row) => String(row.to ?? '').trim() === targetId)
  if (existing) {
    existing.type = String(type ?? '')
    existing.stance = normalizedStance
    existing.covert = covert === true
    existing.weight = normalizedWeight
  } else {
    rows.value.push({
      to: targetId,
      type: String(type ?? ''),
      stance: normalizedStance,
      covert: covert === true,
      weight: normalizedWeight,
      src: 'declared'
    })
  }
  saveRows()
  return true
}

defineExpose({ createEdge })
</script>

<style scoped>
.entry-links-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0 8px;
  border-top: 1px dashed var(--border, var(--border-subtle));
}

.entry-links-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.entry-links-head h3 {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry-links-count {
  color: var(--text-secondary);
  font-size: 11px;
}

.entry-links-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--authoring-catalog-meta-size, 11px);
  line-height: 1.5;
}

.entry-links-empty {
  padding: 8px 10px;
  border: 1px dashed var(--border, var(--border-subtle));
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.entry-links-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 6px;
}

.entry-links-row.unresolved {
  border-style: dashed;
}

.entry-links-row-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
}

.entry-links-row-main label,
.entry-links-row-attrs label {
  display: block;
  color: var(--text-secondary);
  font-size: 11px;
}

.entry-links-row-main .text-input,
.entry-links-row-attrs .select-input,
.entry-links-row-attrs .text-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin-top: 3px;
  color: var(--text-primary);
}

.entry-links-resolve {
  padding-bottom: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-all;
}

.entry-links-resolve.missing { color: var(--warning, #b8860b); }

.entry-links-row-attrs {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}

.entry-links-row-attrs label { flex: 1 1 110px; }
.entry-links-row-attrs .entry-links-weight { flex: 0 0 84px; }

.entry-links-row-attrs .checkbox-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding-bottom: 8px;
  color: var(--text-primary);
  font-size: 12px;
}

.entry-links-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.entry-links-suggest {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--border, var(--border-subtle));
}

.entry-links-suggest h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.entry-links-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid var(--border, var(--border-subtle));
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
}

.suggestion-edge { font-weight: 600; word-break: break-all; }
.suggestion-evidence { color: var(--text-secondary); }
.suggestion-actions { display: flex; gap: 6px; margin-left: auto; }

@media (max-width: 720px) {
  .entry-links-row-main { grid-template-columns: 1fr; }
  .entry-links-resolve { padding-bottom: 0; }
  .entry-links-row-attrs label { flex: 1 1 45%; }
}

@media (pointer: coarse) {
  .entry-links-actions button,
  .suggestion-actions button { min-height: 44px; }
}
</style>
