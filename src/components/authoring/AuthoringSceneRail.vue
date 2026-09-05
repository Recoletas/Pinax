<script setup>
import { computed } from 'vue'

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
const MAX_PEOPLE = 4

const unread = computed(() => {
  const source = props.unreadCounts || props.projection?.unreadChanges || {}
  return ['characters', 'location', 'time', 'events', 'emergence'].reduce(
    (total, key) => total + (Number(source[key]) || 0),
    0
  )
})

// 投影状态（Task 8 Step 1）：当前落笔处 / 沿用上一章 / 未关联世界书 / 世界书已缺失。
const status = computed(() => {
  const projection = props.projection || {}
  if (projection.worldbookStatus === 'missing') return 'worldbook-missing'
  if (!projection.worldbookId || projection.worldbookStatus === 'unbound') return 'worldbook-unbound'
  if (projection.anchorStatus === 'inherited') return 'scene-inherited'
  return 'current-scene'
})

const STATUS_LABELS = {
  'current-scene': '当前落笔处',
  'scene-inherited': '沿用上一章',
  'worldbook-unbound': '未关联世界书',
  'worldbook-missing': '世界书已缺失'
}

const statusLabel = computed(() => STATUS_LABELS[status.value] || STATUS_LABELS['current-scene'])

// 人物行：合并视角/行动者/对象/在场去重，最多四人后收 +N。
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

const visiblePeople = computed(() => people.value.slice(0, MAX_PEOPLE))
const extraPeopleCount = computed(() => Math.max(0, people.value.length - MAX_PEOPLE))

// 未决事件只显示第一条，其余收进 +N。
const unresolvedEvents = computed(() => props.projection?.unresolvedEvents || [])
const topEvent = computed(() => unresolvedEvents.value[0] || null)
const extraEventCount = computed(() => Math.max(0, unresolvedEvents.value.length - 1))
const extraTotal = computed(() => extraPeopleCount.value + extraEventCount.value)

const emergenceCount = computed(() => (props.projection?.emergenceCandidates || []).length)
const topEmergenceId = computed(() => props.projection?.emergenceCandidates?.[0]?.id || '')

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
      <button type="button" class="wall__shelf-pin-btn scene-rail__edit" data-test="scene-edit" @click="emit('edit')">调整</button>
    </header>

    <p class="scene-rail__context">
      <span class="scene-rail__status" :data-scene-status="status">{{ statusLabel }}</span>
      <button
        v-if="status === 'worldbook-missing' || status === 'worldbook-unbound'"
        type="button"
        class="scene-rail__bind"
        data-test="scene-bind"
        @click="emit('bind-worldbook')"
      >{{ status === 'worldbook-missing' ? '重新关联' : '关联世界书' }}</button>
    </p>

    <div class="scene-rail__where">
      <button
        v-if="projection.location"
        type="button"
        class="scene-rail__where-btn scene-rail__line"
        :data-scene-rail-item="`location:${projection.location.id}`"
        @click="openDetail('location', projection.location.id)"
      >{{ projection.location.name || UNSPECIFIED }}<template v-if="projection.time"> · {{ projection.time.label || UNSPECIFIED }}</template></button>
      <span v-else class="scene-rail__line scene-rail__where-plain">{{ UNSPECIFIED }}</span>
    </div>

    <ul class="scene-rail__people">
      <li v-if="!visiblePeople.length" class="scene-rail__empty">
        <span>{{ UNSPECIFIED }}</span>
      </li>
      <li v-for="person in visiblePeople" :key="person.id || person.name" class="scene-rail__item">
        <button
          type="button"
          class="scene-rail__person"
          :data-id="person.id"
          :data-scene-rail-item="person.id ? `character:${person.id}` : undefined"
          :disabled="!person.id"
          @click="openPerson(person)"
        >
          <span class="scene-rail__person-name">{{ person.name }}</span>
        </button>
      </li>
      <li v-if="extraPeopleCount > 0" class="scene-rail__more" data-test="scene-more-people">+{{ extraPeopleCount }}</li>
    </ul>

    <div v-if="topEvent" class="scene-rail__event">
      <button
        type="button"
        class="scene-rail__event-btn"
        :data-scene-rail-item="`event:${topEvent.id}`"
        @click="openDetail('event', topEvent.id)"
      >
        <span class="scene-rail__event-label">未决：{{ topEvent.label }}</span>
      </button>
      <button
        type="button"
        class="scene-rail__set"
        @click="emit('advance-with', topEvent.id)"
      >以此推进</button>
    </div>
    <p v-if="extraTotal > 0" class="scene-rail__more" data-test="scene-more">+{{ extraTotal }}</p>

    <!-- spec §8.3：涌现候选在左栏只显示待查看 +N，点击进入右侧审阅详情。 -->
    <div v-if="emergenceCount > 0" class="scene-rail__event">
      <button
        type="button"
        class="scene-rail__event-btn"
        data-test="emergence-entry"
        :data-scene-rail-item="`emergence:${topEmergenceId}`"
        @click="emit('open-detail', { kind: 'emergence', id: topEmergenceId })"
      >
        <span class="scene-rail__event-label scene-rail__emergence-label">待审候选 <span class="scene-rail__unread">+{{ emergenceCount }}</span></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* 与稿件导航同一套文字层级（.wall__folder 节奏）：无卡片底、无圆角容器、无渐变、无彩色左边框徽标行。 */
.scene-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.scene-rail__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.scene-rail__title {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--archive-ink) 78%, transparent);
}
.scene-rail__edit {
  margin-left: auto;
  padding: 2px 8px;
  font-size: 10px;
}
.scene-rail__unread {
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  font-weight: 700;
  color: var(--archive-olive);
}
.scene-rail__context {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.scene-rail__status {
  color: var(--text-secondary);
  font-size: 11px;
}
.scene-rail__status[data-scene-status='worldbook-missing'] {
  color: var(--signal-danger, #a04b3c);
}
.scene-rail__bind {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  padding: 1px 2px;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.scene-rail__bind:hover {
  color: var(--archive-olive);
}
.scene-rail__bind:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.scene-rail__where {
  display: flex;
  align-items: baseline;
  min-width: 0;
}
.scene-rail__line {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-rail__where-btn,
.scene-rail__event-btn,
.scene-rail__person {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 1px 2px;
  cursor: pointer;
  min-width: 0;
}
.scene-rail__where-btn:hover:not(:disabled),
.scene-rail__event-btn:hover,
.scene-rail__person:hover:not(:disabled) {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.scene-rail__where-btn:focus-visible,
.scene-rail__set:focus-visible,
.scene-rail__event-btn:focus-visible,
.scene-rail__person:focus-visible,
.scene-rail__edit:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.scene-rail__where-plain {
  color: var(--text-secondary);
}
.scene-rail__people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.scene-rail__empty,
.scene-rail__more {
  color: var(--text-secondary);
}
.scene-rail__person-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  max-width: 100%;
}
.scene-rail__set {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  padding: 1px 3px;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  flex-shrink: 0;
}
.scene-rail__set:hover:not(:disabled) {
  color: var(--archive-olive);
}
.scene-rail__event {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border-top: 1px dashed color-mix(in srgb, var(--border) 70%, transparent);
  padding-top: 4px;
  min-width: 0;
}
.scene-rail__event-btn {
  min-width: 0;
  flex: 1;
}
.scene-rail__event-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
</style>
