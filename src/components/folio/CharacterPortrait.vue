<script setup>
import { computed } from 'vue'
import { useCharacterArt } from '@/composables/useCharacterArt'
import PosterStage from './PosterStage.vue'

const props = defineProps({
  poseId: { type: String, required: true },
  size: { type: String, default: 'thumb', validator: (v) => ['hero', 'thumb'].includes(v) },
  caption: { type: String, default: '' },
})

const { resolveArt } = useCharacterArt()
const art = computed(() => resolveArt({ poseId: props.poseId }))
</script>

<template>
  <figure :class="['character-portrait', `character-portrait--${size}`]">
    <PosterStage :image="art.src" :decorated="true" :aria-hidden="false" />
    <small
      v-if="art.status === 'stub'"
      class="is-archive-prop is-archive-prop--tape archive-stub-tape"
      :aria-label="`立绘未生成: ${art.label}`"
    >{{ art.label }}</small>
    <figcaption v-if="caption" class="character-portrait__caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.character-portrait {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  margin: 0;
}
.character-portrait--hero { max-width: 386px; width: 100%; aspect-ratio: 3/4; }
.character-portrait--thumb { max-width: 256px; width: 100%; aspect-ratio: 3/4; }
.archive-stub-tape {
  width: auto;
  min-width: 70px;
  height: auto;
  right: 8px;
  bottom: 8px;
  padding: 2px 10px;
  font: italic 11px/1.2 var(--font-serif);
  color: var(--archive-ink);
  border-radius: 2px;
  transform: rotate(-2deg);
}
.character-portrait__caption {
  padding-top: 8px;
  font: 400 14px/1.4 var(--font-serif);
  color: var(--archive-ink);
}
</style>
