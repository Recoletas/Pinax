<template>
  <section class="comic-planner" data-test="comic-adaptation-planner">
    <header class="comic-planner__header">
      <div>
        <span class="comic-planner__kicker">{{ persisted ? '制作序列' : '改编与分页' }}</span>
        <h2>{{ plan?.title || '从素材建立多页方案' }}</h2>
        <p v-if="persisted">
          {{ plan.pages.length }} 页 · {{ totalPanels(plan) }} 格 · 视觉规则{{ bibleConfirmed ? '已确认' : '待确认' }}
        </p>
        <p v-else>{{ sources.length }} 条素材已选 · 先比较节奏，再建立制作页</p>
      </div>
      <button
        v-if="!persisted"
        type="button"
        class="comic-planner__primary"
        :disabled="generating || !sources.length"
        @click="$emit('generate')"
      >
        <LoaderCircle v-if="generating" :size="15" class="is-spinning" aria-hidden="true" />
        <Sparkles v-else :size="15" aria-hidden="true" />
        {{ generating ? '正在规划' : candidates.length ? '重新生成方案' : '生成分页方案' }}
      </button>
      <button
        v-else
        type="button"
        class="comic-planner__primary"
        :disabled="bibleConfirmed || !hasReviewableBible || Boolean(bibleDraft)"
        @click="confirmBible"
      >
        <ShieldCheck :size="15" aria-hidden="true" />
        {{ bibleConfirmed ? '视觉规则已确认' : '确认视觉规则' }}
      </button>
      <button v-if="generating" type="button" class="comic-planner__stop" @click="$emit('cancel')">停止等待</button>
    </header>

    <p v-if="error" class="comic-planner__error" role="alert">{{ error }}</p>

    <div v-if="!persisted && candidates.length" class="comic-planner__candidate-tabs" role="tablist" aria-label="分页方案">
      <button
        v-for="candidate in candidates"
        :key="candidate.id"
        type="button"
        role="tab"
        :aria-selected="candidate.id === selectedCandidateId"
        :class="{ 'is-active': candidate.id === selectedCandidateId }"
        @click="$emit('select-candidate', candidate.id)"
      >
        <span>{{ candidate.title }}</span>
        <small>{{ candidate.pages.length }} 页 · {{ totalPanels(candidate) }} 格</small>
      </button>
    </div>

    <nav v-if="plan" class="comic-planner__sections" aria-label="计划内容">
      <button type="button" :class="{ active: activeSection === 'script' }" :aria-pressed="activeSection === 'script'" @click="activeSection = 'script'">分镜脚本 <span>{{ plan.pages.length }} 页</span></button>
      <button type="button" :class="{ active: activeSection === 'rules' }" :aria-pressed="activeSection === 'rules'" @click="activeSection = 'rules'">视觉规则 <span>{{ bibleConfirmed && !bibleDraft ? '已确认' : '待确认' }}</span></button>
    </nav>
    <p v-if="planNotice" class="comic-planner__error" role="alert">{{ planNotice }}</p>
    <div v-if="plan" class="comic-planner__body">
      <section v-show="activeSection === 'script'" class="comic-planner__pages" aria-label="分镜脚本">
        <nav class="comic-planner__page-nav" aria-label="选择计划页">
          <button v-for="(page, index) in plan.pages" :key="page.id || index" type="button" :class="{ active: activePageIndex === index }" :aria-pressed="activePageIndex === index" @click="activePageIndex = index">
            <span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ page.title || `第 ${index + 1} 页` }}</strong><small>{{ page.panels.length }} 格</small>
          </button>
        </nav>
        <div class="comic-planner__page-editor">
          <ComicPlanPageEditor v-for="(page, index) in plan.pages" v-show="activePageIndex === index" :key="`${plan.id}:${page.id || index}`" :ref="(editor) => pageEditors[index] = editor" :page="page" :page-index="index" :persisted="persisted" @update-page="updateCandidatePage(index, $event)" @save-page="forwardPageSave" @open-page="openPage" />
        </div>
      </section>

      <section v-show="activeSection === 'rules'" class="comic-planner__bible" aria-labelledby="comic-plan-bible">
        <header class="comic-planner__section-head">
          <div>
            <span>连续性依据</span>
            <h3 id="comic-plan-bible">保持角色与画风一致</h3>
          </div>
          <span class="comic-planner__bible-state" :class="{ 'is-confirmed': bibleConfirmed && !bibleDraft }">
            {{ bibleDraft ? '有未保存修改' : bibleConfirmed ? '已确认' : '待确认' }}
          </span>
        </header>

        <div class="comic-planner__bible-rules">
          <label>
            <span>线条规则</span>
            <input
              :value="editingBible.lineStyle"
              placeholder="人物、背景与效果线的统一规则"
              @change="updateBibleField('lineStyle', $event.target.value)"
            />
          </label>
          <label>
            <span>颜色 / 网点</span>
            <input
              :value="editingBible.palette.join('、')"
              placeholder="冷蓝、灰白、低饱和灯火"
              @change="updatePalette($event.target.value)"
            />
          </label>
          <label class="is-wide">
            <span>渲染规则</span>
            <input
              :value="editingBible.renderingNotes"
              placeholder="光影、网点、材质与效果约定"
              @change="updateBibleField('renderingNotes', $event.target.value)"
            />
          </label>
        </div>

        <div class="comic-planner__reference-list">
          <article
            v-for="reference in editingBible.references"
            :key="reference.referenceId"
            class="comic-planner__reference"
          >
            <span class="comic-planner__reference-kind">{{ referenceKind(reference) }}</span>
            <div>
              <strong>{{ referenceLabel(reference) }}</strong>
              <input
                :value="reference.invariantNotes.join('；')"
                aria-label="视觉不变量"
                placeholder="不可改变的身份、服装、空间或道具特征"
                @change="updateReferenceNotes(reference.referenceId, $event.target.value)"
              />
            </div>
            <button
              type="button"
              class="comic-planner__icon"
              :class="{ 'is-active': reference.locked }"
              :title="reference.locked ? '解除不变量锁定' : '锁定为不变量'"
              :aria-label="reference.locked ? '解除不变量锁定' : '锁定为不变量'"
              @click="toggleReferenceLock(reference.referenceId)"
            >
              <LockKeyhole v-if="reference.locked" :size="14" aria-hidden="true" />
              <LockKeyholeOpen v-else :size="14" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="comic-planner__icon"
              title="打开来源"
              aria-label="打开来源"
              @click="$emit('open-reference', resolvedReference(reference))"
            >
              <ExternalLink :size="14" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="comic-planner__icon"
              title="移除引用"
              aria-label="移除引用"
              @click="removeReference(reference.referenceId)"
            >
              <X :size="14" aria-hidden="true" />
            </button>
          </article>

          <div v-if="availableReferences.length" class="comic-planner__reference-add">
            <select v-model="pendingReferenceId" aria-label="添加视觉规则引用">
              <option value="">选择角色、地点、道具或风格来源</option>
              <option v-for="item in availableReferences" :key="item.id" :value="item.id">
                {{ kindLabels[item.kind] || '风格' }} · {{ item.label }}
              </option>
            </select>
            <button type="button" :disabled="!pendingReferenceId" @click="addReference">
              <Plus :size="14" aria-hidden="true" />
              添加引用
            </button>
          </div>
        </div>
        <div v-if="persisted && bibleDraft" class="comic-planner__bible-save">
          <span>保存后，相关制作阶段需要重新审阅。</span>
          <button type="button" @click="discardBibleDraft">载入已保存规则</button>
          <button type="button" class="comic-planner__primary" @click="saveBible">保存视觉规则</button>
        </div>
      </section>

      <footer v-if="!persisted" class="comic-planner__footer">
        <span>{{ validationError || (hasReviewableBible ? `确认后建立 ${plan.pages.length} 张制作页，保留这里的修改。` : '请先补充视觉规则，再建立制作序列。') }}</span>
        <button
          type="button"
          class="comic-planner__primary"
          :disabled="!hasReviewableBible || Boolean(validationError) || generating"
          @click="$emit('apply')"
        >
          <BookOpenCheck :size="15" aria-hidden="true" />
          建立制作序列
        </button>
      </footer>
    </div>

    <div v-if="generating && !plan" class="comic-planner__empty" role="status"><LoaderCircle :size="24" class="is-spinning" aria-hidden="true" /><strong>正在整理分页方案</strong><span>完成后逐页检查画面与对白，再建立制作序列。</span></div>
    <div v-else-if="!plan" class="comic-planner__empty">
      <LayoutTemplate :size="28" aria-hidden="true" />
      <strong>{{ sources.length ? '素材已就绪' : '先选择要改编的素材' }}</strong>
      <span>{{ sources.length ? '生成后可比较至少两个多页节奏方案。' : '打开素材栏，选择一段或几段内容；也可以先做空白漫画页。' }}</span>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import ComicPlanPageEditor from './ComicPlanPageEditor.vue'
import { validateComicAdaptationPlan } from '../../services/media/comicAdaptationService'
import {
  BookOpenCheck,
  ExternalLink,
  LayoutTemplate,
  LoaderCircle,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-vue-next'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  candidates: { type: Array, default: () => [] },
  selectedCandidateId: { type: String, default: '' },
  plan: { type: Object, default: null },
  focusedPageId: { type: String, default: '' },
  referenceCatalog: { type: Array, default: () => [] },
  generating: { type: Boolean, default: false },
  error: { type: String, default: '' },
  persisted: { type: Boolean, default: false },
  bibleConfirmed: { type: Boolean, default: false }
})

const emit = defineEmits([
  'generate',
  'select-candidate',
  'update-plan',
  'apply',
  'confirm-bible',
  'open-reference',
  'save-page',
  'open-page',
  'cancel'
])
const pendingReferenceId = ref('')
const kindLabels = { character: '角色', location: '地点', prop: '道具', style: '风格' }

const catalogById = computed(() => new Map(props.referenceCatalog.map((item) => [item.id, item])))
const availableReferences = computed(() => {
  const selected = new Set(editingBible.value.references?.map((item) => item.referenceId) || [])
  return props.referenceCatalog.filter((item) => !selected.has(item.id))
})
const activeSection = ref('script')
const activePageIndex = ref(0)
const pageEditors = ref([])
const bibleDraft = ref(null)
const planNotice = ref('')
const editingBible = computed(() => bibleDraft.value || props.plan?.visualBible || { references: [], palette: [], lineStyle: '', renderingNotes: '' })
const validationError = computed(() => props.plan ? validateComicAdaptationPlan(props.plan) : '')
const hasReviewableBible = computed(() => Boolean(editingBible.value.references.length || editingBible.value.palette.length || editingBible.value.lineStyle || editingBible.value.renderingNotes))
watch(() => props.plan?.id, () => {
  activePageIndex.value = Math.max(0, props.plan?.pages.findIndex((page) => page.id === props.focusedPageId) ?? 0)
  bibleDraft.value = null
  planNotice.value = ''
  pageEditors.value = []
}, { immediate: true })
function totalPanels(plan) { return (plan?.pages || []).reduce((total, page) => total + (page.panels?.length || 0), 0) }
function updateCandidatePage(index, page) {
  const next = JSON.parse(JSON.stringify(props.plan))
  next.pages[index] = page
  emit('update-plan', next)
}
function forwardPageSave(payload, done) {
  emit('save-page', payload, (result) => { if (result?.ok) planNotice.value = ''; done?.(result) })
}
function openPage(pageId) { if (flushPendingEdits()) emit('open-page', pageId) }
function confirmBible() { if (flushPendingEdits()) emit('confirm-bible') }
function saveBible() {
  if (!bibleDraft.value || !flushPageEdits()) return
  emit('update-plan', { ...props.plan, visualBible: bibleDraft.value }, (result) => {
    if (result?.ok) { bibleDraft.value = null; planNotice.value = '' }
    else planNotice.value = result?.error || '保存失败，视觉规则的修改仍保留。'
  })
}
function discardBibleDraft() { bibleDraft.value = null; planNotice.value = '' }
function flushPageEdits() {
  const index = pageEditors.value.findIndex((editor) => editor?.hasUnsavedChanges?.())
  if (index !== -1) {
    activePageIndex.value = index
    activeSection.value = 'script'
    pageEditors.value[index]?.flushPendingEdits?.()
    planNotice.value = `第 ${index + 1} 页有未保存修改，请先保存或载入已保存内容。`
    return false
  }
  return true
}
function flushPendingEdits() {
  if (!flushPageEdits()) return false
  if (bibleDraft.value) { activeSection.value = 'rules'; planNotice.value = '视觉规则有未保存修改，请先保存或载入已保存规则。'; return false }
  planNotice.value = ''
  return true
}
defineExpose({ flushPendingEdits })

function resolvedReference(reference) {
  return catalogById.value.get(reference.referenceId) || reference
}

function referenceLabel(reference) {
  return resolvedReference(reference)?.label || reference.referenceId
}

function referenceKind(reference) {
  return kindLabels[resolvedReference(reference)?.kind] || '来源'
}

function updatePlan(mutator) {
  const next = JSON.parse(JSON.stringify({ ...props.plan, visualBible: editingBible.value }))
  mutator(next)
  if (props.persisted) bibleDraft.value = next.visualBible
  else emit('update-plan', next)
}

function updateBibleField(key, value) {
  updatePlan((plan) => {
    plan.visualBible[key] = String(value || '').trim()
  })
}

function updatePalette(value) {
  updatePlan((plan) => {
    plan.visualBible.palette = String(value || '')
      .split(/[、,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 16)
  })
}

function updateReferenceNotes(referenceId, value) {
  updatePlan((plan) => {
    const reference = plan.visualBible.references.find((item) => item.referenceId === referenceId)
    if (!reference) return
    reference.invariantNotes = String(value || '')
      .split(/[；;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 16)
  })
}

function toggleReferenceLock(referenceId) {
  updatePlan((plan) => {
    const reference = plan.visualBible.references.find((item) => item.referenceId === referenceId)
    if (reference) reference.locked = !reference.locked
  })
}

function removeReference(referenceId) {
  updatePlan((plan) => {
    plan.visualBible.references = plan.visualBible.references
      .filter((item) => item.referenceId !== referenceId)
  })
}

function addReference() {
  const item = catalogById.value.get(pendingReferenceId.value)
  if (!item) return
  updatePlan((plan) => {
    plan.visualBible.references.push({
      referenceId: item.id,
      invariantNotes: [],
      locked: true,
      label: item.label,
      kind: item.kind,
      sourceRef: item.sourceRef,
      assetIds: item.assetIds || []
    })
  })
  pendingReferenceId.value = ''
}
</script>

<style scoped>
.comic-planner { width: min(100%, 1000px); min-height: 100%; margin-inline: auto; padding: 30px 36px 36px; display: flex; flex-direction: column; color: var(--text-primary); font: 14px/1.6 var(--font-sans); }
.comic-planner * { box-sizing: border-box; }
.comic-planner__header, .comic-planner__section-head, .comic-planner__footer, .comic-planner__reference-add { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.comic-planner__header { padding-bottom: 24px; align-items: flex-start; }
.comic-planner__header > div { min-width: 0; flex: 1; }
.comic-planner__kicker, .comic-planner__section-head > div > span { color: var(--text-secondary); font-size: 12px; }
.comic-planner :is(h2, h3, p) { margin: 0; }
.comic-planner h2 { margin-top: 5px; font-size: 24px; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; }
.comic-planner__header p { margin-top: 8px; color: var(--text-secondary); font-size: 13px; }
.comic-planner button { min-height: 36px; padding: 7px 12px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; }
.comic-planner button:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.comic-planner button:disabled { opacity: .45; cursor: not-allowed; }
.comic-planner .comic-planner__primary { flex-shrink: 0; background: var(--accent); color: var(--accent-text); padding-inline: 16px; }
.comic-planner .comic-planner__primary:hover:not(:disabled) { background: var(--accent-hover); color: var(--accent-text); }
.comic-planner__stop { font-size: 12px; }
.comic-planner__error { padding: 0 0 16px; color: var(--danger); font-size: 13px; }
.comic-planner__candidate-tabs { display: flex; gap: 8px; padding-bottom: 20px; overflow-x: auto; }
.comic-planner__candidate-tabs button { min-width: 150px; display: grid; justify-content: start; gap: 3px; padding: 12px 16px; text-align: left; background: var(--surface-workbench-input); border: 1px solid transparent; }
.comic-planner__candidate-tabs button.is-active { border-color: var(--accent); color: var(--text-primary); }
.comic-planner__candidate-tabs span { font-size: 14px; font-weight: 500; }
.comic-planner__candidate-tabs small { color: var(--text-secondary); font-size: 12px; }
.comic-planner__sections { display: flex; gap: 20px; border-bottom: 1px solid var(--hairline-soft); margin-bottom: 24px; }
.comic-planner__sections button { border-radius: 0; border-bottom: 2px solid transparent; padding: 8px 0 12px; }
.comic-planner__sections button.active { color: var(--text-primary); border-bottom-color: var(--accent); }
.comic-planner__sections span { color: var(--text-secondary); font-size: 12px; }
.comic-planner__body { display: grid; gap: 24px; }
.comic-planner :is(.comic-planner__header, .comic-planner__candidate-tabs, .comic-planner__sections, .comic-planner__body) { width: 100%; max-width: 1000px; margin-inline: auto; }
.comic-planner__pages { min-width: 0; display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 32px; }
.comic-planner__page-nav { display: flex; flex-direction: column; align-items: stretch; gap: 4px; }
.comic-planner__page-nav button { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 1px 8px; padding: 12px 10px; justify-content: start; text-align: left; }
.comic-planner__page-nav button.active { background: var(--accent-light); color: var(--text-primary); }
.comic-planner__page-nav span { grid-row: span 2; font-size: 12px; color: var(--text-secondary); }
.comic-planner__page-nav strong { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.comic-planner__page-nav small { color: var(--text-secondary); font-size: 11px; }
.comic-planner__page-editor, .comic-planner__bible { min-width: 0; }
.comic-planner__bible { width: min(100%, 760px); margin: 0 auto; }
.comic-planner__section-head { padding-bottom: 24px; }
.comic-planner__section-head h3 { margin-top: 5px; font-size: 18px; font-weight: 500; }
.comic-planner__bible-state { color: var(--text-secondary); font-size: 12px; flex-shrink: 0; }
.comic-planner__bible-state.is-confirmed { color: var(--accent); }
.comic-planner__bible-rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.comic-planner__bible-rules label { display: grid; gap: 7px; color: var(--text-secondary); font-size: 13px; }
.comic-planner__bible-rules .is-wide { grid-column: 1 / -1; }
.comic-planner :is(input, select) { min-width: 0; width: 100%; min-height: 42px; padding: 10px 12px; border: 1px solid transparent; border-radius: var(--radius-control); background: var(--surface-workbench-input); color: var(--text-primary); font: inherit; }
.comic-planner__reference-list { margin-top: 24px; }
.comic-planner__reference { padding: 14px 0; display: grid; grid-template-columns: auto minmax(0, 1fr) repeat(3, 36px); align-items: start; gap: 8px; border-top: 1px solid var(--hairline-soft); }
.comic-planner__reference-kind { font-size: 11px; color: var(--text-secondary); padding-top: 6px; }
.comic-planner__reference > div { display: grid; gap: 8px; min-width: 0; }
.comic-planner__reference strong { font-size: 13px; font-weight: 500; }
.comic-planner__reference .comic-planner__icon { width: 36px; padding: 0; }
.comic-planner__icon.is-active { color: var(--accent); }
.comic-planner__reference-add { margin-top: 16px; }
.comic-planner__reference-add button { flex-shrink: 0; color: var(--accent); }
.comic-planner__footer, .comic-planner__bible-save { border-top: 1px solid var(--hairline-soft); padding-top: 24px; margin-top: 4px; }
.comic-planner__footer > span, .comic-planner__bible-save > span { color: var(--text-secondary); font-size: 13px; }
.comic-planner__bible-save { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 12px; }
.comic-planner__bible-save > span { flex: 1 1 100%; }
.comic-planner__empty { flex: 1; min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 16px; color: var(--text-secondary); text-align: center; }
.comic-planner__empty strong { margin-top: 4px; color: var(--text-primary); font-size: 19px; font-weight: 500; }
.comic-planner__empty span { max-width: 40ch; line-height: 1.8; }
.comic-planner :is(button, input, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.is-spinning { animation: comic-planner-spin 1s linear infinite; }
@keyframes comic-planner-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .is-spinning { animation: none; } }
@media (max-width: 980px) { .comic-planner { padding: 24px; } .comic-planner__pages { grid-template-columns: 130px minmax(0, 1fr); gap: 24px; } }
@media (max-width: 760px) {
  .comic-planner { padding: 24px 16px; }
  .comic-planner__header { flex-wrap: wrap; gap: 16px; }
  .comic-planner__header > div { flex-basis: 100%; }
  .comic-planner h2 { font-size: 22px; }
  .comic-planner__sections { gap: 20px; }
  .comic-planner__pages { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .comic-planner__page-nav { flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
  .comic-planner__page-nav button { min-width: 126px; max-width: 170px; flex-shrink: 0; }
  .comic-planner__footer { align-items: stretch; flex-direction: column; }
  .comic-planner__footer > button { align-self: flex-end; }
  .comic-planner__reference { grid-template-columns: repeat(3, 44px) minmax(0, 1fr); }
  .comic-planner__reference-kind { grid-column: 1 / -1; }
  .comic-planner__reference > div { grid-column: 1 / -1; }
  .comic-planner__reference .comic-planner__icon { width: 44px; }
  .comic-planner__reference-add { flex-direction: column; align-items: stretch; }
  .comic-planner__reference-add > button { align-self: flex-end; }
  .comic-planner__bible-rules { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px), (pointer: coarse) { .comic-planner :is(button, input, select) { min-height: 44px; } }
</style>
