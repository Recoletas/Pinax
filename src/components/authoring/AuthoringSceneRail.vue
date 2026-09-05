<script setup>
import { computed } from 'vue'
import SceneIndexSection from '../scene/SceneIndexSection.vue'

// worldbook scene closure Task 8：左侧“当前场”索引。
// 纯展示组件：只读取共享现场投影；交互只有 打开详情 / 以此推进 / 调整 / 关联世界书
// 四类事件，全部上抛给页面。行动者/对象选择归 Composer（Task 9）。
// 视觉与稿件导航同一套文字层级：连续文本列表、下划线活动态、无卡片/胶囊/横滚。

const props = defineProps({
  projection: {
    type: Object,
    required: true
  },
  unreadCounts: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['open-detail', 'advance-with', 'edit', 'bind-worldbook'])

const UNSPECIFIED = '未指定'

const unread = computed(() => {
  const source = props.unreadCounts || props.projection?.unreadChanges || {}
  return ['characters', 'location', 'time', 'events', 'emergence'].reduce(
    (total, key) => total + (Number(source[key]) || 0),
    0
  )
})

// 投影状态：把“来源状态”和“是否需要作者处理”分开表达。
const status = computed(() => {
  const projection = props.projection || {}
  if (projection.worldbookStatus === 'missing') return 'worldbook-missing'
  if (!projection.worldbookId || projection.worldbookStatus === 'unbound') return 'worldbook-unbound'
  if (projection.anchorStatus === 'worldbook-mismatch') return 'scene-conflict'
  if (projection.anchorStatus === 'inherited') return 'scene-inherited'
  if (projection.anchorStatus === 'no-anchor') return 'scene-unset'
  return 'current-scene'
})

const STATUS_LABELS = {
  'current-scene': '当前落笔处',
  'scene-inherited': '沿用前文',
  'scene-unset': '待设置',
  'scene-conflict': '需重新确认',
  'worldbook-unbound': '未关联世界书',
  'worldbook-missing': '世界书已缺失'
}

const statusLabel = computed(() => STATUS_LABELS[status.value] || STATUS_LABELS['current-scene'])

// 人物行：合并视角/行动者/对象/在场去重。
const people = computed(() => {
  const projection = props.projection || {}
  const byId = new Map()
  function ensure(person) {
    if (!person?.id && !person?.name) return null
    const id = person.id || person.name
    let entry = byId.get(id)
    if (!entry) {
      entry = { id: person.id || '', name: person.name || UNSPECIFIED }
      byId.set(id, entry)
    }
    return entry
  }
  ensure(projection.viewpointCharacter)
  ensure(projection.activeActor)
  ensure(projection.dialogueTarget)
  for (const person of projection.presentCharacters || []) {
    ensure(person)
  }
  return [...byId.values()]
})

const unresolvedEvents = computed(() => props.projection?.unresolvedEvents || [])
const topEvent = computed(() => unresolvedEvents.value[0] || null)

const emergenceCount = computed(() => (props.projection?.emergenceCandidates || []).length)
const topEmergenceId = computed(() => props.projection?.emergenceCandidates?.[0]?.id || '')
const missingRefCount = computed(() => (props.projection?.missingRefs || []).length)

const sceneSections = computed(() => {
  const projection = props.projection || {}
  const updates = props.unreadCounts || projection.unreadChanges || {}
  const characterNames = people.value.map((person) => person.name).filter(Boolean)
  const plannedNames = (projection.plannedCharacters || []).map((person) => person.name).filter(Boolean)
  const topEmergence = projection.emergenceCandidates?.[0]
  return [
    {
      key: 'time', label: '时间', count: projection.time ? 1 : 0,
      latest: projection.time?.label || '补充时间', empty: !projection.time, update: Number(updates.time) || 0,
      actionLabel: projection.time ? '查看时间详情' : '补充本场时间',
      targetRef: projection.time?.id ? `time:${projection.time.id}` : ''
    },
    {
      key: 'characters', label: '人物', count: people.value.length,
      latest: [
        characterNames.slice(0, 2).join('、'),
        plannedNames.length ? `待入场：${plannedNames.join('、')}` : ''
      ].filter(Boolean).join('　') || '添加在场人物', empty: !people.value.length, update: Number(updates.characters) || 0,
      actionLabel: people.value.length ? '查看人物详情' : '从世界书添加在场人物',
      targetRef: (projection.viewpointCharacter || people.value[0])?.id
        ? `character:${(projection.viewpointCharacter || people.value[0]).id}` : ''
    },
    {
      key: 'locations', label: '地点', count: projection.location ? 1 : 0,
      latest: projection.location?.name || '选择本场地点', empty: !projection.location, update: Number(updates.location) || 0,
      actionLabel: projection.location ? '查看地点详情' : '从世界书选择本场地点',
      targetRef: projection.location?.id ? `location:${projection.location.id}` : ''
    },
    {
      key: 'events', label: '事件', count: unresolvedEvents.value.length + emergenceCount.value,
      latest: topEvent.value?.label || topEmergence?.title || topEmergence?.summary || '推演本场',
      empty: !topEvent.value && !topEmergence,
      actionLabel: topEvent.value || topEmergence ? '查看事件详情' : '推演本场',
      update: (Number(updates.events) || 0) + (Number(updates.emergence) || 0),
      targetRef: topEvent.value?.id ? `event:${topEvent.value.id}` : (topEmergence?.id ? `emergence:${topEmergence.id}` : '')
    }
  ]
})

function openSection(key) {
  const projection = props.projection || {}
  if (key === 'time') {
    if (projection.time?.id) openDetail('time', projection.time.id)
    else emit('edit', { axis: 'time' })
    return
  }
  if (key === 'characters') {
    const person = projection.viewpointCharacter || people.value[0]
    if (person) openPerson(person)
    else emit('edit', { axis: 'people' })
    return
  }
  if (key === 'locations') {
    if (projection.location?.id) openDetail('location', projection.location.id)
    else emit('edit', { axis: 'location' })
    return
  }
  if (key !== 'events') return
  if (topEvent.value) openDetail('event', topEvent.value.id)
  else if (topEmergenceId.value) emit('open-detail', { kind: 'emergence', id: topEmergenceId.value })
  else emit('advance-with', '')
}

function openPerson(person) {
  if (!person.id) return
  emit('open-detail', { kind: 'character', id: person.id })
}

function openDetail(kind, id) {
  if (!id) return
  emit('open-detail', { kind, id })
}
</script>

<template>
  <section class="scene-rail" aria-label="当前场">
    <header class="scene-rail__head">
      <span class="scene-rail__title">当前场</span>
      <span v-if="unread > 0" class="scene-rail__unread" aria-label="未查看变化">+{{ unread }}</span>
      <span
        class="scene-rail__status"
        :class="{ 'is-redundant': !['scene-inherited', 'scene-unset', 'scene-conflict'].includes(status) }"
        :data-scene-status="status"
      >{{ statusLabel }}</span>
      <span class="scene-rail__actions">
        <button type="button" class="scene-rail__edit" data-test="scene-edit" data-scene-rail-item="scene-edit" title="调整当前场" @click="emit('edit')">调整</button>
      </span>
    </header>

    <button
      v-if="status === 'worldbook-missing' || status === 'worldbook-unbound' || status === 'scene-conflict' || missingRefCount"
      type="button"
      class="scene-rail__binding-hint"
      data-test="scene-bind"
      @click="status === 'worldbook-missing' || status === 'worldbook-unbound' ? emit('bind-worldbook') : emit('edit')"
    >
      <span>{{ status === 'worldbook-missing'
        ? '现场来源已失效'
        : status === 'worldbook-unbound'
          ? '从世界书添加人物与地点'
          : status === 'scene-conflict'
            ? '现场属于另一世界书'
            : `${missingRefCount} 条现场引用已失效` }}</span>
      <span>{{ status === 'worldbook-missing'
        ? '重新关联'
        : status === 'worldbook-unbound'
          ? '关联'
          : '清理' }} ›</span>
    </button>

    <div class="scene-rail__index ws-live-codex">
      <SceneIndexSection
        v-for="section in sceneSections"
        :key="section.key"
        :section="section"
        :open="false"
        navigation
        @toggle="openSection"
        @open-detail="openSection"
      />
    </div>
  </section>
</template>

<style scoped>
.scene-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px 10px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.scene-rail__head {
  display: flex;
  align-items: center;
  min-height: 26px;
  gap: 6px;
}
.scene-rail__title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.scene-rail__status.is-redundant {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.scene-rail__unread {
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--archive-olive-strong);
}
.scene-rail__status {
  min-width: 0;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-rail__status[data-scene-status='worldbook-missing'],
.scene-rail__status[data-scene-status='scene-conflict'] {
  color: var(--signal-danger, #a04b3c);
}
.scene-rail__actions {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-left: auto;
  white-space: nowrap;
}
.scene-rail__edit {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: 11px/1.2 var(--font-sans, sans-serif);
  padding: 2px 0;
  cursor: pointer;
}
.scene-rail__edit:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.scene-rail__edit:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}

.scene-rail__binding-hint {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 0 1px 3px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: 10px/1.35 var(--font-sans, sans-serif);
  text-align: left;
  cursor: pointer;
}
.scene-rail__binding-hint span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-rail__binding-hint span:last-child {
  color: var(--archive-olive-strong);
}
.scene-rail__binding-hint:hover span:last-child {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.scene-rail__binding-hint:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}

.scene-rail__index {
  border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
}
.scene-rail__index :deep(.ws-codex-section__trigger) {
  min-height: 32px;
  padding: 0 1px;
}
.scene-rail__index :deep(.ws-codex-section__summary) {
  grid-template-columns: 30px minmax(0, 1fr) auto auto;
  gap: 6px;
}
.scene-rail__index :deep(.ws-codex-section__label) {
  font-size: 10px;
  letter-spacing: 0.04em;
}
.scene-rail__index :deep(.ws-codex-section__latest) {
  font-size: 11.5px;
}
.scene-rail__index :deep(.ws-codex-section__latest.is-empty) {
  color: var(--text-secondary);
}
.scene-rail__index :deep(.ws-codex-section__count) {
  border: 0;
  background: transparent;
  font-size: 9px;
}
.scene-rail__index :deep(.ws-codex-section__quick-detail) {
  width: 17px;
  height: 24px;
}
</style>
