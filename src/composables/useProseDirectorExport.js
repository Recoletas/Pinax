import { ref } from 'vue'

// Single lifecycle owner for director export handoff state. Serialization and
// persistence are injected adapters; no repository or storage access occurs here.
export function useProseDirectorExport({ prepareVersion, openVideoPanel }) {
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  let disposed = false
  async function prepare() {
    if (disposed || busy.value) return null
    const owner = ++generation
    busy.value = true
    error.value = ''
    try {
      const version = await prepareVersion()
      return !disposed && owner === generation ? version : null
    } catch (cause) {
      if (!disposed && owner === generation) error.value = cause?.message || '导演导出失败'
      return null
    } finally {
      if (owner === generation) busy.value = false
    }
  }
  async function handoff() {
    if (disposed || busy.value) return null
    const owner = generation + 1
    const version = await prepare()
    if (version && !disposed && owner === generation) openVideoPanel(version)
    return version
  }
  function reset() { generation += 1; busy.value = false; error.value = '' }
  function dispose() { disposed = true; reset() }
  return { busy, error, prepare, handoff, reset, dispose }
}
