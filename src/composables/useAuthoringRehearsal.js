import { computed, ref, shallowRef } from 'vue'
import { normalizeActionIntent, requestRehearsalStep, REHEARSAL_MAX_STEPS } from '../services/agents/authoring/authoringRehearsal.js'

// Only the active prefix goes to the model. Alternatives remain session-local.
//
// A route is a first-class session object: it owns a stable id, its own steps
// and its own uncommitted draft. "Where I am now" is a route id, never an
// empty string, so two different routes can never share one draft slot and
// draft ownership can be compared by identity.
const MAX_ROUTES = 5

export function useAuthoringRehearsal({ validate, getSettings, step = requestRehearsalStep }) {
  const run = shallowRef(null), busy = ref(false), error = ref(''), stale = ref(false)
  const routes = ref([])
  const route = ref('')
  let controller = null, version = 0, settings = null, stepSequence = 0, routeSequence = 0
  // Reading position and folded steps belong to the session, not to the panel
  // component: switching tools unmounts the panel and must not reset them.
  const readingScroll = ref(0)
  const folded = ref({})

  const current = computed(() => routes.value.find(item => item.id === route.value) || null)
  const steps = computed(() => current.value?.steps || [])
  const otherRoutes = computed(() => routes.value.filter(item => item.id !== route.value))
  // 输入就是当前走法的草稿：读写同一个位置，切换走法不可能读到别的路的字，
  // 也不存在“改了但还没同步”的窗口。
  const action = computed({
    get: () => current.value?.draft || '',
    set: (value) => { const target = current.value; if (target) target.draft = String(value ?? '') }
  })

  function toggleFold(stepId) {
    folded.value = { ...folded.value, [stepId]: !folded.value[stepId] }
  }
  function createRoute(items = [], draft = '') {
    const created = { id: `route-${++routeSequence}`, steps: items.map(item => ({ ...item })), draft }
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
    stepSequence = 0; routeSequence = 0
  }
  function start(baseline) {
    clear()
    run.value = baseline
    const first = createRoute()
    route.value = first.id
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
  async function advance(input = action.value) {
    const intent = normalizeActionIntent(input)
    if (!intent.text && action.value.trim()) intent.text = action.value.trim()
    const target = current.value
    if (busy.value || !run.value || !target || !intent.text || target.steps.length >= REHEARSAL_MAX_STEPS) return false
    busy.value = true; error.value = ''; controller = new AbortController()
    const ticket = ++version, baseline = run.value, prefix = [...target.steps], routeId = target.id
    try {
      if (!await check() || ticket !== version) return false
      const resolved = settings || Object.freeze({ ...await getSettings() })
      if (ticket !== version) return false
      settings = resolved
      const result = await step({ run: baseline, steps: prefix, action: intent, signal: controller.signal, settingsSnapshot: settings })
      if (ticket !== version || !await check() || ticket !== version) return false
      const owner = routes.value.find(item => item.id === routeId)
      if (!owner) return false
      owner.steps = [...prefix, {
        id: `step-${++stepSequence}`, action: intent.text,
        actor: intent.actor, targets: intent.targets, ...result
      }]
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
    start, clear, cancel, check, advance, rewind, restore
  }
}
