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
.settings-workspace-header { flex: 0 0 auto; min-width: 0; background: var(--archive-paper-soft); border-bottom: 1px solid var(--archive-paper-strong); }
.settings-workspace-header :deep(.settings-context-bar) { box-sizing: border-box; min-height: 48px; padding: 6px 20px; gap: 16px; border: 0; background: transparent; flex-wrap: nowrap; }
.settings-workspace-header :deep(.context-main) { min-width: 0; flex: 1; }
.settings-workspace-header :deep(.context-project-name) { min-width: 0; max-width: min(45vw, 420px); }
.settings-workspace-header :deep(.settings-section-nav) { display: flex; flex-wrap: nowrap; align-items: center; min-height: 44px; padding: 4px 20px 6px; gap: 4px; border: 0; background: transparent; }
.settings-workspace-header :deep(.settings-section-tab) { min-height: 34px; padding: 0 12px; border: 0; border-radius: 5px; font-size: 13px; }
.settings-workspace-header :deep(.settings-return-authoring) { flex-shrink: 0; }
@media (max-width: 760px) {
 .settings-workspace-header :deep(.settings-context-bar) { min-height: 56px; padding: 4px 16px; gap: 10px; }
 .settings-workspace-header :deep(.context-kicker) { display: inline; font-size: 12px; }
 .settings-workspace-header :deep(.context-main) { gap: 8px; }
 .settings-workspace-header :deep(.context-project-name) { max-width: none; flex: 1; }
 .settings-workspace-header :deep(.settings-section-nav) { min-height: 46px; padding: 4px 16px 6px; }
 .settings-workspace-header :deep(.settings-section-tab) { min-height: 36px; padding: 0 10px; font-size: 14px; }
 .settings-workspace-header :deep(.context-mismatch) { max-width: 22vw; }
}
</style>
