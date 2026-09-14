import { computed, ref, shallowRef } from 'vue'
import { normalizeActionIntent, requestRehearsalStep, rehearsalParticipants, resolveActionParticipants, REHEARSAL_MAX_STEPS } from '../services/agents/authoring/authoringRehearsal.js'
import {
  compareRouteConsequences,
  freezeRehearsalConditions,
  projectRouteConsequenceState
} from '../../shared/authoringRehearsalConsequenceContract.js'
import { buildRehearsalDraftSource, isRehearsalDraftSourceCurrent } from '../services/agents/authoring/authoringRehearsalDraftSource.js'

// Only the active prefix goes to the model. Alternatives remain session-local.
//
// A route is a first-class session object: it owns a stable id, its own steps
// and its own uncommitted draft. "Where I am now" is a route id, never an
// empty string, so two different routes can never share one draft slot and
// draft ownership can be compared by identity.
//
// 已提交 step 深冻结、fork 深复制：后果与引用数组属于各自路线，B 路的任何
// 修改不会渗回 A 路（不可变分支账本）。
const MAX_ROUTES = 5

function cloneStep(step) {
  if (!step || typeof step !== 'object') return step
  // 手写一层深复制：structuredClone 不能处理 Vue reactive proxy
  const copy = { ...step }
  for (const key of Object.keys(copy)) {
    const value = copy[key]
    if (Array.isArray(value)) copy[key] = value.map(item => (item && typeof item === 'object' ? { ...item } : item))
    else if (value && typeof value === 'object') copy[key] = { ...value }
  }
  return copy
}

function freezeStep(step) {
  const frozen = { ...step }
  for (const key of Object.keys(frozen)) {
    const value = frozen[key]
    if (Array.isArray(value)) {
      frozen[key] = Object.freeze(value.map(item => (item && typeof item === 'object' ? Object.freeze({ ...item }) : item)))
    } else if (value && typeof value === 'object') {
      frozen[key] = Object.freeze({ ...value })
    }
  }
  return Object.freeze(frozen)
}

export function useAuthoringRehearsal({ validate, getSettings, step = requestRehearsalStep }) {
  const run = shallowRef(null), busy = ref(false), error = ref(''), stale = ref(false)
  const routes = ref([])
  const route = ref('')
  let controller = null, version = 0, settings = null, stepSequence = 0, routeSequence = 0
  // Reading position and folded steps belong to the session, not to the panel
  // component: switching tools unmounts the panel and must not reset them.
  const readingScroll = ref(0)
  const folded = ref({})
  // 上一次被拒收的响应（needs-review）：保留输入与旧回应，作者可重试或弃掉。
  const lastRejected = ref(null)

  const current = computed(() => routes.value.find(item => item.id === route.value) || null)
  const steps = computed(() => current.value?.steps || [])
  const otherRoutes = computed(() => routes.value.filter(item => item.id !== route.value))
  // 输入就是当前走法的草稿：读写同一个位置，切换走法不可能读到别的路的字，
  // 也不存在“改了但还没同步”的窗口。
  const action = computed({
    get: () => current.value?.draft || '',
    set: (value) => { const target = current.value; if (target) target.draft = String(value ?? '') }
  })
  const conditions = computed(() => run.value?.conditions || null)
  const participants = computed(() => rehearsalParticipants(run.value, current.value?.enteredRefs || []))

  // 路线状态 = 本次冻结条件 + 本路已提交 step 的后果，只读投影。
  // 各路线捕获创建时的条件代次：旧条件路线保留可读，且不被新条件混入。
  function stateFor(target) {
    if (!run.value || !target) return null
    const projected = projectRouteConsequenceState(target.conditions || run.value.conditions, target.steps)
    return Object.freeze({ ...projected, enteredRefs: Object.freeze([...(target.enteredRefs || [])]) })
  }
  const routeState = computed(() => stateFor(current.value))

  function toggleFold(stepId) {
    folded.value = { ...folded.value, [stepId]: !folded.value[stepId] }
  }
  function setAction(value) { action.value = value }
  function setReadingScroll(value) { readingScroll.value = Number(value) || 0 }
  function createRoute(items = [], draft = '') {
    const created = {
      id: `route-${++routeSequence}`,
      // 深复制：fork 只继承值，不共享任何嵌套数组/对象
      steps: items.map(item => freezeStep(cloneStep(item))),
      draft,
      enteredRefs: [],
      conditionGeneration: run.value?.conditionGeneration ?? 0,
      conditions: run.value?.conditions || null
    }
    routes.value = [...routes.value, created]
    // Keep the newest routes; the one in use is never trimmed.
    if (routes.value.length > MAX_ROUTES) {
      const droppable = routes.value.find(item => item.id !== route.value && item.id !== created.id)
      if (droppable) routes.value = routes.value.filter(item => item.id !== droppable.id)
    }
    return created
  }
  function switchTo(id) {
    const target = routes.value.find(item => item.id === id)
    if (!target) return false
    route.value = target.id
    return true
  }
  function cancel() {
    version++
    controller?.abort(); controller = null; busy.value = false
  }
  function clear() {
    cancel(); run.value = null; routes.value = []; route.value = ''; error.value = ''
    stale.value = false; settings = null; readingScroll.value = 0; folded.value = {}
    stepSequence = 0; routeSequence = 0; lastRejected.value = null
  }
  function start(baseline) {
    clear()
    // 条件基线属于本次会话：起点确定时同时确定（空条件 = 尚未声明事实）。
    // 不修改传入的 baseline 本体。
    run.value = { ...baseline, conditions: freezeRehearsalConditions({}), conditionGeneration: 0 }
    const first = createRoute()
    route.value = first.id
  }
  // A02 会话级条件冻结：一条事实、已知者、作者明确不知情者。生成新
  // baseline/generation；旧 generation 的路线保留可读，但不再续写，
  // 避免旧步混入新条件。尚无任何旧步的空路线升级到新代次——
  // “起点声明条件 → 开始推演”不需要先弃掉刚开的空路。
  function freezeConditions(input) {
    if (busy.value || !run.value) return false
    const participants = rehearsalParticipants(run.value)
    const baseline = freezeRehearsalConditions(input || {}, {
      allowedRefs: participants.map(person => person.ref).filter(Boolean)
    })
    if (baseline.issues.length) return false
    version++
    const generation = (run.value.conditionGeneration ?? 0) + 1
    run.value = { ...run.value, conditions: baseline, conditionGeneration: generation }
    routes.value = routes.value.map(item => (item.steps.length === 0
      ? { ...item, conditionGeneration: generation, conditions: baseline }
      : item))
    lastRejected.value = null
    return true
  }
  // "从这里换路" keeps what already happened as its own route and starts a new
  // one after the shared prefix; the old route keeps its own draft.
  function rewind(count) {
    if (busy.value) return false
    const from = current.value
    if (!from) return false
    error.value = ''
    // 回到起点复用同一条空路，避免每按一次就多出一段“第 0 步”。
    if (count === 0) {
      const root = routes.value.find(item => item.id !== from.id && item.steps.length === 0)
      if (root) return switchTo(root.id)
    }
    const created = createRoute(from.steps.slice(0, count))
    switchTo(created.id)
    return true
  }
  function restore(routeId) {
    if (busy.value) return false
    if (!switchTo(routeId)) return false
    error.value = ''
    return true
  }
  async function check() {
    if (!run.value || stale.value) return false
    const baseline = run.value, ticket = version
    const ok = await validate(baseline)
    if (baseline !== run.value || ticket !== version) return false
    if (!ok) { stale.value = true; error.value = '正文或参考已变化。这条试演可回看，但请重新确定起点后再继续。' }
    return ok
  }
  // A05 对照：当前路与指定路（默认第一条其他路）按同一 fact/承诺议题比较。
  function compareRoutes(otherRouteId = '') {
    const from = current.value
    if (!run.value || !from) return null
    const other = otherRouteId
      ? routes.value.find(item => item.id === otherRouteId)
      : otherRoutes.value[0]
    if (!other) return null
    const participants = rehearsalParticipants(run.value, [
      ...(from.enteredRefs || []), ...(other.enteredRefs || [])
    ])
    return compareRouteConsequences(stateFor(from), stateFor(other), {
      namesByRef: (ref) => participants.find(person => person.ref === ref)?.name || ''
    })
  }
  // A06：点击“写成试稿”时捕获的冻结快照；异步生成完成后用它核对此路身份。
  function createDraftSource() {
    const target = current.value
    if (!run.value || !target) return null
    return buildRehearsalDraftSource({ run: run.value, route: target, routeState: stateFor(target) })
  }
  function draftSourceIsCurrent(source) {
    if (!source || !run.value) return false
    const target = routes.value.find(item => item.id === source.routeId)
    if (!target) return false
    return isRehearsalDraftSourceCurrent(source, { route: target, routeState: stateFor(target), conditionGeneration: run.value.conditionGeneration ?? 0 })
  }
  function discardRejected() {
    lastRejected.value = null
    error.value = ''
  }
  // 后果批次失败时，作者可明确选择只保留已经读过的人物回应。降级动作
  // 不登记任何结构化后果，并且只对仍处在原路线/原前缀的结果生效。
  function acceptRejectedWithoutConsequences() {
    const rejected = lastRejected.value
    const owner = current.value
    if (busy.value || !rejected || !owner || owner.id !== rejected.routeId) return false
    if (owner.steps.map(item => item.id).join('|') !== rejected.prefixStepIds.join('|')) return false
    owner.steps = [...owner.steps, freezeStep({ ...rejected.step, id: `step-${++stepSequence}`, consequences: [], consequenceStatus: 'author-accepted-without-consequences' })]
    if (rejected.step.enteringRefs.length) owner.enteredRefs = [...owner.enteredRefs, ...rejected.step.enteringRefs]
    owner.draft = ''
    lastRejected.value = null
    error.value = ''
    return true
  }
  // A07：作者修改模型配置后调用；下一次 advance 重新抓取设置快照，
  // 不再把失败归因于旧配置的缓存。不影响进行中的请求与路线状态。
  function refreshSettings() {
    settings = null
  }
  async function advance(input = action.value) {
    const intent = normalizeActionIntent(input)
    if (!intent.text && action.value.trim()) intent.text = action.value.trim()
    const target = current.value
    if (busy.value || !run.value || !target || !intent.text || target.steps.length >= REHEARSAL_MAX_STEPS) return false
    if (target.conditionGeneration !== (run.value.conditionGeneration ?? 0)) {
      error.value = '本次条件已更新；旧路线只读，请从新条件重开一条试演。'
      return false
    }
    busy.value = true; error.value = ''; lastRejected.value = null; controller = new AbortController()
    const ticket = ++version, baseline = run.value, prefix = [...target.steps], routeId = target.id
    const participants = rehearsalParticipants(baseline, target.enteredRefs)
    const resolved = resolveActionParticipants(participants, intent)
    if (!resolved.ok) {
      error.value = resolved.error
      busy.value = false
      return false
    }
    const routeState = stateFor(target)
    const enteringRefs = participants
      .filter(person => person.status === 'planned' && intent.enteringRefs.includes(person.ref))
      .map(person => person.ref)
    try {
      if (!await check() || ticket !== version) return false
      const resolvedSettings = settings || Object.freeze({ ...await getSettings() })
      if (ticket !== version) return false
      settings = resolvedSettings
      const result = await step({
        run: baseline, steps: prefix, action: intent, signal: controller.signal,
        settingsSnapshot: settings, conditions: baseline.conditions, routeState
      })
      if (ticket !== version || !await check() || ticket !== version) return false
      const owner = routes.value.find(item => item.id === routeId)
      if (!owner) return false
      if (result.consequenceStatus === 'needs-review') {
        // 整批后果不提交：响应留作待核对结果，旧已提交 step 不动，输入保留。
        lastRejected.value = Object.freeze({
          routeId,
          prefixStepIds: Object.freeze(prefix.map(item => item.id)),
          action: intent.text,
          response: result.response,
          issues: Object.freeze([...(result.consequenceIssues || [])]),
          step: freezeStep({
            action: intent.text,
            actor: intent.actor || resolved.actor?.name || '', targets: [...intent.targets],
            actorRef: intent.actorRef || resolved.actor?.ref || '',
            targetRefs: intent.targetRefs.length ? [...intent.targetRefs] : resolved.targets.map(person => person.ref),
            enteringRefs: [...enteringRefs],
            response: result.response, change: result.change,
            choices: [...result.choices], evidenceRefs: [...result.evidenceRefs]
          })
        })
        error.value = '这次回应的后果登记没有通过核对：' + (result.consequenceIssues || []).join('；') + '。可重试、只保留回应，或弃掉本次结果。'
        return false
      }
      owner.steps = [...prefix, freezeStep({
        id: `step-${++stepSequence}`, action: intent.text,
        actor: intent.actor || resolved.actor?.name || '', targets: intent.targets,
        actorRef: intent.actorRef || resolved.actor?.ref || '',
        targetRefs: intent.targetRefs.length ? intent.targetRefs : resolved.targets.map(person => person.ref),
        enteringRefs,
        response: result.response, change: result.change,
        choices: [...result.choices], evidenceRefs: [...result.evidenceRefs],
        consequences: (result.consequences || []).map(item => ({ ...item })),
        consequenceStatus: 'committed'
      })]
      if (enteringRefs.length) owner.enteredRefs = [...owner.enteredRefs, ...enteringRefs]
      owner.draft = ''
      return true
    } catch (cause) {
      if (ticket === version) error.value = cause?.message || '这次试演未完成，可以重试。'
      return false
    } finally { if (ticket === version) busy.value = false }
  }
  return {
    run, routes, route, otherRoutes, current, steps, busy, error, stale, action, maxSteps: REHEARSAL_MAX_STEPS,
    readingScroll, folded, toggleFold,
    conditions, routeState, participants, lastRejected,
    setAction, setReadingScroll,
    start, clear, cancel, check, advance, rewind, restore,
    freezeConditions, compareRoutes, createDraftSource, draftSourceIsCurrent, discardRejected, acceptRejectedWithoutConsequences,
    refreshSettings
  }
}
