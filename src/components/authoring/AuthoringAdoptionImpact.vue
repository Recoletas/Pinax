<template>
  <aside class="authoring-adoption-impact" data-test="adoption-impact" aria-live="polite">
    <span class="authoring-adoption-impact__mark" aria-hidden="true"></span>
    <div>
      <strong>{{ impact.headline }}</strong>
      <span v-if="impact.details?.length">{{ impact.details.join(' · ') }}</span>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  impact: { type: Object, required: true }
})
</script>

<style scoped>
.authoring-adoption-impact {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 14px 9px 38px;
  border-block: 1px solid color-mix(in srgb, var(--archive-olive) 12%, var(--border-subtle));
  background: color-mix(in srgb, var(--archive-olive) 4%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
  pointer-events: none;
}

.authoring-adoption-impact__mark {
  width: 3px;
  height: 24px;
  flex: 0 0 auto;
  background: color-mix(in srgb, var(--archive-olive) 58%, var(--border-subtle));
}

.authoring-adoption-impact div {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 10px;
}

.authoring-adoption-impact strong {
  color: var(--text-primary);
  font-weight: 620;
}

@media (max-width: 759px) {
  .authoring-adoption-impact {
    min-height: 44px;
    padding-inline: 16px 10px;
  }
}
</style>
