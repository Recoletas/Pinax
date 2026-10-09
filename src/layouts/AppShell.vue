<script setup>
import { tr } from '../i18n/index.js'
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import WorkspaceProjectNavigation from '../components/workbench/WorkspaceProjectNavigation.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import SettingsPopup from '../components/workbench/SettingsPopup.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import WorkspaceTabs from '../components/workbench/WorkspaceTabs.vue'
import { useSettingsPopup } from '../composables/useSettingsPopup'
import { useTheme } from '../composables/useTheme'
import { PROJECT_SURFACE_ROUTE_NAMES } from '../services/workspace/workspaceTabContract.js'
import { useWorkspaceRecentStore } from '../stores/workspaceRecentStore.js'
import '../styles/workspace-surfaces.css'
import '../styles/workspace-navigation.css'

const route = useRoute()
const router = useRouter()
const baseUrl = import.meta.env.BASE_URL

const drawerOpen = ref(false)
const drawerTriggerRef = ref(null)
const drawerCloseRef = ref(null)

const hideActivityBar = computed(() => Boolean(route.meta?.hideActivityBar))
const isImmersiveShell = computed(() => Boolean(route.meta?.immersiveShell))
const currentProjectSurface = computed(() => route.name === 'settings-worldbook-create' && route.query.mode === 'sources' && route.query.bookId ? 'sources' : route.name === 'authoring'
  ? route.query.view === 'assistant' ? 'assistant' : 'writing'
  : Object.entries(PROJECT_SURFACE_ROUTE_NAMES).find(([, name]) => name === route.name)?.[0] || '')

// Workspace tabs replace the page directly; exit animations delay editor ownership.

const settingsPopup = useSettingsPopup()
const workspaceRecent = useWorkspaceRecentStore()
workspaceRecent.hydrate()
const { isDark, toggleTheme } = useTheme()
function openSettings(section) {
  closeDrawer()
  settingsPopup.open(section)
}
function openDocs() {
  closeDrawer()
  router.push({ name: 'docs' })
}

watch(() => route.fullPath, () => {
  drawerOpen.value = false
})

// Wait for inert to update before entering the drawer or restoring its trigger.
watch(drawerOpen, async (open) => {
  await nextTick()
  if (drawerOpen.value !== open) return
  if (open) {
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
  if (e.key === 'Tab' && drawerOpen.value) {
    const controls = [...(drawerCloseRef.value?.closest('aside')?.querySelectorAll('button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled)') || [])]
      .filter(control => control.getClientRects().length && !control.closest('[inert]'))
    const first = controls[0]
    const last = controls.at(-1)
    if (first && ((!e.shiftKey && document.activeElement === last) || (e.shiftKey && document.activeElement === first))) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    }
  }
}

// 全局键盘快捷键: `?` 唤起 / 关闭文档。
// 跳过 input / textarea / contentEditable, 避免用户在打字时误触。
function handleGlobalKeydown(e) {
  if (e.key !== '?' && e.key !== '/') return
  const target = e.target
  if (target instanceof HTMLElement) {
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
    if (target.getAttribute('role') === 'textbox') return
  }
  e.preventDefault()
  const isOnDocs = String(route.name) === 'docs'
  if (isOnDocs) {
    router.push('/')
  } else {
    router.push({ name: 'docs' })
  }
}

function closeDrawer() {
  drawerOpen.value = false
}

onMounted(() => {
  document.addEventListener('keydown', handleDrawerKeydown)
  document.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDrawerKeydown)
  document.removeEventListener('keydown', handleGlobalKeydown)
})

</script>

<template>
  <div
    class="app-shell"
    :class="{
      immersive: isImmersiveShell,
      'nav-hidden': hideActivityBar
    }"
  >
    <WorkspaceTabs :inert="drawerOpen ? '' : undefined">
      <div class="shell-tab-actions">
        <button ref="drawerTriggerRef" class="shell-tab-navigation" type="button" :aria-label="tr('打开工作区导航')" :title="tr('工作区导航')" :aria-expanded="drawerOpen" aria-controls="pinax-workspace-navigation" @click="drawerOpen = true"><WorkbenchIcon name="panel-left" :size="18" /><span>{{ tr('导航') }}</span></button>
        <button type="button" :aria-label="isDark ? tr('切换日间模式') : tr('切换夜间模式')" :title="isDark ? tr('日间模式') : tr('夜间模式')" @click="toggleTheme"><WorkbenchIcon :name="isDark ? 'sun' : 'moon'" :size="18" /></button>
        <button type="button" :aria-label="tr(&quot;打开设置&quot;)" :title="tr(&quot;设置&quot;)" @click="openSettings('writing')"><WorkbenchIcon name="settings" :size="18" /></button>
      </div>
    </WorkspaceTabs>
    <p v-if="workspaceRecent.persistenceNotice && route.name !== 'welcome'" class="shell-navigation-notice" role="status">{{ tr(workspaceRecent.persistenceNotice) }}</p>
      <Transition name="modal-fade">
        <SettingsPopup v-if="settingsPopup.isOpen.value && route.name !== 'welcome'" />
      </Transition>

      <Transition name="modal-fade">
        <button
          v-if="drawerOpen"
          class="shell-overlay"
          type="button"
          :aria-label="tr(&quot;关闭工作区导航&quot;)"
          @click="closeDrawer"
        />
      </Transition>

      <FolioSurface
        id="pinax-workspace-navigation"
        as="aside"
        class="shell-drawer"
        variant="chrome"
        :decorated="false"
        :class="{ open: drawerOpen }"
        role="dialog"
        :aria-label="tr('工作区导航')"
        aria-modal="true"
        :aria-hidden="drawerOpen ? 'false' : 'true'"
        :inert="drawerOpen ? null : ''"
        :tabindex="drawerOpen ? -1 : null"
      >
        <div class="shell-drawer__head">
          <div class="shell-drawer__copy">
            <img :src="`${baseUrl}pinax-icon-192.png`" alt="Pinax" width="24" height="24" />
            <strong>{{ tr('工作区导航') }}</strong>
          </div>
          <button ref="drawerCloseRef" class="shell-drawer__close" type="button" :aria-label="tr(&quot;关闭导航&quot;)" @click="closeDrawer">×</button>
        </div>

        <div class="shell-drawer__body">
          <WorkspaceProjectNavigation :book-id="typeof route.query.bookId === 'string' ? route.query.bookId : ''" :current="currentProjectSurface" />
          <div class="shell-drawer__utility" :aria-label="tr(&quot;工具&quot;)">
            <button class="shell-drawer__utility-btn" type="button" @click="router.push({ name: 'welcome' }); closeDrawer()"><WorkbenchIcon name="grid" :size="16" /><span>{{ tr('首页') }}</span></button>
            <button class="shell-drawer__utility-btn" type="button" @click="router.push({ name: 'experience' }); closeDrawer()"><WorkbenchIcon name="adventure" :size="16" /><span>{{ tr('跑团与冒险') }}</span></button>
            <button class="shell-drawer__utility-btn" type="button" @click="router.push({ name: 'online-experience' }); closeDrawer()"><WorkbenchIcon name="collaboration" :size="16" /><span>{{ tr('联机房间') }}</span></button>
            <button class="shell-drawer__utility-btn" type="button" @click="openDocs">
              <WorkbenchIcon name="book" :size="16" />
              <span>{{ tr('文档') }}</span>
            </button>
            <button class="shell-drawer__utility-btn" type="button" @click="openSettings('ai')">
              <WorkbenchIcon name="settings" :size="16" />
              <span>{{ tr('设置') }}</span>
            </button>
            <button class="shell-drawer__utility-btn" type="button" @click="openSettings('storage')">
              <WorkbenchIcon name="backup" :size="16" /><span>{{ tr('备份与恢复') }}</span>
            </button>
          </div>
        </div>
      </FolioSurface>

    <main class="shell-content" :inert="drawerOpen ? '' : undefined">
      <RouterView v-slot="{ Component, route: routeInfo }">
          <component v-if="Component" :is="Component" :key="routeInfo.name || routeInfo.fullPath" />
          <div v-else class="route-loading">
            <span class="route-loading-spinner"></span>
            <span>{{ tr('加载中…') }}</span>
          </div>
      </RouterView>
    </main>
  </div>
</template>

<style scoped>
.shell-tab-actions { display: flex; flex: 0 0 auto; align-self: stretch; align-items: center; gap: 2px; padding: 0 0 0 8px; margin-left: 6px; }
.shell-tab-actions > button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--archive-ink-soft); cursor: pointer; }
.shell-tab-actions > button:hover { background: var(--nav-hover); color: var(--archive-ink); }
.shell-tab-actions > button:active { background: var(--nav-focused); }
.shell-tab-actions > button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.shell-tab-actions > .shell-tab-navigation { display: flex; gap: 6px; width: auto; padding: 0 10px; font: 13px var(--font-sans); }
.shell-navigation-notice { flex: none; margin: 0; padding: 6px 16px; color: var(--text-secondary); background: var(--surface-workbench-muted); font: 12px/1.5 var(--font-sans); }
@media (max-width: 760px), (pointer: coarse) { .shell-tab-actions > button { width: 44px; height: 44px; } }
.app-shell {
  --shell-drawer-width: 360px;
  position: relative;
  /* UI-E18-FIX2: was `min-height: 100vh` which lets app-shell grow
     beyond viewport when content is taller, pushing route content
     below the fold and forcing the user to scroll to see the
     InputArea. Now: `height: 100vh` + `overflow: hidden` bounds
     app-shell to viewport; `display: flex; flex-direction: column`
     lets shell-content (flex: 1) take the remaining space after
     shell-mast's natural height, so route roots like Experience.vue's
     `.game-page { flex:1 }` always end at the viewport bottom. */
  height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-workbench-canvas);
  font-family: var(--font-sans);
  color: var(--text-primary);
  isolation: isolate;
}

.shell-nav-trigger {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: var(--z-workbench-chrome);
  box-shadow: 0 14px 24px color-mix(in srgb, var(--archive-ink) 14%, transparent);
}
.shell-mast {
  position: sticky;
  top: 0;
  z-index: var(--z-workbench-chrome);
  min-height: var(--shell-mast-height);
  display: grid;
  /* R2-A: 加一列 auto 给 shell-subnav（仅体验 activity 渲染时出现，
     其他 activity 此列为空 0 宽度，不影响布局）。 */
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 16px;
  align-items: center;
  padding: 12px 20px;
  /* UI-K1: archive-folder style mast — flat archive-paper surface,
     hairline bottom edge in archive-olive (binder spine rule), soft
     shadow under. Replaces SaaS blur+gradient. */
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 22%, transparent);
  background:
    linear-gradient(180deg, var(--archive-paper-soft), color-mix(in srgb, var(--archive-paper) 92%, transparent));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--archive-ink) 12%, transparent);
}

.shell-mast::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(116deg, transparent 0 68%, color-mix(in srgb, var(--archive-olive) 10%, transparent) 68.2% 72%, transparent 72.2%),
    linear-gradient(90deg, transparent 0 24px, color-mix(in srgb, var(--archive-ink) 8%, transparent) 24px 25px, transparent 25px 100%);
  opacity: 0.55;
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
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, transparent);
  clip-path: polygon(0 9px, 10px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 10px) 100%, 0 100%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 96%, transparent), color-mix(in srgb, var(--archive-paper) 92%, transparent));
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
}

.shell-menu-btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--archive-olive) 48%, var(--archive-ink));
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
}

.shell-brand-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.shell-brand-mark {
  color: color-mix(in srgb, var(--archive-rose) 72%, var(--text-primary));
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
  gap: 0;
}

/* V3: plain rectangle tab with tear-edge dashed divider (border-left
   1px dashed archive-gold 18%); active state shows the archive-rose
   ◆ stamp via ::before. background stays transparent in both states
   — the stamp is the only signal, matching the archive folio rule
   "no background highlight, mark via stamp + ink color". */
.shell-tab {
  position: relative;
  min-height: var(--control-height-lg);
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-left: 1px dashed color-mix(in srgb, var(--border) 86%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}

.shell-tab:first-child {
  border-left: none;
}

.shell-tab:hover {
  background: color-mix(in srgb, var(--archive-paper) 60%, transparent);
  color: var(--text-primary);
}

.shell-tab.active {
  background: transparent;
  color: var(--text-primary);
}

/* V3 + V4 (2026-06-26): active tab gets the archive-rose ◆ stamp
   prefix with a 0.2s cubic-bezier slide-down + fade-in. The
   pseudo-element exists on every tab (always mounted, content
   empty on inactive) so opacity + transform can transition
   smoothly between states instead of mounting/unmounting the
   glyph on every tab swap. translateY -4px → 0 gives the
   impression of the stamp "settling" onto the tab as the user
   activates it; reverse motion on deactivate reads as the
   stamp lifting off. aria-hidden on the index span + the
   pseudo-element means screen readers still rely on the tab's
   aria-selected state, not the visual mark. */
.shell-tab::before {
  content: "";
  display: inline-block;
  width: 0;
  opacity: 0;
  transform: translateY(-4px);
  margin-right: 0;
  transition: opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1),
              transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
              width 0.2s cubic-bezier(0.22, 1, 0.36, 1),
              margin-right 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.shell-tab.active::before {
  content: "◆";
  opacity: 1;
  transform: translateY(0);
  width: auto;
  margin-right: 4px;
  font-size: 9px;
  line-height: 1;
  color: color-mix(in srgb, var(--archive-rose) 82%, transparent);
}

/* V3: inactive label at 500 weight, active label at 600 — the
   weight bump is the typographic "ink stamp" without changing the
   background. No underline, no glow, no clip-path; archive folio
   language stays in ink. */
.shell-tab__label {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
}

.shell-tab.active .shell-tab__label {
  font-weight: 600;
}

/* R2-A (2026-07-16): Experience activity 的子模式入口 chip。
   视觉语言沿用 .shell-tab 的硬边纸签 + tear-edge dashed divider
   + archive-rose 墨点；不引入新视觉家族、不增加顶层 activity。
   与 shell-tab 的差异：无罗马序号、左前缀是 ink-dot `·` 而非
   `◆` 印章（active 时改为 `◆`，让 active 状态在视觉上和 tab 区
   分），尺寸更紧凑，让它在 mast 上作为子链接而非平级 tab 存在。 */
.shell-subnav {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.shell-subnav-btn {
  position: relative;
  min-height: 32px;
  padding: 0 12px 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-left: 1px dashed color-mix(in srgb, var(--border) 86%, transparent);
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}

.shell-subnav-btn::before {
  content: "·";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  line-height: 1;
  color: color-mix(in srgb, var(--archive-rose) 60%, transparent);
  transition: color 0.16s ease, font-weight 0.16s ease, content 0s;
}

.shell-subnav-btn:hover {
  background: color-mix(in srgb, var(--archive-paper) 60%, transparent);
  color: var(--text-primary);
}

.shell-subnav-btn:hover::before {
  color: var(--archive-rose);
  font-weight: 900;
}

.shell-subnav-btn.active {
  color: var(--text-primary);
}

.shell-subnav-btn.active::before {
  content: "◆";
  font-size: 9px;
  color: color-mix(in srgb, var(--archive-rose) 82%, transparent);
}

.shell-subnav-icon {
  width: 14px;
  height: 14px;
  color: color-mix(in srgb, var(--text-secondary) 92%, transparent);
  flex-shrink: 0;
}

.shell-subnav-btn.active .shell-subnav-icon,
.shell-subnav-btn:hover .shell-subnav-icon {
  color: var(--text-primary);
}

.shell-subnav-label {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
}

.shell-subnav-btn.active .shell-subnav-label {
  font-weight: 600;
}

.shell-subnav-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-rose) 60%, transparent);
  outline-offset: 2px;
}

.shell-mast__meta {
  display: flex;
  justify-content: flex-end;
}

/* Mast actions use the shared square, low-chrome control language. */
.shell-meta-chip {
  position: relative;
  min-height: var(--control-height-md);
  padding: 0 12px 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}

/* 带图标的 meta chip：图标即标记，不再画墨点，宽度随文字自适应 */
.shell-meta-chip:has(svg) {
  width: auto;
  justify-content: center;
  padding: 0 12px 0 14px;
}

.shell-meta-chip:has(svg)::before {
  display: none;
}

.shell-meta-chip-label {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.shell-meta-chip::before {
  content: "·";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  line-height: 1;
  color: color-mix(in srgb, var(--archive-rose) 60%, transparent);
  transition: color 0.16s ease, font-weight 0.16s ease;
}

.shell-meta-chip:hover {
  border-color: color-mix(in srgb, var(--archive-rose) 40%, var(--border));
  color: var(--text-primary);
}

.shell-meta-chip:hover::before {
  color: var(--archive-rose);
  font-weight: 900;
}

/* V3: storage chip — same stamp language as shell-meta-chip. */
.shell-storage-chip {
  position: relative;
  min-height: 32px;
  padding: 0 12px 0 18px;
  margin-right: 8px;
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.16s ease, color 0.16s ease;
}

.shell-storage-chip::before {
  content: "·";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  line-height: 1;
  color: color-mix(in srgb, var(--archive-rose) 60%, transparent);
  transition: color 0.16s ease, font-weight 0.16s ease;
}

.shell-storage-chip:hover {
  border-color: color-mix(in srgb, var(--archive-rose) 40%, var(--border));
}

.shell-storage-chip:hover::before {
  color: var(--archive-rose);
  font-weight: 900;
}

.shell-storage-chip.warning {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
  background: color-mix(in srgb, var(--danger) 16%, var(--archive-paper));
  color: var(--danger);
}

.shell-storage-chip.critical {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 22%, var(--archive-paper));
  color: var(--danger);
}

.shell-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-workbench-overlay);
  border: none;
  background: color-mix(in srgb, var(--archive-ink) 18%, transparent);
  backdrop-filter: blur(4px);
  cursor: pointer;
}

.shell-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: var(--z-workbench-sheet);
  width: min(var(--shell-drawer-width), calc(100vw - 28px));
  transform: translateX(calc(-100% - 20px));
  transition: transform 0.2s ease;
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--archive-olive) 22%, transparent);
  clip-path: polygon(0 0, calc(100% - 34px) 0, 100% 40px, 100% 100%, 0 100%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 96%, transparent), color-mix(in srgb, var(--archive-paper) 92%, transparent));
  box-shadow: 18px 0 42px color-mix(in srgb, var(--archive-ink) 18%, transparent);
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
  border-bottom: 1px solid color-mix(in srgb, var(--archive-olive) 18%, transparent);
  background:
    linear-gradient(126deg, color-mix(in srgb, var(--archive-olive) 10%, transparent) 0 28%, transparent 28.4% 100%);
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
  border: 1px solid color-mix(in srgb, var(--archive-olive) 22%, transparent);
  clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
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
  border-right: 1px solid color-mix(in srgb, var(--archive-olive) 18%, transparent);
  background: color-mix(in srgb, var(--archive-paper) 28%, transparent);
}

.shell-content {
  /* UI-E18-FIX2: shell-content is the route slot. With app-shell now
     being a bounded flex column (height: 100vh, overflow: hidden),
     shell-content takes `flex: 1` so it fills the remaining viewport
     after `.shell-mast`'s natural height. `min-height: 0` is the
     critical pair — without it, flex children refuse to shrink
     below their content's intrinsic height, which would re-introduce
     the same overflow the fix removes. The route root inside (e.g.
     Experience.vue's `.game-page { flex:1 }`) now lands at the
     viewport bottom edge so InputArea always stays visible. */
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.route-loading {
  min-height: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.route-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--archive-olive);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1040px) {
  .shell-mast {
    grid-template-columns: minmax(0, 1fr) auto auto;
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

  /* R2-A: subnav 在 1040px 以下保持和 meta 同行，不挤进 tabbar 滚动行。 */
  .shell-subnav {
    order: 2;
  }
}

@media (max-width: 760px) {
  .shell-mast {
    padding: 8px 12px;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 10px;
  }

  .shell-tabbar {
    overflow-x: auto;
    padding-bottom: 2px;
    justify-content: flex-start;
    -webkit-overflow-scrolling: touch;
  }

  .shell-tab {
    min-width: max-content;
    padding: 0 12px;
  }

  .shell-tab__label {
    font-size: 12px;
  }

  .shell-brand-route strong {
    font-size: 16px;
  }

  /* R2-A: mobile 上 meta chip 文字已缩到 10px，subnav 紧凑到
     14px label + 6px gap，确保不溢出 mast 行。 */
  .shell-subnav-btn {
    min-height: 28px;
    padding: 0 10px 0 16px;
    gap: 4px;
  }

  .shell-subnav-icon {
    width: 12px;
    height: 12px;
  }

  .shell-subnav-label {
    font-size: 11px;
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
    /* R2-A: 让 brand 收缩、subnav 和 meta 紧凑同行，避免溢出。
       tabbar 在 ≤480px 隐藏，mast 只剩 brand + subnav + meta。 */
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
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

  .shell-meta-chip-label {
    font-size: 10px;
  }

  .shell-subnav-btn {
    min-height: 26px;
    padding: 0 8px 0 14px;
    gap: 4px;
  }

  .shell-subnav-btn::before {
    left: 6px;
    font-size: 12px;
  }

  .shell-subnav-btn.active::before {
    font-size: 8px;
  }

  .shell-subnav-icon {
    width: 11px;
    height: 11px;
  }

  .shell-subnav-label {
    font-size: 10px;
  }
}

/* V3: meta chip uses archive-rose 22% border + ink-dot prefix in
   archive-rose. Replaces V1's grey-rectangle-with-accent language. */
@media (prefers-reduced-motion: reduce) {
  .shell-tab::before {
    transition: opacity 0.01s ease, width 0.01s ease, margin-right 0.01s ease;
    transform: none;
  }
}

/* U5-R C1-C2: the shell has one context bar and one navigation tree.
   Older tab/chip rules remain below for compatibility with archived
   routes, but the active shell no longer renders those surfaces. */
.shell-mast {
  min-height: 50px;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 7px 16px;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--archive-ink) 8%, transparent);
}

.shell-mast__brand {
  gap: 11px;
}

.shell-menu-btn {
  width: 38px;
  height: 36px;
  border: 0;
  clip-path: none;
  background: transparent;
  color: var(--archive-ink-soft);
}

.shell-menu-btn:hover {
  transform: none;
  border-color: transparent;
  background: color-mix(in srgb, var(--archive-olive) 8%, transparent);
  color: var(--archive-ink);
}

.shell-brand-route {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.shell-brand-mark {
  display: inline-block;
  color: color-mix(in srgb, var(--archive-rose) 76%, var(--archive-ink));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.shell-brand-route strong {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}

.shell-mast__meta {
  min-width: 38px;
  align-items: center;
}


.shell-drawer {
  width: min(304px, calc(100vw - 20px));
  clip-path: none;
  border-right-color: color-mix(in srgb, var(--archive-olive) 18%, transparent);
  box-shadow: 12px 0 34px color-mix(in srgb, var(--archive-ink) 12%, transparent);
}

.shell-drawer__head {
  align-items: center;
  padding: 15px 18px 13px;
  background: transparent;
}

.shell-drawer__copy {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shell-drawer__copy span {
  color: color-mix(in srgb, var(--archive-rose) 76%, var(--archive-ink));
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: none;
}

.shell-drawer__copy strong {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}

.shell-drawer__close {
  width: 36px;
  height: 36px;
  border: 0;
  clip-path: none;
  background: transparent;
  font-size: 22px;
}

.shell-drawer__body {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.shell-drawer__body > :deep(.workspace-project-nav) { flex: none; }

.shell-drawer__utility {
  display: grid;
  gap: 2px;
  padding: 10px 12px max(14px, env(safe-area-inset-bottom, 0px));
  border-top: 1px solid color-mix(in srgb, var(--archive-olive) 16%, transparent);
}

.shell-drawer__utility-btn {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--archive-ink-soft);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.shell-drawer__utility-btn:hover {
  background: color-mix(in srgb, var(--archive-olive) 7%, transparent);
  color: var(--archive-ink);
}


.shell-drawer__utility-btn:focus-visible,
.shell-menu-btn:focus-visible,
.shell-drawer__close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--archive-olive) 70%, transparent);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .shell-mast {
    min-height: 46px;
    padding: 5px 10px;
  }

  .shell-brand-route {
    gap: 7px;
  }

  .shell-brand-route strong {
    max-width: min(52vw, 220px);
  }
}
</style>
