<template>
  <label class="manuscript-language">{{ tr('作品语言') }}
    <select :value="modelValue" data-test="manuscript-language" @change="$emit('update:modelValue', $event.target.value)">
      <option value="">{{ tr('未设置（保留原文语言）') }}</option>
      <option value="zh-CN">简体中文</option><option value="en">English</option>
      <option value="mixed">{{ tr('混合语言') }}</option>
    </select>
  </label>
</template>
<script setup>
import { tr } from '../../i18n/index.js'
defineProps({ modelValue: { type: String, default: '' } })
defineEmits(['update:modelValue'])
</script>
<style scoped>
.manuscript-language { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; margin-block: 8px; }
select { max-width: 100%; min-width: 0; color: inherit; background: var(--archive-paper-soft); border: 1px solid var(--archive-paper-strong); border-radius: 4px; padding: 5px; }
</style>
