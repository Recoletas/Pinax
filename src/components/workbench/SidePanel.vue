<template>
  <aside class="side-panel" aria-label="二级导航">
    <header class="side-panel-head">
      <span class="side-panel-kicker">Section</span>
      <h2 class="side-panel-title">{{ title }}</h2>
    </header>

    <div class="side-panel-list">
      <button
        v-for="item in items"
        :key="item.routeName"
        class="side-link"
        :class="{ active: item.routeName === activeRouteName }"
        type="button"
        @click="$emit('select', item.routeName)"
      >
        <span class="side-link-label">{{ item.label }}</span>
        <span class="side-link-desc">{{ item.description }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '模块'
  },
  items: {
    type: Array,
    default: () => []
  },
  activeRouteName: {
    type: String,
    default: ''
  }
})

defineEmits(['select'])
</script>

<style scoped>
.side-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.side-panel-head {
  padding: 18px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  background:
    linear-gradient(126deg, color-mix(in srgb, var(--accent-light) 12%, transparent) 0 34%, transparent 34.4% 100%);
}

.side-panel-kicker {
  display: inline-block;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.side-panel-title {
  margin-top: 6px;
  font-size: 22px;
  line-height: 1;
  font-weight: 820;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-primary);
}

.side-panel-list {
  padding: 10px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.side-link {
  width: 100%;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 10px 50%);
  background: transparent;
  padding: 12px 14px 12px 18px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease, color 0.16s ease;
}

.side-link:hover {
  transform: translateY(-1px) translateX(1px);
  background: color-mix(in srgb, var(--accent-light) 8%, var(--surface-soft));
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  color: var(--text-primary);
}

.side-link.active {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-light) 18%, var(--surface-soft)), color-mix(in srgb, var(--surface-raised) 92%, transparent));
  color: var(--text-primary);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent),
    0 10px 18px color-mix(in srgb, #000 10%, transparent);
}

.side-link-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.side-link-desc {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.8;
}

.side-panel-head {
  border-bottom-color: color-mix(in srgb, var(--archive-gold) 16%, transparent);
  background:
    linear-gradient(126deg, color-mix(in srgb, var(--archive-gold) 10%, transparent) 0 34%, transparent 34.4% 100%);
}

.side-panel-kicker {
  color: color-mix(in srgb, var(--archive-olive) 72%, var(--archive-ink-soft));
}

.side-panel-title {
  color: var(--archive-ink);
  font-family: "Iowan Old Style", "Songti SC", "STSong", Georgia, serif;
  text-transform: none;
}

.side-link {
  border-color: color-mix(in srgb, var(--archive-gold) 18%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 78%, transparent);
  color: var(--archive-ink-soft);
}

.side-link:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 24%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 88%, transparent);
  color: var(--archive-ink);
}

.side-link.active {
  border-color: color-mix(in srgb, var(--archive-gold) 32%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff) 0 72%, color-mix(in srgb, var(--archive-gold) 18%, transparent) 72% 100%);
  color: var(--archive-ink);
}

.side-link-label {
  color: var(--archive-ink);
}

.side-link-desc {
  color: var(--archive-ink-soft);
  opacity: 1;
}
</style>
