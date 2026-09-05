<template>
  <section class="authoring-ai-reference" aria-label="AI 参考">
    <p class="authoring-ai-reference__switch">自动联想：{{ inlineEnabled ? '开启' : '关闭' }}</p>
    <AuthoringContextSummary
      v-if="manifest || ledger"
      mode="actual"
      :manifest="manifest"
      :receipt="receipt"
      :open-by-default="Boolean(receipt?.anyCut || receipt?.invalidatedSources?.length || manifest?.unresolvedConflicts?.length)"
    />
  </section>
</template>

<script setup>
import AuthoringContextSummary from './AuthoringContextSummary.vue'

defineProps({
  ledger: { type: Object, default: null },
  manifest: { type: Object, default: null },
  receipt: { type: Object, default: null },
  inlineEnabled: Boolean
})
</script>

<style scoped>
.authoring-ai-reference { padding: 4px 14px 12px; color: var(--text-secondary); }
.authoring-ai-reference__switch { margin: 7px 0 2px; font-size: 11px; }
</style>
