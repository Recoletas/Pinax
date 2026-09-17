<script setup>
defineProps({
  section: { type: Object, required: true },
  open: Boolean,
  navigation: Boolean
})

const emit = defineEmits(['toggle', 'open-detail'])
</script>

<template>
  <article
    class="ws-codex-section"
    :data-section="section.key"
    :class="{
      'ws-codex-section--open': open,
      'ws-codex-section--has-update': section.update > 0
    }"
  >
    <button
      v-if="navigation"
      type="button"
      class="ws-codex-section__trigger"
      :data-scene-rail-item="section.targetRef || undefined"
      :aria-label="section.actionLabel || `查看${section.label}详情`"
      @click="emit('toggle', section.key)"
    >
      <span class="ws-codex-section__summary">
        <strong class="ws-codex-section__label">{{ section.label }}</strong>
        <span class="ws-codex-section__latest" :class="{ 'is-empty': section.empty }">{{ section.latest }}</span>
        <span class="ws-codex-section__count" :class="{ 'is-single': section.count <= 1 }">{{ section.count }}</span>
        <span v-if="section.update > 0" class="ws-codex-section__new">+{{ section.update }}</span>
      </span>
      <span class="ws-codex-section__quick-detail" aria-hidden="true">›</span>
    </button>
    <!-- NB03：切换为真实 button，「查看详情」为兄弟 button（禁止交互嵌套） -->
    <div v-else class="ws-codex-section__trigger-wrap">
      <button
        type="button"
        class="ws-codex-section__trigger"
        :aria-expanded="open.toString()"
        @click="emit('toggle', section.key)"
      >
        <span class="ws-codex-section__summary">
          <strong class="ws-codex-section__label">{{ section.label }}</strong>
          <span class="ws-codex-section__latest" :class="{ 'is-empty': section.empty }">{{ section.latest }}</span>
          <span class="ws-codex-section__count" :class="{ 'is-single': section.count <= 1 }">{{ section.count }}</span>
          <span v-if="section.update > 0" class="ws-codex-section__new">+{{ section.update }}</span>
        </span>
      </button>
      <button
        type="button"
        class="ws-codex-section__quick-detail"
        :aria-label="section.actionLabel || `查看${section.label}详情`"
        @click.stop="emit('open-detail', section.key)"
      ><span aria-hidden="true">›</span></button>
    </div>
    <div v-if="open" class="ws-codex-section__body"><slot /></div>
  </article>
</template>

<style scoped>
.ws-codex-section {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}
.ws-codex-section__trigger-wrap {
  position: relative;
}
.ws-codex-section__trigger {
  appearance: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 24px 0 4px;
  width: 100%;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ws-codex-section__summary {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.ws-codex-section__label {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
}
.ws-codex-section__count,
.ws-codex-section__new {
  color: var(--text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.ws-codex-section__count.is-single { display: none; }
.ws-codex-section__new { color: var(--archive-olive); }
.ws-codex-section__latest {
  overflow: hidden;
  color: var(--text-secondary);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ws-codex-section__quick-detail {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 20px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: 400 18px/1 var(--font-sans, sans-serif);
  cursor: pointer;
}
.ws-codex-section__trigger:hover {
  background: color-mix(in srgb, var(--text-primary) 5%, transparent);
}
.ws-codex-section__trigger:focus-visible,
.ws-codex-section__quick-detail:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 2px;
}
.ws-codex-section__body { padding: 2px 0 10px; }
</style>
