<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps({
  entryIntent: { type: Object, default: null },
  pressure: { type: Object, default: null },
  directions: { type: Array, default: () => [] },
  selectedDirectionId: { type: String, default: '' },
  appendRequirement: { type: String, default: '' },
  ifBranches: { type: Object, default: null },
  ifActiveBranch: { type: String, default: 'A' },
  ifPlans: { type: Object, default: () => ({}) },
  ifBaseline: { type: Array, default: () => [] },
  initialIfOpen: { type: Boolean, default: false },
  initialIfActor: { type: String, default: '' },
  phase: { type: String, default: 'ready' },
  notice: { type: String, default: '' }
})

const emit = defineEmits(['select', 'confirm', 'back', 'close', 'ordinary', 'supplement', 'retry', 'start-if', 'switch-if-branch', 'write-if-draft', 'append-requirement', 'plan-if', 'select-if'])
const ifOpen = ref(props.initialIfOpen)
const ifActor = ref(props.initialIfActor)
watch(() => props.initialIfOpen, value => { ifOpen.value = value })
watch(() => props.initialIfActor, value => { ifActor.value = value })
const ifBeliefA = ref('')
const ifBeliefB = ref('')
const titleRef = ref(null)
const selectedDirection = computed(() => (
  props.directions.find((direction) => direction.id === props.selectedDirectionId) || null
))
const ready = computed(() => props.phase === 'ready' || props.phase === 'direction-selected')
const intentName = computed(() => String(
  props.entryIntent?.entityName
  || props.entryIntent?.label?.split(' · ').slice(1).join(' · ')
  || ''
).trim())
const heading = computed(() => {
  if (!props.entryIntent || !intentName.value) return '推演本场'
  if (props.entryIntent.mode === 'next-passage') {
    return props.entryIntent.entityKind === 'location'
      ? `下一段转到${intentName.value}`
      : `让${intentName.value}下一段入场`
  }
  return props.entryIntent.entityKind === 'location'
    ? `以${intentName.value}作为本次推演参考`
    : `带${intentName.value}参与这次推演`
})
const headingDetail = computed(() => {
  if (!props.entryIntent) return '先选清楚因果方向，再决定是否写成正文'
  return props.entryIntent.mode === 'next-passage'
    ? '采纳推演稿后才更新当前场'
    : '只影响这次推演，不改变当前场'
})
const intentKindLabel = computed(() => props.entryIntent?.entityKind === 'location' ? '地点' : '人物')
const workingCopy = computed(() => ({
  'preparing-context': {
    title: '正在核对本场依据',
    detail: '只读取当前落笔处已经允许进入本次推演的内容。'
  },
  'planning-directions': {
    title: '正在整理本场方向',
    detail: '从同一份冻结现场中寻找彼此有代价差异的走向。'
  },
  'validating-dependencies': {
    title: '正在复核所选方向',
    detail: '正文模型启动前，再次确认落笔处和引用没有变化。'
  },
  'generating-prose': {
    title: '正在沿所选方向落笔',
    detail: '只生成这一个方向的连续正文，不会再规划第二组方向。'
  }
}[props.phase] || { title: '正在准备', detail: '本次操作尚未改动正文。' }))

onMounted(() => nextTick(() => titleRef.value?.focus?.({ preventScroll: true })))

function handleLaboratoryKeydown(event) {
  if (event?.isComposing || event?.keyCode === 229 || event?.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}
</script>

<template>
  <section
    class="authoring-scene-lab"
    data-test="scene-laboratory"
    :data-scene-lab-phase="phase"
    :aria-label="heading"
    @keydown="handleLaboratoryKeydown"
  >
    <header class="authoring-scene-lab__head">
      <div>
        <strong ref="titleRef" tabindex="-1">{{ heading }}</strong>
        <span>{{ headingDetail }}</span>
      </div>
      <button type="button" aria-label="关闭场景实验室" @click="emit('close')">收起</button>
    </header>

    <p v-if="entryIntent" class="authoring-scene-lab__intent">
      <span>{{ intentKindLabel }}</span><strong>{{ intentName }}</strong><small>{{ entryIntent.mode === 'next-passage' ? '下一段生效' : '仅本次' }}</small>
    </p>

    <div v-if="['preparing-context', 'planning-directions', 'validating-dependencies', 'generating-prose'].includes(phase)" class="authoring-scene-lab__working" role="status" aria-live="polite">
      <span class="authoring-scene-lab__working-mark" aria-hidden="true"></span>
      <div>
        <strong>{{ workingCopy.title }}</strong>
        <p>{{ workingCopy.detail }}</p>
      </div>
    </div>

    <template v-else-if="phase === 'failed'">
      <div class="authoring-scene-lab__insufficient is-failed" role="alert">
        <strong>这次没能整理出可靠方向</strong>
        <p>{{ notice || '已保留本次现场与作者意图，可以只重试方向规划。' }}</p>
      </div>
      <footer class="authoring-scene-lab__footer">
        <button type="button" @click="emit('ordinary')">直接普通推演</button>
        <button type="button" class="is-primary" @click="emit('retry')">重试方向</button>
      </footer>
    </template>

    <template v-else-if="phase === 'insufficient'">
      <div class="authoring-scene-lab__insufficient" role="status">
        <strong>当前信息还不足以形成真实取舍</strong>
        <p>{{ pressure?.missing || '补充一个在场人物、明确目标或地点规则后，再核对本场方向。' }}</p>
      </div>
      <footer class="authoring-scene-lab__footer">
        <button type="button" @click="emit('supplement')">补充当前场</button>
        <button type="button" class="is-primary" @click="emit('ordinary')">直接普通推演</button>
      </footer>
    </template>

    <template v-else-if="ready">
      <div class="authoring-scene-lab__pressure">
        <span>此刻的难题</span>
        <p>{{ pressure?.statement }}</p>
        <div class="authoring-scene-lab__evidence" aria-label="场景压力依据">
          <span>来自</span>
          <button
            v-for="evidence in pressure?.evidence || []"
            :key="evidence.id || evidence.label"
            type="button"
            @click="$emit('back', evidence)"
          >{{ evidence.label }}</button>
        </div>
      </div>

      <ol class="authoring-scene-lab__directions" aria-label="本场方向">
        <li v-for="(direction, index) in directions" :key="direction.id">
          <button
            type="button"
            class="authoring-scene-lab__direction"
            :class="{ 'is-selected': selectedDirectionId === direction.id }"
            :aria-pressed="(selectedDirectionId === direction.id).toString()"
            @click="emit('select', direction.id)"
          >
            <span class="authoring-scene-lab__ordinal">0{{ index + 1 }}</span>
            <span class="authoring-scene-lab__direction-copy">
              <span class="authoring-scene-lab__direction-lead">
                <strong>{{ direction.title }}</strong>
                <span class="authoring-scene-lab__action">{{ direction.action }}</span>
              </span>
              <span class="authoring-scene-lab__consequence is-gain"><small>眼前所得</small><b>{{ direction.immediateGain }}</b></span>
              <span class="authoring-scene-lab__consequence is-cost"><small>代价</small><b>{{ direction.cost }}</b></span>
            </span>
          </button>
        </li>
      </ol>

      <footer v-if="selectedDirection || initialIfOpen" class="authoring-scene-lab__footer is-selection">
        <p><span>{{ notice ? '当前状态' : '准备沿此方向落笔' }}</span>{{ notice || selectedDirection?.title || '填写一条信念，比较两种条件下的选择。' }}</p>
        <!-- U44：追加一句要求，改变当前方向下的具体行动 -->
        <div class="authoring-scene-lab__append">
          <input
            type="text"
            class="authoring-scene-lab__append-input"
            :value="appendRequirement"
            placeholder="按这个方向，但……（可留空直接推演）"
            aria-label="追加要求"
            @input="emit('append-requirement', $event.target.value)"
          />
        </div>
        <!-- U45: 只改一个条件（人物 IF 入口） -->
        <div class="authoring-scene-lab__if-entry">
          <button type="button" class="authoring-scene-lab__if-toggle"
            :aria-expanded="ifOpen ? 'true' : 'false'"
            @click="ifOpen = !ifOpen">{{ ifOpen ? '收起人物 IF' : '只改一个条件' }}</button>
          <div v-if="ifOpen" class="authoring-scene-lab__if-panel" role="group" aria-label="人物 IF 面板">
            <p class="authoring-scene-lab__if-hint">同一情境，只改一句信念，对照 A/B 行动。</p>
            <label class="authoring-scene-lab__if-label">人物
              <input type="text" class="authoring-scene-lab__if-input" v-model="ifActor"
                placeholder="如：艾德加" aria-label="IF 人物名" /></label>
            <label class="authoring-scene-lab__if-label">条件 A（当前假设）
              <input type="text" class="authoring-scene-lab__if-input" v-model="ifBeliefA"
                placeholder="如：忠于城主" aria-label="条件 A" /></label>
            <label class="authoring-scene-lab__if-label">条件 B（试验假设）
              <input type="text" class="authoring-scene-lab__if-input" v-model="ifBeliefB"
                placeholder="如：暗中背叛城主" aria-label="条件 B" /></label>
            <button type="button" class="is-primary authoring-scene-lab__if-start"
              :disabled="!ifActor || !ifBeliefA || !ifBeliefB"
              @click="emit('start-if', { actor: ifActor, beliefA: ifBeliefA, beliefB: ifBeliefB })">开始 A/B 对照</button>
          </div>
        </div>
        <div v-if="ifBranches && ifBranches.A && ifBranches.B" class="authoring-scene-lab__ab" role="group" aria-label="A/B 对照">
          <p>两支只改变信念；行动可能相同。代价是预测，条件是作者假设。仅在本次会话保留，请及时留作构思。</p>
          <details>
            <summary>查看共用的冻结依据</summary>
            <p v-for="(fact, index) in ifBaseline" :key="index" class="authoring-scene-lab__baseline">{{ fact.text }}</p>
          </details>
          <div v-for="bid in ['A', 'B']" :key="bid"
            class="authoring-scene-lab__ab-card"
            :class="{ 'is-active': ifActiveBranch === bid }"
            role="button" tabindex="0"
            :aria-label="'切换到 ' + bid"
            @click="emit('switch-if-branch', bid)"
            @keydown.enter="emit('switch-if-branch', bid)">
            <span class="authoring-scene-lab__ab-label">{{ bid }}</span>
            <span class="authoring-scene-lab__ab-belief">{{ ifBranches[bid]?.belief ?? '' }}</span>
          </div>
          <div class="authoring-scene-lab__if-choices">
            <p v-if="ifPlans[ifActiveBranch]?.status === 'planning'" role="status">正在整理 {{ ifActiveBranch }} 的行动…</p>
            <p v-if="ifPlans[ifActiveBranch]?.status === 'failed'" role="alert">{{ ifPlans[ifActiveBranch].message }}</p>
            <button v-if="!ifPlans[ifActiveBranch] || ifPlans[ifActiveBranch]?.status === 'failed'"
              type="button" @click="emit('plan-if', ifActiveBranch)">重试这一支的行动</button>
            <button v-for="direction in ifPlans[ifActiveBranch]?.run?.directionSet?.directions || []"
              :key="direction.id" type="button"
              :aria-pressed="ifPlans[ifActiveBranch].run.selectedDirectionId === direction.id"
              @click="emit('select-if', { branchId: ifActiveBranch, directionId: direction.id })">
              <strong>{{ direction.title }}</strong>
              <span>{{ direction.action }}</span>
              <span>眼前所得：{{ direction.immediateGain }} · 预测代价：{{ direction.cost }}</span>
              <small>依据：{{ (direction.evidenceRefs || []).join('、') }}</small>
            </button>
            <button type="button" class="is-primary"
              :disabled="!ifPlans[ifActiveBranch]?.run?.selectedDirectionId"
              :aria-label="'以 ' + ifActiveBranch + ' 条件写正文'"
              @click="emit('write-if-draft', ifActiveBranch)">按此假设写成正文</button>
          </div>
        </div>
        <div v-if="!ifBranches?.A && selectedDirection" class="authoring-scene-lab__footer-actions">
          <button type="button" @click="emit('select', '')">换方向</button>
          <button type="button" class="is-primary" @click="emit('confirm', selectedDirection)">{{ appendRequirement ? '按新要求推演' : '按此推演' }}</button>
        </div>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.authoring-scene-lab__if-choices { display: grid; gap: 8px; min-width: 0; }
.authoring-scene-lab__if-choices button { display: grid; gap: 4px; text-align: start; white-space: normal; overflow-wrap: anywhere; }
.authoring-scene-lab__if-choices [aria-pressed="true"] { outline: 1px solid var(--text-secondary); }
.authoring-scene-lab__baseline { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; }
.authoring-scene-lab {
  position: relative;
  width: 100%;
  max-width: 100%;
  padding: 18px 16px 16px 42px;
  border-block: 1px solid color-mix(in srgb, var(--border-subtle) 78%, transparent);
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
}
.authoring-scene-lab::before {
  position: absolute;
  inset: 18px auto 16px 24px;
  width: 3px;
  content: '';
  background: color-mix(in srgb, var(--archive-olive) 42%, transparent);
}
.authoring-scene-lab__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.authoring-scene-lab__head > div {
  display: grid;
  gap: 2px;
}
.authoring-scene-lab__head strong {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 650;
  letter-spacing: .03em;
}
.authoring-scene-lab__head span,
.authoring-scene-lab__head button {
  color: var(--text-secondary);
  font-size: 11px;
}
.authoring-scene-lab__intent {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin: -4px 0 10px;
  padding: 7px 0;
  border-block: 1px solid var(--border-subtle);
  font-size: 12px;
}
.authoring-scene-lab__intent span,
.authoring-scene-lab__intent small { color: var(--text-secondary); font-size: 10px; }
.authoring-scene-lab__intent strong { font-weight: 600; }
.authoring-scene-lab__intent small { margin-left: auto; }
.authoring-scene-lab button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.authoring-scene-lab button:focus-visible,
.authoring-scene-lab__head strong:focus-visible {
  outline: 2px solid var(--control-focus, var(--accent-primary));
  outline-offset: 2px;
}
.authoring-scene-lab__direction:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--control-focus, var(--accent-primary)) 52%, transparent);
  outline-offset: -1px;
}
.authoring-scene-lab__pressure {
  display: grid;
  gap: 5px;
  padding: 12px 16px 11px;
  border-block: 1px solid color-mix(in srgb, var(--archive-olive) 18%, var(--border-subtle));
  background: color-mix(in srgb, var(--archive-olive) 4%, transparent);
}
.authoring-scene-lab__pressure > span,
.authoring-scene-lab__evidence > span {
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: .04em;
}
.authoring-scene-lab__pressure p {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.7;
}
.authoring-scene-lab__evidence {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 3px 10px;
  padding-top: 2px;
}
.authoring-scene-lab__evidence button {
  min-height: 24px;
  padding: 0;
  color: var(--text-secondary);
  font-size: 11px;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 34%, transparent);
  text-underline-offset: 3px;
}
.authoring-scene-lab__directions {
  display: grid;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.authoring-scene-lab__directions li {
  border-bottom: 1px solid var(--border-subtle);
}
.authoring-scene-lab__direction {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  width: 100%;
  min-height: 86px;
  gap: 12px;
  padding: 13px 10px 13px 4px;
  text-align: left;
}
.authoring-scene-lab__direction:hover,
.authoring-scene-lab__direction.is-selected {
  background: color-mix(in srgb, var(--archive-olive) 6%, transparent);
}
.authoring-scene-lab__direction.is-selected {
  box-shadow: inset 3px 0 color-mix(in srgb, var(--archive-olive) 68%, transparent);
}
.authoring-scene-lab__ordinal {
  padding-top: 2px;
  color: var(--text-secondary);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: .08em;
}
.authoring-scene-lab__direction-copy {
  display: grid;
  grid-template-columns: minmax(150px, 1.15fr) minmax(0, .9fr) minmax(0, .9fr);
  gap: 4px 22px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.55;
}
.authoring-scene-lab__direction-lead {
  display: grid;
  align-content: start;
  gap: 3px;
}
.authoring-scene-lab__direction-copy strong {
  font-size: 14px;
  line-height: 1.45;
}
.authoring-scene-lab__action {
  color: var(--text-secondary);
  line-height: 1.6;
}
.authoring-scene-lab__consequence {
  position: relative;
  display: grid;
  align-content: start;
  gap: 3px;
  padding-left: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.authoring-scene-lab__consequence::before {
  position: absolute;
  inset: 3px auto 3px 0;
  width: 2px;
  content: '';
  background: color-mix(in srgb, var(--archive-olive) 34%, transparent);
}
.authoring-scene-lab__consequence.is-cost::before {
  background: color-mix(in srgb, var(--signal-danger, var(--text-secondary)) 38%, transparent);
}
.authoring-scene-lab__direction-copy small {
  display: block;
  margin-bottom: 1px;
  color: var(--text-secondary);
  font-size: 10px;
}
.authoring-scene-lab__direction-copy b {
  font-weight: 500;
  line-height: 1.55;
}
.authoring-scene-lab__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  padding: 12px 10px 0 4px;
  font-size: 12px;
}
.authoring-scene-lab__footer p {
  display: grid;
  gap: 1px;
  margin: 0 auto 0 0;
  font-weight: 550;
}
.authoring-scene-lab__footer p span {
  margin-right: 0;
  color: var(--text-secondary);
  font-size: 10px;
}
.authoring-scene-lab__footer button {
  min-height: 32px;
  padding: 0;
  color: var(--text-secondary);
}
.authoring-scene-lab__footer .is-primary {
  min-width: 104px;
  padding-inline: 16px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 54%, var(--border-default));
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  color: var(--archive-olive-strong, var(--text-primary));
}
.authoring-scene-lab__insufficient {
  padding: 9px 0 12px;
  border-block: 1px solid var(--border-subtle);
}
.authoring-scene-lab__working {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 82px;
  padding: 12px 0;
  border-block: 1px solid var(--border-subtle);
}
.authoring-scene-lab__working-mark {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 32%, transparent);
  border-top-color: var(--archive-olive);
  border-radius: 50%;
  animation: scene-lab-turn 1s linear infinite;
}
.authoring-scene-lab__working strong {
  font-size: 13px;
}
.authoring-scene-lab__working p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}
.authoring-scene-lab__insufficient.is-failed {
  border-top-color: color-mix(in srgb, var(--color-danger, #9a4d45) 34%, var(--border-subtle));
}
@keyframes scene-lab-turn {
  to { transform: rotate(360deg); }
}
.authoring-scene-lab__insufficient strong {
  font-size: 13px;
}
.authoring-scene-lab__insufficient p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 720px) {
  .authoring-scene-lab {
    padding: 14px 8px 12px 30px;
  }
  .authoring-scene-lab::before {
    left: 16px;
  }
  .authoring-scene-lab__pressure {
    margin-right: 2px;
    padding: 10px 11px;
  }
  .authoring-scene-lab__direction {
    min-height: 44px;
  }
  .authoring-scene-lab__direction-copy {
    grid-template-columns: 1fr;
    gap: 9px;
  }
  .authoring-scene-lab__consequence {
    padding-left: 10px;
  }
  .authoring-scene-lab__footer {
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .authoring-scene-lab__footer p {
    flex-basis: 100%;
  }
  .authoring-scene-lab__footer button {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .authoring-scene-lab * {
    scroll-behavior: auto !important;
    transition: none !important;
    animation: none !important;
  }
}

.authoring-scene-lab__append{margin:8px 0 6px}
.authoring-scene-lab__append-input{box-sizing:border-box;width:100%;min-height:32px;padding:6px 10px;border:1px solid var(--border-subtle);border-radius:4px;background:var(--surface-workbench-muted);color:var(--text-primary);font:400 13px/1.4 var(--font-body);outline:0}
.authoring-scene-lab__append-input:focus{border-color:var(--accent-primary,var(--accent,#1677ff))}
.authoring-scene-lab__footer-actions{display:flex;gap:8px;margin-top:6px}
</style>
