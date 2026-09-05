const VALID_MODES = new Set(['contextual', 'browse', 'search', 'detail'])

export function createAuthoringInspectorState(overrides = {}) {
  return {
    tool: 'annotations',
    mode: 'contextual',
    indexView: 'group',
    selectedId: '',
    query: '',
    dual: false,
    pinned: false,
    returnState: null,
    ...overrides
  }
}

export function selectAuthoringInspectorTool(state, tool) {
  return { ...state, tool: String(tool || 'annotations') }
}

export function openAuthoringInspectorMode(state, mode, patch = {}) {
  const nextMode = VALID_MODES.has(mode) ? mode : 'contextual'
  const preserveReturn = nextMode === 'detail'
    ? { mode: state.mode, indexView: state.indexView, query: state.query }
    : state.returnState
  return { ...state, ...patch, mode: nextMode, returnState: preserveReturn }
}

export function openAuthoringInspectorDetail(state, selectedId) {
  return openAuthoringInspectorMode(state, 'detail', { selectedId: String(selectedId || '') })
}

export function returnFromAuthoringInspectorDetail(state) {
  const previous = state.returnState || { mode: 'contextual', indexView: 'group', query: '' }
  return { ...state, ...previous, selectedId: '', returnState: null }
}

export function toggleAuthoringInspectorDual(state, eligible = true) {
  if (!eligible) return { ...state, dual: false }
  const dual = !state.dual
  return { ...state, dual, pinned: dual || state.pinned }
}

export function resetAuthoringInspectorForBook(state) {
  return { ...state, mode: 'contextual', selectedId: '', query: '', returnState: null }
}