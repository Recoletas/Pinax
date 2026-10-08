<script setup>
import { tr } from '../../i18n/index.js'
import { getWritingAnnotationLabel } from '../../services/writing/writingAnnotations.js'

// 检查器「批注」页正文。会话/改写/布局三个 composable 的工厂参数依赖编辑器
// refs、滚动保护等页面级状态，仍由宿主创建；这里只接收实例并渲染边注列表。
const props = defineProps({
  session: { type: Object, required: true },
  rewrite: { type: Object, required: true },
  layout: { type: Object, required: true },
  laneRef: { type: Object, default: null },
  selectedChapterId: { type: [String, Number], default: '' },
  selectedText: { type: String, default: '' },
  locateAnnotation: { type: Function, required: true },
  startRewriteFromAnnotation: { type: Function, required: true },
  freezeReviewSource: { type: Function, required: true },
  openReviewPanel: { type: Function, required: true },
  closeAnnotationRewrite: { type: Function, required: true }
})

const {
  marginAnnotations,
  activeAnnotationId,
  editingAnnotationId,
  annotationEditDraft,
  annotationDraft,
  annotationComposerOpen,
  annotationDraftAnchor,
  canCreateAnnotation,
  getAnnotationSupplements,
  createAnnotationFromSelection,
  closeAnnotationComposer,
  startAnnotationEdit,
  cancelAnnotationEdit,
  saveAnnotationEdit,
  deleteAnnotation
} = props.session
const {
  rewriteTarget,
  rewriteInstruction,
  rewriteCandidates,
  selectedRewriteCandidateId,
  selectedRewriteCandidate,
  rewriteLoading,
  rewriteError,
  generateRewriteCandidates,
  cancelRewriteGeneration,
  retryRewriteCandidates,
  applyRewriteCandidate,
  dismissRewriteCandidate
} = props.rewrite
const { annotationLaneStyle, setAnnotationNoteRef, getAnnotationNoteStyle } = props.layout

function handleAnnotationKeydown(event, annotation, index) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    props.locateAnnotation(annotation)
    return
  }
  const annotations = marginAnnotations.value
  if (!annotations.length) return
  let nextIndex = index
  if (event.key === 'ArrowDown') nextIndex = Math.min(annotations.length - 1, index + 1)
  if (event.key === 'ArrowUp') nextIndex = Math.max(0, index - 1)
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = annotations.length - 1
  if (nextIndex === index) return
  event.preventDefault()
  const cards = Array.from(event.currentTarget?.parentElement?.querySelectorAll('.writing-annotation') || [])
  cards[nextIndex]?.focus()
  activeAnnotationId.value = annotations[nextIndex].id
}
</script>

<template>
  <div class="writing-inspector__body" data-authoring-inspector="annotations">
    <div class="writing-inspector__density">
      <button type="button" class="writing-review-trigger" :disabled="!selectedChapterId" @pointerdown="freezeReviewSource" @click="openReviewPanel">{{ tr('打开校对') }}</button>
    </div>

    <div
      :ref="laneRef"
      class="writing-inspector__list"
      :style="annotationLaneStyle"
    >
      <article
        v-for="annotation in marginAnnotations"
        :key="annotation.id"
        class="writing-annotation"
        :class="[`is-${annotation.status}`, { 'is-active': activeAnnotationId === annotation.id }]"
        role="button"
        tabindex="0"
        :aria-label="`${getWritingAnnotationLabel(annotation)}：${annotation.body}`"
        :ref="(element) => setAnnotationNoteRef(element, annotation.id)"
        :style="getAnnotationNoteStyle(annotation)"
        @click="locateAnnotation(annotation)"
        @focus="activeAnnotationId = annotation.id"
        @keydown="handleAnnotationKeydown($event, annotation, marginAnnotations.indexOf(annotation))"
      >
        <header>
          <span>{{ annotation.reviewType ? `${annotation.reviewType} · ` : '' }}{{ getWritingAnnotationLabel(annotation) }}</span>
        </header>
        <template v-if="editingAnnotationId === annotation.id">
          <textarea
            v-model="annotationEditDraft"
            class="writing-annotation__edit"
            rows="3"
            :aria-label="tr(&quot;编辑批注&quot;)"
            @click.stop
            @keydown.meta.enter.prevent="saveAnnotationEdit(annotation)"
            @keydown.ctrl.enter.prevent="saveAnnotationEdit(annotation)"
            @keydown.esc.prevent="cancelAnnotationEdit"
          ></textarea>
          <div class="writing-annotation__edit-actions" @click.stop>
            <button type="button" :disabled="!annotationEditDraft.trim()" @click="saveAnnotationEdit(annotation)">{{ tr('保存') }}</button>
            <button type="button" @click="cancelAnnotationEdit">{{ tr('取消') }}</button>
          </div>
        </template>
        <p v-else>{{ annotation.body }}</p>
        <div v-if="getAnnotationSupplements(annotation).length" class="writing-annotation__supplements">
          <p v-for="item in getAnnotationSupplements(annotation)" :key="item.id"><span>{{ tr('补充') }}</span>{{ item.body }}</p>
        </div>
        <footer>
          <button type="button" @click.stop="startAnnotationEdit(annotation)">{{ tr('编辑') }}</button>
          <button v-if="annotation.status !== 'orphaned'" type="button" @click.stop="startRewriteFromAnnotation(annotation)">{{ tr('按批注改写') }}</button>
          <button type="button" class="is-danger" @click.stop="deleteAnnotation(annotation)">{{ tr('删除') }}</button>
        </footer>

        <section
          v-if="rewriteTarget?.annotationId === annotation.id"
          class="writing-annotation-rewrite"
          :aria-label="tr(&quot;按当前批注改写&quot;)"
          @click.stop
        >
          <textarea
            v-model="rewriteInstruction"
            class="writing-rewrite-panel__input"
            rows="2"
            :aria-label="tr(&quot;改写要求&quot;)"
            @keydown.meta.enter.prevent="generateRewriteCandidates(rewriteTarget)"
            @keydown.ctrl.enter.prevent="generateRewriteCandidates(rewriteTarget)"
          ></textarea>
          <div class="writing-rewrite-panel__actions">
            <button type="button" :disabled="rewriteLoading || !rewriteTarget?.text" @click="generateRewriteCandidates(rewriteTarget)">
              {{ rewriteLoading ? tr('生成中…') : rewriteCandidates.length ? tr('重新生成') : tr('生成改写') }}
            </button>
            <button v-if="rewriteLoading" type="button" class="is-quiet" @click="cancelRewriteGeneration">{{ tr('停止') }}</button>
            <button v-if="rewriteError && !rewriteLoading" type="button" class="is-quiet" @click="retryRewriteCandidates">{{ tr('重试') }}</button>
            <button type="button" class="is-quiet" @click="closeAnnotationRewrite">{{ tr('收起') }}</button>
          </div>
          <p v-if="rewriteError" class="writing-rewrite-panel__error" role="alert">{{ rewriteError }}</p>
          <div v-if="rewriteCandidates.length > 1" class="writing-annotation-rewrite__choices" :aria-label="tr(&quot;改写候选&quot;)">
            <button
              v-for="(candidate, candidateIndex) in rewriteCandidates"
              :key="candidate.id"
              type="button"
              :class="{ active: selectedRewriteCandidateId === candidate.id }"
              @click="selectedRewriteCandidateId = candidate.id"
            >{{ candidateIndex + 1 }}</button>
          </div>
          <article v-if="selectedRewriteCandidate" class="writing-rewrite-candidate is-selected">
            <p v-if="selectedRewriteCandidate.rationale">{{ selectedRewriteCandidate.rationale }}</p>
            <div v-if="selectedRewriteCandidate.patches?.length" class="writing-rewrite-patches" :aria-label="tr(&quot;跨片段改写差异&quot;)">
              <section v-for="(patch, patchIndex) in selectedRewriteCandidate.patches" :key="patch.nodeId" class="writing-rewrite-patch">
                <small>{{ tr('片段 {value}', { value: patchIndex + 1 }) }}</small>
                <div class="writing-rewrite-diff">
                  <div><small>{{ tr('原文') }}</small><span v-for="(part, index) in patch.diff?.before || []" :key="`before-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                  <div><small>{{ tr('候选') }}</small><span v-for="(part, index) in patch.diff?.after || []" :key="`after-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
                </div>
              </section>
            </div>
            <div v-else class="writing-rewrite-diff" :aria-label="tr(&quot;改写差异&quot;)">
              <div><small>{{ tr('原文') }}</small><span v-for="(part, index) in selectedRewriteCandidate.diff?.before || []" :key="`before-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
              <div><small>{{ tr('候选') }}</small><span v-for="(part, index) in selectedRewriteCandidate.diff?.after || []" :key="`after-${index}`" :class="`is-${part.type}`">{{ part.text }}</span></div>
            </div>
            <footer>
              <button type="button" :disabled="selectedRewriteCandidate.status !== 'ready'" @click="applyRewriteCandidate(selectedRewriteCandidate)">{{ selectedRewriteCandidate.patches?.length ? tr('整批采用') : tr('采用') }}</button>
              <button type="button" class="is-quiet" @click="dismissRewriteCandidate(selectedRewriteCandidate)">{{ tr('忽略') }}</button>
            </footer>
          </article>
        </section>
      </article>
      <form
        v-show="annotationComposerOpen"
        class="writing-annotation-composer"
        :ref="(element) => setAnnotationNoteRef(element, 'annotation-draft')"
        :style="annotationDraftAnchor ? getAnnotationNoteStyle(annotationDraftAnchor) : undefined"
        @submit.prevent="createAnnotationFromSelection"
      >
        <header>
          <span>{{ tr('新批注') }}</span>
          <button type="button" :title="tr(&quot;取消批注&quot;)" :aria-label="tr(&quot;取消批注&quot;)" @click="closeAnnotationComposer">×</button>
        </header>
        <p>“{{ selectedText.slice(0, 72) }}{{ selectedText.length > 72 ? '…' : '' }}”</p>
        <textarea
          v-model="annotationDraft"
          rows="3"
          :placeholder="tr(&quot;写下批注或修改要求&quot;)"
          :aria-label="tr(&quot;批注内容&quot;)"
          @keydown.meta.enter.prevent="createAnnotationFromSelection"
          @keydown.ctrl.enter.prevent="createAnnotationFromSelection"
          @keydown.esc.prevent="closeAnnotationComposer"
        ></textarea>
        <footer>
          <button type="submit" :disabled="!canCreateAnnotation">{{ tr('添加') }}</button>
          <button type="button" @click="closeAnnotationComposer">{{ tr('取消') }}</button>
        </footer>
      </form>
      <div v-if="!marginAnnotations.length && !annotationComposerOpen" class="writing-inspector__empty">{{ tr('选中正文后即可添加边注。') }}</div>
    </div>
  </div>
</template>
