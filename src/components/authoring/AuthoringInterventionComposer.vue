<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  target: { type: Object, required: true },
  originalText: { type: String, required: true },
  phase: { type: String, default: 'draft' },
  notice: { type: String, default: '' },
  evidenceCount: { type: Number, default: 0 },
  impactGroups: { type: Array, default: () => [] },
  candidateGroups: { type: Array, default: () => [] },
  rehearsalDirections: { type: Array, default: () => [] },
  rehearsalSelection: { type: Object, default: null },
  candidateReviewPendingCount: { type: Number, default: 0 },
  collaborationEnabled: Boolean,
  collaborationReady: Boolean,
  collaborationActive: Boolean,
  collaborationState: { type: String, default: 'idle' }
})
const emit = defineEmits(['submit', 'cancel', 'draft-change', 'review-candidate', 'select-rehearsal', 'rehearse', 'collaborate', 'open-collaboration'])
const operationOptions = Object.freeze([
  { id: 'change-event', label: '事情换一种发生方式' },
  { id: 'replace-fact', label: '事实其实不同' },
  { id: 'change-time', label: '时间提前或推后' },
  { id: 'reframe-function', label: '这段承担别的作用' }
])
const operation = ref('change-event')
const after = ref('')
const rationale = ref('')
const afterInput = ref(null)
const busy = computed(() => props.phase === 'preparing' || props.phase === 'generating')
const readyLike = computed(() => props.phase === 'ready' || props.phase === 'generating')
const canSubmit = computed(() => Boolean(after.value.trim()) && !busy.value)
const operationPrompt = computed(() => ({
  'change-event': '改变谁做了什么、事情是否发生，或它产生的直接结果。',
  'replace-fact': '把这里成立的事实换成另一项明确事实。',
  'change-time': '写清新的时间、先后顺序或持续时长。',
  'reframe-function': '保留这段内容，但改变它在故事中承担的意义。'
}[operation.value]))
const primaryLabel = computed(() => {
  if (props.phase === 'preparing') return '正在核对'
  if (props.phase === 'generating') return '范围已冻结'
  if (props.phase === 'ready' || props.phase === 'stale' || props.phase === 'failed') return '重新核对'
  return '先看影响'
})
const statusCopy = computed(() => {
  if (props.notice) return props.notice
  if (props.phase === 'preparing') return '正在冻结落笔处与相关依据……'
  if (props.phase === 'generating') return '正在按冻结范围生成各处修改草稿……'
  if (props.phase === 'ready') return '条件与相关依据已冻结。下一步只会列出有依据的后续位置。'
  return ''
})

watch([operation, after, rationale], () => emit('draft-change', {
  operation: operation.value,
  after: after.value,
  rationale: rationale.value
}))

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    projectId: props.target.projectId,
    target: props.target,
    operation: operation.value,
    before: props.originalText,
    after: after.value.trim(),
    rationale: rationale.value.trim()
  })
}

function handleKeydown(event) {
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('cancel')
}

onMounted(() => nextTick(() => afterInput.value?.focus?.({ preventScroll: true })))
</script>

<template>
  <section class="authoring-intervention" data-test="intervention-composer" aria-label="改变故事条件">
    <header class="authoring-intervention__head">
      <div>
        <strong>如果这里不是这样？</strong>
        <span>写下变化，先看后文哪些地方会被牵动</span>
      </div>
      <button type="button" aria-label="收起改变条件" @click="emit('cancel')">收起</button>
    </header>

    <div class="authoring-intervention__operations" role="radiogroup" aria-label="条件类型">
      <button
        v-for="option in operationOptions"
        :key="option.id"
        type="button"
        role="radio"
        :aria-checked="operation === option.id"
        :disabled="busy"
        @click="operation = option.id"
      >{{ option.label }}</button>
    </div>
    <p class="authoring-intervention__operation-prompt">{{ operationPrompt }}</p>

    <dl class="authoring-intervention__change">
      <div>
        <dt>现在</dt>
        <dd>{{ originalText }}</dd>
      </div>
      <div>
        <dt><label for="authoring-intervention-after">希望</label></dt>
        <dd>
          <textarea
            id="authoring-intervention-after"
            ref="afterInput"
            v-model="after"
            maxlength="1200"
            :disabled="busy"
            placeholder="直接写下你希望这里变成什么"
            @keydown="handleKeydown"
          ></textarea>
        </dd>
      </div>
    </dl>

    <details class="authoring-intervention__intent-note">
      <summary>补充为什么这样改（可选）</summary>
      <input
        id="authoring-intervention-rationale"
        v-model="rationale"
        maxlength="600"
        :disabled="busy"
        aria-label="修改目的"
        placeholder="例如：让后面的背叛更合理"
        @keydown="handleKeydown"
      >
    </details>

    <p v-if="statusCopy" class="authoring-intervention__status" :class="{ 'is-error': phase === 'failed' || phase === 'stale' }" role="status">
      {{ statusCopy }}
    </p>

    <section v-if="readyLike" class="authoring-intervention__impacts" aria-label="已确认的影响位置">
      <header>
        <strong>{{ impactGroups.length ? `可能需要调整 · ${impactGroups.length}` : '暂未发现确定影响' }}</strong>
        <span>{{ impactGroups.length ? '只列作者明确建立的因果关系' : '相似措辞和普通提及不会自动列入' }}</span>
      </header>
      <ol v-if="impactGroups.length">
        <li v-for="group in impactGroups" :key="group.id">
          <strong>{{ group.title }}</strong>
          <p>{{ group.reason }}</p>
          <details>
            <summary>查看依据</summary>
            <ul>
              <li v-for="evidence in group.evidence" :key="evidence.sourceRef">
                <span>{{ evidence.label }}</span>
                <p>{{ evidence.excerpt }}</p>
              </li>
            </ul>
          </details>
        </li>
      </ol>
    </section>

    <details v-if="readyLike && candidateGroups.length" class="authoring-intervention__candidates">
      <summary>
        <strong>可能相关 · {{ candidateGroups.length }}</strong>
        <span>尚无足够依据判断是否受影响</span>
      </summary>
      <ol>
        <li v-for="group in candidateGroups" :key="group.id">
          <strong>{{ group.title }}</strong>
          <p>{{ group.reason }}</p>
          <div class="authoring-intervention__candidate-actions" aria-label="本次处理">
            <button
              type="button"
              data-test="intervention-candidate-exclude"
              :aria-pressed="group.reviewStatus === 'exclude'"
              @click="emit('review-candidate', { groupId: group.id, decision: 'exclude' })"
            >{{ group.reviewStatus === 'exclude' ? '已排除' : '本次排除' }}</button>
            <button
              type="button"
              data-test="intervention-candidate-keep"
              :aria-pressed="group.reviewStatus === 'keep'"
              @click="emit('review-candidate', { groupId: group.id, decision: 'keep' })"
            >{{ group.reviewStatus === 'keep' ? '已保留' : '保留不改' }}</button>
          </div>
          <details class="authoring-intervention__candidate-evidence">
            <summary>查看依据</summary>
            <ul>
              <li v-for="evidence in group.evidence" :key="evidence.sourceRef">
                <span>{{ evidence.label }}</span>
                <p>{{ evidence.excerpt }}</p>
              </li>
            </ul>
          </details>
        </li>
      </ol>
    </details>

    <section v-if="readyLike && impactGroups.length" class="authoring-intervention__rehearsal" aria-label="排演范围">
      <header>
        <strong>排演范围</strong>
        <span v-if="candidateReviewPendingCount">先处理 {{ candidateReviewPendingCount }} 项可能相关</span>
        <span v-else>只会调整选中范围内的后文</span>
      </header>
      <div v-if="rehearsalDirections.length" role="radiogroup" aria-label="选择排演方式">
        <button
          v-for="direction in rehearsalDirections"
          :key="direction.id"
          type="button"
          role="radio"
          :aria-checked="rehearsalSelection?.directionId === direction.id"
          @click="emit('select-rehearsal', direction.id)"
        >
          <span>
            <strong>{{ direction.label }}</strong>
            <small>{{ direction.intent }}</small>
          </span>
          <em>{{ direction.targetCount ? `调整 ${direction.targetCount} 处` : '保持后文' }}</em>
        </button>
      </div>
      <p v-if="rehearsalSelection">
        范围已冻结 · 调整 {{ rehearsalSelection.rewriteTargetRefs.length }} 处
        <template v-if="rehearsalSelection.unchangedTargetRefs.length"> · 保持 {{ rehearsalSelection.unchangedTargetRefs.length }} 处</template>
      </p>
      <button
        v-if="rehearsalSelection"
        type="button"
        data-test="intervention-rehearse"
        :disabled="phase === 'generating'"
        @click="emit('rehearse')"
      >{{ phase === 'generating' ? '正在生成草稿' : '生成修改草稿' }}</button>
      <button
        v-if="collaborationEnabled && collaborationReady"
        type="button"
        data-test="intervention-collaborate"
        :disabled="collaborationState === 'configuring' || collaborationState === 'joining'"
        @click="emit(collaborationActive ? 'open-collaboration' : 'collaborate', { returnFocus: $event.currentTarget })"
      >{{ collaborationActive ? '打开共同排演' : (collaborationState === 'configuring' || collaborationState === 'joining' ? '正在建立房间' : '邀请共同排演') }}</button>
    </section>

    <footer>
      <span>先看影响，不会修改正文</span>
      <button
        type="button"
        class="control-primary"
        data-test="intervention-primary"
        :disabled="!canSubmit"
        @click="submit"
      >{{ primaryLabel }}</button>
    </footer>
  </section>
</template>

<style scoped>
.authoring-intervention {
  position: relative;
  width: 100%;
  max-width: 100%;
  padding: 16px 16px 14px 38px;
  border-block: 1px solid color-mix(in srgb, var(--archive-olive) 22%, var(--border-subtle));
  background: color-mix(in srgb, var(--archive-olive) 2.5%, transparent);
  color: var(--text-primary);
  font-family: var(--font-sans, sans-serif);
}
.authoring-intervention::before {
  position: absolute;
  inset: 16px auto 14px 22px;
  width: 2px;
  content: '';
  background: color-mix(in srgb, var(--archive-olive) 50%, transparent);
}
.authoring-intervention__head,
.authoring-intervention footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.authoring-intervention__head { margin-bottom: 9px; }
.authoring-intervention__head > div { display: grid; gap: 2px; }
.authoring-intervention__head strong { font-family: var(--font-display); font-size: 16px; font-weight: 650; letter-spacing: 0.01em; }
.authoring-intervention__head span,
.authoring-intervention footer > span { color: var(--text-secondary); font-size: 11px; line-height: 1.5; }
.authoring-intervention button {
  min-height: 32px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.authoring-intervention button:disabled { opacity: 0.46; cursor: default; }
.authoring-intervention__head button { min-height: 28px; font-size: 11px; }
.authoring-intervention__operations {
  display: flex;
  gap: 5px 16px;
  align-items: center;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border-subtle);
}
.authoring-intervention__operations button { margin-bottom: -1px; }
.authoring-intervention__operations [aria-checked="true"] { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
.authoring-intervention__operation-prompt { margin: 7px 0 0; color: var(--text-secondary); font-size: 11px; line-height: 1.55; }
.authoring-intervention__change { margin: 7px 0 0; }
.authoring-intervention__change > div {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-width: 0;
  border-bottom: 1px solid var(--border-subtle);
}
.authoring-intervention dt { padding-top: 8px; color: var(--text-secondary); font-size: 11px; }
.authoring-intervention dd { min-width: 0; margin: 0; }
.authoring-intervention__change > div:first-child dd {
  max-height: 5.2em;
  padding: 7px 0 6px;
  overflow: auto;
  color: var(--text-secondary);
  font-family: var(--notebook-font-family, var(--font-serif, serif));
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.authoring-intervention textarea,
.authoring-intervention input {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  line-height: 1.65;
  outline: none;
}
.authoring-intervention textarea {
  min-height: 84px;
  padding: 9px 0 7px;
  resize: none;
  font-family: var(--notebook-font-family, var(--font-serif, serif));
  font-size: 14px;
  font-weight: 400;
}
.authoring-intervention input { min-height: 36px; padding: 4px 0; font-size: 13px; }
.authoring-intervention__intent-note { margin-top: 4px; color: var(--text-secondary); font-size: 11px; }
.authoring-intervention__intent-note summary { width: max-content; min-height: 30px; line-height: 30px; cursor: pointer; }
.authoring-intervention__intent-note input { border-bottom: 1px solid var(--border-default); }
.authoring-intervention textarea::placeholder,
.authoring-intervention input::placeholder { color: var(--text-tertiary, var(--text-secondary)); }
.authoring-intervention__status { margin: 8px 0 0; color: var(--text-secondary); font-size: 11px; line-height: 1.55; }
.authoring-intervention__status.is-error { color: var(--text-danger, var(--text-primary)); }
.authoring-intervention__impacts { margin-top: 10px; border-top: 1px solid var(--border-subtle); }
.authoring-intervention__impacts > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0 6px;
}
.authoring-intervention__impacts > header strong { font-size: 12px; font-weight: 650; }
.authoring-intervention__impacts > header span { color: var(--text-secondary); font-size: 10px; }
.authoring-intervention__impacts > ol,
.authoring-intervention__impacts details ul { margin: 0; padding: 0; list-style: none; }
.authoring-intervention__impacts > ol > li { padding: 9px 0; border-top: 1px solid var(--border-subtle); }
.authoring-intervention__impacts > ol > li > strong { display: block; font-size: 12px; font-weight: 600; line-height: 1.5; }
.authoring-intervention__impacts > ol > li > p { margin: 3px 0 0; color: var(--text-secondary); font-size: 11px; line-height: 1.6; }
.authoring-intervention__impacts details { margin-top: 5px; color: var(--text-secondary); font-size: 10px; }
.authoring-intervention__impacts summary { width: max-content; min-height: 28px; line-height: 28px; cursor: pointer; }
.authoring-intervention__impacts details li { padding: 6px 0; border-top: 1px solid var(--border-subtle); }
.authoring-intervention__impacts details span { color: var(--text-primary); font-size: 11px; }
.authoring-intervention__impacts details p { margin: 2px 0 0; max-height: 3.2em; overflow: hidden; color: var(--text-secondary); font-size: 10px; line-height: 1.6; }
.authoring-intervention__candidates { border-top: 1px solid var(--border-subtle); color: var(--text-secondary); }
.authoring-intervention__candidates > summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 36px;
  line-height: 36px;
  cursor: pointer;
}
.authoring-intervention__candidates > summary::before {
  content: '›';
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 14px;
  transition: transform 120ms ease;
}
.authoring-intervention__candidates[open] > summary::before { transform: rotate(90deg); }
.authoring-intervention__candidates > summary strong { color: var(--text-primary); font-size: 11px; font-weight: 600; }
.authoring-intervention__candidates > summary span { font-size: 10px; }
.authoring-intervention__candidates > ol,
.authoring-intervention__candidate-evidence ul { margin: 0; padding: 0; list-style: none; }
.authoring-intervention__candidates > ol > li { padding: 8px 0; border-top: 1px solid var(--border-subtle); }
.authoring-intervention__candidates > ol > li > strong { display: block; color: var(--text-primary); font-size: 12px; font-weight: 600; line-height: 1.5; }
.authoring-intervention__candidates > ol > li > p { margin: 3px 0 0; font-size: 11px; line-height: 1.6; }
.authoring-intervention__candidate-actions { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
.authoring-intervention__candidate-actions button { min-height: 28px; font-size: 10px; }
.authoring-intervention__candidate-actions button[aria-pressed="true"] { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
.authoring-intervention__candidate-evidence { margin-top: 2px; font-size: 10px; }
.authoring-intervention__candidate-evidence > summary { width: max-content; min-height: 28px; line-height: 28px; cursor: pointer; }
.authoring-intervention__candidate-evidence li { padding: 6px 0; border-top: 1px solid var(--border-subtle); }
.authoring-intervention__candidate-evidence li > span { color: var(--text-primary); font-size: 11px; }
.authoring-intervention__candidate-evidence li > p { margin: 2px 0 0; max-height: 3.2em; overflow: hidden; font-size: 10px; line-height: 1.6; }
.authoring-intervention__rehearsal { border-top: 1px solid var(--border-subtle); }
.authoring-intervention__rehearsal > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  padding: 9px 0 6px;
}
.authoring-intervention__rehearsal > header strong { font-size: 11px; font-weight: 600; }
.authoring-intervention__rehearsal > header span { color: var(--text-secondary); font-size: 10px; }
.authoring-intervention__rehearsal [role="radiogroup"] { border-top: 1px solid var(--border-subtle); }
.authoring-intervention__rehearsal [role="radio"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  min-height: 46px;
  border-bottom-color: var(--border-subtle);
  text-align: start;
}
.authoring-intervention__rehearsal [role="radio"] > span { display: grid; gap: 1px; min-width: 0; }
.authoring-intervention__rehearsal [role="radio"] strong { color: var(--text-primary); font-size: 11px; font-weight: 600; }
.authoring-intervention__rehearsal [role="radio"] small { color: var(--text-secondary); font-size: 10px; line-height: 1.5; }
.authoring-intervention__rehearsal [role="radio"] em { flex: 0 0 auto; color: var(--text-secondary); font-size: 10px; font-style: normal; }
.authoring-intervention__rehearsal [role="radio"][aria-checked="true"] { border-bottom-color: var(--accent-primary); }
.authoring-intervention__rehearsal [role="radio"][aria-checked="true"] em { color: var(--text-primary); }
.authoring-intervention__rehearsal > p { margin: 7px 0 0; color: var(--text-secondary); font-size: 10px; }
.authoring-intervention__rehearsal > [data-test="intervention-rehearse"] { min-height: 34px; margin-top: 4px; color: var(--text-primary); border-bottom-color: var(--accent-primary); font-size: 11px; }
.authoring-intervention__rehearsal > [data-test="intervention-collaborate"] { min-height: 34px; margin: 4px 0 0 12px; padding-inline: 4px; color: var(--text-primary); border-bottom-color: var(--border-strong, var(--border-subtle)); font-size: 11px; }
.authoring-intervention footer { align-items: center; margin-top: 9px; }
.authoring-intervention [data-test="intervention-primary"] {
  flex-shrink: 0;
  min-width: 112px;
  padding: 7px 18px;
  border: 0;
  border-radius: 3px;
  background: var(--control-accent-bg, var(--accent-primary));
  color: var(--archive-paper-soft, #f5f7f4);
  font-weight: 650;
}
@media (max-width: 720px) {
  .authoring-intervention {
    position: fixed;
    z-index: var(--z-workbench-sheet);
    inset-inline: 0;
    inset-block-end: 44px;
    max-height: min(62vh, 480px);
    padding: 14px 16px 12px 30px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-block-start: 1px solid var(--authoring-hairline, var(--border-subtle));
    border-block-end: 0;
    background: var(--surface-workbench-raised);
    box-shadow: 0 -12px 32px color-mix(in srgb, #000 16%, transparent);
  }
  .authoring-intervention::before { left: 16px; }
  .authoring-intervention__head { gap: 10px; }
  .authoring-intervention__head span { max-width: 25ch; }
  .authoring-intervention button,
  .authoring-intervention input { min-height: 44px; }
  .authoring-intervention__change > div { grid-template-columns: 38px minmax(0, 1fr); gap: 7px; }
  .authoring-intervention__change > div:first-child dd { max-height: 3.4em; }
  .authoring-intervention textarea { min-height: 48px; }
  .authoring-intervention footer { align-items: flex-end; }
  .authoring-intervention footer > span { max-width: 22ch; }
  .authoring-intervention__impacts > header { align-items: flex-start; flex-direction: column; gap: 2px; }
  .authoring-intervention__impacts summary { min-height: 44px; line-height: 44px; }
  .authoring-intervention__candidates > summary { min-height: 44px; line-height: 1.4; }
  .authoring-intervention__candidates > summary span { margin-inline-start: auto; max-width: 16ch; text-align: end; }
  .authoring-intervention__candidate-actions { flex-wrap: wrap; gap: 10px; }
  .authoring-intervention__candidate-actions button,
  .authoring-intervention__candidate-evidence > summary { min-height: 44px; line-height: 44px; }
  .authoring-intervention__rehearsal > header { align-items: flex-start; }
  .authoring-intervention__rehearsal > header span { max-width: 18ch; text-align: end; }
  .authoring-intervention__rehearsal [role="radio"] { min-height: 52px; }
}
</style>
