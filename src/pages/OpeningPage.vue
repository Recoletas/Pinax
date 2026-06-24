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
              <strong class="opening-embedded-title" :aria-label="embeddedTitleText">
                <span
                  v-for="glyph in embeddedTitleGlyphs"
                  :key="glyph.key"
                  class="opening-embedded-title__glyph"
                  aria-hidden="true"
                  :style="glyph.style"
                >
                  {{ glyph.char }}
                </span>
              </strong>
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
const embeddedTitleText = computed(() => hasSelectedWorldbook.value ? playableWorldTitle.value : '还没有选中世界')
const embeddedTitleGlyphs = computed(() => {
  const chars = Array.from(embeddedTitleText.value || '')
  const center = (chars.length - 1) / 2
  return chars.map((char, index) => {
    const offset = index - center
    const lift = Math.abs(offset) * Math.abs(offset) * 1.72 + Math.max(0, offset) * 4.2
    const rotate = offset * 2.55
    const depth = Math.abs(offset) * 0.04
    return {
      char,
      key: `${char}-${index}`,
      style: {
        '--glyph-y': `${lift.toFixed(2)}px`,
        '--glyph-rotate': `${rotate.toFixed(2)}deg`,
        '--glyph-depth': depth.toFixed(2),
      },
    }
  })
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
  router.push({ name: 'settings-worldbook' })
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
  router.push({ name: 'settings-worldbook' })
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
  --opening-copy-arc: 5deg;
  --opening-copy-skew: -8deg;
  --opening-rail-slope: -8deg;
  --opening-surface-shadow: -2px 4px 14px color-mix(in srgb, #000 48%, transparent);
  --opening-surface-glow: 1px -1px 0 color-mix(in srgb, var(--archive-gold) 20%, transparent);
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
  gap: 12px;
  width: min(354px, 35vw);
  padding-left: 24px;
  transform: perspective(1000px) rotateZ(var(--opening-rail-slope)) rotateY(-8deg) skewX(-7deg);
  transform-origin: top right;
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
  width: min(342px, 100%);
  color: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 30%, transparent);
  background:
    linear-gradient(110deg, color-mix(in srgb, var(--archive-paper) 7%, transparent) 0 1px, transparent 1px 100%),
    linear-gradient(135deg, color-mix(in srgb, var(--archive-olive-strong) 76%, transparent), color-mix(in srgb, #000 44%, transparent)),
    color-mix(in srgb, var(--archive-ink) 42%, transparent);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px) saturate(1.08);
  clip-path: polygon(3% 0, 96% 0, 100% 15%, 94% 100%, 0 86%, 7% 18%);
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
  transform: translateX(2px) rotateZ(1.5deg);
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

.opening-rail-btn:nth-of-type(1) {
  transform: translate(-22px, 4px) rotateZ(1deg);
}

.opening-rail-btn:nth-of-type(2) {
  transform: translate(-4px, 10px) rotateZ(2deg) scaleX(0.94);
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
  transform: translate(-28px, 8px) rotateZ(1deg);
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
  grid-template-columns: minmax(0, 1fr);
  gap: 30px;
  padding: 112px 28px 40px;
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
  width: min(900px, 56vw);
  transform: translate(-10px, 34px);
  transform-origin: 8% 18%;
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
  gap: 12px;
  max-width: min(880px, 55vw);
  transform-origin: left top;
  transform: perspective(1200px) rotateZ(var(--opening-copy-arc)) rotateY(-11deg) skewX(var(--opening-copy-skew));
}

.opening-title-block p,
.opening-briefing {
  transform: perspective(1000px) rotateY(-6deg) translateY(14px) rotateZ(1.2deg);
  transform-origin: left center;
  mix-blend-mode: screen;
}

.opening-title-block strong {
  position: relative;
  max-width: 8ch;
  display: inline-flex;
  align-items: flex-start;
  width: fit-content;
  color: var(--archive-paper);
  font-family: "Iowan Old Style", "Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif;
  font-size: clamp(48px, 6.5vw, 96px);
  font-style: italic;
  font-weight: 760;
  line-height: 0.92;
  letter-spacing: -0.015em;
  transform: perspective(900px) rotateY(-16deg) rotateZ(2deg) skewX(-5deg);
  transform-origin: 12% 58%;
  mix-blend-mode: soft-light;
  -webkit-text-stroke: 1px color-mix(in srgb, var(--archive-paper) 38%, transparent);
  text-shadow:
    0 1px 0 color-mix(in srgb, #000 54%, transparent),
    var(--opening-surface-shadow),
    var(--opening-surface-glow);
  filter: drop-shadow(0 10px 18px color-mix(in srgb, #000 30%, transparent));
  opacity: 0.96;
  animation: titleGlow 4.8s ease-in-out infinite alternate;
}

.opening-title-block strong::before {
  content: "";
  position: absolute;
  inset: -0.08em -0.14em -0.06em -0.12em;
  z-index: -1;
  background:
    radial-gradient(ellipse at 24% 46%, color-mix(in srgb, var(--archive-paper) 11%, transparent), transparent 58%),
    linear-gradient(105deg, transparent 0 18%, color-mix(in srgb, var(--archive-gold) 9%, transparent) 38% 58%, transparent 74% 100%);
  border-radius: 48% 42% 54% 40%;
  transform: rotate(3deg) skewX(-6deg);
  mix-blend-mode: screen;
  opacity: 0.62;
}

.opening-embedded-title__glyph {
  display: inline-block;
  transform: translateY(var(--glyph-y)) rotate(var(--glyph-rotate)) scale(calc(1 - var(--glyph-depth)));
  transform-origin: 50% 70%;
}

@keyframes titleGlow {
  from {
    filter: drop-shadow(0 8px 15px color-mix(in srgb, #000 24%, transparent));
  }
  to {
    filter: drop-shadow(0 11px 22px color-mix(in srgb, #000 34%, transparent));
  }
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
  max-width: 58ch;
  text-shadow:
    0 1px 0 color-mix(in srgb, #000 54%, transparent),
    var(--opening-surface-shadow),
    0 0 20px color-mix(in srgb, var(--archive-paper) 12%, transparent);
}

.opening-briefing {
  display: grid;
  gap: 14px;
  padding-top: 16px;
  max-width: min(780px, 50vw);
  margin-left: 4px;
}

.opening-mission {
  display: grid;
  gap: 6px;
  padding-bottom: 12px;
  transform: translateY(18px) rotateZ(2.4deg);
  transform-origin: left center;
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
  text-shadow:
    0 1px 0 color-mix(in srgb, #000 54%, transparent),
    var(--opening-surface-shadow);
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
  transform: translateY(34px) rotateZ(3.4deg) skewX(-6deg);
  transform-origin: left center;
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
  text-shadow:
    0 1px 0 color-mix(in srgb, #000 54%, transparent),
    var(--opening-surface-shadow);
}

/* 5C v3.7: drop the panel chrome — same treatment as .opening-copy.
   The scene strip (CharacterArchiveStrip) sits directly on the art. */
.opening-scene {
  position: absolute;
  right: clamp(-86px, -3.2vw, -34px);
  bottom: -86px;
  width: min(720px, 39vw);
  height: 270px;
  display: block;
  padding: 0;
  margin: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  color: var(--text-primary);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  transform: perspective(1100px) rotateZ(-5deg) rotateY(13deg);
  transform-origin: right bottom;
  overflow: visible;
}

.opening-scene :deep(.character-archive-strip) {
  position: absolute;
  inset: auto 0 0 auto;
  width: 100%;
  height: 100%;
  display: block;
  transform: none;
}

.opening-scene :deep(.character-archive-strip__tile) {
  position: absolute;
  bottom: 0;
  width: 34%;
  min-height: 210px;
  overflow: hidden;
  clip-path: polygon(10% 18%, 100% 0, 92% 100%, 0 86%);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 46%, transparent);
  background: color-mix(in srgb, var(--archive-ink) 42%, transparent);
  box-shadow: 0 16px 34px color-mix(in srgb, #000 42%, transparent);
  transform-origin: 50% 100%;
}

.opening-scene :deep(.character-archive-strip__tile:nth-child(1)) {
  left: 7%;
  transform: translateY(112px) rotateZ(-10deg) scale(0.66);
  z-index: 1;
}

.opening-scene :deep(.character-archive-strip__tile:nth-child(2)) {
  left: 33%;
  transform: translateY(48px) rotateZ(-2deg) scale(0.9);
  z-index: 3;
}

.opening-scene :deep(.character-archive-strip__tile:nth-child(3)) {
  left: 61%;
  transform: translateY(102px) rotateZ(9deg) scale(0.66);
  z-index: 2;
}

.opening-scene :deep(.character-archive-strip__switcher.is-active) {
  transform: translateY(10px) rotateZ(-2deg) scale(1.02);
}

.opening-scene :deep(.character-archive-strip__kicker) {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 7px;
  padding: 4px 0 0;
  color: color-mix(in srgb, var(--archive-gold) 84%, var(--archive-paper));
  background: linear-gradient(180deg, transparent, color-mix(in srgb, #000 62%, transparent));
  text-shadow: 0 1px 8px color-mix(in srgb, #000 80%, transparent);
}

/* 5C v3.7: postage-stamp row floats bottom-center of the page on the
   art, no longer nested inside the (gone) copy panel. */
.opening-action-actions {
  position: absolute;
  bottom: clamp(132px, 15vh, 218px);
  left: clamp(92px, 7.4vw, 190px);
  transform: perspective(980px) rotateX(12deg) rotateY(-19deg) rotateZ(-8deg);
  transform-origin: left center;
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 0;
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
  --command-tilt: -1deg;
  position: relative;
  min-width: 264px;
  min-height: 88px;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: stretch;
  padding: 0 20px 0 0;
  background:
    linear-gradient(122deg, color-mix(in srgb, var(--archive-olive-strong) 88%, #000) 0 64%, color-mix(in srgb, var(--archive-gold) 88%, #8b6426) 64% 100%);
  color: var(--archive-paper);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  border-radius: 0;
  clip-path: polygon(0 8%, 78% 0, 100% 20%, 90% 100%, 10% 84%, 0 68%);
  transform: rotate(var(--command-tilt)) scale(1.14);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--archive-ink) 88%, #000), 0 16px 40px rgba(0, 0, 0, 0.28);
}

.stage-command--secondary {
  --command-tilt: 2deg;
  margin: -8px 0 0 -18px;
  min-width: 224px;
  min-height: 68px;
  grid-template-columns: 54px minmax(0, 1fr);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 94%, transparent) 0 66%, color-mix(in srgb, var(--archive-olive) 70%, var(--archive-olive-strong)) 66% 100%);
  color: var(--archive-ink);
  clip-path: polygon(6% 0, 100% 14%, 94% 82%, 18% 100%, 0 78%, 8% 18%);
  transform: rotate(var(--command-tilt)) scale(0.84);
  transform-origin: left center;
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
    transform: perspective(900px) rotateZ(-3deg) skewX(-3deg);
  }

  .opening-world-card,
  .opening-rail-btn {
    width: 100%;
  }

  .opening-orbit {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .opening-copy {
    width: min(100%, 720px);
  }

  .opening-title-block {
    max-width: min(100%, 720px);
  }

  .opening-scene {
    right: 18px;
    bottom: -72px;
    width: min(560px, 76vw);
    height: 220px;
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

  .opening-copy,
  .opening-title-block,
  .opening-title-block p,
  .opening-briefing,
  .opening-pressure-grid,
  .opening-toolbar__actions {
    transform: none;
  }

  .opening-copy,
  .opening-title-block,
  .opening-briefing {
    max-width: 100%;
    width: 100%;
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

  .opening-scene {
    position: relative;
    right: auto;
    bottom: auto;
    width: 100%;
    height: 160px;
    margin-top: 18px;
    transform: none;
  }

  .opening-scene :deep(.character-archive-strip__tile) {
    min-height: 128px;
  }

  .opening-action-actions .stage-command {
    width: 138px;
    min-width: 138px;
    min-height: 52px;
    grid-template-columns: 42px minmax(0, 1fr);
    flex: 0 0 138px;
  }

  .opening-action-actions {
    left: 14px;
    bottom: 18px;
    transform: rotateZ(-5deg);
  }

  .stage-command,
  .stage-command--secondary {
    transform: none;
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
