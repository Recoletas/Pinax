<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({
  rehearsal: { type: Object, required: true },
  preparing: Boolean,
  notice: { type: String, default: '' },
  title: { type: String, default: '' },
  drafting: Boolean,
  draftState: { type: String, default: 'none' },
  firstRunHint: { type: String, default: '' },
  memoryWorkflow: { type: Object, default: null }
})
const emit = defineEmits(['start', 'draft', 'view-draft', 'locate', 'if', 'check-connection'])
const steps = computed(() => props.rehearsal.steps.value)
const last = computed(() => steps.value.at(-1))
const atLimit = computed(() => steps.value.length >= props.rehearsal.maxSteps)
const suggestions = computed(() => (last.value?.choices || []).slice(0, 3))
const locked = computed(() => props.preparing || props.drafting || props.rehearsal.busy.value)
const stale = computed(() => props.rehearsal.stale.value)
const rejected = computed(() => props.rehearsal.lastRejected.value)
// 失败就地回程:错误翻译成作者能行动的一句话,原始细节保留为次级信息;
// 草拟行动、行动者与对象不动,重试直接重发同一意图。
const failureHeadline = computed(() => {
  const raw = String(props.rehearsal.error.value || '')
  if (/network|fetch|timeout|ECONN|ERR_|status code \d{3}/i.test(raw)) return '推演没有完成：暂时连不上推演服务。'
  return '推演没有完成。'
})
const flow = ref(null)
const input = ref(null)
const more = ref(null)
const hasNew = ref(false)
const follow = ref(true)

function chooseAction(choice) {
  props.rehearsal.setAction(choice)
  nextTick(() => input.value?.focus())
}
function menuAction(action) {
  more.value.open = false
  emit(action)
}
function closeMenuOnBlur(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
}
function closeMenu() {
  more.value.open = false
  more.value.querySelector('summary')?.focus()
}
function submitFromKeyboard(event) {
  if (event.isComposing || event.keyCode === 229 || locked.value) return
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submit()
  }
}
function pickActor(ref) {
  actorRef.value = ref
  targetRef.value = ''
}
function submit() {
  if (locked.value || !props.rehearsal.action.value.trim()) return
  if (ambiguousTarget.value && !targetRef.value) {
    input.value?.focus()
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
  return part.step?.action || part.latest?.action || '起点'
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

// P2-1 行动意图：默认行动者=视角人物；出现代词且在场多人时不自动猜对象，
// 要求作者点名。会话内状态，不写作品数据。
const participants = computed(() => props.rehearsal.participants.value)
const actorRef = ref('')
const defaultActorRef = computed(() => participants.value.find(person => person.roles.includes('viewpoint') && person.status !== 'planned')?.ref
  || participants.value.find(person => person.status !== 'planned')?.ref || '')
const activeActor = computed(() => participants.value.find(person => person.ref === (actorRef.value || defaultActorRef.value)) || null)
watch(defaultActorRef, (value) => { if (!actorRef.value && value) actorRef.value = '' })
const others = computed(() => participants.value.filter(person => person.status !== 'planned' && person.ref !== activeActor.value?.ref))
const ambiguousTarget = computed(() => {
  const text = props.rehearsal.action.value
  if (!text.trim() || !others.value.length) return null
  if (others.value.some(person => text.includes(person.name))) return null
  if (/[他她它]|对方|那人/.test(text)) return others.value
  return null
})
const targetRef = ref('')
watch([ambiguousTarget, () => props.rehearsal.route.value], ([names]) => {
  if (!names) targetRef.value = ''
})
function buildIntent() {
  const selected = []
  if (targetRef.value) selected.push(participants.value.find(person => person.ref === targetRef.value))
  for (const person of others.value.filter(item => props.rehearsal.action.value.includes(item.name))) {
    if (!selected.some(item => item?.ref === person.ref)) selected.push(person)
  }
  return {
    text: props.rehearsal.action.value,
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
function personName(ref) { return participants.value.find(person => person.ref === ref)?.name || '未指名人物' }
function consequenceLines(item) {
  return (item.consequences || []).map((entry) => {
    if (entry.kind === 'knowledge') return `${personName(entry.knowerRef)}得知了本次条件中的事实`
    if (entry.kind === 'commitment') {
      const states = { promised: '答应', conditioned: '有条件答应', refused: '拒绝', withdrawn: '收回承诺' }
      return `${personName(entry.promisorRef)}${states[entry.state] || '回应'}：${entry.content}${entry.condition ? `（条件：${entry.condition}）` : ''}`
    }
    if (entry.kind === 'item') return entry.state === 'delivered' ? `${entry.name || '物品'}交到${personName(entry.toRef)}手中` : `${personName(entry.toRef)}没有接下${entry.name || '物品'}`
    if (entry.kind === 'location') return `${personName(entry.moverRef)}${entry.state === 'left' ? '离开了现场' : '回到了现场'}`
    return ''
  }).filter(Boolean)
}
function receiptSources(item) {
  const refs = new Set((item.toolReceipt?.calls || []).flatMap(call => call.resultRefs || []))
  return (props.rehearsal.run.value?.runSession?.manifest?.blocks || [])
    .filter(block => refs.has(block.primarySourceRef) || (block.sourceRefs || []).some(ref => refs.has(ref)))
    .map(block => ({
      title: block.label || '历史资料',
      type: block.kind === 'history-node' ? '历史' : '参考',
      summary: String(block.text || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    }))
}
function receiptCount(item) {
  return (item.toolReceipt?.calls || []).reduce((total, call) => total + Number(call.resultCount || 0), 0)
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
function paragraphs(text) { return String(text || '').split(/\n\s*\n/).filter(Boolean) }
</script>

<template>
  <section class="rehearsal-panel" aria-label="故事试演" data-test="rehearsal-panel" :data-current-route="rehearsal.route.value">
    <header v-if="rehearsal.run.value" class="rehearsal-origin">
      <button class="rehearsal-source" type="button" :title="title || '当前段落'" @click="emit('locate')"><span>{{ title || '当前段落' }}</span><WorkbenchIcon name="arrow-right" :size="13" /></button>
      <details ref="more" class="rehearsal-more" @focusout="closeMenuOnBlur" @keydown.esc.stop.prevent="closeMenu">
        <summary aria-label="更多试演操作"><WorkbenchIcon name="more" :size="18" /></summary>
        <div class="rehearsal-menu">
          <button type="button" :disabled="locked" @click="menuAction('if')">人物信念对照</button>
          <button type="button" :disabled="locked" @click="menuAction('start')">重新确定起点</button>
          <p>仅为假想，不改正文或设定。刷新后不保留。</p>
        </div>
      </details>
    </header>
    <p v-if="firstRunHint" class="rehearsal-first-run-hint" data-test="rehearsal-first-run-hint">{{ firstRunHint }}</p>
    <div ref="flow" class="rehearsal-flow" @scroll.passive="onFlowScroll">
      <template v-if="!rehearsal.run.value">
        <p class="rehearsal-intro">试一个行动，看看人物如何回应。</p>
        <button type="button" class="rehearsal-primary" :disabled="locked" @click="emit('start')">{{ preparing ? '正在核对现场…' : '从当前段落开始' }}</button>
        <p class="rehearsal-limit">暂不写入正文 · 刷新后不保留</p>
      </template>
      <template v-else>
        <details v-if="!steps.length" class="rehearsal-conditions" data-test="rehearsal-conditions">
          <summary>{{ rehearsal.conditions.value?.facts?.length ? '本次条件已补充' : '补充本次条件' }}</summary>
          <div class="rehearsal-condition-form">
            <label>只在这次推演成立的事实<input v-model="conditionText" maxlength="120" placeholder="例如：艾德加已经看过那封信" :disabled="locked" /></label>
            <div v-if="participants.length" class="rehearsal-condition-people">
              <label>谁知道<select v-model="conditionKnowerRef" :disabled="locked"><option value="">不指定</option><option v-for="person in participants" :key="'knows-'+person.ref" :value="person.ref">{{ person.name }}</option></select></label>
              <label>谁还不知道<select v-model="conditionUnawareRef" :disabled="locked"><option value="">不指定</option><option v-for="person in participants" :key="'unaware-'+person.ref" :value="person.ref">{{ person.name }}</option></select></label>
            </div>
            <p v-if="conditionIssue" class="rehearsal-ambiguous" role="status">{{ conditionIssue }}</p>
            <button type="button" class="rehearsal-condition-save" :disabled="locked || !conditionText.trim()" @click="saveCondition">用于本次推演</button>
          </div>
        </details>
        <p v-if="!steps.length && rehearsal.run.value.directionSet?.pressure?.statement" class="rehearsal-question">{{ rehearsal.run.value.directionSet.pressure.statement }}</p>
        <ol class="rehearsal-steps">
          <li v-for="(item, index) in steps" :key="item.id" class="rehearsal-step" :data-step="item.id">
            <button type="button" class="rehearsal-step-head" :aria-expanded="folded(item.id) ? 'false' : 'true'" @click="rehearsal.toggleFold(item.id)">
              <span class="rehearsal-step-index" aria-hidden="true">{{ index + 1 }}</span>
              <span class="rehearsal-step-action">{{ item.actor ? `${item.actor}：${item.action}` : item.action }}</span>
              <WorkbenchIcon name="arrow-right" :size="13" class="rehearsal-step-chevron" />
            </button>
            <div v-show="!folded(item.id)" class="rehearsal-step-body">
              <div class="rehearsal-response"><p v-for="(paragraph, paragraphIndex) in paragraphs(item.response)" :key="paragraphIndex">{{ paragraph }}</p></div>
              <div class="rehearsal-step-tools">
                <button type="button" class="rehearsal-back" :disabled="locked" @click="rehearsal.rewind(index)">从这里换路</button>
                <details class="rehearsal-consequence"><summary>局面变化</summary><p>{{ item.change }}</p><ul v-if="consequenceLines(item).length"><li v-for="line in consequenceLines(item)" :key="line">{{ line }}</li></ul></details>
                <details v-if="item.toolReceipt?.status === 'completed'" class="rehearsal-evidence" data-test="rehearsal-evidence">
                  <summary>查阅 {{ receiptCount(item) }} 项 · 查看</summary>
                  <ul><li v-for="source in receiptSources(item)" :key="source.title"><strong>{{ source.title }}</strong><small>{{ source.type }} · {{ source.summary }}</small></li></ul>
                </details>
                <p v-else-if="item.toolReceipt?.status === 'unavailable'" class="rehearsal-evidence-status">本次未能查阅资料，可用下方原行动重试。</p>
                <p v-else-if="item.toolReceipt?.status === 'denied'" class="rehearsal-evidence-status">请求的资料不在本次参考范围。<button type="button" @click="emit('locate')">查看本次参考</button></p>
                <p v-else-if="item.toolReceipt?.status === 'failed'" class="rehearsal-evidence-status">资料查询失败，回应未采用查询结果。</p>
              </div>
            </div>
          </li>
        </ol>
        <div v-if="rehearsal.busy.value" class="rehearsal-wait" role="status">正在回应…</div>
        <button v-if="hasNew" type="button" class="rehearsal-new" @click="revealStep(steps[steps.length - 1].id)">有新回应<WorkbenchIcon name="arrow-right" :size="13" class="is-down" /></button>
        <template v-if="!stale && !atLimit">
          <div v-if="suggestions.length" class="rehearsal-options" aria-label="可试行动">
            <button v-for="choice in suggestions" :key="choice" type="button" :disabled="locked" :aria-pressed="rehearsal.action.value === choice" @click="chooseAction(choice)"><span>{{ choice }}</span><WorkbenchIcon name="arrow-right" :size="13" /></button>
          </div>
        </template>
        <p v-else-if="!stale" class="rehearsal-limit">已试演四步：可以从这里换路，或把这条路写成试稿。</p>
        <p v-if="stale" class="rehearsal-stale" role="status">正文或参考已变化：这条路仍可回看和留作构思，需要重新确定起点才能继续。</p>
        <div v-if="otherRoutes.length || steps.length" class="rehearsal-routes" aria-label="试演走法">
          <button v-if="steps.length" type="button" class="rehearsal-route" data-route-root :disabled="locked" @click="rehearsal.rewind(0)">
            <span>回到起点</span><small>第 0 步</small>
          </button>
          <button v-for="path in otherRoutes.slice(-1)" :key="path.id" type="button" class="rehearsal-route" :data-route="path.id" :disabled="locked" @click="rehearsal.restore(path.id)">
            <span>{{ routeName(path) }}</span><small>第 {{ path.steps.length }} 步</small>
          </button>
          <details v-if="otherRoutes.length > 1" class="rehearsal-routes-more">
            <summary>更多走法 · {{ otherRoutes.length - 1 }}</summary>
            <button v-for="path in otherRoutes.slice(0, -1).reverse()" :key="path.id" type="button" class="rehearsal-route" :data-route="path.id" :disabled="locked" @click="rehearsal.restore(path.id)">
              <span>{{ routeName(path) }}</span><small>第 {{ path.steps.length }} 步</small>
            </button>
          </details>
          <details v-if="compareSide" ref="compareSection" class="rehearsal-compare" @toggle="onCompareToggle">
            <summary>对照两条走法</summary>
            <nav v-if="otherRoutes.length > 1" class="rehearsal-compare-pick" aria-label="选择要比较的走法">
              <button v-for="path in otherRoutes" :key="path.id" type="button" :data-route="path.id" :aria-pressed="path.id === compareId" @click="compareId = path.id">{{ routeName(path) }}<small>第 {{ path.steps.length }} 步</small></button>
            </nav>
            <div v-if="compareDifferences.length" class="rehearsal-compare-differences" data-test="rehearsal-compare-differences">
              <h4>真正不同的后果</h4>
              <p v-for="difference in compareDifferences" :key="difference.key"><span>{{ difference.label }}</span><small>当前路：{{ difference.a.statusLabel }} · 另一路：{{ difference.b.statusLabel }}</small></p>
            </div>
            <article v-for="side in [compareSide.mine, compareSide.theirs]" :key="side.depth + '-' + side.index" class="rehearsal-compare-side">
              <h4>{{ side === compareSide.mine ? '当前路' : '另一路' }} · 第 {{ side.depth }} 步</h4>
              <p v-if="side.depth === 0" class="rehearsal-compare-empty">还没有这一步。</p>
              <template v-else>
                <p v-if="side.common.length" class="rehearsal-compare-common">共同前缀 {{ side.common.length }} 步：{{ side.common.join(' → ') }}</p>
                <p v-else class="rehearsal-compare-common">与另一条从一开始就不同。</p>
                <p class="rehearsal-compare-action">{{ side.step?.action || '不再继续' }}</p>
                <div v-if="side.step" class="rehearsal-response is-compare"><p v-for="(paragraph, paragraphIndex) in paragraphs(side.step.response)" :key="paragraphIndex">{{ paragraph }}</p></div>
                <p v-if="side.latest && side.step && side.latest.id !== side.step.id" class="rehearsal-compare-latest">最新一步「{{ side.latest.action }}」：{{ side.latest.change }}</p>
              </template>
            </article>
          </details>
        </div>
        <section v-if="memoryWorkflow?.available.value" class="rehearsal-memory" data-test="rehearsal-memory">
          <button v-if="!memoryWorkflow.open.value" type="button" class="rehearsal-memory-open" @click="memoryWorkflow.begin">记住一项变化</button>
          <form v-else @submit.prevent="memoryWorkflow.submit">
            <p>采用稿已经保存。选择一项变化，加入现有记忆审核：</p>
            <div class="rehearsal-memory-options" role="radiogroup" aria-label="选择要记住的变化">
              <button v-for="(consequence, consequenceIndex) in memoryWorkflow.consequences.value" :key="consequence.stepId + consequenceIndex" type="button" role="radio" :aria-checked="memoryWorkflow.selectedIndex.value === consequenceIndex" @click="memoryWorkflow.select(consequenceIndex)">{{ consequence.content || consequence.name || consequence.stepAction }}</button>
            </div>
            <label>记忆文字<input :value="memoryWorkflow.draft.value" maxlength="180" @input="memoryWorkflow.setDraft($event.target.value)" /></label>
            <p v-if="memoryWorkflow.error.value" class="rehearsal-memory-error" role="alert">{{ memoryWorkflow.error.value }}</p>
            <div class="rehearsal-memory-actions"><button type="button" @click="memoryWorkflow.cancel">取消</button><button type="submit">加入待审核</button></div>
          </form>
        </section>
      </template>
      <div v-if="rehearsal.error.value" class="rehearsal-failure" role="alert" data-test="rehearsal-failure">
        <p class="rehearsal-failure__text">{{ failureHeadline }}行动草稿和已有走法都还在。</p>
        <div v-if="rejected" class="rehearsal-rejected">
          <p>这次人物回应可以先读，但它登记的后果没有通过核对，所以还没有接到当前走法上。</p>
          <blockquote>{{ rejected.response }}</blockquote>
        </div>
        <details class="rehearsal-failure__technical"><summary>技术信息</summary><p class="rehearsal-failure__detail">{{ rehearsal.error.value }}</p></details>
        <div class="rehearsal-failure__actions">
          <button type="button" :disabled="rehearsal.busy.value" data-test="rehearsal-failure-retry" @click="submit">{{ rehearsal.busy.value ? '正在重试…' : '重试' }}</button>
          <button v-if="rejected" type="button" data-test="rehearsal-failure-keep" @click="rehearsal.acceptRejectedWithoutConsequences">保留回应，不登记后果</button>
          <button v-if="rejected" type="button" data-test="rehearsal-failure-discard" @click="rehearsal.discardRejected">弃掉这次回应</button>
          <button type="button" data-test="rehearsal-failure-connect" @click="emit('check-connection')">检查模型连接</button>
        </div>
      </div>
      <p v-else-if="notice" class="rehearsal-error" role="status">{{ notice }}</p>
    </div>
    <footer v-if="rehearsal.run.value" class="rehearsal-footer">
      <form class="rehearsal-compose" :class="{ 'is-comparing': compareOpen }" @submit.prevent="submit">
        <div v-if="!stale && !atLimit && participants.length > 1" class="rehearsal-cast" aria-label="行动者">
          <span class="rehearsal-cast-label">行动者</span>
          <button v-for="person in participants.filter(item => item.status !== 'planned')" :key="person.ref" type="button" class="rehearsal-cast-person" :aria-pressed="person.ref === activeActor?.ref ? 'true' : 'false'" :disabled="locked" @click="pickActor(person.ref)">{{ person.name }}</button>
        </div>
        <textarea v-if="!stale && !atLimit" ref="input" :value="rehearsal.action.value" maxlength="300" rows="2" aria-label="试演行动" :placeholder="last ? '接下来，让人物…' : '让人物…'" :readonly="locked" @input="rehearsal.setAction($event.target.value)" @keydown="submitFromKeyboard" />
        <p v-if="!stale && !atLimit && ambiguousTarget && !targetRef" class="rehearsal-ambiguous" role="status">{{ ambiguousTarget.length > 1 ? '这句话里的「他/她」指向谁？点名或选一个，不自动猜。' : '这句话要交给谁回应？点名或选一个，不自动猜。' }}</p>
        <div v-if="!stale && !atLimit && ambiguousTarget" class="rehearsal-cast is-target" aria-label="动作对象">
          <button v-for="person in ambiguousTarget" :key="person.ref" type="button" class="rehearsal-cast-person" :aria-pressed="targetRef === person.ref ? 'true' : 'false'" :disabled="locked" @click="targetRef = person.ref">{{ person.name }}</button>
        </div>
        <div class="rehearsal-dock-actions">
          <button v-if="draftState === 'same-route'" type="button" class="rehearsal-export" @click="emit('view-draft')">查看试稿<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else-if="draftState !== 'none'" type="button" class="rehearsal-export" @click="emit('view-draft')">正文已有{{ draftState === 'other-route' ? '另一条走法' : '其他来源' }}的待处理试稿<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else-if="steps.length" type="button" class="rehearsal-export" :disabled="locked || stale" @click="emit('draft')">{{ drafting ? '正在写成试稿…' : '写成试稿' }}</button>
          <button v-if="rehearsal.busy.value" type="button" class="rehearsal-primary" @click="rehearsal.cancel">停止</button>
          <button v-else-if="!stale && !atLimit" type="submit" class="rehearsal-primary" :disabled="locked || !rehearsal.action.value.trim() || Boolean(ambiguousTarget && !targetRef)" title="Ctrl / ⌘ + Enter">试演<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else-if="stale" type="button" class="rehearsal-primary" :disabled="locked" @click="emit('start')">重新确定起点</button>
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
button:focus-visible, textarea:focus-visible, summary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
button:not(:disabled):hover { color:var(--accent); }
.rehearsal-origin { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:2px 18px; border-bottom:1px solid var(--hairline-soft); font-size:12px; color:var(--text-secondary); }
.rehearsal-first-run-hint { margin:0; padding:9px 18px; border-bottom:1px solid var(--hairline-soft); color:var(--archive-olive, var(--accent-primary)); font-size:12px; line-height:1.55; }
.rehearsal-source { display:flex; align-items:center; gap:8px; padding:0; min-width:0; text-align:left; }
.rehearsal-source span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
svg { flex-shrink:0; }
.rehearsal-more { position:relative; flex-shrink:0; }
.rehearsal-more > summary { display:flex; align-items:center; justify-content:center; width:36px; min-height:36px; cursor:pointer; list-style:none; }
.rehearsal-more > summary::-webkit-details-marker { display:none; }
.rehearsal-menu { position:absolute; z-index:2; right:0; top:100%; width:220px; padding:8px; background:var(--archive-paper); border:1px solid var(--hairline-soft); box-shadow:var(--shadow-workbench-float); }
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
.rehearsal-routes { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 14px; margin-top:20px; padding-top:12px; border-top:1px solid var(--hairline-soft); font-size:12px; color:var(--text-secondary); }
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
.rehearsal-compose { display:grid; gap:6px; width:100%; padding:10px; border:1px solid var(--hairline-soft); border-radius:4px; background:var(--surface-workbench-muted); box-sizing:border-box; }
.rehearsal-compose:focus-within { border-color:var(--accent); }
.rehearsal-compose textarea { box-sizing:border-box; flex:1; min-width:0; width:100%; min-height:48px; max-height:160px; resize:vertical; border:0; padding:4px; background:transparent; color:var(--archive-ink); font:14px/1.7 var(--font-body,sans-serif); }
/* 对照展开时作者在读两条路的差异，输入压成一行给故事让高度。 */
.rehearsal-compose.is-comparing textarea { min-height:40px; height:40px; max-height:40px; resize:none; }
.rehearsal-compose textarea:focus-visible { outline:none; }
.rehearsal-primary { background:var(--accent); color:var(--accent-text); border-radius:3px; padding:8px 14px; font-size:13px; flex-shrink:0; }
.rehearsal-primary:not(:disabled):hover { color:var(--accent-text); filter:brightness(.95); }
.rehearsal-footer { flex-shrink:0; padding:12px 18px; border-top:1px solid var(--hairline-soft); background:var(--archive-paper); }
.rehearsal-dock-actions { display:flex; justify-content:flex-end; align-items:center; gap:12px; }
.rehearsal-dock-actions button { display:flex; align-items:center; justify-content:center; gap:8px; font-size:13px; text-align:left; }
.rehearsal-export { margin-right:auto; color:var(--text-secondary); padding:0 4px; }
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
</style>
