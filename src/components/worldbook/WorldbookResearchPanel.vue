<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { tr } from '../../i18n'
import {
  WORLDBOOK_RESEARCH_PROVIDERS,
  getWorldbookResearchSettings,
  saveWorldbookResearchSettings,
  planWorldbookResearchQueries,
  searchWorldbookSources,
  fetchWorldbookSourcePages
} from '../../services/worldbook/worldbookResearch'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

// 世界书·联网调研面板：问题输入 → 检索计划 → 联网搜索与正文抓取 → 发现列表。
// 能力全部来自 worldbookResearch 服务；面板只做编排与展示，不写回世界书数据。
// 后端依赖既有 /api/research/search 与 /api/research/fetch（见 server/routes/research.js）。

const props = defineProps({
  worldbook: { type: Object, default: null }
})

const PHASE_IDLE = 'idle'
const PHASE_PLANNING = 'planning'
const PHASE_PLANNED = 'planned'
const PHASE_RUNNING = 'running'
const PHASE_DONE = 'done'

const settings = ref(getWorldbookResearchSettings())
const brief = ref('')
const genreLabel = ref('')
const nameHint = ref('')
const phase = ref(PHASE_IDLE)
const plan = ref(null)
const findings = ref([])
const notices = ref([])
const error = ref('')
const expandedSourceId = ref('')

let abortController = null
let sequence = 0

onMounted(() => {
  // 首次进入用当前世界书的基础设定预填研究问题，减少一次转写。
  if (!brief.value.trim() && props.worldbook) {
    brief.value = String(props.worldbook.worldDescription || props.worldbook.description || '').trim()
    nameHint.value = String(props.worldbook.name || '').trim()
  }
})

onBeforeUnmount(() => {
  sequence += 1
  if (abortController) abortController.abort()
})

const busy = computed(() => phase.value === PHASE_PLANNING || phase.value === PHASE_RUNNING)
const providerMeta = computed(() => WORLDBOOK_RESEARCH_PROVIDERS.find((item) => item.value === settings.value.provider) || WORLDBOOK_RESEARCH_PROVIDERS[0])
const canPlan = computed(() => brief.value.trim().length >= 4 && !busy.value)
const canRun = computed(() => Boolean(plan.value?.queries?.length) && !busy.value)
const plannedByLabel = computed(() => (plan.value?.plannedBy === 'ai' ? tr('AI 规划') : tr('本地兜底')))

const SOURCE_KIND_LABELS = {
  institutional: '机构/参考',
  'academic-or-cultural': '学术/文化',
  'official-reference': '官方参考',
  'general-web': '一般网页',
  unknown: '网页'
}

function sourceKindLabel(source) {
  const key = String(source?.sourceKind || 'unknown')
  return SOURCE_KIND_LABELS[key] ? tr(SOURCE_KIND_LABELS[key]) : tr('网页')
}

function persistSettings() {
  settings.value = saveWorldbookResearchSettings(settings.value)
}

function toggleSource(source) {
  expandedSourceId.value = expandedSourceId.value === String(source?.id || '') ? '' : String(source?.id || '')
}

async function makePlan() {
  if (!canPlan.value) return
  const currentSequence = ++sequence
  if (abortController) abortController.abort()
  abortController = new AbortController()
  phase.value = PHASE_PLANNING
  error.value = ''
  try {
    const result = await planWorldbookResearchQueries({
      brief: brief.value,
      genreLabel: genreLabel.value,
      nameHint: nameHint.value,
      maxQueries: settings.value.maxQueries,
      signal: abortController.signal
    })
    if (currentSequence !== sequence) return
    plan.value = result
    phase.value = PHASE_PLANNED
  } catch (caught) {
    if (caught?.name === 'AbortError' || currentSequence !== sequence) return
    // 服务内部已兜底本地规划；能走到这里的异常属于配置解析等意外，直接展示。
    plan.value = null
    error.value = caught?.message || tr('检索规划失败，请稍后重试。')
    phase.value = PHASE_IDLE
  }
}

async function runSearch() {
  if (!canRun.value) return
  const currentSequence = ++sequence
  if (abortController) abortController.abort()
  abortController = new AbortController()
  const signal = abortController.signal
  phase.value = PHASE_RUNNING
  error.value = ''
  findings.value = []
  notices.value = plan.value?.warning ? [plan.value.warning] : []
  expandedSourceId.value = ''
  try {
    const search = await searchWorldbookSources({
      queries: plan.value.queries,
      settings: settings.value,
      signal
    })
    if (currentSequence !== sequence) return
    let sourceEvidence = { sources: [], warnings: [] }
    try {
      sourceEvidence = await fetchWorldbookSourcePages({ sources: search.results, signal })
    } catch (fetchError) {
      if (fetchError?.name === 'AbortError') return
      sourceEvidence = {
        sources: [],
        warnings: [tr('正文抓取不可用，当前仅显示搜索摘要：{reason}', { reason: fetchError?.message || tr('未知错误') })]
      }
    }
    if (currentSequence !== sequence) return
    const fetchedById = new Map((sourceEvidence.sources || []).map((source) => [source.id, source]))
    findings.value = (Array.isArray(search.results) ? search.results : []).map((source) => ({
      ...source,
      ...(fetchedById.get(source.id) || {})
    }))
    notices.value = [...notices.value, ...(search.warnings || []), ...(sourceEvidence.warnings || [])].slice(-8)
    phase.value = PHASE_DONE
  } catch (caught) {
    if (caught?.name === 'AbortError' || currentSequence !== sequence) return
    error.value = caught?.message || tr('联网检索失败，请检查检索设置后重试。')
    phase.value = PHASE_PLANNED
  }
}

function stopResearch() {
  if (abortController) abortController.abort()
  sequence += 1
  phase.value = plan.value ? PHASE_PLANNED : PHASE_IDLE
}

const findingsCount = computed(() => findings.value.length)
const queryCount = computed(() => plan.value?.queries?.length || 0)
</script>

<template>
  <div class="research-panel" data-test="worldbook-research-panel">
    <p class="research-panel__intro">{{ tr("从一个研究问题出发：AI 规划互补的联网检索词，搜索并抓取可靠来源，作为世界书设定的外部依据。") }}</p>

    <div class="research-form">
      <label class="research-form__field research-form__field--brief">
        {{ tr("研究问题") }}
        <textarea
          v-model.trim="brief"
          class="research-form__textarea"
          rows="3"
          data-test="research-brief-input"
          :placeholder="tr('例如：清代漕运如何运作，对沿河城镇有哪些影响？')"
          :disabled="busy"
        ></textarea>
      </label>
      <div class="research-form__row">
        <label class="research-form__field">
          {{ tr("类型标签（可选）") }}
          <input v-model.trim="genreLabel" class="research-form__input" type="text" data-test="research-genre-input" :placeholder="tr('例如：历史')" :disabled="busy" />
        </label>
        <label class="research-form__field">
          {{ tr("名称提示（可选）") }}
          <input v-model.trim="nameHint" class="research-form__input" type="text" data-test="research-name-input" :placeholder="tr('例如：霜港')" :disabled="busy" />
        </label>
      </div>
    </div>

    <div class="research-actions">
      <button type="button" class="control-secondary" data-test="research-plan-btn" :disabled="!canPlan" @click="makePlan">
        <WorkbenchIcon name="sparkles" :size="15" />
        {{ phase === PHASE_PLANNING ? tr("规划中…") : plan ? tr("重新规划") : tr("生成检索计划") }}
      </button>
      <button v-if="plan" type="button" class="control-primary" data-test="research-run-btn" :disabled="!canRun" @click="runSearch">
        <WorkbenchIcon name="search" :size="15" />
        {{ phase === PHASE_RUNNING ? tr("检索中…") : tr("开始检索") }}
      </button>
      <button v-if="busy" type="button" class="control-quiet" data-test="research-cancel-btn" @click="stopResearch">
        {{ tr("停止") }}
      </button>
    </div>

    <details class="research-settings" data-test="research-settings-toggle">
      <summary>
        <WorkbenchIcon name="settings" :size="14" />
        {{ tr("检索设置") }}
        <span class="research-settings__summary-meta">{{ providerMeta.label }} · {{ tr("{count} 个检索词", { count: settings.maxQueries }) }}</span>
      </summary>
      <div class="research-settings__body">
        <label class="research-settings__field">
          {{ tr("检索渠道") }}
          <select v-model="settings.provider" data-test="research-provider-select" @change="persistSettings">
            <option v-for="item in WORLDBOOK_RESEARCH_PROVIDERS" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label v-if="providerMeta.needsKey" class="research-settings__field">
          {{ tr("API Key") }}
          <input
            v-model="settings.apiKey"
            class="research-settings__input"
            type="password"
            autocomplete="off"
            data-test="research-api-key-input"
            :placeholder="tr('留空时使用服务器环境变量')"
            @change="persistSettings"
          />
        </label>
        <label class="research-settings__field research-settings__field--narrow">
          {{ tr("检索词数量") }}
          <select v-model.number="settings.maxQueries" data-test="research-max-queries-select" @change="persistSettings">
            <option v-for="count in 4" :key="count" :value="count">{{ count }}</option>
          </select>
        </label>
        <label class="research-settings__field research-settings__field--narrow">
          {{ tr("每词结果数") }}
          <select v-model.number="settings.maxResults" data-test="research-max-results-select" @change="persistSettings">
            <option v-for="count in 5" :key="count + 1" :value="count + 1">{{ count + 1 }}</option>
          </select>
        </label>
        <p class="research-settings__hint">{{ tr("设置保存在本机浏览器，不上传。SearXNG 需要服务器配置 SEARXNG_BASE_URL。") }}</p>
      </div>
    </details>

    <p v-if="error" class="research-panel__error" data-test="research-error" role="alert">
      <WorkbenchIcon name="close" :size="14" />
      {{ error }}
    </p>

    <section v-if="plan" class="research-plan" data-test="research-plan" :aria-label="tr('检索计划')">
      <header class="research-plan__head">
        <h3>{{ tr("检索计划") }}</h3>
        <span class="research-plan__badge" :class="{ 'is-local': plan.plannedBy !== 'ai' }" data-test="research-plan-badge">{{ plannedByLabel }}</span>
        <span class="research-plan__count" data-test="research-plan-count">{{ tr("{count} 个检索词", { count: queryCount }) }}</span>
      </header>
      <p v-if="plan.warning" class="research-plan__warning" role="status">{{ plan.warning }}</p>
      <p v-if="plan.intent" class="research-plan__intent">{{ tr("规划意图") }}：{{ plan.intent }}</p>
      <ol class="research-plan__queries" data-test="research-plan-queries">
        <li v-for="(query, index) in plan.queries" :key="`${index}:${query}`" class="research-plan__query" data-test="research-plan-query">
          <span class="research-plan__query-index">{{ index + 1 }}</span>
          <span class="research-plan__query-text">{{ query }}</span>
        </li>
      </ol>
    </section>

    <section v-if="phase === PHASE_DONE || findingsCount" class="research-findings" data-test="research-findings" :aria-label="tr('检索发现')">
      <header class="research-findings__head">
        <h3>{{ tr("检索发现") }}</h3>
        <span class="research-findings__count" data-test="research-findings-count">{{ tr("{count} 条来源", { count: findingsCount }) }}</span>
      </header>
      <p v-if="!findingsCount" class="research-findings__empty" data-test="research-findings-empty" role="status">
        {{ tr("这次检索没有返回可用来源；可调整研究问题或检索设置后重试。") }}
      </p>
      <ul v-else class="research-findings__list">
        <li
          v-for="source in findings"
          :key="source.id"
          class="research-finding"
          :class="{ 'is-expanded': expandedSourceId === String(source.id) }"
          data-test="research-source-item"
        >
          <div class="research-finding__row">
            <span class="research-finding__kind" :data-quality="source.quality === 'priority' ? 'priority' : 'normal'">{{ sourceKindLabel(source) }}</span>
            <div class="research-finding__identity">
              <a class="research-finding__title" :href="source.url" target="_blank" rel="noopener noreferrer">
                {{ source.title || source.url }}
                <WorkbenchIcon name="arrow-up" :size="13" />
              </a>
              <p class="research-finding__snippet">{{ source.snippet || tr("（无摘要）") }}</p>
            </div>
            <span class="research-finding__evidence" :class="{ 'is-page': source.evidenceLevel === 'page' }">
              {{ source.evidenceLevel === 'page' ? tr("全文") : tr("摘要") }}
            </span>
            <button
              type="button"
              class="research-finding__expand control-quiet"
              :aria-expanded="expandedSourceId === String(source.id)"
              data-test="research-source-expand"
              @click="toggleSource(source)"
            >
              {{ expandedSourceId === String(source.id) ? tr("收起正文") : tr("查看正文") }}
            </button>
          </div>
          <div v-if="expandedSourceId === String(source.id)" class="research-finding__body" :aria-label="tr('来源正文')">
            <p v-if="source.fetchError" class="research-finding__fetch-error" role="status">
              {{ tr("正文抓取失败，显示搜索摘要：{reason}", { reason: source.fetchError.message || tr("未知错误") }) }}
            </p>
            <pre>{{ source.content || source.snippet || tr("（无可显示内容）") }}</pre>
          </div>
        </li>
      </ul>
      <ul v-if="notices.length" class="research-panel__notices">
        <li v-for="(notice, index) in notices" :key="`${index}:${notice}`" role="status">{{ notice }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>

.research-panel { display: flex; flex-direction: column; gap: 16px; min-width: 0; color: var(--text-primary); }
.research-panel__intro { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-secondary); }

.research-form { display: flex; flex-direction: column; gap: 12px; }
.research-form__row { display: flex; flex-wrap: wrap; gap: 12px; }
.research-form__field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); min-width: 0; }
.research-form__field--brief { flex: 1; }
.research-form__row .research-form__field { flex: 1 1 220px; }
.research-form__textarea,
.research-form__input { width: 100%; min-width: 0; padding: 9px 12px; border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-control, 12px); background: var(--surface-workbench-input, var(--surface-workbench-muted)); color: var(--text-primary); font: 14px/1.6 var(--font-sans); outline: 0; }
.research-form__textarea { resize: vertical; min-height: 72px; }
.research-form__textarea:focus-visible,
.research-form__input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.research-form__textarea:disabled,
.research-form__input:disabled { opacity: 0.55; }

.research-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.research-actions .control-primary,
.research-actions .control-secondary,
.research-actions .control-quiet { display: inline-flex; align-items: center; gap: 7px; }

.research-settings { border-top: 1px solid var(--hairline-soft, var(--border)); padding-top: 10px; }
.research-settings > summary { display: inline-flex; align-items: center; gap: 8px; padding: 6px 2px; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; list-style: none; }
.research-settings > summary::-webkit-details-marker { display: none; }
.research-settings > summary:hover { color: var(--text-primary); }
.research-settings__summary-meta { font-weight: 400; color: var(--text-secondary); }
.research-settings__body { display: flex; flex-wrap: wrap; gap: 12px; padding: 10px 2px 2px; }
.research-settings__field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.research-settings__field--narrow { flex: 0 0 130px; }
.research-settings__field select,
.research-settings__input { min-height: 36px; padding: 6px 12px; border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-control, 12px); background: var(--surface-workbench-input, var(--surface-workbench-muted)); color: var(--text-primary); font: 14px/1.5 var(--font-sans); outline: 0; }
.research-settings__field select:focus-visible,
.research-settings__input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.research-settings__hint { flex-basis: 100%; margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }

.research-panel__error { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 14px; border-radius: var(--radius-control, 12px); background: color-mix(in srgb, var(--danger, #c94040) 8%, transparent); color: var(--danger, #c94040); font-size: 13px; line-height: 1.6; }

.research-plan { display: flex; flex-direction: column; gap: 8px; padding: 16px; border: 1px solid var(--hairline-soft, var(--border)); border-radius: var(--radius-surface, 16px); background: var(--surface-workbench-muted); }
.research-plan__head { display: flex; align-items: center; gap: 10px; }
.research-plan__head h3 { margin: 0; font-size: 15px; font-weight: 500; color: var(--text-primary); }
.research-plan__badge { padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); font-size: 12px; }
.research-plan__badge.is-local { background: color-mix(in srgb, var(--archive-ink, #333) 8%, transparent); color: var(--text-secondary); }
.research-plan__count { margin-left: auto; font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.research-plan__warning { margin: 0; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }
.research-plan__intent { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-secondary); }
.research-plan__queries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.research-plan__query { display: flex; align-items: baseline; gap: 10px; font-size: 14px; line-height: 1.6; }
.research-plan__query-index { flex-shrink: 0; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--archive-ink, #333) 8%, transparent); color: var(--text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
.research-plan__query-text { overflow-wrap: anywhere; }

.research-findings { display: flex; flex-direction: column; gap: 8px; }
.research-findings__head { display: flex; align-items: center; gap: 10px; }
.research-findings__head h3 { margin: 0; font-size: 15px; font-weight: 500; color: var(--text-primary); }
.research-findings__count { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.research-findings__empty { margin: 0; padding: 24px 16px; text-align: center; font-size: 13px; color: var(--text-secondary); }
.research-findings__list { list-style: none; margin: 0; padding: 0; }
.research-finding { border-bottom: 1px solid var(--hairline-soft, var(--border)); }
.research-finding__row { display: flex; align-items: flex-start; gap: 14px; padding: 14px 4px; }
.research-finding__kind { flex-shrink: 0; padding: 2px 8px; margin-top: 2px; border-radius: 999px; background: color-mix(in srgb, var(--archive-ink, #333) 6%, transparent); color: var(--text-secondary); font-size: 11px; letter-spacing: 0.02em; white-space: nowrap; }
.research-finding__kind[data-quality='priority'] { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
.research-finding__identity { flex: 1; min-width: 0; }
.research-finding__title { display: inline-flex; align-items: baseline; gap: 6px; max-width: 100%; font-size: 14px; font-weight: 500; line-height: 1.6; color: var(--text-primary); text-decoration: none; overflow-wrap: anywhere; }
.research-finding__title svg { color: var(--text-secondary); }
.research-finding__title:hover { color: var(--accent); }
.research-finding__snippet { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 4px 0 0; font-size: 13px; line-height: 1.7; color: var(--text-secondary); }
.research-finding__evidence { flex-shrink: 0; margin-top: 2px; font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.research-finding__evidence.is-page { color: var(--accent); }
.research-finding__expand { flex-shrink: 0; font-size: 13px; }
.research-finding__body { margin: 0 4px 16px; padding: 16px 18px; border-radius: var(--radius-control, 12px); background: var(--surface-workbench-muted); }
.research-finding__body pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 420px; overflow-y: auto; font-family: inherit; font-size: 13px; line-height: 1.9; color: var(--text-primary); }
.research-finding__fetch-error { margin: 0 0 10px; font-size: 12px; line-height: 1.6; color: var(--text-secondary); }

.research-panel__notices { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.research-panel__notices li { font-size: 12px; line-height: 1.6; color: var(--text-secondary); }

@media (max-width: 760px) {
  .research-finding__row { flex-wrap: wrap; gap: 8px 12px; }
  .research-finding__identity { flex-basis: 100%; order: 3; }
  .research-finding__expand { margin-left: auto; }
  .research-finding__snippet { -webkit-line-clamp: 3; }
}

@media (pointer: coarse) {
  .research-finding__expand, .research-settings__field select, .research-settings__input, .research-form__input { min-height: 44px; }
}

</style>
