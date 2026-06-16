<template>
  <div class="opening-view" :class="{ 'is-empty': !hasSelectedWorldbook }">
    <!-- 5C v3.5: CharacterBackdrop is the page background; it lives as a
         direct child of .opening-view (no .opening-shell wrapper). The
         toolbar floats above as a translucent bar (z-index 2) and the
         orbit panels sit inside the backdrop slot (z-index 1) above the
         art layer (z-index 0). -->
    <CharacterBackdrop
      v-if="hasSelectedWorldbook"
      :src="sceneBackgroundSrc"
      position="center"
      tint="archive-olive-strong"
      :tint-strength="34"
      :kicker="kicker"
      :status-line="statusLine"
    >
      <!-- 5C v3.10: 上半屏动态 — drifting dust motes.
           Positioned inside CharacterBackdrop BEFORE the orbit Transition
           so it sits at the backdrop level (above the art, below the
           orbit panels). aria-hidden: decorative only. -->
      <div class="dust-motes" aria-hidden="true"></div>
      <!-- 5C v3 P1.A: panels "orbit" the figure's negative space. The
           Transition fires when currentScenePoseId changes; in v0 all
           stub poses share the same bbox so the drift is a small reset
           (wiring is in place for v1 per-pose bboxes). -->
      <Transition name="orbit-drift">
        <!-- :key on the orbit div drives the orbit-drift transition; the
             archive-strip below also reads currentScenePoseId (active-pose-id)
             to mirror the active tile, but only the orbit uses it as a
             transition key on purpose. -->
        <div :key="currentScenePoseId" class="opening-orbit">
          <section class="opening-copy">
            <div class="opening-kicker-stack">
              <span v-if="playableWorldGenre" class="opening-world-kicker">{{ playableWorldGenre }}</span>
              <span class="opening-phase-tag">{{ showOpeningActionCard ? 'SCENE' : 'LIVE' }}</span>
            </div>

            <div class="opening-title-block">
              <strong>{{ hasSelectedWorldbook ? playableWorldTitle : '还没有选中世界' }}</strong>
              <p v-if="hasSelectedWorldbook && playableWorldDeck">{{ playableWorldDeck }}</p>
              <p v-else>先选择一个世界，再从开场页进入当前冒险。</p>
            </div>

            <div v-if="hasSelectedWorldbook" class="opening-briefing" aria-label="进入前摘要">
              <div class="opening-mission">
                <span>开场钩子</span>
                <strong>{{ playableWorldHookLead }}</strong>
              </div>
              <div class="opening-pressure-grid">
                <div v-for="item in playableWorldPressureCards" :key="item.label">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>

            <div v-if="hasSelectedWorldbook && showOpeningActionCard" class="opening-action-actions">
              <BookmarkButton
                class="action-btn stage-command stage-command--primary"
                type="button"
                :disabled="gameStore.isLoading || isStarting"
                index="01"
                label="开局"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="sendOpeningAction"
              />
              <BookmarkButton
                class="action-btn stage-command stage-command--secondary"
                type="button"
                index="02"
                label="改写"
                variant="secondary"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="dismissOpeningActionCard"
              />
            </div>
          </section>

          <section v-if="hasSelectedWorldbook" class="opening-scene">
            <CharacterArchiveStrip
              :tiles="openingActionStubTiles"
              role="scene-switcher"
              :active-pose-id="currentScenePoseId"
              aria-label="切换场景背景"
              @select="onSceneSelect"
            />
          </section>
        </div>
      </Transition>
    </CharacterBackdrop>

    <header class="opening-toolbar">
      <div class="opening-toolbar__actions">
        <div class="opening-world-card">
          <span class="opening-world-card__eyebrow">SELECTED WORLD</span>
          <select
            class="opening-world-select"
            v-model="selectedWorldbookId"
            aria-label="选择可玩的世界"
            @change="onWorldbookChange"
          >
            <option value="">选择一个可玩的世界...</option>
            <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
              {{ wb.name }}
            </option>
          </select>
        </div>
        <button class="opening-rail-btn opening-rail-btn--primary" type="button" data-rail-index="01" @click="openWorldbookQuickImport">
          <span>换世界</span>
          <strong>CHANGE</strong>
        </button>
        <button class="opening-rail-btn" type="button" data-rail-index="02" @click="toggleTheme">
          <span>{{ isDark ? '暗色' : '亮色' }}</span>
          <strong>{{ isDark ? 'MOON' : 'SUN' }}</strong>
        </button>
      </div>
    </header>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { useTheme } from '../composables/useTheme'
import { useCharacterArt } from '@/composables/useCharacterArt'
import { useSceneBackground } from '@/composables/useSceneBackground'
import ArchiveStrip from '../components/folio/ArchiveStrip.vue'
import BookmarkButton from '../components/folio/BookmarkButton.vue'
import CharacterBackdrop from '@/components/folio/CharacterBackdrop.vue'
import CharacterArchiveStrip from '@/components/folio/CharacterArchiveStrip.vue'
import {
  buildPlayableWorldActionHooks,
  clearPlayableWorldEntryIntent,
  getPlayableWorldEntryIntent
} from '../services/playableWorldEntry'

const gameStore = useGameStore()
const worldStore = useWorldStore()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()

const selectedWorldbookId = ref('')
const selectedOpeningActionId = ref('')
const openingCardDismissed = ref(false)
const storedOpeningIntent = ref(null)
const isStarting = ref(false)
const worldImageUrl = ref(null)

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbook = computed(() => worldStore.activeWorldbook || null)
const hasSelectedWorldbook = computed(() => Boolean(selectedWorldbookId.value && activeWorldbook.value))
const { resolveArt } = useCharacterArt()
const { currentScenePoseId, setScene } = useSceneBackground()
// 5C: scene background flows through CharacterBackdrop, sourced from
// useSceneBackground (shared with CharacterArchiveStrip in scene-switcher role).
const sceneBackgroundSrc = computed(() => resolveArt({ poseId: currentScenePoseId.value }).src)
function onSceneSelect(poseId) {
  setScene(poseId)
}
const playableWorldTitle = computed(() => {
  if (!hasSelectedWorldbook.value) return ''
  return activeWorldbook.value?.name || '未命名世界'
})
const playableWorldGenre = computed(() => {
  if (!hasSelectedWorldbook.value) return ''
  return activeWorldbook.value?.genreLabel || activeWorldbook.value?.sourceLabel || ''
})
const playableWorldDescription = computed(() => {
  if (!hasSelectedWorldbook.value) return ''
  return activeWorldbook.value?.worldDescription || activeWorldbook.value?.description || ''
})
const playableWorldDeck = computed(() => {
  if (!hasSelectedWorldbook.value) return ''
  return activeWorldbook.value?.description || playableWorldDescription.value || ''
})
const openingActionHooks = computed(() => buildPlayableWorldActionHooks(activeWorldbook.value))
const selectedOpeningAction = computed(() => {
  const hooks = openingActionHooks.value
  if (!hooks.length) return null
  const storedAction = storedOpeningIntent.value?.worldbookId === activeWorldbook.value?.id
    ? storedOpeningIntent.value?.action
    : null
  const selected = hooks.find((action) => action.id === selectedOpeningActionId.value)
  return selected || storedAction || hooks[0]
})
const activeEntryList = computed(() => Array.isArray(activeWorldbook.value?.entries) ? activeWorldbook.value.entries : [])
const playableWorldPressureCards = computed(() => {
  const organizations = getActiveEntryNames('organization', 2)
  const locations = getActiveEntryNames('location', 1)
  return [
    {
      label: '现场',
      value: locations[0] || selectedOpeningAction.value?.title || activeWorldbook.value?.name || '未标注'
    },
    {
      label: '阻力',
      value: organizations.length >= 2 ? `${organizations[0]} / ${organizations[1]}` : (organizations[0] || '未标注')
    },
    {
      label: '出口',
      value: Array.isArray(activeWorldbook.value?.creativeExits) && activeWorldbook.value.creativeExits.length
        ? activeWorldbook.value.creativeExits.slice(0, 2).join(' / ')
        : '章节 / 素材 / 分镜'
    }
  ]
})
const playableWorldHookLead = computed(() => {
  if (!hasSelectedWorldbook.value) return ''
  return activeWorldbook.value?.openingHook || selectedOpeningAction.value?.label || activeWorldbook.value?.name || ''
})
const openingSceneCards = computed(() => {
  const locations = getActiveEntryNames('location', 2)
  const organizations = getActiveEntryNames('organization', 2)
  const events = getActiveEntryNames('event', 2)
  return {
    location: locations[0] || selectedOpeningAction.value?.title || activeWorldbook.value?.name || '未标注',
    faction: organizations[0] || '未标注',
    event: events[0] || '未标注'
  }
})
const playableWorldArchiveItems = computed(() => [
  { label: '01' },
  { label: '02' },
  { label: '03' }
])
const openingActionStubTiles = computed(() => [
  { poseId: 'opening-scene-01', kicker: '01 边界小镇' },
  { poseId: 'opening-scene-02', kicker: '02 废墟灯塔' },
  { poseId: 'opening-scene-03', kicker: '03 塔内档案室' },
])
// 5C v3.9b (Arknights pattern 1): kicker + statusLine derived from the
// active scene pose. The text updates as the user switches scenes via
// CharacterArchiveStrip — the art "talks" to the page via scene copy.
const SCENE_COPY = {
  'opening-scene-01': { kicker: '01 / BORDER TOWN', statusLine: '那天的海风带着薄雾' },
  'opening-scene-02': { kicker: '02 / RUINED LIGHTHOUSE', statusLine: '月光从裂缝里漏进来' },
  'opening-scene-03': { kicker: '03 / ARCHIVE ROOM', statusLine: '桌面上的灯油快见底了' },
}
const kicker = computed(() => SCENE_COPY[currentScenePoseId.value]?.kicker || '')
const statusLine = computed(() => SCENE_COPY[currentScenePoseId.value]?.statusLine || '')
const showOpeningActionCard = computed(() => {
  return hasSelectedWorldbook.value &&
    !openingCardDismissed.value &&
    openingActionHooks.value.length > 0
})

onMounted(async () => {
  await worldStore.loadWorldbooksIndex()
  gameStore.loadSessions()
  refreshOpeningIntent()

  const intentWorldbookId = storedOpeningIntent.value?.worldbookId || ''
  const hasIntentWorldbook = Boolean(intentWorldbookId && worldbooksIndex.value.some((wb) => wb.id === intentWorldbookId))

  if (hasIntentWorldbook) {
    await worldStore.setActiveWorldbook(intentWorldbookId)
  } else if (worldStore.activeWorldbookId) {
    await worldStore.setActiveWorldbook(worldStore.activeWorldbookId)
  } else {
    await worldStore.ensureActiveWorldbook()
  }

  selectedWorldbookId.value = worldStore.activeWorldbookId || ''
  refreshOpeningIntent()
})

watch(() => worldStore.activeWorldbookId, (nextId) => {
  const normalized = nextId || ''
  if (selectedWorldbookId.value !== normalized) {
    selectedWorldbookId.value = normalized
  }
  openingCardDismissed.value = false
  refreshOpeningIntent()
})

async function onWorldbookChange() {
  const worldbookId = selectedWorldbookId.value
  if (!worldbookId) return

  await worldStore.setActiveWorldbook(worldbookId)
  openingCardDismissed.value = false
  refreshOpeningIntent()
}

function openWorldbookQuickImport() {
  router.push({ name: 'experience-worldbook' })
}

function refreshOpeningIntent() {
  const intent = getPlayableWorldEntryIntent()
  storedOpeningIntent.value = intent
  if (intent?.worldbookId === activeWorldbook.value?.id && intent?.action?.id) {
    selectedOpeningActionId.value = intent.action.id
  } else {
    selectedOpeningActionId.value = ''
  }
}

async function ensureWorldAdventureSession({ initIfEmpty = true } = {}) {
  if (isStarting.value) return
  try {
    isStarting.value = true
    const worldbookId = selectedWorldbookId.value || worldStore.activeWorldbookId || ''
    if (!worldbookId) {
      openWorldbookQuickImport()
      return
    }

    const existing = gameStore.getLatestSessionForWorldbook(worldbookId)

    if (existing) {
      gameStore.loadSession(existing.id)
      await worldStore.setActiveWorldbook(existing.worldbookId || existing.worldId || worldbookId)
      selectedWorldbookId.value = existing.worldbookId || existing.worldId || worldbookId
    } else {
      await worldStore.setActiveWorldbook(worldbookId)
      selectedWorldbookId.value = worldbookId
      gameStore.createSession({
        title: `${worldStore.activeWorldbook?.name || '世界'} · 冒险`,
        worldbookId,
        inheritRuntimeState: false,
      })
    }

    if (initIfEmpty && (!gameStore.messages || gameStore.messages.length === 0)) {
      await gameStore.initGame()
    }
    refreshOpeningIntent()
    return true
  } finally {
    isStarting.value = false
  }
}

async function sendOpeningAction() {
  const action = selectedOpeningAction.value
  if (!action?.command) return
  const ready = await ensureWorldAdventureSession({ initIfEmpty: false })
  if (!ready) return
  clearPlayableWorldEntryIntent()
  await gameStore.sendAction(action.command, { hidden: true })
  router.push({ name: 'experience' })
}

function dismissOpeningActionCard() {
  openingCardDismissed.value = true
  clearPlayableWorldEntryIntent()
  router.push({ name: 'experience-worldbook' })
}

function getActiveEntryNames(typeValue, limit = 3) {
  return activeEntryList.value
    .filter((entry) => String(entry?.type || '').trim() === typeValue)
    .map((entry) => String(entry?.name || '').trim())
    .filter(Boolean)
    .slice(0, limit)
}
</script>

<style scoped>
/* 5C v3.5: kill the card frame.
   .opening-view is now full-bleed (no padding, no gradient — the
   CharacterBackdrop IS the page background). The toolbar floats as a
   translucent bar at the top (z-index 2), the orbit panels live inside
   the backdrop's slot (z-index 1) above the art (z-index 0). */
.opening-view {
  min-height: var(--app-viewport-height, 100vh);
  position: relative;
  isolation: isolate;
  color: var(--text-primary);
}

/* 5C v3.7: drop the panel chrome — text and tiles sit directly on the
   art. Toolbar keeps its flex layout but loses background / border /
   box-shadow / rose hinge. Spacing via padding only. */
.opening-toolbar {
  position: absolute;
  top: 18px;
  left: 18px;
  right: 18px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 16px;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.opening-world-kicker,
.opening-kicker {
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
}

.opening-toolbar__actions {
  position: relative;
  margin-left: auto;
  display: grid;
  align-items: center;
  justify-items: end;
  gap: 9px;
  width: min(318px, 34vw);
  padding-left: 20px;
}

.opening-toolbar__actions::before {
  content: "";
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 5px;
  width: 1px;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--archive-gold) 70%, transparent) 18% 78%, transparent);
  box-shadow: 0 0 18px color-mix(in srgb, var(--archive-gold) 28%, transparent);
}

.opening-toolbar__actions::after {
  content: "";
  position: absolute;
  top: 20px;
  left: 1px;
  width: 9px;
  height: 9px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 62%, transparent);
  background: color-mix(in srgb, var(--archive-ink) 60%, transparent);
  transform: rotate(45deg);
}

.opening-world-card,
.opening-rail-btn {
  position: relative;
  width: min(318px, 100%);
  color: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 30%, transparent);
  background:
    linear-gradient(110deg, color-mix(in srgb, var(--archive-paper) 7%, transparent) 0 1px, transparent 1px 100%),
    linear-gradient(135deg, color-mix(in srgb, var(--archive-olive-strong) 76%, transparent), color-mix(in srgb, #000 44%, transparent)),
    color-mix(in srgb, var(--archive-ink) 42%, transparent);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px) saturate(1.08);
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
}

.opening-world-card::before,
.opening-rail-btn::before {
  content: "";
  position: absolute;
  inset: 5px;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--archive-paper) 10%, transparent);
  clip-path: inherit;
}

.opening-world-card {
  display: grid;
  gap: 4px;
  padding: 10px 12px 12px;
}

.opening-world-card__eyebrow,
.opening-rail-btn strong {
  color: var(--archive-gold);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.68);
}

.opening-world-select {
  width: 100%;
  min-height: 34px;
  padding: 0 28px 0 0;
  color: var(--archive-paper);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  background: transparent;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 38%, transparent);
  outline: none;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.68);
}

.opening-world-select option {
  color: var(--archive-ink);
  background: var(--archive-paper);
}

.opening-rail-btn {
  min-height: 54px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 0 14px 0 16px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, filter 180ms ease;
}

.opening-rail-btn::after {
  content: attr(data-rail-index);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  grid-column: 1;
  grid-row: 1;
  color: color-mix(in srgb, var(--archive-gold) 82%, var(--archive-paper));
  border-right: 1px solid color-mix(in srgb, var(--archive-gold) 32%, transparent);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 13px;
  font-style: italic;
  font-weight: 900;
}

.opening-rail-btn span {
  min-width: 0;
  grid-column: 2;
  color: var(--archive-paper);
  font-size: 15px;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.68);
}

.opening-rail-btn strong {
  grid-column: 3;
}

.opening-rail-btn--primary {
  background:
    linear-gradient(122deg, color-mix(in srgb, var(--archive-olive-strong) 82%, #000) 0 62%, color-mix(in srgb, var(--archive-gold) 74%, #7a5a24) 62% 100%);
}

.opening-rail-btn:hover {
  transform: translateX(-6px);
  border-color: color-mix(in srgb, var(--archive-gold) 62%, transparent);
  filter: brightness(1.05);
}

.opening-copy,
.opening-scene {
  position: relative;
  z-index: 1;
  min-width: 0;
}

/* 5C v3.5: panel-slot orbit layer. Now sits inside CharacterBackdrop's
   slot (not inside a .opening-shell card). The 88px top padding
   reserves space for the floating toolbar (top: 18px + ~50px tall +
   20px gap). pointer-events: none on the orbit lets clicks pass
   through to the backdrop art where the panels don't cover; children
   opt back in. */
.opening-orbit {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(320px, 0.78fr);
  gap: 30px;
  padding: 88px 40px 40px;
  pointer-events: none;
  z-index: 1;
}
.opening-orbit > .opening-copy,
.opening-orbit > .opening-scene {
  pointer-events: auto;
}

/* 5C v3 P1.A: orbit-drift transition. When currentScenePoseId changes,
   the :key swap triggers an 8px translate between old slot → new slot
   (320ms, easing for a soft folio page turn). */
.orbit-drift-enter-active,
.orbit-drift-leave-active {
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
              opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.orbit-drift-enter-from {
  transform: translateY(8px);
  opacity: 0;
}
.orbit-drift-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .orbit-drift-enter-active,
  .orbit-drift-leave-active {
    transition: none;
  }
}

/* 5C v3.7: drop the panel chrome — no background / border / box-shadow
   / panel padding. Text and tiles sit directly on the art. Color flips
   to cream via --text-primary so text reads on the dark olive backdrop. */
.opening-copy {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 18px;
  align-content: start;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  color: var(--text-primary);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
}

.opening-copy h1, .opening-copy h2, .opening-copy h3, .opening-copy strong {
  color: var(--text-primary);
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.7), 0 0 32px rgba(0, 0, 0, 0.5);
}

.opening-copy p, .opening-copy span, .opening-copy li {
  color: var(--text-primary);
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.7), 0 0 32px rgba(0, 0, 0, 0.5);
}

.opening-kicker-stack,
.opening-action-head {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.opening-kicker-stack > *,
.opening-action-head span {
  color: var(--archive-paper);
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
}

.opening-phase-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 10px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--archive-paper) 80%, transparent), color-mix(in srgb, var(--archive-rose) 34%, transparent));
  color: color-mix(in srgb, var(--archive-rose) 88%, var(--archive-ink));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.opening-title-block {
  display: grid;
  gap: 10px;
}

.opening-title-block strong {
  position: relative;
  max-width: 8ch;
  color: var(--archive-paper);
  font-family: "Iowan Old Style", "Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif;
  font-size: clamp(48px, 6.5vw, 96px);
  font-style: italic;
  font-weight: 760;
  line-height: 0.92;
  letter-spacing: 0.02em;
  transform: skewX(-4deg);
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.7), 0 0 32px rgba(0, 0, 0, 0.5);
  animation: titleGlow 4.8s ease-in-out infinite alternate;
}
@keyframes titleGlow {
  from { text-shadow: 0 0 8px rgba(0,0,0,0.5), 0 0 12px rgba(0,0,0,0.3); }
  to   { text-shadow: 0 0 20px rgba(0,0,0,0.7), 0 0 40px rgba(0,0,0,0.5); }
}
@media (prefers-reduced-motion: reduce) {
  .opening-title-block strong {
    animation: none;
  }
}

.opening-title-block p,
.opening-page-lead p {
  margin: 0;
  color: var(--archive-paper);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.58;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.7), 0 0 32px rgba(0, 0, 0, 0.5);
}

.opening-briefing {
  display: grid;
  gap: 14px;
  padding-top: 16px;
}

.opening-mission {
  display: grid;
  gap: 6px;
  padding-bottom: 12px;
}

.opening-mission span,
.opening-pressure-grid span,
.opening-page-lead span,
.opening-page-facts span {
  color: var(--archive-paper-soft);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
}

.opening-mission strong {
  max-width: 18ch;
  color: var(--archive-paper);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(20px, 2.4vw, 32px);
  font-weight: 800;
  line-height: 1.14;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
}

.opening-pressure-grid,
.opening-page-facts {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
}

.opening-pressure-grid div,
.opening-page-facts div {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 10px 10px 10px 0;
}

.opening-pressure-grid strong,
.opening-page-facts strong {
  color: var(--archive-paper);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
}

/* 5C v3.7: drop the panel chrome — same treatment as .opening-copy.
   The scene strip (CharacterArchiveStrip) sits directly on the art. */
.opening-scene {
  display: grid;
  gap: 14px;
  align-content: end;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  color: var(--text-primary);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
}

/* 5C v3.7: postage-stamp row floats bottom-center of the page on the
   art, no longer nested inside the (gone) copy panel. */
.opening-action-actions {
  position: absolute;
  bottom: 38px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 18px;
  z-index: 3;
}

.opening-action-actions--primary {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 18%, transparent);
}

/* 5C v3.7: .stage-command becomes a postage stamp — notched clip-path,
   solid cream paper, tilted + skewed, hard 2px offset shadow. */
.stage-command {
  --command-tilt: -12deg;
  position: relative;
  min-width: 210px;
  min-height: 72px;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: stretch;
  padding: 0 20px 0 0;
  background:
    linear-gradient(122deg, color-mix(in srgb, var(--archive-olive-strong) 88%, #000) 0 64%, color-mix(in srgb, var(--archive-gold) 88%, #8b6426) 64% 100%);
  color: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-radius: 0;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
  transform: rotate(var(--command-tilt)) skewX(-2deg);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--archive-ink) 88%, #000), 0 16px 40px rgba(0, 0, 0, 0.28);
}

.stage-command--secondary {
  --command-tilt: -10deg;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 94%, transparent) 0 66%, color-mix(in srgb, var(--archive-olive) 70%, var(--archive-olive-strong)) 66% 100%);
  color: var(--archive-ink);
  transform: rotate(var(--command-tilt)) skewX(-2deg);
}

.stage-command--compact {
  min-width: 160px;
  min-height: 54px;
  grid-template-columns: 48px minmax(0, 1fr);
  padding-right: 14px;
}

.stage-command :deep(.stage-command__index) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 24px;
  font-weight: 900;
  background: color-mix(in srgb, #000 16%, transparent);
}

.stage-command--compact :deep(.stage-command__index) {
  font-size: 11px;
}

.stage-command :deep(.stage-command__label) {
  min-width: 0;
  padding-left: 16px;
  display: inline-flex;
  align-items: center;
  color: inherit;
  font-size: 22px;
  font-weight: 900;
  line-height: 1.05;
}

.stage-command--compact :deep(.stage-command__label) {
  padding-left: 6px;
  font-size: 10px;
}

@media (max-width: 980px) {
  .opening-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .opening-toolbar__actions {
    width: min(460px, 100%);
    justify-items: stretch;
  }

  .opening-world-card,
  .opening-rail-btn {
    width: 100%;
  }

  .opening-orbit {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .opening-copy,
  .opening-scene {
    padding: 0;
  }
}

@media (max-width: 640px) {
  .opening-view {
    /* v3.5: no padding on the view (full-bleed); tighten the orbit + toolbar. */
  }

  .opening-toolbar {
    top: 12px;
    left: 12px;
    right: 12px;
  }

  .opening-orbit {
    padding: 76px 14px 14px;
  }

  .opening-pressure-grid,
  .opening-page-facts {
    grid-template-columns: 1fr;
  }

  .opening-pressure-grid div,
  .opening-page-facts div {
    padding-right: 0;
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 12%, transparent);
  }

  .opening-pressure-grid div:last-child,
  .opening-page-facts div:last-child {
    border-bottom: none;
  }

  .opening-world-select,
  .opening-toolbar__actions {
    width: 100%;
  }

  .opening-action-actions .stage-command {
    width: 138px;
    min-width: 138px;
    min-height: 52px;
    grid-template-columns: 42px minmax(0, 1fr);
    flex: 0 0 138px;
  }

  .stage-command :deep(.stage-command__index) {
    font-size: 16px;
  }

  .stage-command :deep(.stage-command__label) {
    padding-left: 10px;
    font-size: 16px;
  }
}
</style>
