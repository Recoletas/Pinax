<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import AuthoringGenerationStatus from './AuthoringGenerationStatus.vue'
import { tr } from '../../i18n/index.js'
import { normalizeNarrativeTransportProse } from '../../services/narrativePresentation.js'
const props = defineProps({
  rehearsal: { type: Object, required: true },
  preparing: Boolean,
  waitingReview: Boolean,
  sourceExcerpt: { type: String, default: '' },
  notice: { type: String, default: '' },
  title: { type: String, default: '' },
  drafting: Boolean,
  draftState: { type: String, default: 'none' },
  firstRunHint: { type: String, default: '' },
  memoryWorkflow: { type: Object, default: null }
})
const emit = defineEmits(['start', 'draft', 'view-draft', 'locate', 'if', 'check-connection', 'cancel'])
const steps = computed(() => props.rehearsal.steps.value)
const last = computed(() => steps.value.at(-1))
const atLimit = computed(() => steps.value.length >= props.rehearsal.maxSteps)
const suggestions = computed(() => (last.value?.choices || []).slice(0, 3))
const working = computed(() => props.preparing || props.drafting || props.rehearsal.busy.value)
const hasDraft = computed(() => props.draftState !== 'none')
const locked = computed(() => working.value || props.waitingReview || hasDraft.value)
const stale = computed(() => props.rehearsal.stale.value)
const rejected = computed(() => props.rehearsal.lastRejected.value)
const pendingInstruction = ref(props.rehearsal.action.value || '')
const actionText = computed(() => props.rehearsal.run.value ? props.rehearsal.action.value : pendingInstruction.value)
watch(() => props.rehearsal.run.value, (run, previous) => {
  if (run && !previous) props.rehearsal.setAction(pendingInstruction.value)
  else if (!run && previous) pendingInstruction.value = ''
}, { flush: 'sync' })
function setAction(value) {
  if (!props.rehearsal.run.value) pendingInstruction.value = value
  props.rehearsal.setAction(value)
}
const retained = computed(() => {
  const result = props.rehearsal.retainedResult?.value
  return result && (!result.routeId || result.routeId === props.rehearsal.route.value) ? result : null
})
const retainedText = computed(() => normalizeNarrativeTransportProse(retained.value?.response || ''))
const retainedNotice = computed(() => {
  if (retained.value?.reason === 'stale') return tr('生成期间正文或参考发生变化，这份结果已保留。')
  if (retained.value?.reason === 'repeat') return tr('这份结果可能重复了前文，尚未加入本次推演。')
  return tr('这份结果未能完整解析，已保留可读内容。')
})
const copyNotice = ref('')
watch(retained, () => { copyNotice.value = '' })
async function copyRetained() {
  try { await navigator.clipboard.writeText(retainedText.value); copyNotice.value = tr('已复制') }
  catch { copyNotice.value = tr('复制失败，请选中文字复制。') }
}
// 失败就地回程:错误翻译成作者能行动的一句话,原始细节保留为次级信息;
// 草拟行动、行动者与对象不动,重试直接重发同一意图。
const failureHeadline = computed(() => {
  const raw = String(props.rehearsal.error.value || '')
  if (/network|fetch|timeout|ECONN|ERR_|status code \d{3}/i.test(raw)) return tr('推演没有完成：暂时连不上推演服务。')
  return tr('推演没有完成。')
})
const flow = ref(null)
const input = ref(null)
const more = ref(null)
const hasNew = ref(false)
const follow = ref(true)

function chooseAction(choice) {
  setAction(choice)
  nextTick(() => input.value?.focus())
}
function placeMoreMenu(event) {
  const menu = event.currentTarget
  if (!menu.open) return
  const panel = menu.querySelector('.rehearsal-menu')
  const anchor = menu.querySelector('summary').getBoundingClientRect()
  panel.classList.toggle('is-above', window.innerHeight - anchor.bottom < panel.getBoundingClientRect().height + 12)
}
function closeMore(restoreFocus = false) {
  if (!more.value) return
  more.value.open = false
  if (restoreFocus) more.value.querySelector('summary')?.focus({ preventScroll: true })
}
function onMoreBlur(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) closeMore()
}
function openComparison() {
  if (locked.value || !props.rehearsal.run.value) return
  closeMore()
  emit('if')
}
function submitFromKeyboard(event) {
  if (event.isComposing || event.keyCode === 229 || event.key !== 'Enter') return
  if (event.shiftKey && !event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  if (locked.value || event.repeat) return
  if (event.ctrlKey || event.metaKey) {
    const field = event.target
    field.setRangeText('\n', field.selectionStart, field.selectionEnd, 'end')
    setAction(field.value)
    nextTick(fitAction)
  } else submit()
}

function pickActor(ref) {
  actorRef.value = ref
}
function restart() {
  if (locked.value) return
  closeMore()
  emit('start', { instruction: '', autoAdvance: false })
}
function submit() {
  if (locked.value || stale.value || atLimit.value) return
  if (!props.rehearsal.run.value) {
    emit('start', { instruction: pendingInstruction.value.trim(), autoAdvance: true })
    return
  }
  props.rehearsal.advance(buildIntent())
}
// The story scrolls inside the panel on wide screens and with the whole
// workspace on narrow ones; the reading position belongs to whichever
// element actually scrolls, so resolve it instead of assuming.
const scroller = ref(null)
function resolveScroller() {
  const element = flow.value
  if (!element) return null
  if (getComputedStyle(element).overflowY === 'auto' && element.scrollHeight > element.clientHeight) return element
  let node = element.parentElement
  while (node && node !== document.body) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}
function scrollTarget() {
  const cached = scroller.value
  if (!cached || !cached.isConnected || cached.scrollHeight <= cached.clientHeight) scroller.value = resolveScroller()
  return scroller.value || window
}
function scrollTopOf() { const target = scrollTarget(); return target === window ? window.scrollY : target.scrollTop }
function distanceFromBottom() {
  const target = scrollTarget()
  return target === window
    ? document.documentElement.scrollHeight - window.scrollY - window.innerHeight
    : target.scrollHeight - target.scrollTop - target.clientHeight
}
// 直接写 scrollTop / scrollTo，避免依赖 scrollIntoView（测试环境与
// 某些嵌入容器不实现它）。
function scrollToPosition(value) {
  const target = scrollTarget()
  if (target !== window) { target.scrollTop = value; return }
  if (document.documentElement.scrollHeight <= window.innerHeight) return
  if (typeof window.scrollTo === 'function') window.scrollTo({ top: value })
}
function onFlowScroll() {
  props.rehearsal.setReadingScroll(scrollTopOf())
  follow.value = distanceFromBottom() < 64
  if (follow.value) hasNew.value = false
}
function revealStep(stepId) {
  const element = flow.value?.querySelector(`[data-step="${stepId}"]`)
  if (!element) return
  const target = scrollTarget()
  const offset = element.getBoundingClientRect().top - (target === window ? 0 : target.getBoundingClientRect().top)
  scrollToPosition(scrollTopOf() + offset - 16)
  hasNew.value = false
  onFlowScroll()
}
function folded(stepId) { return Boolean(props.rehearsal.folded.value[stepId]) }

let lastCount = steps.value.length
let lastRoute = props.rehearsal.route.value
watch(() => steps.value.map(item => item.id).join('|'), async () => {
  await nextTick()
  const ids = steps.value.map(item => item.id)
  if (props.rehearsal.route.value !== lastRoute) {
    lastRoute = props.rehearsal.route.value; lastCount = ids.length; hasNew.value = false
    scrollToPosition(0)
    return
  }
  if (ids.length > lastCount) {
    if (follow.value) revealStep(ids[ids.length - 1])
    else hasNew.value = true
  }
  lastCount = ids.length
})
// The story scrolls inside the panel on wide screens and with the whole
// workspace on narrow ones. Scroll events do not bubble, so listen in the
// capture phase and act only for whichever element is really scrolling now.
function onAnyScroll(event) {
  if (event.target !== flow.value && event.target !== scrollTarget()) return
  onFlowScroll()
}
onMounted(() => {
  scroller.value = resolveScroller()
  document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true })
  if (props.rehearsal.readingScroll.value) scrollToPosition(props.rehearsal.readingScroll.value)
  follow.value = distanceFromBottom() < 64
})
onBeforeUnmount(() => {
  document.removeEventListener('scroll', onAnyScroll, { capture: true })
  props.rehearsal.setReadingScroll(scrollTopOf())
})

// 走法：名字取与当前路分开的那一次行动，而不是统一的第一步或序号。
function divergenceOf(their, mine) {
  const limit = Math.min(their.length, mine.length)
  let index = 0
  while (index < limit && their[index].action === mine[index].action) index += 1
  return { index, common: their.slice(0, index).map(item => item.action), step: their[index] || null, latest: their.at(-1) || null }
}
// 只有别的路可以当比较对象：当前路永远不进候选，避免自己和自己比。
const otherRoutes = computed(() => props.rehearsal.otherRoutes.value)
function routeName(path) {
  const part = divergenceOf(path.steps, steps.value)
  return part.step?.action || part.latest?.action || tr('起点')
}
const compareId = ref('')
const compareSection = ref(null)
watch([otherRoutes, () => props.rehearsal.route.value], ([list]) => {
  const ids = list.map(path => path.id)
  if (!ids.length) { compareId.value = ''; return }
  if (!ids.includes(compareId.value)) compareId.value = ids[ids.length - 1]
}, { immediate: true })
const comparePath = computed(() => otherRoutes.value.find(path => path.id === compareId.value) || null)
const compareSide = computed(() => {
  const other = comparePath.value
  if (!other || other.id === props.rehearsal.route.value) return null
  return {
    mine: { depth: steps.value.length, ...divergenceOf(steps.value, other.steps) },
    theirs: { depth: other.steps.length, ...divergenceOf(other.steps, steps.value) }
  }
})
const compareOpen = ref(false)

const conditionText = ref('')
const conditionKnowerRef = ref('')
const conditionUnawareRef = ref('')
const conditionIssue = ref('')

// 行动者只提供叙事焦点。代词不作为强制指定受事人物的依据。
const participants = computed(() => props.rehearsal.participants.value)
const actorRef = ref('')
const defaultActorRef = computed(() => participants.value.find(person => person.roles.includes('viewpoint') && person.status !== 'planned')?.ref
  || participants.value.find(person => person.status !== 'planned')?.ref || '')
const activeActor = computed(() => participants.value.find(person => person.ref === (actorRef.value || defaultActorRef.value)) || null)
watch(defaultActorRef, (value) => { if (!actorRef.value && value) actorRef.value = '' })
const others = computed(() => participants.value.filter(person => person.status !== 'planned' && person.ref !== activeActor.value?.ref))
function buildIntent() {
  const selected = []
  for (const person of others.value.filter(item => props.rehearsal.action.value.includes(item.name))) {
    if (!selected.some(item => item?.ref === person.ref)) selected.push(person)
  }
  return {
    mode: props.rehearsal.action.value.trim() ? 'instruction' : 'continue',
    text: props.rehearsal.action.value.trim(),
    actor: activeActor.value?.name || '',
    actorRef: activeActor.value?.ref || '',
    targets: selected.filter(Boolean).map(person => person.name),
    targetRefs: selected.filter(Boolean).map(person => person.ref)
  }
}
function saveCondition() {
  const fact = conditionText.value.trim()
  if (!fact) { conditionIssue.value = '先写下一条本次推演成立的事实。'; return }
  const knowerRefs = conditionKnowerRef.value ? [conditionKnowerRef.value] : []
  const unawareRefs = conditionUnawareRef.value && conditionUnawareRef.value !== conditionKnowerRef.value
    ? [conditionUnawareRef.value] : []
  if (!props.rehearsal.freezeConditions({ facts: [{ text: fact, knowerRefs, unawareRefs }] })) {
    conditionIssue.value = '这条条件没有保存，请检查人物选择或缩短文字。'
    return
  }
  conditionIssue.value = ''
}
function personName(ref) { return participants.value.find(person => person.ref === ref)?.name || tr('未指名人物') }
function consequenceLines(item) {
  return (item.consequences || []).map((entry) => {
    if (entry.kind === 'knowledge') return tr('{person}得知了本次条件中的事实', { person: personName(entry.knowerRef) })
    if (entry.kind === 'commitment') {
      const states = { promised: '答应', conditioned: '有条件答应', refused: '拒绝', withdrawn: '收回承诺' }
      return tr('{person}{state}：{content}{condition}', { person: personName(entry.promisorRef), state: tr(states[entry.state] || '回应'), content: entry.content, condition: entry.condition ? tr('（条件：{condition}）', { condition: entry.condition }) : '' })
    }
    if (entry.kind === 'item') return tr(entry.state === 'delivered' ? '{item}交到{person}手中' : '{person}没有接下{item}', { item: entry.name || tr('物品'), person: personName(entry.toRef) })
    if (entry.kind === 'location') return tr(entry.state === 'left' ? '{person}离开了现场' : '{person}回到了现场', { person: personName(entry.moverRef) })
    return ''
  }).filter(Boolean)
}
function receiptSources(item) {
  const refs = new Set((item.toolReceipt?.calls || []).flatMap(call => call.resultRefs || []))
  return (props.rehearsal.run.value?.runSession?.manifest?.blocks || [])
    .filter(block => refs.has(block.primarySourceRef) || (block.sourceRefs || []).some(ref => refs.has(ref)))
    .map(block => ({
      title: block.label || tr('历史资料'),
      type: tr(block.kind === 'history-node' ? '历史' : '参考'),
      summary: String(block.text || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }))
}
function receiptCount(item) {
  return (item.toolReceipt?.calls || []).reduce((total, call) => total + Number(call.resultCount || 0), 0)
}
function differenceStatus(side) {
  return side.status === 'held'
    ? tr('持有者：{name}', { name: side.holderName })
    : tr(side.statusLabel)
}
const compareDifferences = computed(() => (props.rehearsal.compareRoutes(compareId.value)?.differences || []).slice(0, 3))
// 展开对照时把它带进视野：作者不该为一屏之外的比较内容再滚一次。
async function onCompareToggle(event) {
  compareOpen.value = event.target.open
  if (!event.target.open) return
  await nextTick()
  const section = compareSection.value
  if (!section) return
  const target = scrollTarget()
  const offset = section.getBoundingClientRect().top - (target === window ? 0 : target.getBoundingClientRect().top)
  scrollToPosition(scrollTopOf() + offset - 16)
}
function fitAction() {
  const field = input.value
  if (!field) return
  field.style.height = 'auto'
  field.style.height = `${compareOpen.value ? 40 : Math.min(132, Math.max(56, field.scrollHeight))}px`
}
watch(actionText, () => nextTick(fitAction))
watch(input, () => nextTick(fitAction))
watch(compareOpen, () => nextTick(fitAction))
function onRoutesToggle(event) {
  if (event.target !== event.currentTarget) return
  compareOpen.value = event.currentTarget.open && Boolean(compareSection.value?.open)
}
function paragraphs(text) { return String(text || '').split(/\n\s*\n/).filter(Boolean) }
</script>

<template>
  <section class="rehearsal-panel" :class="{ 'is-ready': !steps.length && !retainedText }" :aria-label="tr('故事推演')" data-test="rehearsal-panel" :data-current-route="rehearsal.route.value">
    <p v-if="firstRunHint" class="rehearsal-first-run-hint" data-test="rehearsal-first-run-hint">{{ tr(firstRunHint) }}</p>
    <button v-if="sourceExcerpt" type="button" class="rehearsal-anchor" :title="sourceExcerpt" :aria-label="tr('定位推演起点')" @click="emit('locate')"><span>{{ sourceExcerpt }}</span><WorkbenchIcon name="arrow-right" :size="13" /></button>
    <div ref="flow" class="rehearsal-flow" @scroll.passive="onFlowScroll">
      <div v-if="!rehearsal.run.value && hasDraft" class="rehearsal-result-actions">
        <button type="button" class="rehearsal-export" @click="emit('view-draft')">{{ tr('查看草稿') }}<WorkbenchIcon name="arrow-right" :size="14" /></button>
      </div>
      <template v-if="rehearsal.run.value">

        <p v-if="!steps.length && rehearsal.run.value.directionSet?.pressure?.statement" class="rehearsal-question">{{ rehearsal.run.value.directionSet.pressure.statement }}</p>
        <ol class="rehearsal-steps">
          <li v-for="(item, index) in steps" :key="item.id" class="rehearsal-step" :data-step="item.id">
            <button type="button" class="rehearsal-step-head" :aria-expanded="folded(item.id) ? 'false' : 'true'" @click="rehearsal.toggleFold(item.id)">
              <span class="rehearsal-step-index" aria-hidden="true">{{ index + 1 }}</span>
              <span class="rehearsal-step-action">{{ item.mode === 'continue' ? tr('继续推演') : item.actor ? `${item.actor}：${item.action}` : item.action }}</span>
              <WorkbenchIcon name="arrow-right" :size="13" class="rehearsal-step-chevron" />
            </button>
            <div v-show="!folded(item.id)" class="rehearsal-step-body">
              <div class="rehearsal-response"><p v-for="(paragraph, paragraphIndex) in paragraphs(item.response)" :key="paragraphIndex">{{ paragraph }}</p></div>
              <div class="rehearsal-step-tools">
                <button type="button" class="rehearsal-back" :disabled="locked" @click="rehearsal.rewind(index)">{{ tr('从这一步重新推演') }}</button>
                <details class="rehearsal-consequence"><summary>{{ tr('发生了什么变化') }}</summary><p>{{ item.change }}</p><ul v-if="consequenceLines(item).length"><li v-for="line in consequenceLines(item)" :key="line">{{ line }}</li></ul></details>
                <details v-if="item.toolReceipt?.status === 'completed'" class="rehearsal-evidence" data-test="rehearsal-evidence">
                  <summary>{{ tr('查阅 {count} 项 · 查看', { count: receiptCount(item) }) }}</summary>
                  <ul><li v-for="source in receiptSources(item)" :key="source.title"><strong>{{ source.title }}</strong><small>{{ source.type }} · {{ source.summary }}</small></li></ul>
                </details>
                <p v-else-if="item.toolReceipt?.status === 'unavailable'" class="rehearsal-evidence-status">{{ tr('本次未能查阅资料，可用下方原行动重试。') }}</p>
                <p v-else-if="item.toolReceipt?.status === 'denied'" class="rehearsal-evidence-status">{{ tr('请求的资料不在本次参考范围。') }}<button type="button" @click="emit('locate')">{{ tr('查看本次参考') }}</button></p>
                <p v-else-if="item.toolReceipt?.status === 'failed'" class="rehearsal-evidence-status">{{ tr('资料查询失败，回应未采用查询结果。') }}</p>
              </div>
            </div>
          </li>
        </ol>
        <div v-if="steps.length || draftState !== 'none'" class="rehearsal-result-actions">
          <button v-if="draftState !== 'none'" type="button" class="rehearsal-export" @click="emit('view-draft')">{{ tr('查看草稿') }}<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else type="button" class="rehearsal-export" :disabled="locked || stale" @click="emit('draft')">{{ drafting ? tr('正在整理正文草稿…') : tr('写成正文') }}<WorkbenchIcon name="arrow-right" :size="14" /></button>
        </div>
        <button v-if="hasNew" type="button" class="rehearsal-new" @click="revealStep(steps[steps.length - 1].id)">{{ tr('有新回应') }}<WorkbenchIcon name="arrow-right" :size="13" class="is-down" /></button>
        <template v-if="!stale && !atLimit">
          <div v-if="suggestions.length" class="rehearsal-options" :aria-label="tr('可试行动')">
            <span class="rehearsal-options-label">{{ tr('接下来') }}</span>
            <button v-for="choice in suggestions" :key="choice" type="button" :disabled="locked" :aria-pressed="rehearsal.action.value === choice" @click="chooseAction(choice)"><span>{{ choice }}</span><WorkbenchIcon name="arrow-right" :size="13" /></button>
          </div>
        </template>
        <p v-else-if="!stale" class="rehearsal-limit">{{ tr('已完成四步推演。可以写成正文，或从前面的步骤重新推演。') }}</p>
        <p v-if="stale && !retainedText" class="rehearsal-stale" role="status">{{ tr('正文或参考已变化：这条路仍可回看和留作构思，需要重新确定起点才能继续。') }}</p>
        <details v-if="otherRoutes.length || steps.length" class="rehearsal-route-library" @toggle="onRoutesToggle">
          <summary>{{ tr('其他结果') }}<span v-if="otherRoutes.length">{{ otherRoutes.length }}</span><WorkbenchIcon name="chevron-down" :size="14" /></summary>
          <div class="rehearsal-routes" :aria-label="tr('其他推演结果')">
          <button v-if="steps.length" type="button" class="rehearsal-route" data-route-root :disabled="locked" @click="rehearsal.rewind(0)">
            <span>{{ tr('回到起点') }}</span><small>{{ tr('第 {count} 步', { count: 0 }) }}</small>
          </button>
          <button v-for="path in otherRoutes.slice(-1)" :key="path.id" type="button" class="rehearsal-route" :data-route="path.id" :disabled="locked" @click="rehearsal.restore(path.id)">
            <span>{{ routeName(path) }}</span><small>{{ tr('第 {count} 步', { count: path.steps.length }) }}</small>
          </button>
          <details v-if="otherRoutes.length > 1" class="rehearsal-routes-more">
            <summary>{{ tr('更多结果 · {count}', { count: otherRoutes.length - 1 }) }}</summary>
            <button v-for="path in otherRoutes.slice(0, -1).reverse()" :key="path.id" type="button" class="rehearsal-route" :data-route="path.id" :disabled="locked" @click="rehearsal.restore(path.id)">
              <span>{{ routeName(path) }}</span><small>{{ tr('第 {count} 步', { count: path.steps.length }) }}</small>
            </button>
          </details>
          <details v-if="compareSide" ref="compareSection" class="rehearsal-compare" @toggle="onCompareToggle">
            <summary>{{ tr('比较两种结果') }}</summary>
            <nav v-if="otherRoutes.length > 1" class="rehearsal-compare-pick" :aria-label="tr('选择要比较的结果')">
              <button v-for="path in otherRoutes" :key="path.id" type="button" :data-route="path.id" :aria-pressed="path.id === compareId" @click="compareId = path.id">{{ routeName(path) }}<small>{{ tr('第 {count} 步', { count: path.steps.length }) }}</small></button>
            </nav>
            <div v-if="compareDifferences.length" class="rehearsal-compare-differences" data-test="rehearsal-compare-differences">
              <h4>{{ tr('结果差异') }}</h4>
              <p v-for="difference in compareDifferences" :key="difference.key"><span>{{ difference.label }}</span><small>{{ tr('当前结果：{current} · 另一种结果：{other}', { current: differenceStatus(difference.a), other: differenceStatus(difference.b) }) }}</small></p>
            </div>
            <article v-for="side in [compareSide.mine, compareSide.theirs]" :key="side.depth + '-' + side.index" class="rehearsal-compare-side">
              <h4>{{ tr(side === compareSide.mine ? '当前结果' : '另一种结果') }} · {{ tr('第 {count} 步', { count: side.depth }) }}</h4>
              <p v-if="side.depth === 0" class="rehearsal-compare-empty">{{ tr('还没有这一步。') }}</p>
              <template v-else>
                <p v-if="side.common.length" class="rehearsal-compare-common">{{ tr('前 {count} 步相同：{actions}', { count: side.common.length, actions: side.common.join(' → ') }) }}</p>
                <p v-else class="rehearsal-compare-common">{{ tr('两次推演从第一步就不同。') }}</p>
                <p class="rehearsal-compare-action">{{ side.step?.action || tr('不再继续') }}</p>
                <div v-if="side.step" class="rehearsal-response is-compare"><p v-for="(paragraph, paragraphIndex) in paragraphs(side.step.response)" :key="paragraphIndex">{{ paragraph }}</p></div>
                <p v-if="side.latest && side.step && side.latest.id !== side.step.id" class="rehearsal-compare-latest">{{ tr('最新一步「{action}」：{change}', { action: side.latest.action, change: side.latest.change }) }}</p>
              </template>
            </article>
          </details>
          </div>
        </details>
        <section v-if="memoryWorkflow?.available.value" class="rehearsal-memory" data-test="rehearsal-memory">
          <button v-if="!memoryWorkflow.open.value" type="button" class="rehearsal-memory-open" @click="memoryWorkflow.begin">{{ tr('记住一项变化') }}</button>
          <form v-else @submit.prevent="memoryWorkflow.submit">
            <p>{{ tr('采用稿已经保存。选择一项变化，加入现有记忆审核：') }}</p>
            <div class="rehearsal-memory-options" role="radiogroup" :aria-label="tr('选择要记住的变化')">
              <button v-for="(consequence, consequenceIndex) in memoryWorkflow.consequences.value" :key="consequence.stepId + consequenceIndex" type="button" role="radio" :aria-checked="memoryWorkflow.selectedIndex.value === consequenceIndex" @click="memoryWorkflow.select(consequenceIndex)">{{ consequence.content || consequence.name || consequence.stepAction }}</button>
            </div>
            <label>{{ tr('记忆文字') }}<input :value="memoryWorkflow.draft.value" maxlength="180" @input="memoryWorkflow.setDraft($event.target.value)" /></label>
            <p v-if="memoryWorkflow.error.value" class="rehearsal-memory-error" role="alert">{{ tr(memoryWorkflow.error.value) }}</p>
            <div class="rehearsal-memory-actions"><button type="button" @click="memoryWorkflow.cancel">{{ tr('取消') }}</button><button type="submit">{{ tr('加入待审核') }}</button></div>
          </form>
        </section>
      </template>
      <AuthoringGenerationStatus v-if="working" :label="preparing ? tr('正在核对现场…') : drafting ? tr('正在整理正文草稿…') : tr('正在推演…')" />
      <p v-else-if="waitingReview" class="rehearsal-review" role="status">{{ tr('确认出场人物后继续推演。') }}</p>
      <section v-if="retainedText && !working" class="rehearsal-retained" :aria-label="tr('保留的推演结果')">
        <p class="rehearsal-retained-notice">{{ retainedNotice }}</p>
        <div class="rehearsal-response"><p v-for="(paragraph, index) in paragraphs(retainedText)" :key="index">{{ paragraph }}</p></div>
        <p v-if="retained.truncated" class="rehearsal-retained-notice">{{ tr('仅保留了部分生成内容。') }}</p>
        <div class="rehearsal-retained-actions"><button type="button" @click="copyRetained">{{ tr('复制') }}</button><button v-if="!stale && !atLimit" type="button" :disabled="locked" @click="submit">{{ tr('重试') }}</button><span v-if="copyNotice" role="status">{{ copyNotice }}</span></div>
        <details v-if="rehearsal.error.value" class="rehearsal-failure__technical"><summary>{{ tr('技术信息') }}</summary><p class="rehearsal-failure__detail">{{ rehearsal.error.value }}</p></details>
      </section>
      <div v-if="rehearsal.error.value && !retainedText && !working && !waitingReview" class="rehearsal-failure" role="alert" data-test="rehearsal-failure">
        <p class="rehearsal-failure__text">{{ failureHeadline }} {{ tr('输入的要求和之前的结果都已保留。') }}</p>
        <div v-if="rejected" class="rehearsal-rejected">
          <p>{{ tr('这段回应的后果尚未核对通过，暂时不能继续。') }}</p>
          <blockquote>{{ rejected.response }}</blockquote>
        </div>
        <details class="rehearsal-failure__technical"><summary>{{ tr('技术信息') }}</summary><p class="rehearsal-failure__detail">{{ rehearsal.error.value }}</p></details>
        <div class="rehearsal-failure__actions">
          <button v-if="!stale" type="button" :disabled="locked || atLimit" data-test="rehearsal-failure-retry" @click="submit">{{ tr('重试') }}</button>
          <button v-if="rejected" type="button" data-test="rehearsal-failure-keep" @click="rehearsal.acceptRejectedWithoutConsequences">{{ tr('保留回应，不登记后果') }}</button>
          <button v-if="rejected" type="button" data-test="rehearsal-failure-discard" @click="rehearsal.discardRejected">{{ tr('弃掉这次回应') }}</button>
          <button type="button" data-test="rehearsal-failure-connect" @click="emit('check-connection')">{{ tr('检查模型连接') }}</button>
        </div>
      </div>
      <p v-else-if="notice && !working && !waitingReview" class="rehearsal-error" role="status">{{ tr(notice) }}</p>
    </div>
    <footer v-if="!hasDraft" class="rehearsal-footer">
      <form class="rehearsal-compose" :class="{ 'is-comparing': compareOpen }" @submit.prevent="submit">
        <div v-if="!stale && !atLimit && participants.length > 1" class="rehearsal-cast" :aria-label="tr('谁来行动')">
          <span class="rehearsal-cast-label">{{ tr('谁来行动') }}</span>
          <select :value="activeActor?.ref || ''" :aria-label="tr('谁来行动')" :disabled="locked" @change="pickActor($event.target.value)"><option v-for="person in participants.filter(item => item.status !== 'planned')" :key="person.ref" :value="person.ref">{{ person.name }}</option></select>
        </div>
        <details v-if="rehearsal.run.value && !steps.length" class="rehearsal-conditions" data-test="rehearsal-conditions">
          <summary>{{ rehearsal.conditions.value?.facts?.length ? tr('已补充背景') : tr('补充背景') }}</summary>
          <div class="rehearsal-condition-form">
            <label>{{ tr('补充这次推演的背景') }}<input v-model="conditionText" maxlength="120" :placeholder="tr('例如：艾德加已经看过那封信')" :disabled="locked" /></label>
            <div v-if="participants.length" class="rehearsal-condition-people">
              <label>{{ tr('谁知道') }}<select v-model="conditionKnowerRef" :disabled="locked"><option value="">{{ tr('不指定') }}</option><option v-for="person in participants" :key="'knows-'+person.ref" :value="person.ref">{{ person.name }}</option></select></label>
              <label>{{ tr('谁还不知道') }}<select v-model="conditionUnawareRef" :disabled="locked"><option value="">{{ tr('不指定') }}</option><option v-for="person in participants" :key="'unaware-'+person.ref" :value="person.ref">{{ person.name }}</option></select></label>
            </div>
            <p v-if="conditionIssue" class="rehearsal-ambiguous" role="status">{{ tr(conditionIssue) }}</p>
            <button type="button" class="rehearsal-condition-save" :disabled="locked || !conditionText.trim()" @click="saveCondition">{{ tr('添加背景') }}</button>
          </div>
        </details>
        <textarea v-if="!stale && !atLimit" ref="input" :value="actionText" maxlength="300" rows="2" :aria-label="tr('推演要求')" :placeholder="tr('补充推演要求（可留空）')" :readonly="locked" @input="setAction($event.target.value); fitAction()" @keydown="submitFromKeyboard" />
        <div class="rehearsal-dock-actions">
          <details v-if="rehearsal.run.value" ref="more" class="rehearsal-more" @toggle="placeMoreMenu" @focusout="onMoreBlur" @keydown.esc.stop.prevent="closeMore(true)">
            <summary :aria-label="tr('更多推演操作')" :title="tr('更多推演操作')"><WorkbenchIcon name="more" :size="18" /></summary>
            <div class="rehearsal-menu">
              <button type="button" :disabled="locked" @click="openComparison">{{ tr('比较人物选择') }}</button>
              <button type="button" :disabled="locked" @click="restart">{{ tr('重新开始') }}</button>
            </div>
          </details>
          <button v-if="working || waitingReview" type="button" class="rehearsal-primary" @click="emit('cancel')">{{ tr('停止') }}</button>
          <button v-else-if="!stale && !atLimit" type="submit" class="rehearsal-primary" :disabled="locked" :title="tr('Enter 推演 · Ctrl+Enter 换行')">{{ steps.length ? tr('继续推演') : tr('推演') }}<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else-if="stale" type="button" class="rehearsal-primary" :disabled="locked" @click="restart">{{ tr('重新确定起点') }}</button>
        </div>
      </form>
    </footer>
  </section>
</template>


<style scoped>
.rehearsal-panel { display:flex; flex-direction:column; min-height:0; height:100%; color:var(--archive-ink); overflow-wrap:anywhere; }
button, summary { font:inherit; }
button { border:0; background:none; color:inherit; cursor:pointer; min-height:36px; }
button:disabled { opacity:.45; cursor:not-allowed; }
button:focus-visible, textarea:focus-visible, summary:focus-visible, select:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
button:not(:disabled):hover { color:var(--accent); }
.rehearsal-origin { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:2px 18px; border-bottom:1px solid var(--hairline-soft); font-size:12px; color:var(--text-secondary); }
.rehearsal-first-run-hint { margin:0; padding:9px 18px; border-bottom:1px solid var(--hairline-soft); color:var(--archive-olive, var(--accent-primary)); font-size:12px; line-height:1.55; }
.rehearsal-source { flex:1; display:flex; align-items:center; gap:8px; padding:0; min-width:0; text-align:left; }
.rehearsal-source span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
svg { flex-shrink:0; }
.rehearsal-more { position:relative; flex-shrink:0; margin-inline-end:auto; color:var(--text-secondary); }
.rehearsal-more > summary { display:flex; align-items:center; justify-content:center; width:36px; min-height:36px; cursor:pointer; list-style:none; }
.rehearsal-more > summary::-webkit-details-marker { display:none; }
.rehearsal-menu { position:absolute; z-index:2; left:0; right:auto; top:calc(100% + 6px); width:240px; max-width:calc(100vw - 64px); box-sizing:border-box; padding:8px; background:var(--surface-workbench-overlay); border:1px solid var(--hairline-soft); border-radius:var(--radius-popover); box-shadow:var(--shadow-workbench-float); }
.rehearsal-dock-actions .rehearsal-menu button { justify-content:flex-start; color:var(--text-primary); }
.rehearsal-menu.is-above { top:auto; bottom:calc(100% + 6px); }
.rehearsal-menu button { display:block; width:100%; text-align:left; padding:6px 10px; font-size:13px; }
.rehearsal-menu p { margin:6px 10px; font-size:12px; line-height:1.7; color:var(--text-muted); }
.rehearsal-flow { flex:1; min-height:0; overflow-y:auto; padding:16px 18px 18px; overscroll-behavior:contain; }
.rehearsal-intro { margin:12px 0 20px; font-size:15px; line-height:1.8; }
.rehearsal-question { font-size:15px; line-height:1.85; margin:0 0 18px; color:var(--text-secondary); }
.rehearsal-conditions { margin:0 0 16px; border-bottom:1px solid var(--hairline-soft); color:var(--text-secondary); font-size:12px; }
.rehearsal-conditions > summary { min-height:36px; display:flex; align-items:center; cursor:pointer; color:var(--text-secondary); }
.rehearsal-condition-form { display:grid; gap:10px; padding:2px 0 14px; }
.rehearsal-condition-form label { display:grid; gap:5px; line-height:1.55; }
.rehearsal-condition-form input, .rehearsal-condition-form select { box-sizing:border-box; width:100%; min-height:36px; padding:6px 8px; border:1px solid var(--hairline-soft); border-radius:4px; background:var(--archive-paper); color:var(--archive-ink); font:13px/1.5 var(--font-ui,sans-serif); }
.rehearsal-condition-people { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.rehearsal-condition-save { justify-self:start; padding:0 10px; border:1px solid var(--hairline-soft); border-radius:4px; }
.rehearsal-steps { list-style:none; margin:0; padding:0; }
.rehearsal-step + .rehearsal-step { margin-top:16px; }
.rehearsal-step-head { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:baseline; gap:8px; width:100%; text-align:left; padding:6px 0; color:var(--text-secondary); font-size:13px; line-height:1.7; }
.rehearsal-step-head svg { align-self:center; color:var(--text-muted); transition:transform .15s ease; }
.rehearsal-step-head[aria-expanded="true"] .rehearsal-step-chevron { transform:rotate(90deg); }
.rehearsal-new svg.is-down { transform:rotate(90deg); }
.rehearsal-step-index { color:var(--text-muted); font-variant-numeric:tabular-nums; font-size:12px; }
.rehearsal-step-action { min-width:0; }
.rehearsal-step-head[aria-expanded="true"] .rehearsal-step-action { color:var(--text-primary); }
.rehearsal-step-body { padding-bottom:12px; border-bottom:1px solid var(--hairline-soft); }
.rehearsal-response { margin-top:6px; white-space:pre-wrap; font:16.5px/1.88 var(--font-body,serif); }
.rehearsal-response p { margin:0 0 12px; }
.rehearsal-response p:last-child { margin-bottom:0; }
.rehearsal-response.is-compare { margin-top:8px; }
.rehearsal-step-tools { display:flex; align-items:baseline; flex-wrap:wrap; column-gap:16px; margin-top:10px; color:var(--text-secondary); font-size:12px; }
.rehearsal-back { padding:0; }
.rehearsal-consequence > summary { cursor:pointer; padding:4px 0; }
.rehearsal-consequence[open] { flex-basis:100%; }
.rehearsal-consequence p { margin:0 0 4px; line-height:1.8; }
.rehearsal-consequence ul { margin:6px 0 4px; padding-left:18px; line-height:1.75; color:var(--text-secondary); }
.rehearsal-evidence > summary { cursor:pointer; padding:4px 0; }
.rehearsal-evidence[open] { flex-basis:100%; }
.rehearsal-evidence ul { margin:6px 0 4px; padding:0; list-style:none; }
.rehearsal-evidence li { display:grid; gap:2px; padding:6px 0; border-top:1px solid var(--hairline-soft); }
.rehearsal-evidence strong { color:var(--text-primary); font-weight:600; }
.rehearsal-evidence small { color:var(--text-muted); line-height:1.65; }
.rehearsal-evidence-status { flex-basis:100%; margin:4px 0 0; color:var(--text-muted); line-height:1.65; }
.rehearsal-evidence-status button { padding:0 4px; text-decoration:underline; text-underline-offset:3px; }
.rehearsal-options { display:grid; margin-top:14px; border-top:1px solid var(--hairline-soft); }
.rehearsal-options button { text-align:left; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 0; font-size:13px; line-height:1.7; }
.rehearsal-options svg { color:var(--text-muted); }
.rehearsal-options button[aria-pressed="true"] { color:var(--accent); }
.rehearsal-options button[aria-pressed="true"] svg { color:var(--accent); }
.rehearsal-new { display:inline-flex; align-items:center; gap:6px; margin-top:12px; padding:6px 10px; border:1px solid var(--hairline-soft); border-radius:999px; font-size:12px; color:var(--text-secondary); background:var(--archive-paper); }
.rehearsal-stale { margin-top:14px; font-size:12px; line-height:1.8; color:var(--text-secondary); }
.rehearsal-routes { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 14px; margin-top:0; padding-top:4px; border-top:0; font-size:12px; color:var(--text-secondary); }
.rehearsal-memory { margin-top:16px; padding-top:12px; border-top:1px solid var(--hairline-soft); font-size:12px; }
.rehearsal-memory-open { padding:4px 0; color:var(--accent); }
.rehearsal-memory form, .rehearsal-memory label { display:grid; gap:8px; }
.rehearsal-memory form > p { margin:0; line-height:1.65; color:var(--text-secondary); }
.rehearsal-memory-options { display:grid; }
.rehearsal-memory-options button { padding:7px 0; text-align:left; border-bottom:1px solid var(--hairline-soft); }
.rehearsal-memory-options button[aria-checked="true"] { color:var(--accent); }
.rehearsal-memory input { min-height:38px; padding:6px 8px; border:1px solid var(--hairline-soft); background:var(--archive-paper); color:var(--text-primary); font:inherit; }
.rehearsal-memory-actions { display:flex; justify-content:flex-end; gap:8px; }
.rehearsal-memory-actions button { padding:0 10px; border:1px solid var(--hairline-soft); }
.rehearsal-memory-error { color:var(--danger, #a04b3c) !important; }
.rehearsal-route { display:flex; align-items:baseline; gap:6px; min-width:0; padding:2px 0; text-align:left; font-size:12px; }
.rehearsal-route span { max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rehearsal-route small { color:var(--text-muted); font-size:11px; }
.rehearsal-routes-more > summary, .rehearsal-compare > summary { cursor:pointer; padding:4px 0; list-style:none; }
.rehearsal-routes-more > summary::-webkit-details-marker, .rehearsal-compare > summary::-webkit-details-marker { display:none; text-decoration:underline; text-underline-offset:3px; }
.rehearsal-routes-more button { display:flex; }
.rehearsal-routes-more[open], .rehearsal-compare[open] { flex-basis:100%; }
.rehearsal-compare-pick { display:flex; flex-wrap:wrap; gap:6px 14px; margin:8px 0 4px; }
.rehearsal-compare-pick button { display:flex; align-items:baseline; gap:6px; min-width:0; padding:2px 0; font-size:12px; color:var(--text-secondary); }
.rehearsal-compare-pick button[aria-pressed="true"] { color:var(--accent); }
.rehearsal-compare-pick small { color:var(--text-muted); font-size:11px; }
.rehearsal-compare-side { margin-top:12px; }
.rehearsal-compare-side h4 { margin:0 0 4px; font-size:12px; font-weight:600; color:var(--text-muted); }
.rehearsal-compare-common { margin:0 0 6px; font-size:12px; line-height:1.8; color:var(--text-muted); }
.rehearsal-compare-action { margin:0; font-size:13px; line-height:1.7; color:var(--text-secondary); }
.rehearsal-compare-latest { margin:8px 0 0; font-size:12px; line-height:1.8; color:var(--text-muted); }
.rehearsal-compare-empty { margin:0; font-size:12px; color:var(--text-muted); }
.rehearsal-compare-differences { margin:10px 0 14px; padding:10px 12px; border-left:2px solid var(--accent); background:var(--surface-workbench-muted); }
.rehearsal-compare-differences h4 { margin:0 0 7px; font-size:12px; color:var(--text-secondary); }
.rehearsal-compare-differences p { display:grid; gap:2px; margin:6px 0; font-size:12px; line-height:1.55; }
.rehearsal-compare-differences small { color:var(--text-muted); }
.rehearsal-cast { display:flex; align-items:center; flex-wrap:wrap; gap:4px 10px; font-size:12px; color:var(--text-secondary); }
.rehearsal-cast-label { color:var(--text-muted); }
.rehearsal-cast-person { min-height:28px; padding:2px 10px; border:1px solid var(--hairline-soft); border-radius:999px; font-size:12px; color:var(--text-secondary); }
.rehearsal-cast-person[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); }
.rehearsal-ambiguous { margin:0; font-size:12px; line-height:1.7; color:var(--text-secondary); }
.rehearsal-compose { display:grid; gap:10px; width:100%; padding:0; border:0; border-radius:0; background:transparent; box-sizing:border-box; }
.rehearsal-compose:focus-within { box-shadow:none; }
.rehearsal-compose textarea { box-sizing:border-box; flex:1; min-width:0; width:100%; min-height:48px; max-height:132px; resize:none; border:0; border-bottom:1px solid var(--hairline-soft); padding:10px 0 14px; background:transparent; color:var(--text-primary); font:15px/1.75 var(--font-interface); }
/* 对照展开时作者在读两条路的差异，输入压成一行给故事让高度。 */
.rehearsal-compose.is-comparing textarea { min-height:40px; height:40px; max-height:40px; resize:none; }
.rehearsal-compose textarea:focus-visible { outline:none; border-bottom-color:var(--accent); }
.rehearsal-primary { background:var(--accent); color:var(--accent-text); border-radius:3px; padding:8px 14px; font-size:13px; flex-shrink:0; }
.rehearsal-primary:not(:disabled):hover { color:var(--accent-text); filter:brightness(.95); }
.rehearsal-footer { flex-shrink:0; padding:12px 18px; border-top:0; background:var(--surface-workbench); }
.rehearsal-dock-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:8px 12px; }
.rehearsal-dock-actions button { display:flex; align-items:center; justify-content:center; gap:8px; font-size:13px; text-align:left; }
.rehearsal-export { min-width:0; margin-right:auto; color:var(--text-secondary); padding:0 4px; }
.rehearsal-error, .rehearsal-limit, .rehearsal-wait { color:var(--text-secondary); font-size:12px; line-height:1.8; }
.rehearsal-failure { margin:12px 0 0; padding:10px 12px; border:1px solid color-mix(in srgb, var(--danger, #a04b3c) 34%, transparent); border-radius:6px; background:color-mix(in srgb, var(--danger, #a04b3c) 6%, transparent); }
.rehearsal-failure__text { margin:0; color:var(--danger, #a04b3c); font-size:12px; font-weight:650; line-height:1.55; }
.rehearsal-failure__detail { margin:4px 0 0; color:var(--text-secondary); font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
.rehearsal-rejected { margin:8px 0 2px; color:var(--text-secondary); font-size:12px; line-height:1.65; }
.rehearsal-rejected p { margin:0; }
.rehearsal-rejected blockquote { margin:6px 0 0; padding-left:10px; border-left:2px solid var(--hairline-soft); color:var(--archive-ink); font-family:var(--font-body,serif); }
.rehearsal-failure__technical { margin-top:4px; color:var(--text-muted); font-size:11px; }
.rehearsal-failure__technical > summary { min-height:28px; display:flex; align-items:center; cursor:pointer; }
.rehearsal-failure__actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.rehearsal-failure__actions button { min-height:32px; padding:0 10px; border:1px solid color-mix(in srgb, var(--danger, #a04b3c) 38%, transparent); border-radius:4px; font-size:12px; }
@media(max-width:720px) {
  button, .rehearsal-more > summary, .rehearsal-step-head, .rehearsal-routes-more > summary, .rehearsal-compare > summary, .rehearsal-consequence > summary, .rehearsal-evidence > summary { min-height:44px; box-sizing:border-box; }
  .rehearsal-flow { padding:14px 18px; }
  .rehearsal-route { min-height:44px; align-items:center; }
  .rehearsal-cast-person { min-height:44px; }
  .rehearsal-cast { row-gap:6px; }
  .rehearsal-condition-form input, .rehearsal-condition-form select, .rehearsal-condition-save { min-height:44px; }
}
@media(max-width:720px) and (max-height:600px) {
  .rehearsal-footer { padding:6px 12px; }
  .rehearsal-compose { padding:6px; gap:2px; }
  .rehearsal-compose textarea { min-height:44px; height:44px; max-height:80px; }
  .rehearsal-flow { padding:10px 18px; }
}

.rehearsal-empty { padding:24px 2px 0; }
.rehearsal-empty h2 { margin:0 0 12px; font:600 20px/1.4 var(--font-interface); letter-spacing:-.02em; }
.rehearsal-empty .rehearsal-intro { color:var(--text-secondary); font-size:14px; margin:0 0 18px; }
.rehearsal-empty-source { margin:0 0 16px; color:var(--text-muted); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rehearsal-progress { flex:none; font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
.rehearsal-options-label { color:var(--text-muted); font-size:11px; padding-top:8px; }
.rehearsal-route-library { margin-top:18px; padding-top:6px; border-top:1px solid var(--hairline-soft); color:var(--text-secondary); }
.rehearsal-route-library > summary { display:flex; align-items:center; gap:8px; min-height:36px; list-style:none; cursor:pointer; font-size:12px; }
.rehearsal-route-library > summary::-webkit-details-marker { display:none; }
.rehearsal-route-library > summary span { color:var(--text-muted); font-size:11px; }
.rehearsal-route-library > summary svg { margin-inline-start:auto; transition:transform .15s; }
.rehearsal-route-library[open] > summary svg { transform:rotate(180deg); }
.rehearsal-cast select { flex:1; min-width:0; min-height:32px; border:0; border-radius:6px; padding:4px 8px; background:var(--surface-workbench-input); color:var(--text-primary); font:inherit; cursor:pointer; }
.rehearsal-compose textarea::placeholder { color:var(--text-muted); opacity:1; }
.rehearsal-export { min-height:36px; border-radius:8px; }
.rehearsal-step-head { align-items:start; padding-block:10px; }
.rehearsal-step-index { padding-top:1px; }
.rehearsal-step-action { font-weight:550; }
@media(max-width:720px) { .rehearsal-route-library > summary, .rehearsal-cast select { min-height:44px; } }
@media(prefers-reduced-motion:reduce) { .rehearsal-route-library > summary svg, .rehearsal-step-head svg { transition:none; } }
.rehearsal-panel.is-ready .rehearsal-flow { flex:none; padding-block:0; }
.rehearsal-compose .rehearsal-conditions { margin:0; border:0; }
.rehearsal-compose .rehearsal-conditions > summary { font-size:12px; color:var(--text-muted); }
.rehearsal-restart { color:var(--text-muted); }

.rehearsal-anchor { flex:none; display:flex; align-items:center; gap:10px; width:100%; padding:8px 18px 12px; text-align:left; color:var(--text-secondary); font-size:12px; line-height:1.6; }
.rehearsal-anchor span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rehearsal-anchor svg { margin-inline-start:auto; }
.rehearsal-result-actions { display:flex; justify-content:flex-end; margin:10px 0 4px; }
.rehearsal-result-actions .rehearsal-export { display:inline-flex; align-items:center; gap:8px; margin:0; padding:4px 0; color:var(--text-primary); }
.rehearsal-review, .rehearsal-retained-notice { margin:12px 0; color:var(--text-secondary); font-size:12px; line-height:1.75; }
.rehearsal-retained { padding-block:4px 12px; }
.rehearsal-retained-actions { display:flex; align-items:center; gap:12px; color:var(--text-secondary); font-size:12px; }
.rehearsal-retained-actions button { padding-inline:0; }
.rehearsal-panel.is-ready .rehearsal-footer { padding-top:12px; }
.rehearsal-panel.is-ready .rehearsal-flow:empty { display:none; }
@media(max-width:720px) { .rehearsal-anchor { min-height:44px; } }
</style>
