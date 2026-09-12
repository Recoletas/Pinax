<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
const props = defineProps({
  rehearsal: { type: Object, required: true },
  preparing: Boolean,
  notice: { type: String, default: '' },
  title: { type: String, default: '' },
  drafting: Boolean,
  draftState: { type: String, default: 'none' }
})
const emit = defineEmits(['start', 'draft', 'view-draft', 'locate', 'if'])
const steps = computed(() => props.rehearsal.steps.value)
const last = computed(() => steps.value.at(-1))
const atLimit = computed(() => steps.value.length >= props.rehearsal.maxSteps)
const suggestions = computed(() => (last.value?.choices || []).slice(0, 3))
const locked = computed(() => props.preparing || props.drafting || props.rehearsal.busy.value)
const stale = computed(() => props.rehearsal.stale.value)
const flow = ref(null)
const input = ref(null)
const more = ref(null)
const hasNew = ref(false)
const follow = ref(true)

function chooseAction(choice) {
  props.rehearsal.action.value = choice
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
function pickActor(name) {
  actor.value = name
  target.value = ''
}
function submit() {
  if (locked.value || !props.rehearsal.action.value.trim()) return
  if (ambiguousTarget.value && !target.value) {
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
  props.rehearsal.readingScroll.value = scrollTopOf()
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
  props.rehearsal.readingScroll.value = scrollTopOf()
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

// P2-1 行动意图：默认行动者=视角人物；出现代词且在场多人时不自动猜对象，
// 要求作者点名。会话内状态，不写作品数据。
const participants = computed(() => {
  const list = props.rehearsal.run.value?.pressureProjection?.participants || []
  return list.filter(person => person?.name).map(person => ({
    name: String(person.name),
    viewpoint: (person.roles || []).includes('viewpoint')
  }))
})
const actor = ref('')
const defaultActor = computed(() => participants.value.find(person => person.viewpoint)?.name
  || participants.value[0]?.name || '')
const activeActor = computed(() => actor.value || defaultActor.value)
watch(defaultActor, (value) => { if (!actor.value && value) actor.value = '' })
const others = computed(() => participants.value.filter(person => person.name !== activeActor.value).map(person => person.name))
const ambiguousTarget = computed(() => {
  const text = props.rehearsal.action.value
  if (!text.trim() || !others.value.length) return null
  if (others.value.some(name => text.includes(name))) return null
  if (/[他她它]|对方|那人/.test(text)) return others.value
  return null
})
const target = ref('')
watch([ambiguousTarget, () => props.rehearsal.route.value], ([names]) => {
  if (!names) target.value = ''
})
function buildIntent() {
  const targets = []
  if (target.value) targets.push(target.value)
  const named = others.value.filter(name => props.rehearsal.action.value.includes(name))
  for (const name of named) if (!targets.includes(name)) targets.push(name)
  return { text: props.rehearsal.action.value, actor: activeActor.value, targets }
}
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
    <div ref="flow" class="rehearsal-flow" @scroll.passive="onFlowScroll">
      <template v-if="!rehearsal.run.value">
        <p class="rehearsal-intro">试一个行动，看看人物如何回应。</p>
        <button type="button" class="rehearsal-primary" :disabled="locked" @click="emit('start')">{{ preparing ? '正在核对现场…' : '从当前段落开始' }}</button>
        <p class="rehearsal-limit">暂不写入正文 · 刷新后不保留</p>
      </template>
      <template v-else>
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
                <details class="rehearsal-consequence"><summary>局面变化</summary><p>{{ item.change }}</p></details>
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
      </template>
      <p v-if="rehearsal.error.value" class="rehearsal-error" role="alert">{{ rehearsal.error.value }}</p>
      <p v-else-if="notice" class="rehearsal-error" role="status">{{ notice }}</p>
    </div>
    <footer v-if="rehearsal.run.value" class="rehearsal-footer">
      <form class="rehearsal-compose" :class="{ 'is-comparing': compareOpen }" @submit.prevent="submit">
        <div v-if="!stale && !atLimit && participants.length > 1" class="rehearsal-cast" aria-label="行动者">
          <span class="rehearsal-cast-label">行动者</span>
          <button v-for="person in participants" :key="person.name" type="button" class="rehearsal-cast-person" :aria-pressed="person.name === activeActor ? 'true' : 'false'" :disabled="locked" @click="pickActor(person.name)">{{ person.name }}</button>
        </div>
        <textarea v-if="!stale && !atLimit" ref="input" v-model="rehearsal.action.value" maxlength="300" rows="2" aria-label="试演行动" :placeholder="last ? '接下来，让人物…' : '让人物…'" :readonly="locked" @keydown="submitFromKeyboard" />
        <p v-if="!stale && !atLimit && ambiguousTarget && !target" class="rehearsal-ambiguous" role="status">{{ ambiguousTarget.length > 1 ? '这句话里的「他/她」指向谁？点名或选一个，不自动猜。' : '这句话要交给谁回应？点名或选一个，不自动猜。' }}</p>
        <div v-if="!stale && !atLimit && ambiguousTarget" class="rehearsal-cast is-target" aria-label="动作对象">
          <button v-for="name in ambiguousTarget" :key="name" type="button" class="rehearsal-cast-person" :aria-pressed="target === name ? 'true' : 'false'" :disabled="locked" @click="target = name">{{ name }}</button>
        </div>
        <div class="rehearsal-dock-actions">
          <button v-if="draftState === 'same-route'" type="button" class="rehearsal-export" @click="emit('view-draft')">查看试稿<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else-if="draftState !== 'none'" type="button" class="rehearsal-export" @click="emit('view-draft')">正文已有{{ draftState === 'other-route' ? '另一条走法' : '其他来源' }}的待处理试稿<WorkbenchIcon name="arrow-right" :size="14" /></button>
          <button v-else-if="steps.length" type="button" class="rehearsal-export" :disabled="locked || stale" @click="emit('draft')">{{ drafting ? '正在写成试稿…' : '写成试稿' }}</button>
          <button v-if="rehearsal.busy.value" type="button" class="rehearsal-primary" @click="rehearsal.cancel">停止</button>
          <button v-else-if="!stale && !atLimit" type="submit" class="rehearsal-primary" :disabled="locked || !rehearsal.action.value.trim() || Boolean(ambiguousTarget && !target)" title="Ctrl / ⌘ + Enter">试演<WorkbenchIcon name="arrow-right" :size="14" /></button>
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
.rehearsal-options { display:grid; margin-top:14px; border-top:1px solid var(--hairline-soft); }
.rehearsal-options button { text-align:left; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 0; font-size:13px; line-height:1.7; }
.rehearsal-options svg { color:var(--text-muted); }
.rehearsal-options button[aria-pressed="true"] { color:var(--accent); }
.rehearsal-options button[aria-pressed="true"] svg { color:var(--accent); }
.rehearsal-new { display:inline-flex; align-items:center; gap:6px; margin-top:12px; padding:6px 10px; border:1px solid var(--hairline-soft); border-radius:999px; font-size:12px; color:var(--text-secondary); background:var(--archive-paper); }
.rehearsal-stale { margin-top:14px; font-size:12px; line-height:1.8; color:var(--text-secondary); }
.rehearsal-routes { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 14px; margin-top:20px; padding-top:12px; border-top:1px solid var(--hairline-soft); font-size:12px; color:var(--text-secondary); }
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
@media(max-width:720px) {
  button, .rehearsal-more > summary, .rehearsal-step-head, .rehearsal-routes-more > summary, .rehearsal-compare > summary, .rehearsal-consequence > summary { min-height:44px; box-sizing:border-box; }
  .rehearsal-flow { padding:14px 18px; }
  .rehearsal-route { min-height:44px; align-items:center; }
  .rehearsal-cast-person { min-height:44px; }
  .rehearsal-cast { row-gap:6px; }
}
@media(max-width:720px) and (max-height:600px) {
  .rehearsal-footer { padding:6px 12px; }
  .rehearsal-compose { padding:6px; gap:2px; }
  .rehearsal-compose textarea { min-height:44px; height:44px; max-height:80px; }
  .rehearsal-flow { padding:10px 18px; }
}
</style>
