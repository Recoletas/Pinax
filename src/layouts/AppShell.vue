<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import ActivityBar from '../components/workbench/ActivityBar.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import SidePanel from '../components/workbench/SidePanel.vue'
import SettingsPopup from '../components/workbench/SettingsPopup.vue'
import AppearanceControls from '../components/theme/AppearanceControls.vue'
import { ACTIVITY_ITEMS, SIDE_PANELS, resolveActivityKey } from '../config/workbenchNav'
import { useSettingsPopup } from '../composables/useSettingsPopup'
import { useStorageHealth } from '../composables/useStorageHealth'

const route = useRoute()
const router = useRouter()

/* V3 (2026-06-25): roman numeral stamps for the 5 activity tabs.
   ACTIVITY_ITEMS is fixed at 5 entries (workbenchNav.js), so the
   map is hard-coded; if the count grows beyond Ⅹ we can extend or
   switch to toRoman() but for now the archive folio language wants
   hand-picked Ⅰ-Ⅴ marks, not generic 01-05 sans numerals. */
const ROMAN_ACTIVITY_STAMPS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']

const drawerOpen = ref(false)
const drawerTriggerRef = ref(null)
const drawerCloseRef = ref(null)
const tabbarRef = ref(null)

const currentActivityKey = computed(() => resolveActivityKey(route))
const currentPanel = computed(() => SIDE_PANELS[currentActivityKey.value] || { title: '模块', items: [] })
const panelItems = computed(() => currentPanel.value.items || [])
const hideActivityBar = computed(() => Boolean(route.meta?.hideActivityBar))
const hideSidePanel = computed(() => Boolean(route.meta?.hideSidePanel))
const isImmersiveShell = computed(() => Boolean(route.meta?.immersiveShell))
const drawerHasPanel = computed(() => !hideSidePanel.value && panelItems.value.length > 1)
const currentRouteCaption = computed(() => String(route.meta?.title || currentPanel.value.title || '工作区'))

/* V4 (2026-06-26): direction-aware page-route transition. We resolve
   the previous activity key before the route swap, then on the new
   tick compute the horizontal sign from the ACTIVITY_ITEMS index
   delta. Direction defaults to +1 (rightward enter) so the very
   first navigation never reads as a leftward slide-in. The same
   value feeds both before-enter (positive: page slides in from
   right) and before-leave (negative of the same value: page slides
   out toward the opposite side, so enter and leave mirror each
   other instead of both moving the same way). Same-activity
   navigation resets direction to 0 — only the vertical settle
   plays, no horizontal displacement (sub-route swaps like
   /experience → /opening should not pretend to be cross-section
   moves). */
const prevActivityKey = ref(currentActivityKey.value)
const transitionDirection = ref(1)

watch(currentActivityKey, (nextKey, previousKey) => {
  if (nextKey === previousKey) {
    transitionDirection.value = 0
    return
  }
  const nextIndex = ACTIVITY_ITEMS.findIndex((item) => item.key === nextKey)
  const prevIndex = ACTIVITY_ITEMS.findIndex((item) => item.key === previousKey)
  const safeNext = nextIndex >= 0 ? nextIndex : 0
  const safePrev = prevIndex >= 0 ? prevIndex : safeNext
  if (safeNext === safePrev) {
    transitionDirection.value = 0
  } else {
    transitionDirection.value = safeNext > safePrev ? 1 : -1
  }
  prevActivityKey.value = nextKey
})

function onPageBeforeEnter(el) {
  if (el && el.style) {
    el.style.setProperty('--page-direction', String(transitionDirection.value))
  }
}

function onPageBeforeLeave(el) {
  if (el && el.style) {
    el.style.setProperty('--page-direction', String(-transitionDirection.value))
  }
}

const storageHealth = useStorageHealth()
const storageChipLabel = computed(() => `存储 ${storageHealth.percent.value}%`)
const settingsPopup = useSettingsPopup()
function openSettings(section) {
  settingsPopup.open(section)
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
            <Transition name="caption-fade" mode="out-in">
              <strong :key="currentRouteCaption">{{ currentRouteCaption }}</strong>
            </Transition>
          </div>
        </div>

        <nav ref="tabbarRef" class="shell-tabbar" role="tablist" aria-label="顶部活动导航">
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
            <span class="shell-tab__index" aria-hidden="true">{{ ROMAN_ACTIVITY_STAMPS[index] || '·' }}</span>
            <span class="shell-tab__label">{{ item.label }}</span>
          </button>
        </nav>

        <div class="shell-mast__meta">
          <button
            v-if="storageHealth.showChip.value"
            class="shell-storage-chip"
            :class="storageHealth.level.value"
            type="button"
            :aria-label="`存储已用 ${storageHealth.percent.value}%，点击查看存储详情`"
            data-test="shell-storage-chip"
            @click="openSettings('storage')"
          >{{ storageChipLabel }}</button>
          <button
            class="shell-meta-chip"
            type="button"
            aria-label="打开设置"
            data-test="shell-settings-chip"
            @click="openSettings('appearance')"
          >设置</button>
        </div>
      </header>

      <Transition name="modal-fade">
        <SettingsPopup v-if="settingsPopup.isOpen.value" />
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
        <transition
          name="page-route"
          mode="out-in"
          @before-enter="onPageBeforeEnter"
          @before-leave="onPageBeforeLeave"
        >
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

/* V3 (2026-06-25): mast paper-fiber baseline. Drops the SaaS
   backdrop-filter:blur(18px) (translucent / glassy top-bar) and
   replaces it with a flat archive-paper surface. The kao theme
   adds the speckle layer on top via ::before; legacy theme keeps
   the simple 2-stop gradient with no blur. The mast now reads as
   paper, not as a floating glass bar. */
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

/* V3 (2026-06-25): tabs share tear-edge dashed dividers instead of
   a Material-style gap. gap:0 + border-left:1px dashed archive-gold
   on every tab except :first-child gives a paper-tear signature
   between activities. The kao theme re-colors the dash to
   archive-rose / archive-gold per variant. */
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
  min-height: 40px;
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
  background: color-mix(in srgb, var(--surface-soft) 60%, transparent);
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
  color: color-mix(in srgb, var(--accent-rose) 82%, transparent);
}

/* V3: roman numeral stamp on .shell-tab__index — LXGW brush via
   var(--font-display) instead of V1's sans mono. No skewX (V1
   removed it), no tabular-nums (roman numerals don't align). */
.shell-tab__index {
  display: inline-block;
  min-width: 14px;
  text-align: center;
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0;
}

.shell-tab.active .shell-tab__index {
  color: var(--text-primary);
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

.shell-mast__meta {
  display: flex;
  justify-content: flex-end;
}

/* V3 (2026-06-25): mast chips (设置 / 存储 / 切换) move to the
   archive-rose ink-dot stamp language. transparent background +
   1px solid archive-rose 22% border + ::before `·` ink dot in
   archive-rose. hover promotes the dot to a solid mark + lifts
   the border to archive-rose 40%. border-radius: 0 (档案册硬切角).
   Replaces V1's rounded-grey-rect SaaS chip language. */
.shell-meta-chip {
  position: relative;
  min-height: 32px;
  padding: 0 12px 0 18px;
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--accent-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease;
}

.shell-meta-chip::before {
  content: "·";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  line-height: 1;
  color: color-mix(in srgb, var(--accent-rose) 60%, transparent);
  transition: color 0.16s ease, font-weight 0.16s ease;
}

.shell-meta-chip:hover {
  border-color: color-mix(in srgb, var(--accent-rose) 40%, var(--border));
  color: var(--text-primary);
}

.shell-meta-chip:hover::before {
  color: var(--accent-rose);
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
  border: 1px solid color-mix(in srgb, var(--accent-rose) 22%, var(--border));
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
  color: color-mix(in srgb, var(--accent-rose) 60%, transparent);
  transition: color 0.16s ease, font-weight 0.16s ease;
}

.shell-storage-chip:hover {
  border-color: color-mix(in srgb, var(--accent-rose) 40%, var(--border));
}

.shell-storage-chip:hover::before {
  color: var(--accent-rose);
  font-weight: 900;
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
    padding: 0 12px;
  }

  /* V3 (2026-06-25): roman numeral stamp stays visible at ≤760px so
     the archive folio language reads on mobile. Old behavior hid the
     index and let the labels stand alone; that read as plain text
     tabs. With the LXGW Ⅰ-Ⅴ mark + small font + reduced letter-
     spacing, the row fits the mast width without overflow. */
  .shell-tab__index {
    font-size: 11px;
  }

  .shell-tab__label {
    font-size: 12px;
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

/* V3 (2026-06-25): the .theme-kao .shell-mast overrides that used to
   sit here were redundant — kao.css owns the kao mast baseline now
   (V3 paper-fiber: flat archive-paper surface + 1px archive-gold
   14% bottom edge + ::before speckle overlay; no backdrop-filter, no
   box-shadow). The legacy ::before paper-grain overlay that was
   here is now ALSO owned by kao.css (the same 3-stop radial-gradient
   speckle layer used by .is-archive-paper is shared with the mast).
   Keeping a redundant rule here would re-introduce the SaaS blur. */
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

/* V3 (2026-06-25): kao archive-folio overrides for the mast tab /
   chip stamp language. The .shell-tab-indicator slide bar is GONE
   (V3 deletes V2's 2px accent bar — replaced by the archive-rose
   ◆ ::before stamp on active tabs). Tabs read as paper-tear
   dashed dividers (border-left 1px dashed archive-gold 18%) +
   roman numeral stamp + ink-dot chip language. */
.theme-kao .shell-tabbar {
  gap: 0;
}

.theme-kao .shell-tab {
  min-height: 38px;
  border-left-color: color-mix(in srgb, var(--archive-gold) 18%, transparent);
  background: transparent;
  color: var(--archive-ink-soft);
}

.theme-kao .shell-tab:hover {
  background: color-mix(in srgb, var(--archive-paper) 80%, transparent);
  color: var(--archive-ink);
}

.theme-kao .shell-tab.active {
  background: transparent;
  color: var(--archive-ink);
}

/* V3: active tab's archive-rose ◆ stamp. Uses --archive-rose (the
   kao pink-ink stamp color) instead of --accent (the SaaS blue) so
   the mark reads as an archive-folio stamp, not a SaaS highlight. */
.theme-kao .shell-tab.active::before {
  color: color-mix(in srgb, var(--archive-rose) 88%, transparent);
}

.theme-kao .shell-tab__index {
  font-family: var(--font-display, "Iowan Old Style", "Songti SC", "STSong", Georgia, serif);
  color: var(--archive-ink-soft);
}

.theme-kao .shell-tab.active .shell-tab__index {
  color: var(--archive-ink);
}

.theme-kao .shell-tab__label {
  font-size: 13px;
}

/* V3: meta chip uses archive-rose 22% border + ink-dot prefix in
   archive-rose. Replaces V1's grey-rectangle-with-accent language. */
.theme-kao .shell-meta-chip {
  border-color: color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  background: transparent;
  color: var(--archive-ink);
}

.theme-kao .shell-meta-chip::before {
  color: color-mix(in srgb, var(--archive-rose) 60%, transparent);
}

.theme-kao .shell-meta-chip:hover {
  border-color: color-mix(in srgb, var(--archive-rose) 40%, var(--border));
  color: var(--archive-ink);
}

.theme-kao .shell-meta-chip:hover::before {
  color: var(--archive-rose);
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

/* V4 (2026-06-26): reduced-motion must disable the stamp micro-
   animation. The stamp still toggles content / opacity instantly,
   but transform and the longer transitions fall back to near-zero
   so vestibular-sensitive users never see the slide-in. The kao
   archive-rose color override above keeps the stamp visible. */
@media (prefers-reduced-motion: reduce) {
  .shell-tab::before {
    transition: opacity 0.01s ease, width 0.01s ease, margin-right 0.01s ease;
    transform: none;
  }
}
</style>
