<script setup>
import { computed, onBeforeUnmount } from 'vue'
import { useTipState } from '../../composables/useTipState'

const tip = useTipState()
const cur = tip.currentTip

const variantClass = computed(() => {
  const v = cur.value?.variant || 'info'
  return `tip-banner--${v}`
})

function handleCtaClick() {
  const cta = cur.value?.cta
  if (!cta || typeof cta.action !== 'function') return
  // CTA 点击即视为用户消化了这条 tip, 写入 seen 防复弹
  try {
    cta.action()
  } catch { /* Best-effort fallback intentionally ignores diagnostics. */ }
  tip.dismissTip()
}

function handleClose() {
  tip.dismissTip()
}

onBeforeUnmount(() => {
  // 不强制 dismiss: 切换路由时希望保持显示 (除非 bindRouter 自动 dismiss nav 类)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tip-layer">
      <div
        v-if="cur"
        class="tip-banner"
        :class="variantClass"
        role="status"
        aria-live="polite"
        data-test="tip-banner"
      >
        <div class="tip-banner__body">
          <strong v-if="cur.title" class="tip-banner__title">{{ cur.title }}</strong>
          <p v-if="cur.body" class="tip-banner__text">{{ cur.body }}</p>
          <button
            v-if="cur.cta"
            type="button"
            class="tip-banner__cta"
            data-test="tip-banner-cta"
            @click="handleCtaClick"
          >{{ cur.cta.label }}</button>
        </div>
        <button
          type="button"
          class="tip-banner__close"
          aria-label="关闭提示"
          data-test="tip-banner-close"
          @click="handleClose"
        >×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tip-banner {
  position: fixed;
  top: clamp(64px, 8vh, 96px);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-popover, 400);
  width: min(720px, calc(100vw - 32px));
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  color: var(--text-primary);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(6px);
  font-size: 13px;
  line-height: 1.55;
}

.tip-banner--welcome {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent-light) 90%, var(--bg-secondary));
}

.tip-banner--success {
  border-color: color-mix(in srgb, var(--success) 50%, var(--border));
  background: color-mix(in srgb, var(--accent-emerald-light) 90%, var(--bg-secondary));
}

.tip-banner__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tip-banner__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.tip-banner__text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.tip-banner__cta {
  align-self: flex-start;
  margin-top: 4px;
  padding: 4px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  border-radius: 3px;
  transition: background var(--motion-fast, 140ms), color var(--motion-fast, 140ms);
}

.tip-banner__cta:hover,
.tip-banner__cta:focus-visible {
  background: var(--accent);
  color: var(--accent-text);
  outline: none;
}

.tip-banner__close {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  border-radius: 3px;
  transition: color var(--motion-fast, 140ms), background var(--motion-fast, 140ms);
}

.tip-banner__close:hover,
.tip-banner__close:focus-visible {
  color: var(--text-primary);
  background: var(--bg-hover);
  outline: none;
}

/* Transition */
.tip-layer-enter-active,
.tip-layer-leave-active {
  transition: opacity var(--motion-layer, 180ms) var(--motion-ease-out),
              transform var(--motion-layer, 180ms) var(--motion-ease-out);
}

.tip-layer-enter-from,
.tip-layer-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

/* 移动端: 改底部 sheet 形态, 避开 mast */
@media (max-width: 640px) {
  .tip-banner {
    top: auto;
    bottom: 16px;
    left: 16px;
    right: 16px;
    transform: none;
    width: auto;
    max-width: none;
    border-radius: 8px;
  }
  .tip-layer-enter-from,
  .tip-layer-leave-to {
    transform: translateY(16px);
  }
}
</style>
<style scoped>
.tip-banner { top: auto; left: auto; right: 24px; bottom: 24px; transform: none; width: min(380px, calc(100vw - 48px)); box-sizing: border-box; padding: 20px; gap: 12px; border: 1px solid var(--hairline-soft); border-radius: 12px; background: var(--surface-workbench-raised); backdrop-filter: none; font-family: var(--font-sans); }
.tip-banner--welcome, .tip-banner--success { background: var(--surface-workbench-raised); border-color: var(--hairline-soft); }
.tip-banner__body { gap: 9px; }
.tip-banner__title { font-size: 15px; line-height: 1.5; font-weight: 600; }
.tip-banner__text { font-size: 13px; line-height: 1.7; }
.tip-banner__cta { min-height: 36px; padding: 8px 14px; margin-top: 4px; border: 0; border-radius: 8px; background: var(--accent); color: var(--accent-text); font: 500 13px/1.4 var(--font-sans); }
.tip-banner__close { width: 32px; height: 32px; margin: -6px -8px 0 0; font-size: 22px; border-radius: 8px; }
.tip-banner :is(button):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tip-layer-enter-from, .tip-layer-leave-to { transform: translateY(8px); }
@media (max-width: 640px) { .tip-banner { top: 64px; bottom: auto; left: 12px; right: 12px; width: auto; padding: 16px; } .tip-banner__close { width: 44px; height: 44px; } .tip-banner__cta { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .tip-layer-enter-active, .tip-layer-leave-active { transition: none; } }
</style>
