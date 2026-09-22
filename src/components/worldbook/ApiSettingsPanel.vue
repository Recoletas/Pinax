<template>
  <div class="api-settings-panel">
    <div class="ai-settings-head">
      <strong>{{ tr('AI 文本模型') }}</strong>
      <p>{{ tr('内置 MiniMax 由部署服务器提供密钥，无需作者填写；首次使用前可打开详情测试连通性。也可添加自己的模型配置。') }}</p>
    </div>

    <TextModelPicker
      :model-value="selectedId"
      :configs="configs"
      @update:model-value="handleSelect"
      @configs-updated="handleConfigsUpdated"
    />

    <p v-if="currentNote" class="ai-settings-note" role="status">{{ currentNote }}</p>
  </div>
</template>

<script setup>
import { tr } from '../../i18n/index.js'
import { computed, onMounted, ref } from 'vue'
import TextModelPicker from '../text/TextModelPicker.vue'
import {
  getSelectedTextProviderConfigId,
  listTextProviderConfigs,
  resolveSelectedTextProviderConfig,
  saveSelectedTextProviderConfigId
} from '../../services/textProviderConfigStore'

const selectedId = ref('')
const configs = ref([])

const currentNote = computed(() => {
  const resolved = resolveSelectedTextProviderConfig()
  if (resolved?.builtin) {
    return '当前使用内置 MiniMax：能否生成取决于部署服务器状态，可在模型详情中测试。'
  }
  return `当前使用「${resolved?.name || '自定义配置'}」，模型 ${resolved?.model || '—'}。`
})

onMounted(() => {
  configs.value = listTextProviderConfigs()
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
  // 选中失效时收敛回内置, 保持 store 干净
  if (getSelectedTextProviderConfigId() !== resolved.id) {
    saveSelectedTextProviderConfigId(resolved.id)
  }
})

function handleSelect(id) {
  selectedId.value = id
  saveSelectedTextProviderConfigId(id)
}

function handleConfigsUpdated(next) {
  configs.value = next
  const resolved = resolveSelectedTextProviderConfig()
  selectedId.value = resolved.id
}
</script>

<style scoped>
.api-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-settings-head {
  display: grid;
  gap: 4px;
}

.ai-settings-head strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-settings-head p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.ai-settings-note {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed color-mix(in srgb, var(--archive-gold, var(--accent)) 45%, var(--border));
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft, var(--bg-tertiary)) 80%, transparent);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
