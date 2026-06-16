<template>
  <div ref="dockRef" class="gm-persona-dock" @click.stop>
    <Transition name="persona-bubble">
      <section
        v-if="expanded"
        class="gm-persona-bubble"
        aria-label="角色化顾问入口"
      >
        <div class="gm-persona-brow">
          <span class="gm-persona-kicker">{{ kicker }}</span>
          <button
            class="gm-persona-close"
            type="button"
            aria-label="收起角色入口"
            @click="collapse"
          >
            ×
          </button>
        </div>
        <strong class="gm-persona-title">{{ title }}</strong>
        <p class="gm-persona-body">{{ body }}</p>
        <div class="gm-persona-actions">
          <button class="gm-persona-primary" type="button" @click="openPanel">
            {{ primaryLabel }}
          </button>
          <button class="gm-persona-secondary" type="button" @click="collapse">
            稍后
          </button>
        </div>
      </section>
    </Transition>

    <button
      class="gm-persona-launcher"
      type="button"
      :title="launcherTitle"
      :aria-expanded="expanded ? 'true' : 'false'"
      aria-haspopup="dialog"
      @click="handleLauncherClick"
    >
      <span class="gm-persona-launcher-glow" aria-hidden="true"></span>
      <span class="gm-persona-avatar">{{ avatarLabel }}</span>
      <span class="gm-persona-caption">
        <strong>{{ caption }}</strong>
        <small>{{ captionHint }}</small>
      </span>
    </button>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  kicker: {
    type: String,
    default: '在场 GM'
  },
  title: {
    type: String,
    default: '从这里继续推进'
  },
  body: {
    type: String,
    default: '我先看当前页面和最近动作，再给你一个更紧的切口。'
  },
  primaryLabel: {
    type: String,
    default: '打开顾问'
  },
  launcherTitle: {
    type: String,
    default: '打开角色化顾问入口'
  },
  avatarLabel: {
    type: String,
    default: 'GM'
  },
  caption: {
    type: String,
    default: '虚构集'
  },
  captionHint: {
    type: String,
    default: '先看提示'
  }
})

const emit = defineEmits(['open'])

const expanded = ref(false)
const dockRef = ref(null)

function collapse() {
  expanded.value = false
}

function openPanel() {
  expanded.value = false
  emit('open')
}

function handleLauncherClick() {
  if (expanded.value) {
    openPanel()
    return
  }
  expanded.value = true
}

function handlePointerDown(event) {
  if (!expanded.value) return
  if (dockRef.value?.contains(event.target)) return
  collapse()
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    collapse()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown, true)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown, true)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.gm-persona-dock {
  position: fixed;
  right: 18px;
  bottom: 20px;
  z-index: var(--z-floating-action, 260);
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.gm-persona-bubble {
  width: min(320px, calc(100vw - 32px));
  padding: 14px 14px 12px;
  border: 1px solid color-mix(in srgb, var(--accent-rose, var(--accent)) 24%, var(--border));
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--bg-secondary) 92%, var(--accent-rose-light, var(--accent-light))),
      color-mix(in srgb, var(--bg-primary) 88%, var(--accent-amber-light, var(--accent-light)))
    );
  box-shadow: var(--shadow-floating);
  color: var(--text-primary);
}

.gm-persona-brow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.gm-persona-kicker {
  font-size: 11px;
  font-weight: 700;
  color: color-mix(in srgb, var(--accent-rose, var(--accent)) 74%, var(--text-primary));
}

.gm-persona-close {
  width: 24px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
}

.gm-persona-title {
  display: block;
  margin-bottom: 6px;
  font-size: 18px;
  line-height: 1.15;
}

.gm-persona-body {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.gm-persona-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gm-persona-primary,
.gm-persona-secondary {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.gm-persona-primary {
  border-color: color-mix(in srgb, var(--accent-rose, var(--accent)) 46%, var(--border));
  background: color-mix(in srgb, var(--accent-rose-light, var(--accent-light)) 72%, var(--bg-secondary));
  color: color-mix(in srgb, var(--accent-rose, var(--accent)) 78%, var(--text-primary));
}

.gm-persona-secondary {
  background: color-mix(in srgb, var(--bg-secondary) 88%, transparent);
  color: var(--text-secondary);
}

.gm-persona-launcher {
  position: relative;
  min-width: 60px;
  min-height: 60px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--accent-rose, var(--accent)) 24%, var(--border));
  background:
    linear-gradient(
      165deg,
      color-mix(in srgb, var(--bg-secondary) 92%, var(--accent-amber-light, var(--accent-light))),
      color-mix(in srgb, var(--bg-primary) 84%, var(--accent-rose-light, var(--accent-light)))
    );
  color: var(--text-primary);
  box-shadow: var(--shadow-floating);
  display: grid;
  place-items: center;
  cursor: pointer;
  overflow: hidden;
}

.gm-persona-launcher-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 22% 20%, color-mix(in srgb, var(--accent-amber, var(--accent)) 24%, transparent), transparent 32%),
    linear-gradient(35deg, transparent 47%, color-mix(in srgb, var(--accent-rose, var(--accent)) 18%, transparent) 48%, transparent 52%);
  opacity: 0.9;
}

.gm-persona-avatar,
.gm-persona-caption {
  position: relative;
  z-index: 1;
}

.gm-persona-avatar {
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--accent-rose, var(--accent)) 34%, var(--border));
  background: color-mix(in srgb, var(--bg-secondary) 84%, transparent);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
}

.gm-persona-caption {
  display: grid;
  gap: 1px;
  margin-top: 4px;
  text-align: center;
}

.gm-persona-caption strong {
  font-size: 11px;
  line-height: 1;
}

.gm-persona-caption small {
  font-size: 10px;
  color: var(--text-secondary);
  line-height: 1;
}

.persona-bubble-enter-active,
.persona-bubble-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.persona-bubble-enter-from,
.persona-bubble-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.gm-persona-close:hover,
.gm-persona-secondary:hover {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  color: var(--text-primary);
}

.gm-persona-primary:hover,
.gm-persona-launcher:hover {
  transform: translateY(-1px);
}

@media (max-width: 720px) {
  .gm-persona-dock {
    right: 12px;
    left: 12px;
    bottom: 12px;
    justify-content: flex-end;
  }

  .gm-persona-bubble {
    position: absolute;
    right: 0;
    bottom: calc(100% + 10px);
  }
}
</style>
