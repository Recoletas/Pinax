<template>
  <section class="runtime-review" data-test="runtime-conflict-review" aria-labelledby="runtime-review-title">
    <header class="runtime-review__header">
      <div class="runtime-review__heading">
        <span class="runtime-review__signal" aria-hidden="true"></span>
        <div>
          <span class="runtime-review__kicker">历史一致性</span>
          <h2 id="runtime-review-title">因果审阅</h2>
        </div>
      </div>
      <div class="runtime-review__status">
        <span v-if="activeConflicts.length" class="runtime-review__count">
          {{ activeConflicts.length }} 项待确认
        </span>
        <span v-else class="runtime-review__clean">
          <CircleCheck :size="15" aria-hidden="true" />
          事件链一致
          <template v-if="resolvedCount"> · 已审阅 {{ resolvedCount }} 项</template>
        </span>
        <button
          v-if="activeConflicts.length"
          type="button"
          class="runtime-review__toggle"
          :aria-expanded="reviewOpen"
          aria-controls="runtime-review-content"
          :title="reviewOpen ? '收起因果审阅' : '展开因果审阅'"
          @click="reviewOpen = !reviewOpen"
        >
          <ChevronDown :size="17" :class="{ 'is-open': reviewOpen }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-show="reviewOpen && activeConflicts.length" id="runtime-review-content" class="runtime-review__content">
      <div class="runtime-review__list">
        <details
          v-for="conflict in activeConflicts"
          :key="conflict.conflictKey"
          class="runtime-review__item"
        >
          <summary>
            <span class="runtime-review__summary-icon" aria-hidden="true">
              <GitMerge v-if="conflict.code === 'branch-merge-conflict'" :size="16" />
              <AlertTriangle v-else :size="16" />
            </span>
            <span class="runtime-review__summary-copy">
              <strong>{{ conflictLabel(conflict.code) }}</strong>
              <span>{{ conflictTarget(conflict) }}</span>
            </span>
            <code>{{ shortId(conflict.eventId) }}</code>
            <ChevronDown class="runtime-review__chevron" :size="16" aria-hidden="true" />
          </summary>

          <div class="runtime-review__detail">
            <p class="runtime-review__message">{{ conflict.message }}</p>

            <div class="runtime-review__meta">
              <span>事件 {{ conflict.eventId }}</span>
              <span v-if="conflict.branchId">分支 {{ conflict.branchId }}</span>
              <span v-if="conflict.path">字段 {{ conflict.path }}</span>
            </div>

            <div v-if="sourceEventIds(conflict).length" class="runtime-review__sources">
              <span class="runtime-review__field-label">来源事件</span>
              <div class="runtime-review__source-actions">
                <button
                  v-for="eventId in sourceEventIds(conflict)"
                  :key="eventId"
                  type="button"
                  :class="{ 'is-active': selectedEventId === eventId }"
                  @click="selectedEventId = selectedEventId === eventId ? '' : eventId"
                >
                  <History :size="13" aria-hidden="true" />
                  {{ shortId(eventId) }}
                </button>
              </div>
              <div v-if="selectedEventId && sourceEventIds(conflict).includes(selectedEventId)" class="runtime-review__event">
                <strong>{{ eventDetail(selectedEventId).kind }}</strong>
                <span>{{ eventDetail(selectedEventId).summary }}</span>
              </div>
            </div>

            <fieldset v-if="conflict.code === 'branch-merge-conflict'" class="runtime-review__branches">
              <legend>采用与当前结果一致的来源分支</legend>
              <label
                v-for="branch in conflict.sourceBranches || []"
                :key="branch.branchId"
                :class="{ 'is-incompatible': !isCompatible(conflict, branch.branchId) }"
              >
                <input
                  v-model="branchSelections[conflict.conflictKey]"
                  type="radio"
                  :name="`branch-${conflict.conflictKey}`"
                  :value="branch.branchId"
                  :disabled="!isCompatible(conflict, branch.branchId)"
                />
                <span>
                  <strong>{{ branch.branchId }}</strong>
                  <small>{{ compactValue(branch.value) }}</small>
                </span>
              </label>
            </fieldset>

            <div class="runtime-review__footer">
              <span v-if="feedback[conflict.conflictKey]" role="status" class="runtime-review__feedback">
                {{ feedback[conflict.conflictKey] }}
              </span>
              <button
                type="button"
                class="runtime-review__resolve"
                :disabled="!canReview(conflict)"
                @click="resolveConflict(conflict)"
              >
                <Check :size="14" aria-hidden="true" />
                {{ conflict.code === 'branch-merge-conflict' ? '采用所选分支' : '确认当前状态' }}
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watchEffect } from 'vue'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleCheck,
  GitMerge,
  History
} from 'lucide-vue-next'
import { useGameStore } from '../../stores/gameStore'

const gameStore = useGameStore()
const reviewOpen = ref(true)
const selectedEventId = ref('')
const branchSelections = reactive({})
const feedback = reactive({})

const report = computed(() => gameStore.getRuntimeCausalityReport())
const activeConflicts = computed(() => report.value.activeConflicts || [])
const resolvedCount = computed(() => report.value.resolvedConflicts?.length || 0)

const labels = {
  'state-snapshot-divergence': '状态链断点',
  'place-control-conflict': '地点控制权改写',
  'character-state-conflict': '角色状态改写',
  'kinship-conflict': '角色关系冲突',
  'canonical-fact-conflict': '既定事实冲突',
  'era-transition-conflict': '年代切换',
  'era-time-regression': '时间回退',
  'branch-merge-conflict': '分支合并差异',
  'branch-merge-invalid': '分支合并结构异常',
  'branch-merge-source-missing': '分支来源缺失',
  'duplicate-event-id': '事件编号重复',
  'orphan-parent': '父事件缺失'
}

watchEffect(() => {
  for (const conflict of activeConflicts.value) {
    if (conflict.code !== 'branch-merge-conflict') continue
    const compatible = conflict.compatibleBranchIds || []
    if (!compatible.includes(branchSelections[conflict.conflictKey])) {
      branchSelections[conflict.conflictKey] = compatible[0] || ''
    }
  }
})

function conflictLabel(code) {
  return labels[code] || '事件冲突'
}

function conflictTarget(conflict) {
  return conflict.path
    || conflict.relationId
    || conflict.factId
    || conflict.characterId
    || conflict.placeId
    || conflict.parentId
    || '运行时事件链'
}

function shortId(value) {
  const source = String(value || '')
  return source.length > 20 ? `${source.slice(0, 9)}…${source.slice(-7)}` : source
}

function sourceEventIds(conflict) {
  return [...new Set([
    conflict.eventId,
    conflict.previousEventId,
    conflict.parentId,
    ...(conflict.sourceBranches || []).map((item) => item.eventId)
  ].filter(Boolean))]
}

function eventDetail(eventId) {
  const event = gameStore.runtimeEvents.find((item) => item?.id === eventId)
  if (!event) return { kind: '事件不可用', summary: '该事件已不在当前会话窗口中。' }
  const changed = [...new Set([
    ...Object.keys(event.payload?.before || {}),
    ...Object.keys(event.payload?.after || {})
  ])]
  return {
    kind: event.payload?.kind || event.type || '运行时事件',
    summary: [
      event.branchId ? `分支 ${event.branchId}` : '',
      changed.length ? `变更 ${changed.join(' / ')}` : '',
      new Date(event.ts).toLocaleString()
    ].filter(Boolean).join(' · ')
  }
}

function compactValue(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  if (!serialized) return '空值'
  return serialized.length > 96 ? `${serialized.slice(0, 93)}…` : serialized
}

function isCompatible(conflict, branchId) {
  return (conflict.compatibleBranchIds || []).includes(branchId)
}

function canReview(conflict) {
  if (conflict.code !== 'branch-merge-conflict') {
    return [
      'state-snapshot-divergence',
      'place-control-conflict',
      'character-state-conflict',
      'kinship-conflict',
      'canonical-fact-conflict',
      'era-transition-conflict',
      'era-time-regression'
    ].includes(conflict.code)
  }
  return isCompatible(conflict, branchSelections[conflict.conflictKey])
}

function resolveConflict(conflict) {
  const result = gameStore.resolveRuntimeConflict({
    conflictKey: conflict.conflictKey,
    chosenBranchId: branchSelections[conflict.conflictKey] || ''
  })
  if (!result.ok) {
    feedback[conflict.conflictKey] = result.error
    return
  }
  selectedEventId.value = ''
}
</script>

<style scoped>
.runtime-review {
  flex: none;
  border-block: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent-teal) 5%, var(--bg-secondary)), var(--bg-secondary) 42%);
}

.runtime-review__header {
  min-height: 54px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.runtime-review__heading,
.runtime-review__status,
.runtime-review__clean,
.runtime-review__source-actions,
.runtime-review__resolve {
  display: flex;
  align-items: center;
}

.runtime-review__heading {
  min-width: 0;
  gap: 10px;
}

.runtime-review__signal {
  width: 4px;
  height: 32px;
  background: linear-gradient(180deg, var(--accent-teal), var(--signal-warm));
}

.runtime-review__kicker {
  display: block;
  margin-bottom: 2px;
  color: var(--text-muted);
  font-size: 9px;
  letter-spacing: 0;
}

.runtime-review h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 720;
  letter-spacing: 0;
}

.runtime-review__status {
  gap: 8px;
  color: var(--text-secondary);
  font-size: 11px;
}

.runtime-review__count {
  color: color-mix(in srgb, var(--signal-warm) 72%, var(--text-primary));
  font-weight: 700;
}

.runtime-review__clean {
  gap: 5px;
  color: var(--accent-teal);
  font-weight: 650;
}

.runtime-review__toggle {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.runtime-review__toggle svg {
  transition: transform 0.16s ease;
}

.runtime-review__toggle svg.is-open {
  transform: rotate(180deg);
}

.runtime-review__toggle:hover,
.runtime-review__toggle:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
}

.runtime-review__content {
  border-top: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
}

.runtime-review__list {
  display: grid;
}

.runtime-review__item + .runtime-review__item {
  border-top: 1px solid color-mix(in srgb, var(--border) 66%, transparent);
}

.runtime-review__item > summary {
  min-height: 48px;
  padding: 8px 14px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  list-style: none;
}

.runtime-review__item > summary::-webkit-details-marker {
  display: none;
}

.runtime-review__item > summary:hover {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.runtime-review__summary-icon {
  color: var(--signal-warm);
}

.runtime-review__summary-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.runtime-review__summary-copy strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.runtime-review__summary-copy span,
.runtime-review__item code {
  color: var(--text-muted);
  font-size: 10px;
}

.runtime-review__summary-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-review__chevron {
  color: var(--text-muted);
  transition: transform 0.16s ease;
}

.runtime-review__item[open] .runtime-review__chevron {
  transform: rotate(180deg);
}

.runtime-review__detail {
  padding: 2px 14px 14px 46px;
  display: grid;
  gap: 10px;
}

.runtime-review__message {
  margin: 0;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.65;
}

.runtime-review__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 14px;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 9px;
}

.runtime-review__sources {
  display: grid;
  gap: 6px;
}

.runtime-review__field-label,
.runtime-review__branches legend {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 650;
}

.runtime-review__source-actions {
  flex-wrap: wrap;
  gap: 5px;
}

.runtime-review__source-actions button {
  min-height: 26px;
  padding: 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 5px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
}

.runtime-review__source-actions button:hover,
.runtime-review__source-actions button.is-active {
  border-color: color-mix(in srgb, var(--accent) 54%, var(--border));
  color: var(--accent);
}

.runtime-review__event {
  padding: 8px 10px;
  display: grid;
  gap: 3px;
  border-block: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  font-size: 10px;
}

.runtime-review__event strong {
  color: var(--text-primary);
}

.runtime-review__event span {
  color: var(--text-muted);
}

.runtime-review__branches {
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 6px;
  border: 0;
}

.runtime-review__branches legend {
  grid-column: 1 / -1;
  margin-bottom: 5px;
}

.runtime-review__branches label {
  min-width: 0;
  padding: 8px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  border-block: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  cursor: pointer;
}

.runtime-review__branches label:has(input:checked) {
  border-color: color-mix(in srgb, var(--accent-teal) 58%, var(--border));
  background: color-mix(in srgb, var(--accent-teal) 6%, transparent);
}

.runtime-review__branches label.is-incompatible {
  opacity: 0.48;
  cursor: not-allowed;
}

.runtime-review__branches input {
  margin: 2px 0 0;
  accent-color: var(--accent);
}

.runtime-review__branches span {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.runtime-review__branches strong {
  color: var(--text-primary);
  font-size: 11px;
}

.runtime-review__branches small {
  overflow: hidden;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-review__footer {
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.runtime-review__feedback {
  color: var(--danger);
  font-size: 10px;
}

.runtime-review__resolve {
  min-height: 30px;
  padding: 4px 10px;
  justify-content: center;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--accent-teal) 48%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-teal) 8%, var(--bg-primary));
  color: color-mix(in srgb, var(--accent-teal) 84%, var(--text-primary));
  font-size: 11px;
  font-weight: 680;
  cursor: pointer;
}

.runtime-review__resolve:hover:not(:disabled) {
  border-color: var(--accent-teal);
  background: color-mix(in srgb, var(--accent-teal) 13%, var(--bg-primary));
}

.runtime-review__resolve:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .runtime-review__header {
    min-height: 52px;
    padding-inline: 10px;
  }

  .runtime-review__item > summary {
    padding-inline: 10px;
    grid-template-columns: 22px minmax(0, 1fr) 18px;
  }

  .runtime-review__item code {
    display: none;
  }

  .runtime-review__detail {
    padding: 2px 10px 12px 40px;
  }

  .runtime-review__footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .runtime-review__resolve {
    align-self: stretch;
  }
}
</style>
