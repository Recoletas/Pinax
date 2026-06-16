<!--
  Frozen snapshot from 424fe28 feat(ui): Phase 1B ui-redesign (OpeningPage first added).
  Extracted 2026-06-15 by feat/theme-system-20260615 implementation.
  Note: the spec's named boundary 4e779d2 predates the standalone OpeningPage.vue
  (its content lived inside Experience.vue at 4e779d2). We snapshot from 424fe28,
  the earliest commit that ships the standalone archive-folio opening page.
  DO NOT MODIFY. This file is a visual fallback only.

  Allowed changes (per spec §7):
  - compile fixes required by current Vue/Vite/store contracts
  - wrapper adapters for renamed composables or store fields
  - accessibility / test IDs for the theme switcher
  - critical bug fixes that prevent the fallback from loading
-->
<template>
  <div class="opening-view" :style="{ '--hero-image': heroImage }">
    <header class="opening-toolbar">
      <div class="opening-toolbar__copy">
        <span>开场页</span>
        <strong>{{ hasSelectedWorldbook ? playableWorldTitle : '选择世界' }}</strong>
      </div>

      <div class="opening-toolbar__actions">
        <select
          class="opening-world-select"
          v-model="selectedWorldbookId"
          @change="onWorldbookChange"
        >
          <option value="">选择一个可玩的世界...</option>
          <option v-for="wb in worldbooksIndex" :key="wb.id" :value="wb.id">
            {{ wb.name }}
          </option>
        </select>
        <button class="opening-utility" type="button" @click="openWorldbookQuickImport">换世界</button>
        <button class="opening-utility" type="button" @click="toggleTheme">
          {{ isDark ? '暗色' : '亮色' }}
        </button>
      </div>
    </header>

    <main class="opening-shell" :class="{ 'is-empty': !hasSelectedWorldbook }">
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
      </section>

      <section v-if="hasSelectedWorldbook" class="opening-scene">
        <div class="opening-stage-poster" aria-hidden="true">
          <span class="opening-stage-poster__halo" aria-hidden="true"></span>
          <span class="opening-stage-badge">SCENE</span>
          <span class="opening-stage-roman">I</span>
          <span class="opening-stage-index">01</span>
          <span class="opening-stage-world">SCENE</span>
          <span class="opening-stage-title">{{ selectedOpeningAction?.title || openingSceneCards.location }}</span>
          <span class="opening-stage-sash"></span>
          <span class="opening-stage-blade"></span>
          <span class="opening-stage-grid"></span>
        </div>
        <ArchiveStrip class="opening-archive-strip" :items="playableWorldArchiveItems" aria-label="当前现场缩略条" />

        <section v-if="hasSelectedWorldbook" class="playable-world-opening-page" aria-label="开场页">
          <div class="opening-action-head">
            <span class="opening-kicker">开场页</span>
            <span class="opening-phase-tag">{{ showOpeningActionCard ? 'SCENE' : 'LIVE' }}</span>
            <div v-if="showOpeningActionCard" class="opening-action-actions">
              <BookmarkButton
                class="action-btn stage-command stage-command--compact stage-command--primary"
                type="button"
                size="micro"
                :disabled="gameStore.isLoading || isStarting"
                index="01"
                label="开局"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="sendOpeningAction"
              />
              <BookmarkButton
                class="action-btn stage-command stage-command--compact stage-command--secondary"
                type="button"
                size="micro"
                index="02"
                label="改写"
                variant="secondary"
                index-class="stage-command__index"
                label-class="stage-command__label"
                @click="dismissOpeningActionCard"
              />
            </div>
          </div>

          <div class="opening-page-lead">
            <span>开场钩子</span>
            <strong>{{ selectedOpeningAction?.title || openingSceneCards.location }}</strong>
            <p v-if="playableWorldHookLead">{{ playableWorldHookLead }}</p>
          </div>

          <div class="opening-page-facts" aria-label="开场页现场摘要">
            <div v-for="item in playableWorldOpeningFacts" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../../stores/gameStore'
import { useWorldStore } from '../../stores/worldStore'
import { useTheme } from '../../composables/useTheme'
import ArchiveStrip from '../../components/folio/ArchiveStrip.vue'
import BookmarkButton from '../../components/folio/BookmarkButton.vue'
import {
  buildPlayableWorldActionHooks,
  clearPlayableWorldEntryIntent,
  getPlayableWorldEntryIntent
} from '../../services/playableWorldEntry'

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
const heroImage = computed(() => {
  if (!hasSelectedWorldbook.value) return null
  return worldImageUrl.value || null
})
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
const playableWorldOpeningFacts = computed(() => {
  const exitValue = playableWorldPressureCards.value.find((item) => item.label === '出口')?.value || '章节 / 素材 / 分镜'
  return [
    { label: '现场', value: openingSceneCards.value.location },
    { label: '阻力', value: openingSceneCards.value.faction },
    { label: '出口', value: exitValue }
  ]
})
const playableWorldArchiveItems = computed(() => [
  { label: '01' },
  { label: '02' },
  { label: '03' }
])
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
  if (intent?.worldbookId === activeWorldbook.value?.id && intent.action?.id) {
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
.opening-view {
  min-height: var(--app-viewport-height, 100vh);
  padding: 18px;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--archive-gold) 16%, transparent), transparent 24%),
    linear-gradient(152deg, color-mix(in srgb, var(--archive-paper-soft) 96%, var(--bg-secondary)) 0%, color-mix(in srgb, var(--archive-paper) 92%, var(--bg-primary)) 66%, color-mix(in srgb, var(--archive-paper-strong) 84%, var(--bg-primary)) 100%);
}

.opening-toolbar {
  width: min(1240px, 100%);
  margin: 0 auto 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.opening-toolbar__copy {
  display: grid;
  gap: 3px;
}

.opening-toolbar__copy span,
.opening-world-kicker,
.opening-kicker {
  color: color-mix(in srgb, var(--archive-olive) 82%, var(--archive-ink));
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.opening-toolbar__copy strong {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 22px;
  line-height: 1;
}

.opening-toolbar__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.opening-world-select,
.opening-utility {
  min-height: 34px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 18%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 88%, transparent);
  color: var(--archive-ink);
  font: inherit;
}

.opening-world-select {
  width: min(280px, 100%);
  padding: 0 12px;
}

.opening-utility {
  padding: 0 12px;
  cursor: pointer;
}

.opening-shell {
  isolation: isolate;
  width: min(1240px, 100%);
  margin: 0 auto;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(320px, 0.78fr);
  gap: 30px;
  padding: 30px 34px;
  clip-path: polygon(0 24px, 26px 0, calc(100% - 44px) 0, 100% 44px, 100% 100%, 0 100%);
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 14%, transparent), transparent 96px),
    linear-gradient(160deg, color-mix(in srgb, var(--archive-paper-soft) 98%, #fff) 0%, color-mix(in srgb, var(--archive-paper) 96%, #f0e2cf) 56%, color-mix(in srgb, var(--archive-paper-strong) 90%, #d4c2aa) 100%);
  box-shadow:
    0 30px 58px color-mix(in srgb, #000 14%, transparent),
    18px 18px 0 color-mix(in srgb, var(--archive-olive-strong) 10%, transparent);
}

.opening-shell::before {
  content: '';
  position: absolute;
  inset: 16px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 14%, transparent);
  clip-path: polygon(0 16px, 20px 0, calc(100% - 34px) 0, 100% 32px, 100% 100%, 0 100%);
  pointer-events: none;
}

.opening-copy,
.opening-scene {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.opening-copy {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 18px;
  align-content: start;
  padding: 22px 28px 18px 4px;
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 22%, transparent), transparent 80px),
    repeating-linear-gradient(180deg, transparent 0 31px, color-mix(in srgb, var(--border) 7%, transparent) 31px 32px),
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 64%, transparent), color-mix(in srgb, var(--archive-paper) 38%, transparent));
}

.opening-copy::before {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  top: 0;
  height: 8px;
  pointer-events: none;
  z-index: 1;
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--archive-gold) 56%, transparent) 0 24px,
      transparent 24px 32px,
      color-mix(in srgb, var(--archive-olive) 38%, transparent) 32px 96px,
      transparent 96px 108px,
      color-mix(in srgb, var(--archive-gold) 40%, transparent) 108px calc(100% - 28px),
      transparent calc(100% - 28px) calc(100% - 16px),
      color-mix(in srgb, var(--archive-rose) 46%, transparent) calc(100% - 16px) 100%
    );
  clip-path: polygon(0 0, 100% 0, calc(100% - 4px) 60%, calc(100% - 12px) 100%, 12px 100%, 4px 70%, 0 80%);
  filter: blur(0.3px);
  opacity: 0.86;
}

.opening-copy::after {
  content: 'C·01';
  position: absolute;
  top: 22px;
  right: 18px;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border: 1.5px solid color-mix(in srgb, var(--accent-rose) 58%, transparent);
  border-radius: 50%;
  color: color-mix(in srgb, var(--accent-rose) 84%, var(--archive-ink));
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
  transform: rotate(-9deg);
  opacity: 0.82;
  pointer-events: none;
  box-shadow: 0 2px 0 color-mix(in srgb, var(--accent-rose) 18%, transparent) inset;
}

.opening-kicker-stack,
.opening-action-head {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
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
  color: var(--archive-ink);
  font-family: var(--font-display);
  font-size: clamp(44px, 5.2vw, 78px);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: 0.04em;
  text-shadow:
    1px 0 0 color-mix(in srgb, var(--archive-olive) 30%, transparent),
    -1px 0 0 color-mix(in srgb, var(--accent-rose) 24%, transparent),
    0 1px 0 color-mix(in srgb, var(--archive-paper) 60%, transparent);
}

.opening-title-block strong::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 8px;
  width: 4px;
  bottom: 8px;
  background: linear-gradient(180deg, var(--archive-gold), color-mix(in srgb, var(--archive-gold) 36%, transparent));
  pointer-events: none;
}

.opening-title-block p,
.opening-page-lead p {
  margin: 0;
  color: var(--archive-ink-soft);
  font-size: 12px;
  line-height: 1.58;
}

.opening-briefing {
  display: grid;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 18%, transparent);
}

.opening-mission {
  display: grid;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 14%, transparent);
}

.opening-mission span,
.opening-pressure-grid span,
.opening-page-lead span,
.opening-page-facts span {
  color: color-mix(in srgb, var(--archive-olive) 76%, var(--archive-ink-soft));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.opening-mission strong {
  max-width: 18ch;
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(18px, 2vw, 28px);
  font-weight: 800;
  line-height: 1.14;
}

.opening-pressure-grid,
.opening-page-facts {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 12%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 12%, transparent);
}

.opening-pressure-grid::after {
  content: '';
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: -10px;
  height: 6px;
  pointer-events: none;
  background:
    linear-gradient(90deg,
      color-mix(in srgb, var(--archive-olive) 46%, transparent) 0 12%,
      transparent 12% 16%,
      color-mix(in srgb, var(--archive-gold) 36%, transparent) 16% 62%,
      transparent 62% 66%,
      color-mix(in srgb, var(--accent-rose) 38%, transparent) 66% 100%
    );
  transform: rotate(-2deg);
  transform-origin: left center;
  filter: blur(0.4px);
  opacity: 0.78;
}

.opening-pressure-grid div,
.opening-page-facts div {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 10px 10px 10px 0;
  border-right: 1px solid color-mix(in srgb, var(--archive-gold) 12%, transparent);
}

.opening-pressure-grid div:last-child,
.opening-page-facts div:last-child {
  border-right: none;
}

.opening-pressure-grid strong,
.opening-page-facts strong {
  color: var(--archive-ink);
  font-size: 12px;
  line-height: 1.35;
}

.opening-scene {
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 6px 4px 12px 30px;
}

.opening-stage-poster {
  position: relative;
  height: 360px;
  overflow: hidden;
  border: 7px solid color-mix(in srgb, #fff 86%, var(--archive-paper-soft));
  border-radius: 2px;
  background-image: var(--hero-image, var(--hero-placeholder-gradient));
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  isolation: isolate;
  mix-blend-mode: multiply;
  transform: rotate(-0.4deg);
  box-shadow:
    0 26px 42px color-mix(in srgb, #000 18%, transparent),
    14px 16px 0 color-mix(in srgb, #000 12%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 34%, transparent);
}

.opening-stage-poster::before {
  content: '';
  position: absolute;
  inset: 14px 14px 14px 44px;
  background:
    linear-gradient(125deg, transparent 0 44%, color-mix(in srgb, var(--accent-rose) 12%, transparent) 44.5% 48%, transparent 48.5%),
    linear-gradient(180deg, transparent 0 74%, color-mix(in srgb, #000 10%, transparent) 100%);
  opacity: 0.9;
}

.opening-stage-poster::after {
  content: '';
  position: absolute;
  right: 22px;
  bottom: 16px;
  width: 82px;
  height: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, #fff 40%, transparent), color-mix(in srgb, var(--archive-gold) 30%, transparent));
  transform: rotate(-5deg);
  opacity: 0.72;
}

.opening-stage-poster__halo {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(183, 138, 52, 0.22) 80%, rgba(120, 50, 30, 0.18) 100%);
  mix-blend-mode: multiply;
}

.opening-stage-badge,
.opening-stage-index,
.opening-stage-world,
.opening-stage-title,
.opening-stage-roman,
.opening-stage-sash,
.opening-stage-blade,
.opening-stage-grid {
  position: absolute;
}

.opening-stage-badge {
  top: 16px;
  left: 18px;
  min-height: 24px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--text-primary) 86%, #111);
  color: color-mix(in srgb, var(--accent-amber-light) 72%, #f8e7ba);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 30%, transparent);
}

.opening-stage-badge::after {
  content: 'NO.01';
  position: absolute;
  top: -10px;
  right: -52px;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1.5px solid color-mix(in srgb, var(--archive-gold) 50%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--archive-paper-soft) 88%, transparent);
  color: color-mix(in srgb, var(--accent-rose) 78%, var(--archive-ink));
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
  transform: rotate(8deg);
  pointer-events: none;
  box-shadow: 0 4px 8px color-mix(in srgb, #000 12%, transparent);
}

.opening-stage-roman {
  top: 20px;
  right: 24px;
  color: color-mix(in srgb, var(--accent-rose) 24%, transparent);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 152px;
  font-weight: 900;
  line-height: 1;
}

.opening-stage-index {
  right: 22px;
  bottom: 18px;
  color: color-mix(in srgb, var(--accent-amber) 86%, var(--text-primary));
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.opening-stage-world {
  left: 12px;
  top: 18px;
  bottom: 16px;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  color: color-mix(in srgb, var(--text-primary) 92%, #28201a);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.18em;
  z-index: 2;
}

.opening-stage-title {
  left: 58px;
  right: 22px;
  bottom: 22px;
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(26px, 2.8vw, 36px);
  font-weight: 900;
  line-height: 1.05;
  z-index: 2;
}

.opening-stage-sash {
  left: 58px;
  right: -26px;
  top: 24px;
  height: 22px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--text-primary) 92%, #101010), color-mix(in srgb, var(--accent-rose) 72%, #843c48));
}

.opening-stage-blade {
  left: 72px;
  right: 22px;
  bottom: 26px;
  height: 128px;
  background:
    radial-gradient(circle at 26% 28%, color-mix(in srgb, var(--accent-amber) 28%, transparent), transparent 24%),
    linear-gradient(180deg, color-mix(in srgb, var(--accent-rose-light) 24%, transparent), transparent 78%);
  clip-path: polygon(0 100%, 8% 76%, 18% 56%, 36% 32%, 58% 12%, 100% 0, 100% 100%);
  opacity: 0.88;
}

.opening-stage-grid {
  inset: 14px 18px 14px 54px;
  background:
    linear-gradient(90deg, transparent 0 8px, color-mix(in srgb, var(--border) 14%, transparent) 8px 9px, transparent 9px),
    repeating-linear-gradient(180deg, transparent 0 22px, color-mix(in srgb, var(--border) 7%, transparent) 22px 23px);
  opacity: 0.5;
}

.opening-archive-strip {
  width: min(300px, 78%);
  justify-self: end;
  margin: -32px 18px 0 0;
  z-index: 2;
  opacity: 0.92;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 30%, transparent);
  background: color-mix(in srgb, var(--archive-paper-soft) 78%, transparent);
  box-shadow: 0 8px 18px color-mix(in srgb, #000 10%, transparent);
}

.opening-archive-strip :deep(.archive-strip__tile) {
  min-height: 58px;
}

.playable-world-opening-page {
  display: grid;
  gap: 14px;
  padding: 12px 2px 0;
  border-top: 1px solid color-mix(in srgb, var(--archive-gold) 14%, transparent);
}

.opening-action-head {
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 12%, transparent);
}

.opening-action-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  gap: 6px;
}

.opening-action-actions .stage-command {
  width: 88px;
  min-width: 88px;
  flex: 0 0 88px;
}

.opening-page-lead {
  display: grid;
  gap: 7px;
}

.opening-page-lead strong {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(18px, 2vw, 28px);
  font-weight: 900;
  line-height: 1.08;
}

.opening-page-lead p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.stage-command {
  --command-tilt: -3deg;
  position: relative;
  min-width: 144px;
  min-height: 40px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: stretch;
  padding: 0 12px 0 0;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 26%, transparent);
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 9px 50%);
  transform: rotate(var(--command-tilt));
  box-shadow:
    0 8px 12px color-mix(in srgb, #000 8%, transparent),
    4px 5px 0 color-mix(in srgb, #000 7%, transparent);
}

.stage-command--secondary {
  --command-tilt: 2deg;
}

.stage-command--compact {
  min-width: 88px;
  min-height: 28px;
  grid-template-columns: 24px minmax(0, 1fr);
  padding-right: 6px;
}

.stage-command :deep(.stage-command__index) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 16px;
  font-weight: 900;
  background: color-mix(in srgb, #000 16%, transparent);
}

.stage-command--compact :deep(.stage-command__index) {
  font-size: 11px;
}

.stage-command :deep(.stage-command__label) {
  min-width: 0;
  padding-left: 10px;
  display: inline-flex;
  align-items: center;
  color: inherit;
  font-size: 13px;
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

  .opening-shell {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .opening-copy,
  .opening-scene {
    padding: 10px 0 0;
  }

  .opening-stage-poster {
    height: 280px;
  }
}

@media (max-width: 640px) {
  .opening-view {
    padding: 12px;
  }

  .opening-shell {
    padding: 16px 14px;
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
    width: 88px;
    min-width: 88px;
    flex: 0 0 88px;
  }
}
</style>
