<script setup>
import { computed } from 'vue'
import CharacterPortrait from './CharacterPortrait.vue'

const props = defineProps({
  tiles: {
    type: Array,
    required: true,
    validator: (arr) => arr.length > 0 && arr.every((t) => typeof t.poseId === 'string' && typeof t.kicker === 'string'),
  },
  ariaLabel: { type: String, default: '开场档案缩略条' },
  // 5C step 4: 'kicker' = pure display, 'scene-switcher' = clickable, highlights active
  role: { type: String, default: 'kicker', validator: (v) => ['kicker', 'scene-switcher'].includes(v) },
  activePoseId: { type: String, default: '' },
})
const emit = defineEmits(['select'])
const isSwitcher = computed(() => props.role === 'scene-switcher')
</script>

<template>
  <div
    class="character-archive-strip is-archive-strip"
    :class="{ 'character-archive-strip--switcher': isSwitcher }"
    :aria-label="ariaLabel"
  >
    <button
      v-if="isSwitcher"
      v-for="tile in tiles"
      :key="tile.poseId"
      type="button"
      class="character-archive-strip__tile character-archive-strip__switcher"
      :class="{ 'is-active': tile.poseId === activePoseId }"
      :aria-pressed="tile.poseId === activePoseId"
      @click="emit('select', tile.poseId)"
    >
      <CharacterPortrait :pose-id="tile.poseId" size="thumb" />
      <span class="character-archive-strip__kicker">{{ tile.kicker }}</span>
    </button>
    <figure
      v-else
      v-for="tile in tiles"
      :key="tile.poseId"
      class="character-archive-strip__tile"
    >
      <CharacterPortrait :pose-id="tile.poseId" size="thumb" />
      <figcaption class="character-archive-strip__kicker">{{ tile.kicker }}</figcaption>
    </figure>
  </div>
</template>

<style scoped>
.character-archive-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.character-archive-strip__tile {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.character-archive-strip__kicker {
  padding-top: 6px;
  font: italic 12px/1.3 var(--font-serif);
  color: var(--archive-ink);
  text-align: center;
}
/* 5C step 4: scene-switcher variant — tiles become buttons, active one
   is highlighted. Same layout, just interactive. */
.character-archive-strip__switcher {
  background: none;
  border: 1px solid transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  border-radius: 2px;
  transition: border-color 0.18s ease, transform 0.18s ease, background-color 0.18s ease;
}
.character-archive-strip__switcher:hover {
  border-color: color-mix(in srgb, var(--archive-gold) 60%, transparent);
  background-color: color-mix(in srgb, var(--archive-gold) 6%, transparent);
}
.character-archive-strip__switcher:focus-visible {
  outline: 2px solid var(--archive-gold);
  outline-offset: 2px;
}
.character-archive-strip__switcher.is-active {
  border-color: var(--archive-gold);
  background-color: color-mix(in srgb, var(--archive-gold) 12%, transparent);
  transform: translateY(-2px);
}
@media (max-width: 760px) {
  .character-archive-strip { gap: 6px; }
}
</style>
