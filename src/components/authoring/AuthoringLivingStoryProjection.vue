<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  projection: { type: Object, default: null },
  activeUnitId: { type: String, default: '' }
})
const emit = defineEmits(['locate', 'open-source', 'intervene'])

const FILTERS = Object.freeze([
  { id: 'all', label: '全部' },
  { id: 'causes', label: '因果' },
  { id: 'reveals', label: '揭示' },
  { id: 'changes', label: '改变' },
  { id: 'payoff', label: '兑现' }
])
const FUNCTION_LABELS = Object.freeze({
  transition: '转场', action: '动作', dialogue: '对话', reflection: '思考', exposition: '叙述'
})
const EFFECT_LABELS = Object.freeze({ reveals: '揭示', changes: '改变' })
const filter = ref('all')

const beatById = computed(() => new Map((props.projection?.beats || []).map((beat) => [beat.id, beat])))
const relatedBeatIds = computed(() => {
  const ids = new Set()
  if (!['causes', 'payoff'].includes(filter.value)) return ids
  for (const relation of props.projection?.relations || []) {
    if (relation.kind !== filter.value) continue
    ids.add(relation.fromBeatId)
    ids.add(relation.toBeatId)
  }
  return ids
})
const visibleScenes = computed(() => (props.projection?.scenes || []).map((scene) => ({
  ...scene,
  beats: scene.beatIds.map((id) => beatById.value.get(id)).filter((beat) => {
    if (!beat) return false
    if (filter.value === 'all') return true
    if (['reveals', 'changes'].includes(filter.value)) return beat.effects.includes(filter.value)
    return relatedBeatIds.value.has(beat.id)
  })
})).filter((scene) => scene.beats.length))

function relationsFrom(beatId) {
  return (props.projection?.relations || []).filter((relation) => (
    relation.fromBeatId === beatId && (filter.value === 'all' || filter.value === relation.kind)
  )).map((relation) => ({ ...relation, target: beatById.value.get(relation.toBeatId) })).filter((item) => item.target)
}

function openEntity(item) {
  if (!item?.sourceRef) return
  emit('open-source', item)
}

watch(() => props.projection?.fingerprint, () => { filter.value = 'all' })
</script>

<template>
  <section class="living-story" data-test="living-story-projection">
    <header class="living-story__summary">
      <div>
        <strong>本章故事线</strong>
        <span>{{ projection?.scenes?.length || 0 }} 场 · {{ projection?.beats?.length || 0 }} 拍 · {{ projection?.relations?.length || 0 }} 条明确关系</span>
      </div>
      <p>从正文、当前场和项目大纲即时派生，不单独保存。</p>
    </header>

    <nav class="living-story__filters" aria-label="故事关系筛选">
      <button
        v-for="item in FILTERS"
        :key="item.id"
        type="button"
        :class="{ active: filter === item.id }"
        :aria-pressed="(filter === item.id).toString()"
        @click="filter = item.id"
      >{{ item.label }}</button>
    </nav>

    <div v-if="projection?.beats?.length" class="living-story__lanes" aria-label="本章故事要素">
      <section v-if="projection.lanes.characters.length">
        <strong>人物</strong>
        <button v-for="item in projection.lanes.characters" :key="item.id" type="button" @click="openEntity(item)">{{ item.label }}</button>
      </section>
      <section v-if="projection.lanes.locations.length">
        <strong>地点</strong>
        <button v-for="item in projection.lanes.locations" :key="item.id" type="button" @click="openEntity(item)">{{ item.label }}</button>
      </section>
      <section v-if="projection.lanes.threads.length">
        <strong>线索</strong>
        <button v-for="item in projection.lanes.threads" :key="item.id" type="button" @click="openEntity(item)">{{ item.label }}</button>
      </section>
    </div>

    <ol v-if="visibleScenes.length" class="living-story__sequence">
      <li v-for="scene in visibleScenes" :key="scene.id" class="living-story__scene">
        <header>
          <span>{{ String(scene.index + 1).padStart(2, '0') }}</span>
          <strong>{{ scene.title }}</strong>
        </header>
        <ol>
          <li v-for="beat in scene.beats" :key="beat.id" class="living-story__beat" :class="{ active: beat.unitId === activeUnitId }">
            <span class="living-story__dot" aria-hidden="true"></span>
            <div class="living-story__beat-main">
              <button type="button" class="living-story__beat-copy" @click="emit('locate', beat)">
                <span>{{ FUNCTION_LABELS[beat.function] || '叙述' }}</span>
                <strong>{{ beat.title }}</strong>
              </button>
              <div v-if="beat.effects.length || beat.threads.length" class="living-story__beat-meta">
                <span v-for="effect in beat.effects" :key="effect">{{ EFFECT_LABELS[effect] }}</span>
                <button v-for="thread in beat.threads" :key="thread.id" type="button" @click="openEntity(thread)">{{ thread.label }}</button>
              </div>
              <button type="button" class="living-story__intervene" @click="emit('intervene', beat)">改变这里</button>
              <button
                v-for="relation in relationsFrom(beat.id)"
                :key="relation.id"
                type="button"
                class="living-story__relation"
                @click="emit('locate', relation.target)"
              ><span>{{ relation.label }}</span><strong>{{ relation.target.title }}</strong><span aria-hidden="true">→</span></button>
            </div>
          </li>
        </ol>
      </li>
    </ol>
    <div v-else-if="projection?.beats?.length" class="living-story__empty">本章没有符合这个筛选的故事节点。</div>
    <div v-else class="living-story__empty">
      <strong>还没有可投影的正文</strong>
      <span>开始写作后，这里会按场景和写作单元自动排列。</span>
    </div>
  </section>
</template>

<style scoped>
.living-story { min-width: 0; color: var(--text-primary); font-family: var(--font-sans); }
.living-story__summary { display: grid; gap: 7px; padding: 13px 14px 11px; border-bottom: 1px solid var(--border-subtle); }
.living-story__summary div { display: grid; gap: 3px; }
.living-story__summary strong { font-size: 13px; font-weight: 620; }
.living-story__summary span, .living-story__summary p { color: var(--text-secondary); font-size: 10px; line-height: 1.55; }
.living-story__summary p { margin: 0; }
.living-story__filters { display: flex; overflow-x: auto; padding: 0 14px; border-bottom: 1px solid var(--border-subtle); scrollbar-width: none; }
.living-story__filters button { flex: 0 0 auto; min-height: 36px; padding: 0 8px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-secondary); font: 11px/1 var(--font-sans); cursor: pointer; }
.living-story__filters button.active { border-bottom-color: var(--accent-primary); color: var(--text-primary); }
.living-story__filters button:focus-visible, .living-story button:focus-visible { outline: 2px solid var(--control-focus, currentColor); outline-offset: -2px; }
.living-story__lanes { display: grid; padding: 5px 14px 8px; border-bottom: 1px solid var(--border-subtle); }
.living-story__lanes section { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: baseline; gap: 4px; min-width: 0; padding-top: 5px; }
.living-story__lanes strong { color: var(--text-secondary); font-size: 10px; font-weight: 500; }
.living-story__lanes button { justify-self: start; min-width: 0; padding: 1px 0; border: 0; background: transparent; color: var(--text-primary); font: 11px/1.45 var(--font-sans); cursor: pointer; text-align: left; }
.living-story__lanes button + button { grid-column: 2; }
.living-story__sequence, .living-story__sequence ol { margin: 0; padding: 0; list-style: none; }
.living-story__scene > header { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 6px; align-items: baseline; padding: 14px 14px 7px; }
.living-story__scene > header span { color: var(--text-secondary); font: 9px/1 var(--font-sans); letter-spacing: .08em; }
.living-story__scene > header strong { font-size: 12px; font-weight: 620; }
.living-story__beat { position: relative; display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 6px; padding: 0 14px; }
.living-story__beat::before { position: absolute; inset-block: 0; inset-inline-start: 25px; width: 1px; content: ''; background: var(--border-subtle); }
.living-story__dot { position: relative; z-index: 1; width: 5px; height: 5px; margin: 17px auto 0; border-radius: 50%; background: var(--text-secondary); }
.living-story__beat.active .living-story__dot { width: 7px; height: 7px; background: var(--accent-primary); }
.living-story__beat-main { min-width: 0; padding: 8px 0 10px; border-bottom: 1px solid var(--border-subtle); }
.living-story__beat-copy { display: grid; width: 100%; gap: 3px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.living-story__beat-copy span { color: var(--text-secondary); font-size: 9px; }
.living-story__beat-copy strong { font-size: 11px; font-weight: 520; line-height: 1.65; }
.living-story__beat-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; padding-top: 5px; color: var(--text-secondary); font-size: 9px; }
.living-story__beat-meta button { padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
.living-story__intervene { min-height: 30px; margin-top: 2px; padding: 0; border: 0; background: transparent; color: var(--text-secondary); font: 10px/1 var(--font-sans); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
.living-story__intervene:hover, .living-story__beat-meta button:hover { color: var(--accent-primary); }
.living-story__relation { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 5px; align-items: baseline; width: 100%; min-height: 34px; padding: 6px 0; border: 0; border-top: 1px dotted var(--border-subtle); background: transparent; color: var(--text-secondary); font: 9px/1.45 var(--font-sans); text-align: left; cursor: pointer; }
.living-story__relation strong { overflow: hidden; color: var(--text-primary); font-size: 10px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.living-story__empty { display: grid; gap: 5px; padding: 28px 18px; color: var(--text-secondary); font-size: 11px; line-height: 1.6; text-align: center; }
.living-story__empty strong { color: var(--text-primary); font-size: 12px; }
@media (max-width: 720px) {
  .living-story__summary { padding-inline: 16px; }
  .living-story__filters { padding-inline: 8px; }
  .living-story__filters button { min-height: 44px; padding-inline: 10px; }
  .living-story__lanes { padding-inline: 16px; }
  .living-story__scene > header, .living-story__beat { padding-inline: 16px; }
  .living-story__beat::before { inset-inline-start: 27px; }
  .living-story__beat-copy, .living-story__intervene, .living-story__relation { min-height: 44px; }
}
</style>
