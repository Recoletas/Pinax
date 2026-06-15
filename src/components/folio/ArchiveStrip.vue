<template>
  <div class="archive-strip is-archive-strip" :aria-label="ariaLabel">
    <span
      v-for="(item, index) in normalizedItems"
      :key="`${item.label}-${index}`"
      class="archive-strip__tile"
      :class="`archive-strip__tile--${index + 1}`"
      :style="tileStyle(item)"
    >
      <span>{{ item.label }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  image: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: '档案缩略条'
  }
})

const normalizedItems = computed(() => {
  if (props.items.length) return props.items.slice(0, 4)
  return [
    { label: '01', position: '18% 44%' },
    { label: '02', position: '54% 42%' },
    { label: '03', position: '84% 28%' }
  ]
})

function tileStyle(item) {
  return {
    '--archive-strip-image': item.image ? `url(${item.image})` : (props.image ? `url(${props.image})` : 'none'),
    '--archive-strip-position': item.position || 'center'
  }
}
</script>

<style scoped>
.archive-strip {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 8px;
  background: color-mix(in srgb, var(--archive-paper-soft) 82%, transparent);
}

.archive-strip__tile {
  position: relative;
  min-height: 78px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, #fff 64%, var(--hairline-soft));
  background:
    linear-gradient(180deg, color-mix(in srgb, #fff 18%, transparent), transparent 22%),
    var(--archive-strip-image),
    linear-gradient(135deg, color-mix(in srgb, var(--archive-photo) 84%, var(--archive-olive-strong)), color-mix(in srgb, var(--archive-gold) 24%, var(--archive-photo)));
  background-size: cover;
  background-position: var(--archive-strip-position);
}

.archive-strip__tile::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, transparent, color-mix(in srgb, #000 28%, transparent)),
    linear-gradient(118deg, transparent 0 68%, color-mix(in srgb, var(--archive-gold) 18%, transparent) 68.2% 76%, transparent 76.2%);
}

.archive-strip__tile span {
  position: absolute;
  left: 8px;
  bottom: 7px;
  color: color-mix(in srgb, var(--archive-paper-soft) 96%, #fff);
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: var(--fs-mono);
  font-weight: 800;
  letter-spacing: 0.18em;
}

@media (max-width: 760px) {
  .archive-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    transform: none;
  }

  .archive-strip__tile {
    min-height: 58px;
  }
}
</style>
