import { ref } from 'vue'

// Single lifecycle owner for director export handoff state. Serialization and
// persistence are injected adapters; no repository or storage access occurs here.
export function useProseDirectorExport({ prepareVersion, openVideoPanel }) {
  const busy = ref(false)
  const error = ref('')
  async function prepare() {
    if (busy.value) return null
    busy.value = true
    error.value = ''
    try { return await prepareVersion() } catch (cause) {
      error.value = cause?.message || '导演导出失败'
      return null
    } finally { busy.value = false }
  }
  async function handoff() {
    const version = await prepare()
    if (version) openVideoPanel(version)
    return version
  }
  function reset() { busy.value = false; error.value = '' }
  return { busy, error, prepare, handoff, reset, dispose: reset }
}
