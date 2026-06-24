<template>
  <div class="welcome-view">
    <header class="welcome-chrome">
      <div class="welcome-appmark">
        <span class="welcome-appmark__name">Pinax</span>
      </div>

      <button class="theme-toggle" data-test="theme-toggle" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
        <span class="theme-icon">
          <svg v-if="isDark" width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.06 10.06l1.06 1.06M2.93 11.07l1.06-1.06M10.06 3.94l1.06-1.06" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <path d="M7 10a3 3 0 100-6 3 3 0 000 6zM7 0v1.5M7 12.5V14M0 7h1.5M12.5 7H14" />
          </svg>
        </span>
        <span class="theme-label">{{ isDark ? '暗色' : '亮色' }}</span>
      </button>
      <div class="variant-toggle" role="group" aria-label="主题版本">
        <button
          type="button"
          class="variant-toggle__option"
          :class="{ 'is-active': isKao }"
          data-test="variant-kao"
          :aria-pressed="isKao"
          @click="setVariant('kao')"
        >现代</button>
        <button
          type="button"
          class="variant-toggle__option"
          :class="{ 'is-active': !isKao }"
          data-test="variant-legacy"
          :aria-pressed="!isKao"
          @click="setVariant('legacy')"
        >经典</button>
      </div>
    </header>

    <main class="welcome-main">
      <section class="welcome-stage" aria-label="Pinax 世界入口">
        <PosterStage class="welcome-stage-poster" :style="{ '--welcome-reference-image': `url(${kaoReference})` }" :image="kaoReference" :decorated="false">
          <div class="welcome-stage-backdrop" aria-hidden="true">
            <span class="welcome-stage-act">Act 01</span>
            <span class="welcome-stage-code">PINAX</span>
            <span class="welcome-collage-tile welcome-collage-tile--1 is-torn-a"></span>
            <span class="welcome-collage-tile welcome-collage-tile--3 is-torn-c"></span>
            <span class="welcome-collage-tile welcome-collage-tile--4 is-torn-a"></span>
            <span class="welcome-collage-tile welcome-collage-tile--5 is-torn-b"></span>
            <span class="welcome-collage-tile welcome-collage-tile--7 is-torn-b"></span>
            <span class="welcome-collage-tile welcome-collage-tile--8 is-torn-c"></span>
            <span class="welcome-collage-note"></span>
            <span class="is-archive-prop is-archive-prop--tape welcome-prop-tape-1"></span>
            <span class="is-archive-prop is-archive-prop--tape welcome-prop-tape-2"></span>
            <span class="is-archive-prop is-archive-prop--fold welcome-prop-fold-1"></span>
            <span class="is-archive-prop is-archive-prop--stain welcome-prop-stain-1"></span>
            <svg class="welcome-collage-defs" width="0" height="0" aria-hidden="true" focusable="false">
              <defs>
                <filter id="welcome-collage-tear-a" x="-6%" y="-6%" width="112%" height="112%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.04 0.06" numOctaves="2" seed="3" result="noise-a" />
                  <feDisplacementMap in="SourceGraphic" in2="noise-a" scale="6" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <filter id="welcome-collage-tear-b" x="-6%" y="-6%" width="112%" height="112%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.05 0.045" numOctaves="2" seed="11" result="noise-b" />
                  <feDisplacementMap in="SourceGraphic" in2="noise-b" scale="7" xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <filter id="welcome-collage-tear-c" x="-6%" y="-6%" width="112%" height="112%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.038 0.052" numOctaves="2" seed="19" result="noise-c" />
                  <feDisplacementMap in="SourceGraphic" in2="noise-c" scale="5" xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </defs>
            </svg>
          </div>

          <FolioSurface class="welcome-poster-shell" variant="paper" :decorated="false">
            <FolioSurface as="div" class="welcome-poster-frame" variant="paper" :decorated="false" aria-hidden="true">
              <span class="welcome-frame-cut welcome-frame-cut--top"></span>
              <span class="welcome-frame-cut welcome-frame-cut--side"></span>
            </FolioSurface>

            <div class="welcome-poster-stage" aria-hidden="true">
              <span class="welcome-stage-art"></span>
              <span class="welcome-stage-glow"></span>
              <span class="welcome-stage-rim"></span>
              <span class="welcome-stage-reflection"></span>
              <span class="welcome-stage-haze"></span>
            </div>

            <aside v-if="showFeaturedPreset" class="welcome-world-chip" aria-label="默认世界入口">
              <span class="welcome-world-chip__genre">{{ featuredPreset.genreLabel }}</span>
              <strong class="welcome-world-chip__name">{{ featuredPreset.name }}</strong>
            </aside>

            <div class="welcome-poster-meta">
              <strong class="welcome-poster-meta__brand">Pinax</strong>
            </div>

            <div
              v-if="isOnboarding"
              class="welcome-onboarding"
              role="region"
              aria-label="首次启动引导"
            >
              <span class="welcome-onboarding__kicker">首次启动 · 3 步就绪</span>
              <ol class="welcome-onboarding__steps">
                <li class="welcome-onboarding__step" :class="{ 'is-done': step1Done }">
                  <span class="welcome-onboarding__step-index">1</span>
                  <button
                    type="button"
                    class="welcome-onboarding__step-link"
                    aria-label="步骤 1：配置 AI"
                    @click="openApiSettings"
                  >配置 AI</button>
                  <span class="welcome-onboarding__step-status">{{ step1Done ? '✓' : '待配置' }}</span>
                </li>
                <li class="welcome-onboarding__step" :class="{ 'is-done': step2Done }">
                  <span class="welcome-onboarding__step-index">2</span>
                  <router-link
                    class="welcome-onboarding__step-link"
                    to="/settings/worldbook"
                    aria-label="步骤 2：选择世界"
                  >选择世界</router-link>
                  <span class="welcome-onboarding__step-status">{{ step2Done ? '✓' : '待选择' }}</span>
                </li>
                <li class="welcome-onboarding__step" :class="{ 'is-done': step3Done }">
                  <span class="welcome-onboarding__step-index">3</span>
                  <router-link
                    class="welcome-onboarding__step-link"
                    to="/opening"
                    aria-label="步骤 3：开始开场"
                  >开始开场</router-link>
                  <span class="welcome-onboarding__step-status">{{ step3Done ? '✓' : '待开始' }}</span>
                </li>
              </ol>
            </div>

            <div
              v-else
              class="welcome-onboarding-done"
              role="status"
              aria-label="已就绪"
            >
              <span class="welcome-onboarding-done__check" aria-hidden="true">✓</span>
              <span class="welcome-onboarding-done__line">已就绪 · 可以开始</span>
            </div>

            <section
              v-if="hasSessions && lastSession"
              class="welcome-recent-session"
              role="region"
              aria-label="最近会话续接"
            >
              <header class="welcome-recent-session__head">
                <span class="welcome-recent-session__kicker" aria-hidden="true">·</span>
                <span class="welcome-recent-session__label">最近会话</span>
                <span v-if="lastSession.worldbookName" class="welcome-recent-session__world">
                  · {{ lastSession.worldbookName }}
                </span>
              </header>
              <strong class="welcome-recent-session__title">{{ lastSession.title || '未命名会话' }}</strong>
              <p class="welcome-recent-session__meta">
                <span>{{ formatTimestamp(lastSession.updatedAt) }}</span>
                <span class="welcome-recent-session__sep" aria-hidden="true">·</span>
                <span>{{ lastSession.messageCount }} 条</span>
                <template v-if="lastSession.volumeLabel">
                  <span class="welcome-recent-session__sep" aria-hidden="true">·</span>
                  <span>{{ lastSession.volumeLabel }}</span>
                </template>
              </p>
              <button
                type="button"
                class="welcome-recent-session__enter"
                @click="enterLastSession"
                :aria-label="`进入最近会话：${lastSession.title || '未命名会话'}`"
              >进入</button>
            </section>

            <div class="welcome-command-stack">
              <BookmarkButton
                :key="primaryAction.key"
                :to="primaryAction.to"
                class="welcome-primary-link"
                :aria-label="primaryAction.ariaLabel"
                :index="primaryAction.index"
                :label="primaryAction.label"
                :variant="primaryAction.variant"
                @click="handlePrimaryAction"
                index-class="welcome-command-index"
                label-class="welcome-command-label"
              />

              <BookmarkButton
                v-for="action in secondaryActions"
                :key="`secondary-${action.key}`"
                :to="action.to"
                :class="`welcome-secondary-link welcome-secondary-link--${action.key}`"
                :aria-label="action.ariaLabel"
                :index="action.index"
                :label="action.label"
                :variant="action.variant"
                index-class="welcome-command-index"
                label-class="welcome-command-label"
              />

              <BookmarkButton
                v-for="action in tertiaryActions"
                :key="`tertiary-${action.key}`"
                :to="action.to"
                :class="`welcome-tertiary-link welcome-tertiary-link--${action.key}`"
                :aria-label="action.ariaLabel"
                :index="action.index"
                :label="action.label"
                :variant="action.variant"
                compact
                index-class="welcome-command-index"
                label-class="welcome-command-label"
              />
            </div>

            <ArchiveStrip class="welcome-archive-strip" :items="welcomeArchiveItems" :image="kaoReference" aria-hidden="true" />
          </FolioSurface>
        </PosterStage>

        <div class="welcome-persona-note" aria-hidden="true"></div>
        <div class="welcome-dossier" aria-hidden="true"></div>
        <div class="welcome-briefing" aria-hidden="true"></div>
        <div class="welcome-mission-card" aria-hidden="true"></div>
        <div class="welcome-pressure-grid" aria-hidden="true"></div>
        <div class="welcome-dossier-route" aria-hidden="true"></div>
        <div class="welcome-exit-strip" aria-hidden="true"></div>
      </section>

      <section class="welcome-workbench" aria-hidden="true">
        <p class="welcome-workbench-copy"></p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'
import { useGameStore } from '../stores/gameStore'
import { useWorldStore } from '../stores/worldStore'
import { useSettingsPopup } from '../composables/useSettingsPopup'
import { seedWorldbookPresets } from '../services/seedWorldbookPresets'
import ArchiveStrip from '../components/folio/ArchiveStrip.vue'
import BookmarkButton from '../components/folio/BookmarkButton.vue'
import FolioSurface from '../components/folio/FolioSurface.vue'
import PosterStage from '../components/folio/PosterStage.vue'
import kaoReference from '../../docs/demo/kao.jpg'

const { isDark, toggleTheme, isKao, setVariant } = useTheme()
const gameStore = useGameStore()
const worldStore = useWorldStore()
const settingsPopup = useSettingsPopup()
const router = useRouter()

const featuredPreset = computed(() => seedWorldbookPresets[0] || null)
const hasApiKey = computed(() => Boolean(String(gameStore.apiSettings?.apiKey || '').trim()))
const hasWorldbooks = computed(() => (worldStore.worldbooksIndex || []).length > 0)
const hasSessions = computed(() => (gameStore.sessions || []).length > 0)
function openApiSettings() {
  settingsPopup.open('ai')
}

const step1Done = computed(() => hasApiKey.value)
const step2Done = computed(() => hasWorldbooks.value)
const step3Done = computed(() => hasSessions.value)
const allStepsDone = computed(() => step1Done.value && step2Done.value && step3Done.value)
const isOnboarding = computed(() => !allStepsDone.value)

/* V2 (W2 2026-06-26): state-aware 3-tier entry instead of 7 static buttons.
   The Welcome page now picks 1 primary action based on what the user is
   missing (key → world → session) and shows always-on secondary + tertiary
   utility links. The previous 7-static-button layout forced every user
   through every choice, which read as a feature wall rather than a
   dashboard. 3 layers + 1 contextual recent-session card makes the page
   act like a "where do I go from here" hub, not a settings index. */
const welcomeState = computed(() => {
  if (!hasApiKey.value) return 'setup'
  if (!hasWorldbooks.value) return 'choose-world'
  if (!hasSessions.value) return 'start'
  return 'resume'
})

const primaryAction = computed(() => {
  const state = welcomeState.value
  if (state === 'setup') {
    return {
      key: 'primary-setup',
      to: null,
      label: '开始配置',
      index: '01',
      variant: 'primary',
      ariaLabel: '开始配置 API Key（先决条件）'
    }
  }
  if (state === 'choose-world') {
    return {
      key: 'primary-choose-world',
      to: '/settings/worldbook',
      label: '选择世界',
      index: '01',
      variant: 'primary',
      ariaLabel: '选择世界书（API 已配置）'
    }
  }
  if (state === 'start') {
    return {
      key: 'primary-start',
      to: '/opening',
      label: '开始冒险',
      index: '01',
      variant: 'primary',
      ariaLabel: '开始冒险（世界书已选）'
    }
  }
  return {
    key: 'primary-resume',
    to: '/experience',
    label: '继续冒险',
    index: '01',
    variant: 'primary',
    ariaLabel: '继续最近一次冒险'
  }
})

function handlePrimaryAction() {
  if (primaryAction.value.key === 'primary-setup') {
    settingsPopup.open('ai')
  }
}

const secondaryActions = computed(() => [
  { key: 'new-world', to: '/settings/worldbook', label: '新世界', index: '02', variant: 'secondary', ariaLabel: '打开世界书快选（换 / 导入）' },
  { key: 'writing', to: '/writing', label: '写作', index: '03', variant: 'secondary', ariaLabel: '打开写作工作台' },
  { key: 'materials', to: '/materials', label: '素材', index: '04', variant: 'secondary', ariaLabel: '打开素材库' }
])

const tertiaryActions = computed(() => [
  { key: 'settings', to: '/settings/structured', label: '设定', index: '05', variant: 'tertiary', ariaLabel: '结构化设定（结构化 / 世界书 / 存储）' },
  { key: 'canvas', to: '/prose-essay', label: '画布', index: '06', variant: 'tertiary', ariaLabel: '画布（分镜 / 关系编排）' }
])

/* Recent session card — only shows when at least one session exists.
   The 7-static layout always showed "继续" even when no session was
   around; users would click and land in an empty adventure. Now the
   "继续冒险" primary button and the recent-session card both require
   hasSessions, and the recent-session card is the visible proof of
   "I can resume this" rather than an empty promise. */
const lastSession = computed(() => {
  const list = Array.isArray(gameStore.sessions) ? gameStore.sessions : []
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => {
    const aTime = Number(a?.updatedAt || a?.createdAt || 0)
    const bTime = Number(b?.updatedAt || b?.createdAt || 0)
    return bTime - aTime
  })
  const session = sorted[0]
  const worldbookId = session?.worldbookId || session?.worldId || ''
  const worldbookEntry = (worldStore.worldbooksIndex || []).find((w) => w && w.id === worldbookId)
  return {
    id: String(session?.id || ''),
    title: String(session?.title || '未命名会话'),
    updatedAt: Number(session?.updatedAt || session?.createdAt || 0),
    messageCount: Array.isArray(session?.messages)
      ? session.messages.length
      : (Array.isArray(session?.chatHistory) ? session.chatHistory.length : 0),
    worldbookId,
    worldbookName: worldbookEntry?.name || '',
    volumeLabel: ''
  }
})

const showFeaturedPreset = computed(() => {
  return Boolean(featuredPreset.value) && !hasWorldbooks.value
})

function enterLastSession() {
  router.push('/experience')
}

function formatTimestamp(ts) {
  const t = Number(ts || 0)
  if (!t) return '刚刚'
  const diff = Date.now() - t
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / (60 * 1000)))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const welcomeArchiveItems = [
  { label: '01', image: kaoReference, position: '18% 44%' },
  { label: '02', image: kaoReference, position: '54% 42%' },
  { label: '03', image: kaoReference, position: '84% 28%' }
]
</script>

<style scoped>
.welcome-view {
  position: relative;
  min-height: var(--app-viewport-height, 100vh);
  overflow: hidden;
  color: var(--text-primary);
  background:
    radial-gradient(circle at 12% 16%, color-mix(in srgb, var(--archive-gold) 16%, transparent), transparent 24%),
    radial-gradient(circle at 82% 14%, color-mix(in srgb, var(--archive-olive) 12%, transparent), transparent 18%),
    linear-gradient(152deg, color-mix(in srgb, var(--archive-paper-soft) 96%, var(--bg-secondary)) 0%, color-mix(in srgb, var(--archive-paper) 92%, var(--bg-primary)) 62%, color-mix(in srgb, var(--archive-paper-strong) 84%, var(--bg-primary)) 100%);
}

.welcome-view::before,
.welcome-view::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.welcome-view::before {
  background:
    linear-gradient(112deg, transparent 0 54%, color-mix(in srgb, var(--archive-olive) 9%, transparent) 54.3% 60%, transparent 60.3%),
    linear-gradient(138deg, transparent 0 78%, color-mix(in srgb, var(--archive-gold) 10%, transparent) 78.2% 84%, transparent 84.2%);
  opacity: 0.88;
}

.welcome-view::after {
  background:
    repeating-linear-gradient(
      90deg,
      transparent 0 84px,
      color-mix(in srgb, var(--border) 7%, transparent) 84px 85px
    ),
    linear-gradient(180deg, color-mix(in srgb, #fff 12%, transparent), transparent 18%, transparent 84%, color-mix(in srgb, #000 12%, transparent));
  opacity: 0.4;
}

.welcome-chrome,
.welcome-main {
  position: relative;
  z-index: 1;
  width: min(1380px, calc(100% - 48px));
  margin: 0 auto;
}

.welcome-chrome {
  min-height: 82px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.welcome-appmark {
  display: grid;
  gap: 2px;
}

.welcome-appmark__name {
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--archive-ink);
}

.welcome-appmark__desc {
  color: color-mix(in srgb, var(--archive-olive) 74%, var(--archive-ink-soft));
  font-size: 11px;
  letter-spacing: 0.08em;
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 28%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--archive-paper-soft) 84%, var(--surface-raised));
  color: var(--archive-ink-soft);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
  box-shadow: 0 10px 18px color-mix(in srgb, #000 8%, transparent);
}

.theme-toggle:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 38%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, var(--surface-raised));
  color: var(--archive-ink);
}

.theme-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.variant-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 3px 4px;
  background: color-mix(in srgb, var(--archive-paper-soft, #fbf4e9) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--archive-gold, #b08d3c) 28%, var(--border));
  border-radius: 999px;
}
.variant-toggle__option {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 4px 12px;
  min-height: 26px;
  font-family: "Noto Serif SC", "Iowan Old Style", "Songti SC", Georgia, serif;
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--archive-ink, #241a15) 60%, transparent);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.variant-toggle__option.is-active {
  background: color-mix(in srgb, var(--archive-gold, #b08d3c) 22%, transparent);
  color: var(--archive-ink, #241a15);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--archive-gold, #b08d3c) 60%, transparent);
}
.variant-toggle__option:hover:not(.is-active) {
  color: var(--archive-ink, #241a15);
}

.welcome-main {
  padding-bottom: 24px;
}

.welcome-stage {
  min-height: calc(var(--app-viewport-height, 100vh) - 112px);
}

.welcome-stage-poster {
  position: relative;
  isolation: isolate;
  min-height: clamp(640px, 86vh, 940px);
}

.welcome-stage-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.welcome-stage-act {
  position: absolute;
  left: 10px;
  top: 10px;
  color: color-mix(in srgb, var(--archive-rose) 78%, var(--archive-ink));
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.welcome-stage-code {
  position: absolute;
  top: 26px;
  right: 10px;
  bottom: 16px;
  display: flex;
  align-items: center;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  color: color-mix(in srgb, var(--archive-olive) 22%, var(--archive-ink));
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(44px, 5vw, 76px);
  font-weight: 900;
  letter-spacing: 0.14em;
}

.welcome-collage-tile,
.welcome-collage-note {
  position: absolute;
  display: block;
  background-image:
    linear-gradient(180deg, color-mix(in srgb, #fff 18%, transparent), transparent 18%),
    var(--welcome-reference-image);
  background-size: cover;
  background-repeat: no-repeat;
  border: 6px solid color-mix(in srgb, #fff 92%, var(--archive-paper-soft));
  box-shadow:
    0 18px 34px color-mix(in srgb, #000 16%, transparent),
    0 2px 0 color-mix(in srgb, #fff 48%, transparent) inset;
  opacity: 0.92;
}

.welcome-collage-tile {
  mix-blend-mode: multiply;
  mask-image: var(--welcome-tile-mask, none);
  -webkit-mask-image: var(--welcome-tile-mask, none);
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  filter: var(--welcome-tile-filter, none);
}

.welcome-collage-defs {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
  overflow: hidden;
}

.welcome-collage-tile--1 {
  left: -6%;
  top: 20%;
  width: 340px;
  height: 310px;
  background-position: 18% 44%;
  transform: rotate(12deg);
  z-index: var(--z-stage-decor);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,8 8,0 28,4 48,0 68,6 86,1 100,4 100,28 96,52 100,72 98,94 100,100 76,96 50,100 26,95 4,98 0,90 0,68 4,42 0,18'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-a);
}

.welcome-collage-tile--3 {
  left: 12%;
  top: 50%;
  width: 130px;
  height: 150px;
  background-position: 32% 48%;
  transform: rotate(14deg);
  z-index: calc(var(--z-stage-decor) - 1);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,4 14,0 36,5 58,0 82,3 100,0 100,22 96,48 100,72 96,96 100,100 72,98 48,100 22,96 0,98 0,76 4,52 0,28'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-c);
}

.welcome-collage-tile--4 {
  right: -2%;
  top: 10%;
  width: 220px;
  height: 195px;
  background-position: 42% 70%;
  transform: rotate(30deg);
  z-index: calc(var(--z-stage-decor) + 1);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,8 8,0 28,4 48,0 68,6 86,1 100,4 100,28 96,52 100,72 98,94 100,100 76,96 50,100 26,95 4,98 0,90 0,68 4,42 0,18'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-a);
}

.welcome-collage-tile--5 {
  right: 6%;
  top: 8%;
  width: 70px;
  height: 85px;
  background-position: 62% 44%;
  transform: rotate(-18deg);
  z-index: calc(var(--z-stage-decor) + 4);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,5 18,0 42,3 64,0 88,6 100,2 100,22 96,48 100,72 98,96 100,100 78,98 56,100 30,96 8,100 0,94 0,72 4,46 0,22'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-b);
}

.welcome-collage-tile--7 {
  left: -2%;
  top: 62%;
  width: 250px;
  height: 220px;
  background-position: 28% 28%;
  transform: rotate(-2deg);
  z-index: calc(var(--z-stage-decor) - 1);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,5 18,0 42,3 64,0 88,6 100,2 100,22 96,48 100,72 98,96 100,100 78,98 56,100 30,96 8,100 0,94 0,72 4,46 0,22'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-b);
}

.welcome-collage-tile--8 {
  left: 12%;
  top: 75%;
  width: 200px;
  height: 150px;
  background-position: 32% 52%;
  transform: rotate(20deg);
  z-index: calc(var(--z-stage-decor) + 1);
  --welcome-tile-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><polygon fill='white' points='0,4 14,0 36,5 58,0 82,3 100,0 100,22 96,48 100,72 96,96 100,100 72,98 48,100 22,96 0,98 0,76 4,52 0,28'/></svg>");
  --welcome-tile-filter: url(#welcome-collage-tear-c);
}

.welcome-prop-tape-1 {
  top: 10%;
  left: 30%;
  transform: rotate(-3deg);
  z-index: calc(var(--z-stage-decor) + 8);
}

.welcome-prop-tape-2 {
  top: 44%;
  right: 8%;
  transform: rotate(6deg);
  z-index: calc(var(--z-stage-decor) + 8);
}

.welcome-prop-fold-1 {
  top: 6%;
  left: 10%;
  z-index: calc(var(--z-stage-decor) + 9);
}

.welcome-prop-stain-1 {
  top: 60%;
  right: 18%;
  transform: rotate(25deg);
  z-index: calc(var(--z-stage-decor) + 7);
}

.welcome-collage-note {
  left: 13%;
  top: 54px;
  width: min(180px, 18vw);
  aspect-ratio: 1.18;
  border-width: 10px 10px 22px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--archive-paper-soft) 94%, #fff), color-mix(in srgb, var(--archive-paper) 92%, var(--archive-paper-strong)));
  transform: rotate(-4deg);
}

.welcome-collage-note::before,
.welcome-collage-note::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.welcome-collage-note::before {
  left: 18px;
  right: 18px;
  top: 18px;
  bottom: 18px;
  background:
    repeating-linear-gradient(
      180deg,
      transparent 0 22px,
      color-mix(in srgb, var(--border) 18%, transparent) 22px 23px
    );
}

.welcome-collage-note::after {
  left: 18px;
  top: 16px;
  width: 42px;
  height: 6px;
  background: color-mix(in srgb, var(--archive-gold) 76%, transparent);
  border-radius: 999px;
}

.welcome-poster-shell {
  position: absolute;
  inset: 34px 5.5% 24px 15.5%;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 18%, var(--border));
  clip-path: polygon(0 28px, 32px 0, calc(100% - 56px) 0, 100% 58px, 100% 100%, 0 100%);
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--archive-paper-soft) 98%, #fff) 0%, color-mix(in srgb, var(--archive-paper) 96%, var(--archive-paper-strong)) 52%, color-mix(in srgb, var(--archive-paper-strong) 90%, var(--bg-tertiary)) 100%);
  box-shadow:
    0 28px 60px color-mix(in srgb, #000 18%, transparent),
    22px 22px 0 color-mix(in srgb, var(--archive-olive-strong) 14%, transparent);
  overflow: hidden;
}

.welcome-poster-shell::before,
.welcome-poster-shell::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.welcome-poster-shell::before {
  inset: 16px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 16%, transparent);
  clip-path: polygon(0 18px, 24px 0, calc(100% - 42px) 0, 100% 40px, 100% 100%, 0 100%);
}

.welcome-poster-shell::after {
  inset: 0;
  background:
    linear-gradient(118deg, transparent 0 58%, color-mix(in srgb, var(--archive-olive) 8%, transparent) 58.2% 64%, transparent 64.2%),
    linear-gradient(146deg, transparent 0 78%, color-mix(in srgb, var(--archive-gold) 12%, transparent) 78.2% 86%, transparent 86.2%);
}

.welcome-poster-frame {
  position: absolute;
  top: clamp(80px, 9vw, 126px);
  right: clamp(72px, 9vw, 132px);
  bottom: clamp(146px, 14vw, 224px);
  left: clamp(258px, 23vw, 386px);
  border: 1px solid color-mix(in srgb, var(--archive-gold) 18%, transparent);
  clip-path: polygon(0 26px, 34px 0, calc(100% - 46px) 0, 100% 42px, 100% 100%, 0 100%);
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 36%, transparent), transparent 14%),
    linear-gradient(164deg, color-mix(in srgb, var(--archive-paper-soft) 96%, transparent) 0%, color-mix(in srgb, var(--archive-paper) 90%, transparent) 100%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--archive-gold) 10%, transparent),
    0 18px 36px color-mix(in srgb, #000 10%, transparent);
}

.welcome-poster-frame::before,
.welcome-poster-frame::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.welcome-poster-frame::before {
  inset: 8% 12% 12%;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--archive-gold) 12%, transparent), transparent 68%);
  filter: blur(24px);
  opacity: 0.68;
}

.welcome-poster-frame::after {
  left: 2%;
  right: 6%;
  top: 18%;
  bottom: 18%;
  background:
    linear-gradient(136deg, transparent 0 42%, color-mix(in srgb, #fff 48%, transparent) 42.3% 43.1%, transparent 43.4%),
    linear-gradient(136deg, transparent 0 66%, color-mix(in srgb, var(--archive-olive) 10%, transparent) 66.3% 67.2%, transparent 67.5%);
  opacity: 0.86;
}

.welcome-frame-cut {
  position: absolute;
  display: block;
  background: color-mix(in srgb, var(--archive-gold) 32%, transparent);
  opacity: 0.74;
}

.welcome-frame-cut--top {
  top: 18px;
  left: 14%;
  width: 38%;
  height: 2px;
  transform: rotate(-16deg);
}

.welcome-frame-cut--side {
  right: 12%;
  bottom: 16%;
  width: 28%;
  height: 1px;
  background: color-mix(in srgb, var(--archive-olive) 34%, transparent);
  transform: rotate(64deg);
}

.welcome-poster-stage {
  position: absolute;
  inset: 10% 12% 14% 12%;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
  clip-path: polygon(0 16px, 20px 0, calc(100% - 38px) 0, 100% 34px, 100% 100%, 0 100%);
  background: color-mix(in srgb, var(--archive-photo) 94%, var(--archive-olive-strong));
}

.welcome-poster-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background: linear-gradient(180deg, rgba(245, 235, 221, 0.18) 0%, rgba(245, 235, 221, 0.05) 50%, transparent 100%);
  mix-blend-mode: multiply;
}

.welcome-stage-art,
.welcome-stage-glow,
.welcome-stage-rim,
.welcome-stage-reflection,
.welcome-stage-haze {
  position: absolute;
  display: block;
}

.welcome-stage-art {
  inset: 0;
  background-image: var(--welcome-reference-image);
  background-position: 60% center;
  background-size: cover;
  transform: scale(1.04);
}

.welcome-stage-art::before,
.welcome-stage-art::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.welcome-stage-art::before {
  inset: 0;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--archive-paper-soft) 88%, transparent) 0 8%, transparent 18%),
    linear-gradient(180deg, color-mix(in srgb, #fff 18%, transparent), transparent 26%, color-mix(in srgb, #000 20%, transparent));
}

.welcome-stage-art::after {
  left: 0;
  top: 0;
  bottom: 0;
  width: 26%;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--archive-paper-soft) 98%, transparent) 0 72%, transparent 100%);
  clip-path: polygon(0 0, 84% 0, 100% 18%, 88% 40%, 100% 62%, 82% 100%, 0 100%);
  opacity: 0.94;
}

.welcome-stage-glow {
  inset: 0;
  background:
    radial-gradient(circle at 62% 40%, color-mix(in srgb, var(--archive-gold-soft) 20%, transparent), transparent 18%),
    radial-gradient(circle at 48% 18%, color-mix(in srgb, var(--archive-paper-soft) 24%, transparent), transparent 24%);
  filter: blur(14px);
  opacity: 0.88;
}

.welcome-stage-rim {
  inset: 0;
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  clip-path: polygon(0 16px, 20px 0, calc(100% - 38px) 0, 100% 34px, 100% 100%, 0 100%);
}

.welcome-stage-reflection {
  left: -12%;
  right: 38%;
  top: -2%;
  height: 28%;
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 26%, transparent), transparent 58%);
  transform: rotate(-16deg);
  opacity: 0.64;
  filter: blur(8px);
}

.welcome-stage-haze {
  inset: 0;
  background:
    linear-gradient(180deg, transparent 0 52%, color-mix(in srgb, var(--archive-olive-strong) 18%, transparent) 78%, color-mix(in srgb, var(--archive-olive-strong) 40%, transparent) 100%),
    linear-gradient(108deg, transparent 0 68%, color-mix(in srgb, var(--archive-gold) 12%, transparent) 68.2% 74%, transparent 74.2%);
}

.welcome-stage-haze::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 42%, rgba(120, 50, 30, 0.18) 72%, rgba(60, 20, 18, 0.40) 100%);
  mix-blend-mode: multiply;
}

.welcome-world-chip {
  position: absolute;
  left: clamp(28px, 4vw, 56px);
  top: clamp(42px, 5vw, 66px);
  z-index: 2;
  max-width: min(360px, calc(100% - 160px));
  padding: 14px 18px;
  display: grid;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 22%, transparent);
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 18px, 100% 100%, 0 100%);
  background: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 16px 26px color-mix(in srgb, #000 12%, transparent);
}

.welcome-world-chip__genre {
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink-soft));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.welcome-world-chip__name {
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(28px, 3vw, 38px);
  line-height: 1.02;
  font-weight: 760;
  letter-spacing: 0.01em;
  color: var(--archive-ink);
}

.welcome-onboarding {
  position: relative;
  margin: 0 16px;
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 28%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper) 94%, var(--surface-raised));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--archive-ink) 6%, transparent);
  display: grid;
  gap: 8px;
}

.welcome-onboarding__kicker {
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.welcome-onboarding__steps {
  display: flex;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.welcome-onboarding__step {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 2px 6px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
  color: var(--text-muted);
  font-size: 12px;
}

.welcome-onboarding__step.is-done {
  border-color: color-mix(in srgb, var(--archive-olive) 22%, transparent);
  background: color-mix(in srgb, var(--archive-olive) 6%, transparent);
  color: var(--archive-olive);
}

.welcome-onboarding__step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-muted) 18%, transparent);
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}

.welcome-onboarding__step.is-done .welcome-onboarding__step-index {
  background: color-mix(in srgb, var(--archive-olive) 28%, transparent);
  color: var(--archive-paper-soft);
}

.welcome-onboarding__step-link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}

.welcome-onboarding__step-link:hover {
  text-decoration: underline;
}

.welcome-onboarding__step-status {
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text-muted);
}

.welcome-onboarding__step.is-done .welcome-onboarding__step-status {
  color: var(--archive-olive);
}

@media (max-width: 760px) {
  .welcome-onboarding__steps {
    flex-direction: column;
    gap: 6px;
  }
}

/* V2 (W2 2026-06-26): completed-onboarding seal line. The 3-step
   onboarding strip is gated by isOnboarding; once all 3 steps
   complete, this 1-line seal stays in the same place so the page
   doesn't read as "everything got hidden, where did the guide go".
   archive-olive + ✓ glyph = "ready" stamp, not "you finished an
   onboarding flow". */
.welcome-onboarding-done {
  position: relative;
  margin: 0 16px;
  padding: 8px 14px 8px 28px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  border: 1px solid color-mix(in srgb, var(--archive-olive) 38%, var(--border));
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-olive) 8%, var(--archive-paper-soft));
  color: color-mix(in srgb, var(--archive-olive-strong) 80%, var(--archive-ink));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.welcome-onboarding-done__check {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: color-mix(in srgb, var(--archive-olive) 90%, var(--archive-ink));
  font-size: 14px;
  font-weight: 900;
}
.welcome-onboarding-done__line {
  white-space: nowrap;
}

/* V2 (W2 2026-06-26): recent session card. V3 archive-folio stamp
   language (transparent background + archive-rose 22% border + prefix
   · ink dot) so the card reads as a binder card, not a SaaS tile.
   Positioned above the command stack so users see "you can resume
   here" before they read the action list. */
.welcome-recent-session {
  position: absolute;
  right: clamp(24px, 3vw, 40px);
  bottom: clamp(220px, 22vw, 280px);
  z-index: var(--z-stage-cta);
  width: min(360px, 32vw);
  padding: 12px 14px 12px 22px;
  display: grid;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 22%, var(--border));
  border-radius: 0;
  background: transparent;
  box-shadow:
    0 12px 22px color-mix(in srgb, var(--archive-ink) 8%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--archive-paper) 60%, transparent);
}
.welcome-recent-session::before {
  content: '·';
  position: absolute;
  left: 8px;
  top: 12px;
  color: var(--archive-rose);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}
.welcome-recent-session__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--archive-rose) 72%, var(--archive-ink-soft));
}
.welcome-recent-session__label {
  color: color-mix(in srgb, var(--archive-rose) 78%, var(--archive-ink));
}
.welcome-recent-session__world {
  color: color-mix(in srgb, var(--archive-olive) 70%, var(--archive-ink-soft));
  font-weight: 700;
}
.welcome-recent-session__title {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 760;
  letter-spacing: 0.01em;
}
.welcome-recent-session__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 0;
  color: color-mix(in srgb, var(--archive-ink-soft) 88%, transparent);
  font-size: 11px;
  letter-spacing: 0.04em;
}
.welcome-recent-session__sep {
  color: color-mix(in srgb, var(--archive-rose) 50%, transparent);
}
.welcome-recent-session__enter {
  justify-self: end;
  min-height: 28px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--archive-rose) 46%, var(--border));
  background: color-mix(in srgb, var(--archive-rose-light) 36%, transparent);
  color: color-mix(in srgb, var(--archive-rose) 84%, var(--archive-ink));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}
.welcome-recent-session__enter:hover {
  border-color: color-mix(in srgb, var(--archive-rose) 72%, var(--archive-ink));
  background: color-mix(in srgb, var(--archive-rose-light) 56%, transparent);
  color: var(--archive-ink);
}

.welcome-poster-meta {
  position: absolute;
  left: clamp(34px, 4vw, 58px);
  bottom: clamp(40px, 5vw, 62px);
  z-index: 2;
  display: grid;
  gap: 4px;
}

.welcome-poster-meta__kicker {
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.welcome-poster-meta__brand {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: clamp(34px, 3.4vw, 48px);
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.welcome-command-stack {
  position: absolute;
  right: clamp(24px, 3vw, 40px);
  bottom: clamp(36px, 5vw, 54px);
  z-index: var(--z-stage-cta);
  width: min(360px, 32vw);
  display: grid;
  gap: 14px;
  justify-items: end;
  perspective: 1500px;
}

.welcome-primary-link,
.welcome-secondary-link,
.welcome-tertiary-link {
  width: 100%;
  min-height: 68px;
  padding: 0 18px 0 0;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: stretch;
  text-decoration: none;
  border: 1px solid color-mix(in srgb, var(--archive-gold) 24%, transparent);
  clip-path: polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%, 12px 50%);
  overflow: hidden;
  transform-origin: left center;
  transition: transform 0.18s ease, border-color 0.18s ease, filter 0.18s ease;
}

.welcome-primary-link {
  border-color: color-mix(in srgb, var(--archive-gold) 38%, var(--border));
  background:
    linear-gradient(122deg, color-mix(in srgb, var(--archive-olive-strong) 92%, #09090a) 0%, color-mix(in srgb, var(--archive-olive) 88%, #123530) 68%, color-mix(in srgb, var(--archive-gold) 96%, #b88a33) 68% 100%);
  color: color-mix(in srgb, #fff8ef 96%, transparent);
  transform: perspective(1500px) rotateX(10deg) rotateY(-20deg) skewX(-18deg);
  box-shadow:
    0 20px 36px color-mix(in srgb, var(--archive-olive) 18%, transparent),
    18px 18px 0 color-mix(in srgb, #000 18%, transparent);
}

.welcome-secondary-link {
  width: calc(100% - 62px);
  border-color: color-mix(in srgb, var(--archive-olive) 18%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 98%, transparent) 0%, color-mix(in srgb, var(--archive-paper) 92%, transparent) 68%, color-mix(in srgb, var(--archive-olive) 72%, var(--archive-olive-strong)) 68% 100%);
  color: var(--archive-ink);
  transform: perspective(1500px) rotateX(9deg) rotateY(-16deg) skewX(-16deg);
  box-shadow:
    0 14px 26px color-mix(in srgb, #000 10%, transparent),
    10px 12px 0 color-mix(in srgb, #000 14%, transparent);
}

.welcome-tertiary-link {
  width: calc(100% - 96px);
  min-height: 54px;
  border-color: color-mix(in srgb, var(--archive-rose) 18%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 98%, transparent) 0%, color-mix(in srgb, var(--archive-paper) 90%, transparent) 68%, color-mix(in srgb, var(--archive-rose) 72%, var(--archive-gold)) 68% 100%);
  color: var(--archive-ink);
  transform: perspective(1500px) rotateX(8deg) rotateY(-12deg) skewX(-12deg);
  box-shadow:
    0 10px 20px color-mix(in srgb, #000 8%, transparent),
    8px 10px 0 color-mix(in srgb, #000 10%, transparent);
}

.welcome-primary-link::before,
.welcome-secondary-link::before,
.welcome-tertiary-link::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, color-mix(in srgb, #fff 12%, transparent), transparent 18%),
    linear-gradient(118deg, transparent 0 72%, color-mix(in srgb, var(--archive-gold) 10%, transparent) 72.2% 78%, transparent 78.2%);
}

.welcome-command-stack :deep(.welcome-command-index) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  font-size: 22px;
  font-weight: 900;
  background: color-mix(in srgb, #000 18%, transparent);
  transform: skewX(18deg);
}

.welcome-secondary-link :deep(.welcome-command-index),
.welcome-tertiary-link :deep(.welcome-command-index) {
  color: color-mix(in srgb, var(--archive-paper-soft) 94%, transparent);
  background: color-mix(in srgb, var(--archive-olive-strong) 82%, transparent);
}

.welcome-command-stack :deep(.welcome-command-label) {
  min-width: 0;
  padding: 0 10px 0 14px;
  display: inline-flex;
  align-items: center;
  font-size: 17px;
  font-weight: 900;
  transform: skewX(18deg);
  letter-spacing: 0.02em;
}

.welcome-primary-link:hover,
.welcome-secondary-link:hover,
.welcome-tertiary-link:hover {
  filter: brightness(1.04);
}

.welcome-primary-link:hover {
  transform: perspective(1500px) rotateX(10deg) rotateY(-20deg) skewX(-18deg) translate3d(8px, -6px, 0);
}

.welcome-secondary-link:hover {
  transform: perspective(1500px) rotateX(9deg) rotateY(-16deg) skewX(-16deg) translate3d(6px, -4px, 0);
}

.welcome-tertiary-link:hover {
  transform: perspective(1500px) rotateX(8deg) rotateY(-12deg) skewX(-12deg) translate3d(5px, -3px, 0);
}

.welcome-archive-strip {
  position: absolute;
  right: clamp(34px, 4vw, 58px);
  bottom: clamp(210px, 20vw, 260px);
  z-index: 2;
  width: min(330px, 27vw);
  opacity: 0.92;
}

.welcome-persona-note,
.welcome-dossier,
.welcome-briefing,
.welcome-mission-card,
.welcome-pressure-grid,
.welcome-dossier-route,
.welcome-exit-strip,
.welcome-workbench,
.welcome-workbench-copy {
  display: none;
}

@media (max-width: 980px) {
  .welcome-stage-poster {
    min-height: 820px;
  }

  .welcome-collage-tile--3,
  .welcome-collage-tile--4,
  .welcome-collage-tile--5,
  .welcome-collage-tile--7,
  .welcome-collage-tile--8,
  .welcome-collage-note,
  .welcome-prop-tape-2,
  .welcome-prop-stain-1 {
    display: none;
  }

  .welcome-poster-shell {
    inset: 64px 0 24px 0;
  }

  .welcome-poster-frame {
    top: 126px;
    right: 38px;
    bottom: 232px;
    left: 118px;
  }

  .welcome-command-stack {
    left: 24px;
    right: 24px;
    bottom: 24px;
    width: auto;
    justify-items: stretch;
  }

  .welcome-primary-link,
  .welcome-secondary-link,
  .welcome-tertiary-link {
    width: 100%;
    transform: none;
    box-shadow: 0 14px 24px color-mix(in srgb, #000 14%, transparent);
  }

  .welcome-primary-link:hover,
  .welcome-secondary-link:hover,
  .welcome-tertiary-link:hover {
    transform: translateY(-2px);
  }

  .welcome-archive-strip {
    right: 28px;
    bottom: 214px;
    width: min(300px, calc(100% - 56px));
  }

  .welcome-recent-session {
    right: 24px;
    left: 24px;
    bottom: 224px;
    width: auto;
  }
}

@media (max-width: 760px) {
  .welcome-collage-tile,
  .welcome-collage-note,
  [class*='welcome-prop-'] {
    display: none;
  }

  .welcome-chrome,
  .welcome-main {
    width: min(100%, calc(100% - 28px));
  }

  .welcome-chrome {
    min-height: 64px;
  }

  .welcome-stage-poster {
    min-height: 720px;
  }

  .welcome-stage-code {
    font-size: 34px;
    right: 8px;
  }

  .welcome-poster-shell {
    inset: 18px 0 0;
    box-shadow:
      0 18px 40px color-mix(in srgb, #000 18%, transparent),
      10px 10px 0 color-mix(in srgb, var(--archive-olive-strong) 10%, transparent);
  }

  .welcome-world-chip {
    left: 18px;
    top: 20px;
    max-width: calc(100% - 78px);
  }

  .welcome-poster-frame {
    top: 118px;
    right: 18px;
    bottom: 224px;
    left: 18px;
  }

  .welcome-poster-stage {
    inset: 12% 8% 18% 8%;
  }

  .welcome-poster-meta {
    left: 18px;
    bottom: 138px;
  }

  .welcome-command-stack {
    left: 16px;
    right: 16px;
    bottom: 18px;
    gap: 10px;
  }

  .welcome-primary-link,
  .welcome-secondary-link,
  .welcome-tertiary-link {
    min-height: 58px;
    grid-template-columns: 48px minmax(0, 1fr);
    padding-right: 16px;
  }

  .welcome-tertiary-link {
    min-height: 48px;
  }

  .welcome-command-stack :deep(.welcome-command-index) {
    font-size: 18px;
  }

  .welcome-command-stack :deep(.welcome-command-label) {
    font-size: 16px;
  }

  .welcome-archive-strip {
    display: none;
  }

  .welcome-recent-session {
    position: static;
    width: auto;
    margin: 8px 16px 0;
  }
}
</style>
