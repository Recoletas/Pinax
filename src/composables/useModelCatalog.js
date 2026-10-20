import { computed, onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue'
import { MODEL_CONFIG_EVENT } from '../services/modelConfigEvents.js'
import { listTextProviderConfigs, resolveSelectedTextProviderConfig, saveSelectedTextProviderConfigId } from '../services/textProviderConfigStore.js'
import { listImageProviderConfigs, resolveSelectedImageProviderConfig, saveSelectedImageProviderConfigId } from '../services/media/imageProviderConfigStore.js'
import { listVideoProviderConfigs, resolveSelectedVideoProviderConfig, saveSelectedVideoProviderConfigId } from '../services/media/videoProviderConfigStore.js'

const stores = { text: [listTextProviderConfigs, resolveSelectedTextProviderConfig, saveSelectedTextProviderConfigId], image: [listImageProviderConfigs, resolveSelectedImageProviderConfig, saveSelectedImageProviderConfigId], video: [listVideoProviderConfigs, resolveSelectedVideoProviderConfig, saveSelectedVideoProviderConfigId] }
export function useModelCatalog(kind = 'text') {
  const configs = ref([]), selectedId = ref(''), error = ref('')
  function refresh() {
    try { const store = stores[toValue(kind)]; configs.value = store[0](); selectedId.value = store[1]()?.id || ''; error.value = '' }
    catch { error.value = '无法读取模型配置。' }
  }
  function select(id) {
    try { stores[toValue(kind)][2](id); refresh() }
    catch { error.value = '模型选择未保存，请重试。' }
  }
  function changed(event) { if (!event.detail?.kind || event.detail.kind === toValue(kind)) refresh() }
  watch(() => toValue(kind), refresh, { immediate: true })
  onMounted(() => { window.addEventListener(MODEL_CONFIG_EVENT, changed); window.addEventListener('storage', changed) })
  onBeforeUnmount(() => { window.removeEventListener(MODEL_CONFIG_EVENT, changed); window.removeEventListener('storage', changed) })
  return { configs, selectedId, selected: computed(() => configs.value.find(item => item.id === selectedId.value) || null), refresh, select, error }
}
