<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onBeforeUnmount, ref } from 'vue'
import AuthoringReviewPanel from './AuthoringReviewPanel.vue'
import { WRITING_SKILL_METHODS } from '../../../shared/writingSkillMethodContract.js'

const props = defineProps({ workflow: { type: Object, required: true } })
onBeforeUnmount(() => { props.workflow.cancel(); if (rewritingFinding.value && props.workflow.rewrite?.loading.value) props.workflow.rewrite.cancel() })
const emit = defineEmits(['close'])
const goal = ref(props.workflow.session.value?.goal?.text || '')
const hasSelection = computed(() => Boolean(props.workflow.invocation.value?.selectionRanges?.length))
const scope = ref(hasSelection.value ? 'selection' : props.workflow.session.value?.scope?.kind === 'chapter' ? 'chapter' : 'block')
const skillId = ref(props.workflow.session.value?.goal?.skill?.skillId || 'motivation-causality')
const rewritingFinding = ref(null)
const preserveDialogue = ref(false)
const manualLockText = ref('')
async function rewrite(finding) {
  rewritingFinding.value = finding
  await props.workflow.rewriteFinding(finding, { preserveDialogue: preserveDialogue.value, manualLockText: manualLockText.value })
}
function run() {
  return props.workflow.run({ goal: goal.value, scope: scope.value, skillId: skillId.value })
}
function close() {
  props.workflow.close()
  emit('close')
}
async function resumeInterrupted() {
  const record = props.workflow.resumeRecord.value
  if (!record) return
  goal.value = record.goal
  skillId.value = record.skillId
  scope.value = record.scope
  await props.workflow.resume()
}
</script>

<template>
  <AuthoringReviewPanel embedded :open="true" :document-title="workflow.documentTitle.value"
    :explanation-language="workflow.languagePolicy.value?.assistantLanguage" :content-language="workflow.languagePolicy.value?.outputLanguage"
    :findings="workflow.findings.value" :busy="workflow.loading.value"
    :progress="{ completed: workflow.completedBatches.value, total: workflow.totalBatches.value }"
    :error="workflow.error.value" :status="workflow.status.value" :undo-available="workflow.undoAvailable.value"
    :retry-available="workflow.retryAvailable.value" @close="close" @scan="run" @retry="workflow.run({ retry: true })"
    @cancel="workflow.cancel" @jump="workflow.jump" @apply="workflow.applyOne" @ignore="workflow.ignore"
    @apply-selected="workflow.applySelected" @undo="workflow.undo" @rewrite="rewrite">
    <template #controls>
      <fieldset class="goal-review-controls" :disabled="workflow.loading.value">
        <div v-if="workflow.resumeRecord.value" class="goal-review-resume" role="status">
          <span>{{ tr('发现中断任务（{length} / {totalBatches} 批）', { length: workflow.resumeRecord.value.batches.length, totalBatches: workflow.resumeRecord.value.totalBatches }) }}</span>
          <button type="button" @click="resumeInterrupted">{{ tr('恢复') }}</button>
          <button type="button" @click="workflow.discardResume">{{ tr('丢弃') }}</button>
        </div>
        <div>
          <select v-model="scope" :aria-label="tr(&quot;审稿范围&quot;)"><option v-if="hasSelection" value="selection">{{ tr('当前选区') }}</option><option value="block">{{ tr('当前文本块') }}</option><option value="chapter">{{ tr('当前文稿') }}</option></select>
          <select v-model="skillId" :aria-label="tr(&quot;审稿方法&quot;)"><option v-for="method in WRITING_SKILL_METHODS" :key="method.id" :value="method.id">{{ tr(method.title) }}</option></select>
        </div>
        <textarea v-model="goal" :aria-label="tr(&quot;审稿目标&quot;)" :placeholder="tr(&quot;这次想检查什么？&quot;)" rows="3" maxlength="400" @keydown.ctrl.enter.prevent="run" @keydown.meta.enter.prevent="run" />
        <small>{{ tr('只检查所选范围；引用资料不代表已通读全书。') }}</small>
        <small v-if="workflow.coverage.value">{{ tr('已检查 {readChars} / {totalChars} 字（重叠批次不重复计数）', { readChars: workflow.coverage.value.prose.readChars, totalChars: workflow.coverage.value.prose.totalChars }) }}</small>
        <button v-if="workflow.saveRetryAvailable.value" type="button" class="goal-review-save-retry" @click="workflow.retrySave">{{ tr('只重试保存') }}</button>
        <label><input v-model="preserveDialogue" type="checkbox" />{{ tr('改写时保留原文对话') }}</label>
      <label>{{ tr('额外锁定原文（精确且唯一）') }}<input v-model="manualLockText" type="text" /></label>
      </fieldset>
    </template>
    <template #rewrite>
      <section v-if="rewritingFinding && workflow.rewrite" class="goal-review-candidates" :aria-label="tr(&quot;审稿改写候选&quot;)">
        <header><strong>{{ tr('按意见改写') }}</strong><button type="button" @click="workflow.rewrite.cancel(); rewritingFinding = null">{{ tr('关闭') }}</button></header>
        <details v-if="preserveDialogue || manualLockText" open><summary>{{ tr('已识别的锁定范围') }}</summary><p v-if="!workflow.rewrite.lockedSegments?.value.length">{{ tr('未识别到锁定范围。自动识别不覆盖跨段或未闭合引号，请手动指定。') }}</p><blockquote v-for="(lock, index) in workflow.rewrite.lockedSegments?.value || []" :key="index">{{ lock.text }}</blockquote></details>
        <p v-if="workflow.rewrite.loading.value" role="status">{{ tr('正在生成候选…') }}</p>
        <p v-if="workflow.rewrite.error.value" role="alert">{{ workflow.rewrite.error.value }}</p>
        <article v-for="candidate in workflow.rewrite.candidates.value" :key="candidate.id">
          <details><summary>{{ tr('查看原文') }}</summary><p>{{ candidate.baseText }}</p></details>
          <p :lang="candidate.languagePolicy?.outputLanguage === 'mixed' ? undefined : candidate.languagePolicy?.outputLanguage || undefined">{{ candidate.text }}</p>
          <details v-if="!candidate.patches && candidate.status === 'ready'"><summary>{{ tr('微调候选') }}</summary><textarea v-model="candidate.text" :aria-label="tr(&quot;编辑改写候选&quot;)" rows="4" /></details>
          <button type="button" :disabled="candidate.status !== 'ready'" @click="workflow.applyFindingRewrite(candidate, rewritingFinding.id)">{{ candidate.status === 'applied' ? tr('已采用') : tr('采用这版') }}</button>
        </article>
      </section>
    </template>
  </AuthoringReviewPanel>
</template>

<style scoped>
.goal-review-candidates { overflow: auto; flex: 1 1 220px; min-height: 160px; padding: 12px 18px; border-top: 1px solid var(--border-subtle); font-size: 13px; }
.goal-review-candidates header { display: flex; justify-content: space-between; }
.goal-review-candidates article { padding-block: 12px; border-bottom: 1px solid var(--border-subtle); }
.goal-review-candidates p { white-space: pre-wrap; line-height: 1.7; }
.goal-review-candidates textarea { box-sizing: border-box; width: 100%; min-height: 100px; margin-block: 8px; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--surface-secondary); color: var(--text-primary); font: inherit; line-height: 1.7; resize: vertical; }
.goal-review-candidates textarea:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
.goal-review-candidates button { padding: 6px 10px; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-primary); background: var(--surface-secondary); cursor: pointer; }
.goal-review-candidates button:disabled { opacity: .5; cursor: default; }
.goal-review-controls { display: grid; gap: 10px; min-width: 0; margin: 0; padding: 14px 18px; border: 0; font: 13px/1.5 var(--font-sans); }
.goal-review-resume { display: grid !important; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 12px; }
.goal-review-resume button { border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; }
.goal-review-save-retry { justify-self: start; min-height: 30px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--surface-secondary); color: var(--text-primary); cursor: pointer; }
.goal-review-controls > div { display: flex; flex-wrap: wrap; gap: 8px; }
.goal-review-controls select { max-width: 100%; min-width: 0; min-height: 32px; border: 0; background: var(--surface-secondary); color: var(--text-primary); font: inherit; border-radius: 4px; }
.goal-review-controls textarea { box-sizing: border-box; width: 100%; min-height: 80px; resize: vertical; padding: 10px; border: 1px solid var(--border-subtle); border-radius: 5px; background: var(--surface-primary); color: var(--text-primary); font: inherit; }
.goal-review-controls textarea:focus-visible, .goal-review-controls select:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.goal-review-controls input[type="text"] { box-sizing: border-box; display: block; width: 100%; min-height: 32px; padding: 6px 8px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--surface-primary); color: var(--text-primary); font: inherit; }
.goal-review-controls input[type="text"]:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.goal-review-controls small { color: var(--text-secondary); font-size: 11px; }
</style>
