<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import ActivityBar from '../components/workbench/ActivityBar.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import SidePanel from '../components/workbench/SidePanel.vue'
import AppearanceControls from '../components/theme/AppearanceControls.vue'
import { ACTIVITY_ITEMS, SIDE_PANELS, resolveActivityKey } from '../config/workbenchNav'
import { useStorageHealth } from '../composables/useStorageHealth'
import { exportAllBackup } from '../utils/backupExport'

const route = useRoute()
const router = useRouter()

const drawerOpen = ref(false)
const drawerTriggerRef = ref(null)
const drawerCloseRef = ref(null)

const currentActivityKey = computed(() => resolveActivityKey(route))
const currentPanel = computed(() => SIDE_PANELS[currentActivityKey.value] || { title: '模块', items: [] })
const panelItems = computed(() => currentPanel.value.items || [])
const hideActivityBar = computed(() => Boolean(route.meta?.hideActivityBar))
const hideSidePanel = computed(() => Boolean(route.meta?.hideSidePanel))
const isImmersiveShell = computed(() => Boolean(route.meta?.immersiveShell))
const drawerHasPanel = computed(() => !hideSidePanel.value && panelItems.value.length > 1)
const currentRouteCaption = computed(() => String(route.meta?.title || currentPanel.value.title || '工作区'))

const storageHealth = useStorageHealth()
const storageChipLabel = computed(() => `存储 ${storageHealth.percent.value}%`)
const showStorageModal = ref(false)
function openStorageModal() {
  showStorageModal.value = true
}
function closeStorageModal() {
  showStorageModal.value = false
}
function handleExportBackup() {
  try {
    exportAllBackup()
  } catch (e) {
    console.error('[AppShell] backup export failed:', e)
  }
}
const storageTopKeys = computed(() => storageHealth.getTopKeys(10))
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

watch(() => route.fullPath, () => {
  drawerOpen.value = false
})

// Focus management: move focus into the drawer when it opens, return
// focus to the trigger when it closes. Minimal-but-real a11y — a full
// focus-trap loop is left for future polish, but keyboard users can at
// least dismiss the drawer with Esc and re-enter via Tab from the trigger.
watch(drawerOpen, async (open) => {
  if (open) {
    await nextTick()
    drawerCloseRef.value?.focus()
  } else if (drawerTriggerRef.value) {
    // Only restore focus when the drawer was actually closed (not
    // initial mount where drawerTriggerRef is null).
    drawerTriggerRef.value.focus()
  }
})

function handleDrawerKeydown(e) {
  if (e.key === 'Escape' && drawerOpen.value) {
    e.preventDefault()
    closeDrawer()
  }
}

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function closeDrawer() {
  drawerOpen.value = false
}

onMounted(() => {
  document.addEventListener('keydown', handleDrawerKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDrawerKeydown)
})

function handleSelectActivity(activityKey) {
  const matched = ACTIVITY_ITEMS.find((item) => item.key === activityKey)
  if (!matched) return
  if (route.name !== matched.defaultRouteName) {
    router.push({ name: matched.defaultRouteName })
  }
  closeDrawer()
}

function handleSelectPanel(routeName) {
  if (!routeName) return
  if (route.name !== routeName) {
    router.push({ name: routeName })
  }
  closeDrawer()
}
</script>

<template>
  <div
    class="app-shell"
    :class="{
      immersive: isImmersiveShell,
      'nav-hidden': hideActivityBar
    }"
  >
    <template v-if="!hideActivityBar">
      <header class="shell-mast">
        <div class="shell-mast__brand">
          <button
            ref="drawerTriggerRef"
            class="shell-menu-btn"
            type="button"
            :aria-expanded="drawerOpen ? 'true' : 'false'"
            aria-label="打开工作区导航"
            @click="toggleDrawer"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div class="shell-brand-route">
            <strong>{{ currentRouteCaption }}</strong>
          </div>
        </div>

        <nav class="shell-tabbar" role="tablist" aria-label="顶部活动导航">
          <button
            v-for="(item, index) in ACTIVITY_ITEMS"
            :key="item.key"
            class="shell-tab"
            :class="{ active: item.key === currentActivityKey }"
            role="tab"
            :aria-selected="(item.key === currentActivityKey).toString()"
            :aria-label="item.label"
            type="button"
            @click="handleSelectActivity(item.key)"
          >
            <span class="shell-tab__index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="shell-tab__label">{{ item.label }}</span>
          </button>
        </nav>

        <div class="shell-mast__meta">
          <button
            v-if="storageHealth.showChip.value"
            class="shell-storage-chip"
            :class="storageHealth.level.value"
            type="button"
            :aria-label="`存储已用 ${storageHealth.percent.value}%，点击查看详情`"
            @click="openStorageModal"
          >{{ storageChipLabel }}</button>
          <router-link class="shell-meta-chip" to="/settings/structured" aria-label="打开结构化设定">设定</router-link>
        </div>
      </header>

      <Transition name="modal-fade">
        <div v-if="showStorageModal" class="storage-overlay" @click.self="closeStorageModal">
          <div class="storage-modal" role="dialog" aria-modal="true" aria-label="存储健康详情">
            <header class="storage-modal__head">
              <h2>存储健康</h2>
              <button class="storage-modal__close" type="button" aria-label="关闭" @click="closeStorageModal">×</button>
            </header>
            <div class="storage-modal__body">
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
            </div>
            <footer class="storage-modal__foot">
              <button class="storage-modal__primary" type="button" @click="handleExportBackup">导出全部备份</button>
              <button class="storage-modal__secondary" type="button" @click="closeStorageModal">关闭</button>
            </footer>
          </div>
        </div>
      </Transition>

      <Transition name="modal-fade">
        <button
          v-if="drawerOpen"
          class="shell-overlay"
          type="button"
          aria-label="关闭工作区导航"
          @click="closeDrawer"
        />
      </Transition>

      <FolioSurface
        as="aside"
        class="shell-drawer"
        variant="chrome"
        :decorated="false"
        :class="{ open: drawerOpen, 'has-panel': drawerHasPanel }"
        role="dialog"
        aria-modal="true"
        :aria-hidden="drawerOpen ? 'false' : 'true'"
        :inert="drawerOpen ? null : ''"
        :tabindex="drawerOpen ? -1 : null"
      >
        <div class="shell-drawer__head">
          <div class="shell-drawer__copy">
            <span>Pinax</span>
            <strong>{{ currentRouteCaption }}</strong>
          </div>
          <button ref="drawerCloseRef" class="shell-drawer__close" type="button" aria-label="关闭导航" @click="closeDrawer">×</button>
        </div>

        <div class="shell-drawer__body">
          <div class="shell-drawer__activity">
            <ActivityBar
              :items="ACTIVITY_ITEMS"
              :active-key="currentActivityKey"
              @select="handleSelectActivity"
            />
          </div>

          <div v-if="drawerHasPanel" class="shell-drawer__panel">
            <SidePanel
              :title="currentPanel.title"
              :items="panelItems"
              :active-route-name="String(route.name || '')"
              @select="handleSelectPanel"
            />
          </div>

          <AppearanceControls />
        </div>
      </FolioSurface>
    </template>

    <main class="shell-content">
      <RouterView v-slot="{ Component, route: routeInfo }">
        <transition name="page-route" mode="out-in">
          <component v-if="Component" :is="Component" :key="routeInfo.name || routeInfo.fullPath" />
          <div v-else class="route-loading">
            <span class="route-loading-spinner"></span>
            <span>加载中…</span>
          </div>
        </transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  --shell-drawer-width: 360px;
  position: relative;
  min-height: var(--app-viewport-height, 100vh);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 84%, transparent), transparent 120px),
    linear-gradient(128deg, color-mix(in srgb, var(--accent-light) 10%, transparent) 0 18%, transparent 18.4% 100%),
    linear-gradient(90deg, color-mix(in srgb, var(--accent-rose-light) 8%, transparent), transparent 32%);
  color: var(--text-primary);
  isolation: isolate;
}

.app-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--border) 10%, transparent), transparent 120px),
    linear-gradient(118deg, transparent 0 62%, color-mix(in srgb, var(--accent) 8%, transparent) 62.2% 66%, transparent 66.2%),
    repeating-linear-gradient(
      90deg,
      transparent 0 48px,
      color-mix(in srgb, var(--border) 7%, transparent) 48px 49px
    );
  opacity: 0.72;
  z-index: -1;
}

.app-shell.immersive::before,
.app-shell.nav-hidden::before {
  opacity: 0.32;
}

.shell-nav-trigger {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 90;
  box-shadow: 0 14px 24px color-mix(in srgb, #000 12%, transparent);
}

.shell-mast {
  position: sticky;
  top: 0;
  z-index: 90;
  min-height: var(--shell-mast-height);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 96%, transparent), color-mix(in srgb, var(--surface-panel) 94%, transparent));
  backdrop-filter: blur(18px);
  box-shadow: 0 10px 26px color-mix(in srgb, #000 8%, transparent);
}

.shell-mast::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(116deg, transparent 0 68%, color-mix(in srgb, var(--accent) 10%, transparent) 68.2% 72%, transparent 72.2%),
    linear-gradient(90deg, transparent 0 24px, color-mix(in srgb, var(--border) 10%, transparent) 24px 25px, transparent 25px 100%);
  opacity: 0.72;
}

.shell-mast__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.shell-menu-btn {
  width: 46px;
  height: 42px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  clip-path: polygon(0 9px, 10px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 10px) 100%, 0 100%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface-raised) 92%, transparent), color-mix(in srgb, var(--surface-panel) 92%, transparent));
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.shell-menu-btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: color-mix(in srgb, var(--accent-light) 16%, var(--surface-raised));
}

.shell-menu-btn span {
  width: 16px;
  height: 1px;
  background: currentColor;
}

.shell-brand-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shell-brand-mark {
  color: color-mix(in srgb, var(--accent-rose) 72%, var(--text-primary));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.shell-brand-route {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shell-brand-route strong {
  font-size: 20px;
  line-height: 1;
  font-weight: 820;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shell-brand-route span {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.35;
  letter-spacing: 0.04em;
}

.shell-tabbar {
  min-width: 0;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

.shell-tab {
  min-height: 40px;
  padding: 0 16px 0 0;
  display: inline-grid;
  grid-template-columns: 42px auto;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 10px 50%);
  background: color-mix(in srgb, var(--surface-soft) 90%, transparent);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease, color 0.16s ease;
}

.shell-tab:hover {
  transform: translateY(-1px) translateX(1px);
  border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
  color: var(--text-primary);
}

.shell-tab.active {
  border-color: color-mix(in srgb, var(--accent) 44%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-light) 26%, var(--surface-soft)), color-mix(in srgb, var(--surface-raised) 92%, transparent));
  color: var(--text-primary);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent),
    0 10px 18px color-mix(in srgb, #000 10%, transparent);
}

.shell-tab__index {
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  transform: skewX(16deg);
}

.shell-tab.active .shell-tab__index {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-light) 22%, transparent);
}

.shell-tab__label {
  display: inline-flex;
  align-items: center;
  padding-left: 12px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shell-mast__meta {
  display: flex;
  justify-content: flex-end;
}

.shell-meta-chip {
  min-height: 34px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%);
  background: color-mix(in srgb, var(--accent-light) 18%, var(--surface-raised));
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.shell-storage-chip {
  min-height: 34px;
  padding: 0 12px;
  margin-right: 8px;
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border));
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%);
  background: color-mix(in srgb, var(--accent-light) 22%, var(--surface-raised));
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
}

.shell-storage-chip.warning {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
  background: color-mix(in srgb, var(--danger) 16%, var(--surface-raised));
  color: var(--danger);
}

.shell-storage-chip.critical {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 22%, var(--surface-raised));
  color: var(--danger);
}

.storage-overlay {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: color-mix(in srgb, var(--ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.storage-modal {
  width: min(520px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  background: var(--surface-panel, var(--surface-raised));
  color: var(--text-primary);
  border-radius: 8px;
  overflow: hidden;
}

.storage-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.storage-modal__head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.storage-modal__close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  border-radius: 4px;
}

.storage-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: grid;
  gap: 12px;
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

.storage-summary.warning .storage-summary__fill {
  background: var(--danger);
}
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
}

.storage-modal__foot {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.storage-modal__primary,
.storage-modal__secondary {
  padding: 8px 14px;
  border: 1px solid var(--border);
  background: var(--surface-raised, transparent);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.storage-modal__primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface-raised);
}

.storage-modal__primary:hover {
  filter: brightness(1.08);
}

.shell-overlay {
  position: fixed;
  inset: 0;
  z-index: 88;
  border: none;
  background: color-mix(in srgb, #000 18%, transparent);
  backdrop-filter: blur(4px);
  cursor: pointer;
}

.shell-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 89;
  width: min(var(--shell-drawer-width), calc(100vw - 28px));
  transform: translateX(calc(-100% - 20px));
  transition: transform 0.2s ease;
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  clip-path: polygon(0 0, calc(100% - 34px) 0, 100% 40px, 100% 100%, 0 100%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 96%, transparent), color-mix(in srgb, var(--surface-panel) 94%, transparent));
  box-shadow: 18px 0 42px color-mix(in srgb, #000 18%, transparent);
}

.shell-drawer.open {
  transform: translateX(0);
}

.shell-drawer__head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  background:
    linear-gradient(126deg, color-mix(in srgb, var(--accent-light) 12%, transparent) 0 28%, transparent 28.4% 100%);
}

.shell-drawer__copy {
  display: grid;
  gap: 4px;
}

.shell-drawer__copy span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.shell-drawer__copy strong {
  font-size: 24px;
  line-height: 1;
  font-weight: 820;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.shell-drawer__close {
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
}

.shell-drawer__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  overflow: hidden;
}

.shell-drawer.has-panel .shell-drawer__body {
  grid-template-columns: 168px minmax(0, 1fr);
}

.shell-drawer__activity,
.shell-drawer__panel {
  min-height: 0;
  overflow-y: auto;
}

.shell-drawer__activity {
  border-right: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  background: color-mix(in srgb, var(--surface-soft) 42%, transparent);
}

.shell-content {
  min-height: var(--app-viewport-height, 100vh);
}

.route-loading {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted, #999);
  font-size: 13px;
}

.route-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border, #e5e7eb);
  border-top-color: var(--accent, #c84b31);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1040px) {
  .shell-mast {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .shell-tabbar {
    grid-column: 1 / -1;
    order: 3;
    overflow-x: auto;
    padding-bottom: 2px;
    justify-content: flex-start;
  }

  .shell-tab {
    min-width: max-content;
  }
}

@media (max-width: 760px) {
  .shell-mast {
    padding: 8px 12px;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .shell-tabbar {
    overflow-x: auto;
    padding-bottom: 2px;
    justify-content: flex-start;
    -webkit-overflow-scrolling: touch;
  }

  .shell-tab {
    min-width: max-content;
    padding: 0 12px 0 0;
  }

  .shell-tab__index {
    display: none;
  }

  .shell-tab__label {
    padding-left: 0;
    font-size: 11px;
  }

  .shell-brand-route strong {
    font-size: 16px;
  }

  .shell-nav-trigger {
    top: 12px;
    left: 12px;
  }

  .shell-drawer {
    width: min(92vw, 360px);
  }

  .shell-drawer.has-panel .shell-drawer__body {
    grid-template-columns: 1fr;
  }

  .shell-drawer__activity {
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  }
}

@media (max-width: 480px) {
  .shell-mast {
    padding: 8px 10px;
  }

  .shell-tabbar {
    display: none;
  }

  .shell-brand-route strong {
    font-size: 14px;
  }

  .shell-meta-chip {
    font-size: 10px;
    padding: 0 10px;
  }
}

/* archive-folio chrome overrides — gated by .theme-kao so the classic
   blue-white legacy variant does not inherit these visuals.
   The .app-shell scoped styles below remain the source for shared
   layout/positioning; only the kao-specific archive visual language
   is conditional. */
.theme-kao .app-shell {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 92%, var(--bg-secondary)), color-mix(in srgb, var(--archive-paper) 94%, var(--bg-primary)));
  color: var(--archive-ink);
}

.theme-kao .app-shell::before {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-gold) 10%, transparent), transparent 120px),
    linear-gradient(118deg, transparent 0 62%, color-mix(in srgb, var(--archive-olive) 8%, transparent) 62.2% 66%, transparent 66.2%),
    repeating-linear-gradient(
      90deg,
      transparent 0 52px,
      color-mix(in srgb, var(--border) 7%, transparent) 52px 53px
    );
  opacity: 0.62;
}

.theme-kao .shell-mast {
  min-height: 68px;
  padding: 10px 18px;
  border-bottom-color: color-mix(in srgb, var(--archive-gold) 18%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff), color-mix(in srgb, var(--archive-paper) 94%, var(--surface-panel)));
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 24px color-mix(in srgb, #000 8%, transparent);
}

.theme-kao .shell-mast::before {
  background:
    linear-gradient(116deg, transparent 0 68%, color-mix(in srgb, var(--archive-gold) 10%, transparent) 68.2% 72%, transparent 72.2%),
    linear-gradient(90deg, transparent 0 22px, color-mix(in srgb, var(--border) 10%, transparent) 22px 23px, transparent 23px 100%);
}

.theme-kao .shell-menu-btn {
  border-color: color-mix(in srgb, var(--archive-gold) 22%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff), color-mix(in srgb, var(--archive-paper) 92%, var(--surface-raised)));
  color: var(--archive-ink);
}

.theme-kao .shell-menu-btn:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 34%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, var(--surface-raised));
}

.theme-kao .shell-brand-mark {
  color: color-mix(in srgb, var(--archive-gold) 82%, var(--archive-ink));
  font-size: 11px;
}

.theme-kao .shell-brand-route strong {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: none;
}

.theme-kao .shell-brand-route span {
  color: var(--archive-ink-soft);
}

.theme-kao .shell-tabbar {
  gap: 10px;
}

.theme-kao .shell-tab {
  min-height: 38px;
  border-color: color-mix(in srgb, var(--archive-gold) 18%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 90%, transparent);
  color: var(--archive-ink-soft);
}

.theme-kao .shell-tab:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 26%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 94%, transparent);
  color: var(--archive-ink);
}

.theme-kao .shell-tab.active {
  border-color: color-mix(in srgb, var(--archive-gold) 36%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff) 0 68%, color-mix(in srgb, var(--archive-gold) 24%, transparent) 68% 100%);
  color: var(--archive-ink);
}

.theme-kao .shell-tab__index {
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
  color: var(--archive-ink-soft);
}

.theme-kao .shell-tab.active .shell-tab__index {
  color: var(--archive-paper-soft);
  background: linear-gradient(180deg, color-mix(in srgb, var(--archive-olive-strong) 92%, #15312d), color-mix(in srgb, var(--archive-photo) 90%, #22413c));
}

.theme-kao .shell-tab__label {
  font-size: 11px;
  letter-spacing: 0.1em;
}

.theme-kao .shell-meta-chip {
  border-color: color-mix(in srgb, var(--archive-olive) 24%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, var(--surface-raised));
  color: color-mix(in srgb, var(--archive-olive) 82%, var(--archive-ink));
}

.theme-kao .shell-overlay {
  background: color-mix(in srgb, #000 16%, transparent);
}

.theme-kao .shell-drawer {
  border-right-color: color-mix(in srgb, var(--archive-gold) 18%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff), color-mix(in srgb, var(--archive-paper) 94%, var(--surface-panel)));
  box-shadow: 18px 0 42px color-mix(in srgb, #000 12%, transparent);
  mix-blend-mode: normal;
}

.theme-kao .shell-drawer__head {
  border-bottom-color: color-mix(in srgb, var(--archive-gold) 16%, transparent);
  background:
    linear-gradient(126deg, color-mix(in srgb, var(--archive-gold) 10%, transparent) 0 28%, transparent 28.4% 100%);
}

.theme-kao .shell-drawer__copy span {
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink-soft));
}

.theme-kao .shell-drawer__copy strong {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  text-transform: none;
}

.theme-kao .shell-drawer__close {
  border-color: color-mix(in srgb, var(--archive-gold) 18%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, var(--surface-raised));
  color: var(--archive-ink-soft);
}

.theme-kao .shell-drawer__activity {
  border-right-color: color-mix(in srgb, var(--archive-gold) 14%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 34%, transparent);
}
</style>
