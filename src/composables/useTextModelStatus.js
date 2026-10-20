import { ref } from 'vue'
import { setServerTextModel } from '../services/textProviderConfigStore.js'
import { MODEL_CONFIG_EVENT } from '../services/modelConfigEvents.js'
export const textModelReadOnly = ref(true)
export const textModelReady = ref(false)
let pending = null
export function refreshTextModelStatus() {
  if (pending) return pending
  pending = (async () => {
    try {
      const response = await fetch('/api/storyagent/model')
      const body = await response.json()
      textModelReadOnly.value = body.readOnly === true
      textModelReady.value = response.ok && body.ok === true
      setServerTextModel(textModelReady.value ? body : null)
      window.dispatchEvent(new CustomEvent(MODEL_CONFIG_EVENT, { detail: { kind: 'text' } }))
    } catch { textModelReady.value = false }
    finally { pending = null }
  })()
  return pending
}
