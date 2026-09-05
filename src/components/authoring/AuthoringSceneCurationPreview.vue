<script setup>
import { computed } from 'vue'

const props = defineProps({
  draft: { type: Object, required: true },
  baseline: { type: Object, default: null },
  characterCandidates: { type: Array, default: () => [] },
  locationCandidates: { type: Array, default: () => [] },
  busy: Boolean,
  error: { type: Object, default: null }
})

const characterNames = computed(() => new Map(
  props.characterCandidates.map((item) => [String(item.id || ''), item.name || '未命名人物'])
))
const locationNames = computed(() => new Map(
  props.locationCandidates.map((item) => [String(item.id || ''), item.name || '未命名地点'])
))

function names(ids = []) {
  const selected = new Set(ids.map(String))
  const orderedIds = props.characterCandidates
    .map((item) => String(item.id || ''))
    .filter((id) => selected.delete(id))
  orderedIds.push(...[...selected].sort())
  const values = orderedIds.map((id) => characterNames.value.get(id) || '已失效人物')
  return values.length ? values.join('、') : '无人'
}

function locationName(id) {
  return id ? (locationNames.value.get(String(id)) || '已失效地点') : '未指定'
}

const rows = computed(() => {
  const baseline = props.baseline || props.draft
  return [
    {
      key: 'people',
      label: '人物',
      before: names(baseline.presentCharacterIds || []),
      after: names(props.draft.presentCharacterIds || [])
    },
    {
      key: 'location',
      label: '地点',
      before: locationName(baseline.locationId),
      after: locationName(props.draft.locationId)
    },
    {
      key: 'time',
      label: '时间',
      before: [baseline.time?.label, baseline.time?.period].filter(Boolean).join(' · ') || '未指定',
      after: [props.draft.time?.label, props.draft.time?.period].filter(Boolean).join(' · ') || '未指定'
    }
  ].map((row) => ({ ...row, changed: row.before !== row.after }))
})

const changed = computed(() => rows.value.some((row) => row.changed))
</script>

<template>
  <section class="authoring-scene-curation-preview" data-test="scene-curation-preview" aria-label="当前场草稿">
    <header>
      <div>
        <strong>调整这一处的现场</strong>
        <span>{{ changed ? '右侧改动尚未保存' : '在右侧选择人物、地点或时间' }}</span>
      </div>
    </header>

    <dl>
      <div v-for="row in rows" :key="row.key" :class="{ 'is-changed': row.changed }">
        <dt>{{ row.label }}</dt>
        <dd>
          <template v-if="row.changed"><del>{{ row.before }}</del><span aria-hidden="true">→</span></template>
          <strong>{{ row.after }}</strong>
        </dd>
      </div>
    </dl>

    <p v-if="error" role="alert">{{ error.message }}</p>
    <footer><span>{{ changed ? '在右侧保存后成为当前场' : '正文不会被自动改写' }}</span></footer>
  </section>
</template>

<style scoped>
.authoring-scene-curation-preview {
  width: 100%;
  padding: 13px 12px 11px 36px;
  border-block: 1px solid color-mix(in srgb, var(--archive-olive) 25%, var(--border-subtle));
  background: color-mix(in srgb, var(--archive-olive) 3%, transparent);
  color: var(--text-primary);
  font-family: var(--font-sans, sans-serif);
}
.authoring-scene-curation-preview header,
.authoring-scene-curation-preview footer,
.authoring-scene-curation-preview dd {
  display: flex;
  align-items: center;
}
.authoring-scene-curation-preview header,
.authoring-scene-curation-preview footer { justify-content: space-between; gap: 16px; }
.authoring-scene-curation-preview header > div { display: grid; gap: 2px; }
.authoring-scene-curation-preview header strong { font-size: 12px; font-weight: 650; }
.authoring-scene-curation-preview header span,
.authoring-scene-curation-preview footer span { color: var(--text-secondary); font-size: 11px; }
.authoring-scene-curation-preview dl { margin: 9px 0 8px; border-top: 1px solid var(--border-subtle); }
.authoring-scene-curation-preview dl > div {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  min-height: 34px;
  align-items: center;
  border-bottom: 1px solid var(--border-subtle);
}
.authoring-scene-curation-preview dt { color: var(--text-secondary); font-size: 11px; }
.authoring-scene-curation-preview dd { min-width: 0; gap: 8px; margin: 0; font-size: 12px; }
.authoring-scene-curation-preview dd del {
  max-width: 38%;
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.authoring-scene-curation-preview dd > span { color: var(--archive-olive); }
.authoring-scene-curation-preview dd strong { min-width: 0; overflow-wrap: anywhere; font-weight: 550; }
.authoring-scene-curation-preview .is-changed { box-shadow: inset 2px 0 color-mix(in srgb, var(--archive-olive) 55%, transparent); }
.authoring-scene-curation-preview p { margin: 7px 0; color: var(--signal-danger, var(--text-primary)); font-size: 11px; }
@media (max-width: 720px) {
  .authoring-scene-curation-preview { padding: 12px 8px 10px 28px; }
}
</style>
