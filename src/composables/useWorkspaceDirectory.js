import { computed, reactive, ref, watch } from 'vue'

// Explorer visibility belongs to the shell, independently of document owners.
// The mobile sheet deliberately does not share desktop visibility preferences.
export function useWorkspaceDirectory({ state, scope }) {
  const preferences = reactive({})
  let prepareOpen = null
  function bindPrepare(handler) { prepareOpen = handler; return () => { if (prepareOpen === handler) prepareOpen = null } }
  const prepare = async () => !prepareOpen || await prepareOpen() !== false
  const modes = ['files', 'search', 'chapters', 'extensions']
  const bookKey = computed(() => String(scope.value.bookId || ''))
  const contextKey = bookKey
  const storageKey = key => `pinax-directory-mode:v1:${key}`
  function preference(key) {
    if (!preferences[key]) {
      let saved
      try {
        const raw = localStorage.getItem(storageKey(key))
        saved = raw === 'chapters' || raw === 'files' ? { mode: raw } : JSON.parse(raw)
      } catch { /* A display preference must never block access to a book. */ }
      preferences[key] = { mode: modes.includes(saved?.mode) ? saved.mode : 'files', expanded: typeof saved?.expanded === 'boolean' ? saved.expanded : Boolean(key), width: Math.min(360, Math.max(200, Number(saved?.width) || 248)) }
    }
    return preferences[key]
  }
  function persist(key) {
    try { localStorage.setItem(storageKey(key), JSON.stringify(preference(key))) } catch { /* Content has its own explicit save errors. */ }
  }
  const mode = computed({
    get: () => preference(bookKey.value).mode,
    set: value => { preference(bookKey.value).mode = modes.includes(value) ? value : 'files'; persist(bookKey.value) }
  })
  const width = computed(() => preference(contextKey.value).width)
  function resize(value, commit = true) { preference(contextKey.value).width = Math.min(360, Math.max(200, Number(value) || 248)); if (commit) persist(contextKey.value) }
  const desktopExpanded = ref(preference(contextKey.value).expanded)
  function setDesktopExpanded(value) {
    desktopExpanded.value = Boolean(value)
    // Remember the last shell visibility on Home as well. Returning Home does
    // not restore a separate, potentially closed snapshot over the live shell.
    for (const key of new Set([bookKey.value, ''])) {
      preference(key).expanded = desktopExpanded.value; persist(key)
    }
  }
  const documentActive = computed(() => !state.hidden && state.views.some(view =>
    view.id === state.mainModuleId && ['chapter', 'exploration'].includes(view.resource.type)))
  watch(() => [bookKey.value, documentActive.value], ([bookId, active], previous = []) => {
    if (active && (!previous[1] || bookId !== previous[0])) {
      if (!['files', 'chapters'].includes(mode.value)) mode.value = 'files'
      setDesktopExpanded(true)
    }
  }, { immediate: true })
  const expanded = computed(() => state.narrow ? state.directoryOpen : desktopExpanded.value)
  function setExpanded(value) {
    if (state.narrow) state.directoryOpen = Boolean(value)
    else setDesktopExpanded(value)
  }
  function select(value) {
    if (mode.value === value) setExpanded(!expanded.value)
    else { mode.value = value; setExpanded(true) }
  }
  return { bindPrepare, prepare, mode, expanded, width, resize, setExpanded, toggle: () => setExpanded(!expanded.value), select }
}
