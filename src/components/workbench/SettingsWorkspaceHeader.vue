<script setup>
import SettingsSectionNav from './SettingsSectionNav.vue'
</script>

<template>
  <div class="settings-workspace-header" data-test="settings-workspace-header">
    <slot />
    <SettingsSectionNav />
  </div>
</template>

<style scoped>
.settings-workspace-header {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-height: var(--workspace-toolbar-height, 52px);
  padding: 6px 20px;
  flex: 0 0 auto;
  min-width: 0;
  background: var(--surface-workbench-canvas);
  border-bottom: 1px solid var(--hairline-soft);
}
/* One shared toolbar owns book identity, sections and the manuscript return. */
.settings-workspace-header :deep(.settings-context-bar) { display: contents; }
.settings-workspace-header :deep(.context-main) { order: 0; flex: 1 1 0; min-width: 0; gap: 8px; }
.settings-workspace-header :deep(.context-worldbook-select) { max-width: min(32vw, 380px); min-width: 0; }
.settings-workspace-header :deep(.settings-section-nav) { order: 1; padding: 0; border: 0; background: transparent; }
.settings-workspace-header :deep(.settings-return-authoring) { order: 2; flex-shrink: 0; }
.settings-workspace-header :deep(.context-meta) { order: 3; }
@media (max-width: 1100px) {
  .settings-workspace-header { padding-inline: 16px; }
  .settings-workspace-header :deep(.context-kicker) { display: none; }
}
@media (max-width: 760px) {
  .settings-workspace-header { flex-wrap: wrap; gap: 0 8px; padding: 4px 12px 6px; }
  .settings-workspace-header :deep(.context-main) { min-height: 44px; }
  .settings-workspace-header :deep(.context-worldbook-select) { max-width: 100%; }
  .settings-workspace-header :deep(.settings-return-authoring) { order: 1; padding: 0; }
  .settings-workspace-header :deep(.settings-section-nav) { order: 2; flex: 1 1 100%; min-width: 0; overflow-x: auto; padding-top: 4px; }
  .settings-workspace-header :deep(.context-mismatch) { max-width: 22vw; font-size: 12px; }
  .settings-workspace-header :deep(.context-meta) { flex: 1 1 100%; padding: 4px 0; }
}
</style>
