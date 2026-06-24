<template>
  <div class="settings-overlay" @click.self="close">
    <div class="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
      <header class="settings-modal__head">
        <h2>设置</h2>
        <button
          ref="closeBtnRef"
          class="settings-modal__close"
          type="button"
          aria-label="关闭"
          @click="close"
        >×</button>
      </header>

      <nav class="settings-tabs" role="tablist" aria-label="设置分区">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="settings-tab"
          :class="{ active: activeSection === tab.key }"
          :data-test="`settings-tab-${tab.key}`"
          role="tab"
          :aria-selected="(activeSection === tab.key).toString()"
          type="button"
          @click="activeSection = tab.key"
        >{{ tab.label }}</button>
      </nav>

      <div class="settings-modal__body">
        <section
          v-show="activeSection === 'appearance'"
          class="settings-section"
          role="tabpanel"
          aria-label="外观"
        >
          <p class="settings-section__hint">主题变体与明暗模式,选择后立即生效。</p>
          <AppearanceControls />
        </section>

        <section
          v-show="activeSection === 'ai'"
          class="settings-section"
          role="tabpanel"
          aria-label="AI 配置"
        >
          <ApiSettingsPanel />
        </section>

        <section
          v-show="activeSection === 'storage'"
          class="settings-section"
          role="tabpanel"
          aria-label="存储"
        >
          <div class="storage-summary" :class="storageHealth.level.value">
            <span class="storage-summary__pct">{{ storageHealth.percent.value }}%</span>
            <span class="storage-summary__bar">
              <span class="storage-summary__fill" :style="{ width: `${Math.min(storageHealth.percent.value, 100)}%` }"></span>
            </span>
            <span class="storage-summary__hint">
              {{ storageHealth.isCritical.value ? '请立即导出备份并清理' : storageHealth.isWarning.value ? '建议导出备份' : '存储充足' }}
            </span>
          </div>
          <table class="storage-table">
            <thead>
              <tr><th>key</th><th>大小</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in storageTopKeys" :key="row.key">
                <td><code>{{ row.key }}</code></td>
                <td>{{ formatBytes(row.bytes) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="storage-actions">
            <button class="settings-btn settings-btn--primary" type="button" @click="handleExportBackup">导出全部备份</button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import AppearanceControls from '../theme/AppearanceControls.vue'
import ApiSettingsPanel from '../worldbook/ApiSettingsPanel.vue'
import { useStorageHealth } from '../../composables/useStorageHealth'
import { exportAllBackup } from '../../utils/backupExport'
import { useSettingsPopup } from '../../composables/useSettingsPopup'

const { close, activeSection, isOpen } = useSettingsPopup()

const storageHealth = useStorageHealth()
const storageTopKeys = computed(() => storageHealth.getTopKeys(10))

const closeBtnRef = ref(null)

const tabs = [
  { key: 'appearance', label: '外观' },
  { key: 'ai', label: 'AI 配置' },
  { key: 'storage', label: '存储' }
]

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function handleExportBackup() {
  try {
    exportAllBackup()
  } catch (e) {
    console.error('[SettingsPopup] backup export failed:', e)
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault()
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

watch(isOpen, async (open) => {
  if (open) {
    await nextTick()
    closeBtnRef.value?.focus()
  }
})
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 96;
  background: color-mix(in srgb, var(--ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  width: min(720px, 92vw);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  background: var(--surface-panel, var(--surface-raised));
  color: var(--text-primary);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 24px 60px color-mix(in srgb, #000 28%, transparent);
}

.settings-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.settings-modal__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.settings-modal__close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  border-radius: 4px;
}

.settings-modal__close:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  background: var(--surface-soft, transparent);
}

.settings-tab {
  padding: 6px 14px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.settings-tab:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.settings-tab.active {
  background: var(--accent-light, transparent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  color: var(--accent);
}

.settings-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: grid;
  gap: 16px;
  align-content: start;
}

.settings-section__hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.storage-summary {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
}

.storage-summary__pct {
  font-size: 18px;
  font-weight: 700;
}

.storage-summary__bar {
  height: 8px;
  background: color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 4px;
  overflow: hidden;
}

.storage-summary__fill {
  display: block;
  height: 100%;
  background: var(--accent);
}

.storage-summary.warning .storage-summary__fill,
.storage-summary.critical .storage-summary__fill {
  background: var(--danger);
}

.storage-summary__hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.storage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.storage-table th,
.storage-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.storage-table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.storage-table code {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  word-break: break-all;
}

.storage-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.settings-btn {
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--surface-raised);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.settings-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface-raised);
}

.settings-btn--primary:hover {
  filter: brightness(1.08);
}
</style>
