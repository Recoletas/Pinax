<template>
  <nav class="activity-bar" aria-label="一级导航">
    <button
      v-for="(item, index) in items"
      :key="item.key"
      class="activity-btn"
      :class="{ active: item.key === activeKey }"
      type="button"
      @click="$emit('select', item.key)"
    >
      <span class="activity-index">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="activity-icon" aria-hidden="true">
        <svg v-if="item.icon === 'compass'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="5"></circle>
          <path d="M6.2 9.8L7.3 6.8L10.3 5.7L9.2 8.7L6.2 9.8Z"></path>
        </svg>
        <svg v-else-if="item.icon === 'book'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 2.5H7A2 2 0 0 1 9 4.5V13.5H4A1 1 0 0 0 3 14.5V2.5Z"></path>
          <path d="M13 2.5H9A2 2 0 0 0 7 4.5V13.5H12A1 1 0 0 1 13 14.5V2.5Z"></path>
        </svg>
        <svg v-else-if="item.icon === 'archive'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 4.2h10l-.8 8.3A1.2 1.2 0 0 1 11 13.6H5a1.2 1.2 0 0 1-1.2-1.1L3 4.2Z"></path>
          <path d="M2.5 2.4h11v1.8h-11z"></path>
          <path d="M6.2 7h3.6"></path>
        </svg>
        <svg v-else-if="item.icon === 'settings'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="2"></circle>
          <path d="M8 1.8v1.5M8 12.7v1.5M1.8 8h1.5M12.7 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1"></path>
        </svg>
        <svg v-else-if="item.icon === 'film'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.2" y="3" width="11.6" height="10" rx="1.2"></rect>
          <path d="M5.2 3v10M10.8 3v10M2.2 6h11.6M2.2 10h11.6"></path>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 2.5H9L12 5.5V13A1 1 0 0 1 11 14H4A1 1 0 0 1 3 13V3.5A1 1 0 0 1 4 2.5Z"></path>
          <path d="M9 2.5V5.5H12"></path>
          <path d="M5.5 8H10.5"></path>
          <path d="M5.5 10.5H10.5"></path>
        </svg>
      </span>
      <span class="activity-copy">
        <span class="activity-label">{{ item.label }}</span>
        <span class="activity-desc">{{ item.description }}</span>
      </span>
    </button>
  </nav>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    default: () => []
  },
  activeKey: {
    type: String,
    default: ''
  }
})

defineEmits(['select'])
</script>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.activity-btn {
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: 34px 34px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 12px 14px 12px 0;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 12px 50%);
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease, color 0.16s ease;
}

.activity-btn:hover {
  transform: translateY(-1px) translateX(1px);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  background: color-mix(in srgb, var(--accent-light) 10%, var(--surface-soft));
  color: var(--text-primary);
}

.activity-btn.active {
  border-color: color-mix(in srgb, var(--accent) 44%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-light) 26%, var(--surface-soft)), color-mix(in srgb, var(--surface-raised) 92%, transparent));
  color: var(--text-primary);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent),
    0 10px 18px color-mix(in srgb, #000 10%, transparent);
}

.activity-index {
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  transform: skewX(14deg);
}

.activity-btn.active .activity-index {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-light) 22%, transparent);
}

.activity-icon {
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
}

.activity-btn.active .activity-icon {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--accent);
}

.activity-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.activity-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.activity-desc {
  display: block;
  font-size: 11px;
  line-height: 1.35;
  opacity: 0.8;
}

.activity-btn {
  border-color: color-mix(in srgb, var(--archive-gold) 18%, var(--border));
  background: color-mix(in srgb, var(--archive-paper-soft) 78%, transparent);
  color: var(--archive-ink-soft);
}

.activity-btn:hover {
  border-color: color-mix(in srgb, var(--archive-olive) 26%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 88%, transparent);
  color: var(--archive-ink);
}

.activity-btn.active {
  border-color: color-mix(in srgb, var(--archive-gold) 34%, var(--border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--archive-paper-soft) 96%, #fff) 0 72%, color-mix(in srgb, var(--archive-gold) 20%, transparent) 72% 100%);
  color: var(--archive-ink);
}

.activity-index {
  background: color-mix(in srgb, var(--archive-paper) 90%, transparent);
  color: var(--archive-ink-soft);
}

.activity-btn.active .activity-index {
  color: var(--archive-paper-soft);
  background: linear-gradient(180deg, color-mix(in srgb, var(--archive-olive-strong) 92%, #163430), color-mix(in srgb, var(--archive-photo) 88%, #25433e));
}

.activity-icon {
  border-color: color-mix(in srgb, var(--archive-gold) 16%, var(--border));
  background: color-mix(in srgb, var(--archive-paper) 92%, transparent);
}

.activity-btn.active .activity-icon {
  border-color: color-mix(in srgb, var(--archive-gold) 34%, var(--border));
  color: color-mix(in srgb, var(--archive-olive) 82%, var(--archive-ink));
}

.activity-label {
  color: var(--archive-ink);
}

.activity-desc {
  color: var(--archive-ink-soft);
  opacity: 1;
}
</style>
