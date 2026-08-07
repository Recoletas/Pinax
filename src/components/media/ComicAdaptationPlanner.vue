<template>
  <section class="comic-planner" data-test="comic-adaptation-planner">
    <header class="comic-planner__header">
      <div>
        <span class="comic-planner__kicker">{{ persisted ? '制作序列' : '改编与分页' }}</span>
        <h2>{{ plan?.title || '从素材建立多页方案' }}</h2>
        <p v-if="persisted">
          {{ plan.pages.length }} 页 · {{ totalPanels(plan) }} 格 · 视觉圣经{{ bibleConfirmed ? '已确认' : '待确认' }}
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
        :disabled="bibleConfirmed || !hasReviewableBible"
        @click="$emit('confirm-bible')"
      >
        <ShieldCheck :size="15" aria-hidden="true" />
        {{ bibleConfirmed ? '视觉圣经已确认' : '确认视觉圣经' }}
      </button>
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

    <div v-if="plan" class="comic-planner__body">
      <section class="comic-planner__pages" aria-labelledby="comic-plan-pages">
        <header class="comic-planner__section-head">
          <div>
            <span>叙事分页</span>
            <h3 id="comic-plan-pages">{{ plan.pages.length }} 页节奏</h3>
          </div>
          <p v-if="plan.rationale">{{ plan.rationale }}</p>
        </header>

        <ol class="comic-planner__page-flow">
          <li v-for="(page, index) in plan.pages" :key="`${plan.id}-page-${index}`">
            <span class="comic-planner__page-index">P{{ String(index + 1).padStart(2, '0') }}</span>
            <div class="comic-planner__page-copy">
              <strong>{{ page.title || `第 ${index + 1} 页` }}</strong>
              <span>{{ page.narrativeBeat || page.pagePurpose || '待补本页剧情任务' }}</span>
              <small v-if="page.pageTurnHook">
                <CornerDownRight :size="12" aria-hidden="true" />
                {{ page.pageTurnHook }}
              </small>
              <details class="comic-planner__panel-beats">
                <summary>查看 {{ page.panels.length }} 格节拍</summary>
                <ol>
                  <li v-for="(panel, panelIndex) in page.panels" :key="panelIndex">
                    <span>{{ panelIndex + 1 }}</span>
                    <p>{{ panelBeat(panel) }}</p>
                  </li>
                </ol>
              </details>
            </div>
            <div class="comic-planner__panel-count" :title="`本页 ${page.panels.length} 格`">
              <i v-for="panelIndex in page.panels.length" :key="panelIndex"></i>
              <span>{{ page.panels.length }}</span>
            </div>
          </li>
        </ol>
      </section>

      <section class="comic-planner__bible" aria-labelledby="comic-plan-bible">
        <header class="comic-planner__section-head">
          <div>
            <span>连续性依据</span>
            <h3 id="comic-plan-bible">视觉圣经</h3>
          </div>
          <span class="comic-planner__bible-state" :class="{ 'is-confirmed': bibleConfirmed }">
            {{ bibleConfirmed ? '已确认' : `${plan.visualBible.references.length} 项待审` }}
          </span>
        </header>

        <div class="comic-planner__bible-rules">
          <label>
            <span>线条规则</span>
            <input
              :value="plan.visualBible.lineStyle"
              placeholder="人物、背景与效果线的统一规则"
              @change="updateBibleField('lineStyle', $event.target.value)"
            />
          </label>
          <label>
            <span>颜色 / 网点</span>
            <input
              :value="plan.visualBible.palette.join('、')"
              placeholder="冷蓝、灰白、低饱和灯火"
              @change="updatePalette($event.target.value)"
            />
          </label>
          <label class="is-wide">
            <span>渲染规则</span>
            <input
              :value="plan.visualBible.renderingNotes"
              placeholder="光影、网点、材质与效果约定"
              @change="updateBibleField('renderingNotes', $event.target.value)"
            />
          </label>
        </div>

        <div class="comic-planner__reference-list">
          <article
            v-for="reference in plan.visualBible.references"
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
            <select v-model="pendingReferenceId" aria-label="添加视觉圣经引用">
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
      </section>

      <footer v-if="!persisted" class="comic-planner__footer">
        <span>建立后生成 {{ plan.pages.length }} 张制作页；每页格数保留当前方案。</span>
        <button
          type="button"
          class="comic-planner__primary"
          :disabled="!hasReviewableBible"
          @click="$emit('apply')"
        >
          <BookOpenCheck :size="15" aria-hidden="true" />
          建立制作序列
        </button>
      </footer>
    </div>

    <div v-else-if="!generating" class="comic-planner__empty">
      <LayoutTemplate :size="28" aria-hidden="true" />
      <strong>{{ sources.length ? '素材已就绪' : '先从左侧选择素材' }}</strong>
      <span>{{ sources.length ? '生成后可比较至少两个多页节奏方案。' : '页面计划支持同时使用多条正文、事件与视觉素材。' }}</span>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  BookOpenCheck,
  CornerDownRight,
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
  'open-reference'
])
const pendingReferenceId = ref('')
const kindLabels = { character: '角色', location: '地点', prop: '道具', style: '风格' }

const catalogById = computed(() => new Map(props.referenceCatalog.map((item) => [item.id, item])))
const availableReferences = computed(() => {
  const selected = new Set(props.plan?.visualBible?.references?.map((item) => item.referenceId) || [])
  return props.referenceCatalog.filter((item) => !selected.has(item.id))
})
const hasReviewableBible = computed(() => Boolean(
  props.plan?.visualBible?.references?.length
  || props.plan?.visualBible?.palette?.length
  || props.plan?.visualBible?.lineStyle
  || props.plan?.visualBible?.renderingNotes
))

function totalPanels(plan) {
  return (plan?.pages || []).reduce((total, page) => total + (page.panels?.length || 0), 0)
}

function panelBeat(panel = {}) {
  return panel.beat?.action
    || panel.beat?.reveal
    || panel.visual
    || '待补画面节拍'
}

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
  const next = JSON.parse(JSON.stringify(props.plan))
  mutator(next)
  emit('update-plan', next)
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
.comic-planner {
  width: min(100%, 1040px);
  min-height: 100%;
  margin-inline: auto;
  padding: 18px 22px 24px;
  display: flex;
  flex-direction: column;
  color: var(--archive-ink, var(--text-primary));
}

.comic-planner__header,
.comic-planner__section-head,
.comic-planner__footer,
.comic-planner__reference-add {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.comic-planner__header {
  padding-bottom: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent);
}

.comic-planner__kicker,
.comic-planner__section-head span {
  color: var(--archive-olive);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
}

.comic-planner h2,
.comic-planner h3,
.comic-planner p {
  margin: 0;
}

.comic-planner h2 {
  margin-top: 3px;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 650;
}

.comic-planner__header p {
  margin-top: 4px;
  color: var(--archive-ink-soft);
  font-size: 11px;
}

.comic-planner__primary {
  min-height: 32px;
  padding: 5px 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 54%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-olive) 8%, var(--archive-paper-soft));
  color: var(--archive-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.comic-planner__primary:hover:not(:disabled) {
  border-color: var(--archive-olive);
  background: color-mix(in srgb, var(--archive-olive) 13%, var(--archive-paper-soft));
}

.comic-planner__primary:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.comic-planner__error {
  padding: 8px 0;
  color: var(--danger);
  font-size: 11px;
}

.comic-planner__candidate-tabs {
  display: flex;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 15%, transparent);
}

.comic-planner__candidate-tabs button {
  min-width: 150px;
  padding: 10px 14px 9px;
  display: grid;
  gap: 2px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--archive-ink-soft);
  text-align: left;
  cursor: pointer;
}

.comic-planner__candidate-tabs button.is-active {
  border-bottom-color: var(--accent);
  color: var(--archive-ink);
}

.comic-planner__candidate-tabs span {
  font-size: 12px;
  font-weight: 680;
}

.comic-planner__candidate-tabs small {
  font-size: 9px;
}

.comic-planner__body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
  gap: 22px;
  padding-top: 16px;
}

.comic-planner__pages,
.comic-planner__bible {
  min-width: 0;
}

.comic-planner__section-head {
  align-items: flex-start;
  padding-bottom: 9px;
}

.comic-planner__section-head h3 {
  margin-top: 2px;
  font-size: 14px;
}

.comic-planner__section-head p {
  max-width: 38ch;
  color: var(--archive-ink-soft);
  font-size: 10px;
  line-height: 1.55;
  text-align: right;
}

.comic-planner__page-flow {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 15%, transparent);
}

.comic-planner__page-flow li {
  min-height: 70px;
  padding: 10px 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 54px;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 13%, transparent);
}

.comic-planner__page-index {
  color: var(--archive-olive);
  font-family: ui-monospace, monospace;
  font-size: 10px;
}

.comic-planner__page-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.comic-planner__page-copy strong {
  font-size: 12px;
}

.comic-planner__page-copy > span {
  color: var(--archive-ink-soft);
  font-size: 10px;
  line-height: 1.45;
}

.comic-planner__page-copy small {
  display: flex;
  align-items: center;
  gap: 4px;
  color: color-mix(in srgb, var(--signal-warm) 70%, var(--archive-ink));
  font-size: 9px;
}

.comic-planner__panel-beats {
  margin-top: 3px;
  color: var(--archive-ink-soft);
  font-size: 9px;
}

.comic-planner__panel-beats summary {
  width: fit-content;
  cursor: pointer;
}

.comic-planner__panel-beats ol {
  margin: 5px 0 0;
  padding: 0;
  display: grid;
  gap: 3px;
  list-style: none;
}

.comic-planner__panel-beats li {
  min-height: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 4px;
  border: 0;
}

.comic-planner__panel-beats li > span {
  color: var(--archive-olive);
  font-family: ui-monospace, monospace;
}

.comic-planner__panel-beats p {
  color: var(--archive-ink-soft);
  line-height: 1.4;
}

.comic-planner__panel-count {
  display: grid;
  grid-template-columns: repeat(4, 5px);
  justify-content: end;
  gap: 3px;
}

.comic-planner__panel-count i {
  width: 5px;
  height: 9px;
  background: color-mix(in srgb, var(--archive-olive) 32%, var(--border));
}

.comic-planner__panel-count span {
  grid-column: 1 / -1;
  color: var(--archive-ink-soft);
  font-size: 9px;
  text-align: right;
}

.comic-planner__bible-state {
  color: var(--signal-warm);
}

.comic-planner__bible-state.is-confirmed {
  color: var(--accent-teal);
}

.comic-planner__bible-rules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 0;
  border-block: 1px solid color-mix(in srgb, var(--archive-ink) 15%, transparent);
}

.comic-planner__bible-rules label {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.comic-planner__bible-rules label.is-wide {
  grid-column: 1 / -1;
}

.comic-planner__bible-rules label > span {
  color: var(--archive-ink-soft);
  font-size: 9px;
}

.comic-planner input,
.comic-planner select {
  width: 100%;
  min-width: 0;
  min-height: 30px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 24%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--archive-ink);
  font: inherit;
  font-size: 10px;
}

.comic-planner input:focus,
.comic-planner select:focus {
  outline: 0;
  border-bottom-color: var(--accent);
}

.comic-planner__reference-list {
  display: grid;
}

.comic-planner__reference {
  min-height: 52px;
  padding: 8px 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 28px 28px 28px;
  align-items: center;
  gap: 5px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-ink) 13%, transparent);
}

.comic-planner__reference-kind {
  color: var(--archive-olive);
  font-size: 9px;
}

.comic-planner__reference > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.comic-planner__reference strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comic-planner__reference input {
  min-height: 24px;
  color: var(--archive-ink-soft);
}

.comic-planner__icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  cursor: pointer;
}

.comic-planner__icon:hover,
.comic-planner__icon.is-active {
  color: var(--accent);
}

.comic-planner__reference-add {
  padding-top: 10px;
}

.comic-planner__reference-add select {
  flex: 1;
}

.comic-planner__reference-add button {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 10px;
  cursor: pointer;
}

.comic-planner__reference-add button:disabled {
  color: var(--archive-ink-soft);
  cursor: not-allowed;
}

.comic-planner__footer {
  grid-column: 1 / -1;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--archive-ink) 18%, transparent);
}

.comic-planner__footer > span {
  color: var(--archive-ink-soft);
  font-size: 10px;
}

.comic-planner__empty {
  flex: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  color: var(--archive-ink-soft);
  text-align: center;
}

.comic-planner__empty strong {
  color: var(--archive-ink);
  font-size: 15px;
}

.comic-planner__empty span {
  max-width: 36ch;
  font-size: 10px;
  line-height: 1.55;
}

.is-spinning {
  animation: comic-planner-spin 0.8s linear infinite;
}

@keyframes comic-planner-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
  .comic-planner {
    padding: 12px 10px 18px;
  }

  .comic-planner__header,
  .comic-planner__footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .comic-planner__header .comic-planner__primary,
  .comic-planner__footer .comic-planner__primary {
    align-self: stretch;
  }

  .comic-planner__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .comic-planner__footer {
    grid-column: 1;
  }

  .comic-planner__section-head p {
    display: none;
  }

  .comic-planner__bible-rules {
    grid-template-columns: minmax(0, 1fr);
  }

  .comic-planner__bible-rules label.is-wide {
    grid-column: 1;
  }

  .comic-planner__reference {
    grid-template-columns: 30px minmax(0, 1fr) repeat(3, 28px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}
</style>
