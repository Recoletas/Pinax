<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  model: {
    type: Object,
    default: () => ({ beatItems: [], unplacedItems: [], relationItems: [] })
  },
  selectedCardId: { type: String, default: '' },
  relationTypes: { type: Array, required: true },
  directorExportStatus: { type: Object, default: null }
})

const emit = defineEmits([
  'select-card',
  'open-source',
  'add-to-beats',
  'remove-from-beats',
  'move-beat',
  'set-relation'
])

const mobileTab = ref('beats')
const showAllUnplaced = ref(false)
const relationCardIds = ref([])
const selectedRelationType = ref(props.relationTypes[0]?.value || '')

const allItems = computed(() => {
  const seen = new Set()
  return [...(props.model.beatItems || []), ...(props.model.unplacedItems || [])]
    .filter((item) => {
      const cardId = item?.card?.id
      if (!cardId || seen.has(cardId)) return false
      seen.add(cardId)
      return true
    })
})
const displayedUnplaced = computed(() => showAllUnplaced.value
  ? props.model.unplacedItems || []
  : (props.model.unplacedItems || []).slice(0, 4))
const hiddenUnplacedCount = computed(() => Math.max(
  0,
  (props.model.unplacedItems || []).length - displayedUnplaced.value.length
))

watch(() => props.relationTypes, (types) => {
  if (!types.some((item) => item.value === selectedRelationType.value)) {
    selectedRelationType.value = types[0]?.value || ''
  }
}, { deep: true })

watch(allItems, (items) => {
  const availableIds = new Set(items.map((item) => item.card.id))
  relationCardIds.value = relationCardIds.value.filter((id) => availableIds.has(id))
})

function cardTitle(card) {
  return String(card?.title || card?.content || '无标题素材').trim().slice(0, 42)
}

function sourceStateLabel(sourceState) {
  if (sourceState?.state === 'archived') return '来源已归档'
  if (sourceState?.state === 'detached') return '来源已断开'
  if (sourceState?.state === 'untracked') return '未追踪来源'
  return '来源已连接'
}

function toggleRelationCard(cardId) {
  if (!cardId) return
  if (relationCardIds.value.includes(cardId)) {
    relationCardIds.value = relationCardIds.value.filter((id) => id !== cardId)
    return
  }
  relationCardIds.value = [...relationCardIds.value.slice(-1), cardId]
}

function setRelationType(type) {
  selectedRelationType.value = type
  if (relationCardIds.value.length !== 2) return
  emit('set-relation', {
    sourceId: relationCardIds.value[0],
    targetId: relationCardIds.value[1],
    type
  })
}

function openSource(item) {
  if (!['linked', 'archived'].includes(item?.sourceState?.state)) return
  emit('open-source', item.card)
}
</script>

<template>
  <section class="scene-material-board" data-scene-material-board>
    <header class="scene-material-board__header">
      <div>
        <p class="scene-material-board__eyebrow">场景组织</p>
        <h2>场景板</h2>
      </div>
      <span
        v-if="directorExportStatus"
        class="scene-material-board__version"
        :class="`is-${directorExportStatus.kind || 'empty'}`"
      >
        {{ directorExportStatus.title }}
      </span>
    </header>

    <nav class="scene-material-board__mobile-tabs control-group" aria-label="场景板区域">
      <button type="button" class="control-toggle" :aria-pressed="mobileTab === 'relations'" @click="mobileTab = 'relations'">关系</button>
      <button type="button" class="control-toggle" :aria-pressed="mobileTab === 'beats'" @click="mobileTab = 'beats'">节拍</button>
      <button type="button" class="control-toggle" :aria-pressed="mobileTab === 'unplaced'" @click="mobileTab = 'unplaced'">待选素材</button>
    </nav>

    <div class="scene-material-board__layout" :data-mobile-tab="mobileTab">
      <div class="scene-material-board__main">
        <section class="scene-board-region scene-board-region--relations" aria-labelledby="scene-relations-title">
          <header class="scene-board-region__header">
            <div>
              <h3 id="scene-relations-title">关系编组</h3>
              <p>明确选中两张卡片，再指定关系。</p>
            </div>
            <span>{{ model.relationItems?.length || 0 }} 条</span>
          </header>

          <div v-if="allItems.length" class="scene-relation-picker" aria-label="选择两张关系卡片">
            <button
              v-for="item in allItems"
              :key="item.card.id"
              type="button"
              class="scene-card-button control-toggle"
              :aria-pressed="relationCardIds.includes(item.card.id)"
              @click="toggleRelationCard(item.card.id)"
            >
              {{ cardTitle(item.card) }}
            </button>
          </div>
          <p v-if="relationCardIds.length !== 2" class="scene-board-empty">请选择两张卡片建立关系</p>

          <div class="scene-relation-types" role="group" aria-label="关系类型">
            <button
              v-for="relationType in relationTypes"
              :key="relationType.value"
              type="button"
              class="control-toggle"
              :aria-pressed="selectedRelationType === relationType.value"
              :disabled="relationCardIds.length !== 2"
              @click="setRelationType(relationType.value)"
            >
              {{ relationType.label }}
            </button>
          </div>

          <ol v-if="model.relationItems?.length" class="scene-relation-list">
            <li v-for="item in model.relationItems" :key="item.edge.id">
              <span>{{ cardTitle(item.sourceCard) }}</span>
              <strong>{{ relationTypes.find((type) => type.value === item.edge.type)?.label || item.edge.type }}</strong>
              <span>{{ cardTitle(item.targetCard) }}</span>
            </li>
          </ol>
        </section>

        <section class="scene-board-region scene-board-region--beats" aria-labelledby="scene-beats-title">
          <header class="scene-board-region__header">
            <div>
              <h3 id="scene-beats-title">节拍</h3>
              <p>顺序直接沿用当前时间轴。</p>
            </div>
            <span>{{ model.beatItems?.length || 0 }} 拍</span>
          </header>

          <ol v-if="model.beatItems?.length" class="scene-beat-list">
            <li
              v-for="(item, index) in model.beatItems"
              :key="item.card.id"
              class="scene-beat-item"
              :class="{ 'is-selected': selectedCardId === item.card.id }"
            >
              <button type="button" class="scene-beat-item__select" @click="emit('select-card', item.card.id)">
                <span class="scene-beat-item__sequence">{{ item.sequence }}</span>
                <span class="scene-beat-item__copy">
                  <strong>{{ cardTitle(item.card) }}</strong>
                  <small>{{ sourceStateLabel(item.sourceState) }}</small>
                </span>
              </button>
              <div class="scene-beat-item__actions">
                <button
                  type="button"
                  class="control-icon"
                  :aria-label="`把第 ${item.sequence} 个节拍上移`"
                  :disabled="index === 0"
                  @click="emit('move-beat', { fromIndex: index, toIndex: index - 1 })"
                >↑</button>
                <button
                  type="button"
                  class="control-icon"
                  :aria-label="`把第 ${item.sequence} 个节拍下移`"
                  :disabled="index === model.beatItems.length - 1"
                  @click="emit('move-beat', { fromIndex: index, toIndex: index + 1 })"
                >↓</button>
                <button
                  v-if="['linked', 'archived'].includes(item.sourceState?.state)"
                  type="button"
                  class="control-quiet"
                  @click="openSource(item)"
                >来源</button>
                <button type="button" class="control-quiet" @click="emit('remove-from-beats', item.card.id)">移出</button>
              </div>
            </li>
          </ol>
          <p v-else class="scene-board-empty">从待选素材加入第一个节拍</p>
        </section>
      </div>

      <aside class="scene-board-region scene-board-region--unplaced" aria-labelledby="scene-unplaced-title">
        <header class="scene-board-region__header">
          <div>
            <h3 id="scene-unplaced-title">待选素材</h3>
            <p>已在画布、尚未进入节拍。</p>
          </div>
          <span>{{ model.unplacedItems?.length || 0 }} 项</span>
        </header>

        <ul v-if="displayedUnplaced.length" class="scene-unplaced-list">
          <li v-for="item in displayedUnplaced" :key="item.card.id" :class="{ 'is-selected': selectedCardId === item.card.id }">
            <button type="button" class="scene-unplaced-card" @click="emit('select-card', item.card.id)">
              <strong>{{ cardTitle(item.card) }}</strong>
              <small>{{ sourceStateLabel(item.sourceState) }}</small>
            </button>
            <div class="scene-unplaced-card__actions">
              <button
                v-if="['linked', 'archived'].includes(item.sourceState?.state)"
                type="button"
                class="control-quiet"
                @click="openSource(item)"
              >来源</button>
              <button type="button" class="control-secondary" @click="emit('add-to-beats', item.card.id)">加入节拍</button>
            </div>
          </li>
        </ul>
        <p v-else class="scene-board-empty">没有待选素材</p>
        <button
          v-if="hiddenUnplacedCount"
          type="button"
          class="scene-unplaced-more control-quiet"
          @click="showAllUnplaced = true"
        >显示其余 {{ hiddenUnplacedCount }} 项</button>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.scene-material-board {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--archive-paper) 40%, var(--surface-panel));
  color: var(--text-primary);
}

.scene-material-board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 42%, transparent);
}

.scene-material-board__eyebrow,
.scene-board-region__header p {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.scene-material-board__header h2,
.scene-board-region__header h3 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
}

.scene-material-board__header h2 { font-size: 20px; }
.scene-board-region__header h3 { font-size: 14px; }

.scene-material-board__version {
  max-width: 180px;
  color: var(--text-secondary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-material-board__version.is-current { color: var(--accent); }
.scene-material-board__version.is-stale,
.scene-material-board__version.is-warning { color: var(--warning); }
.scene-material-board__version.is-error { color: var(--danger); }

.scene-material-board__layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 30%);
  overflow: hidden;
}

.scene-material-board__main,
.scene-board-region--unplaced {
  min-height: 0;
  overflow-y: auto;
}

.scene-material-board__main { padding: 16px 18px 24px; }
.scene-board-region--unplaced {
  padding: 16px 14px 24px;
  border-left: 1px solid color-mix(in srgb, var(--archive-gold) 34%, transparent);
}

.scene-board-region + .scene-board-region { margin-top: 22px; }

.scene-board-region__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 9px;
  border-bottom: 1px dashed color-mix(in srgb, var(--archive-gold) 36%, transparent);
}

.scene-board-region__header > span {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.scene-relation-picker,
.scene-relation-types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.scene-card-button {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-relation-list,
.scene-beat-list,
.scene-unplaced-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.scene-relation-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  font-size: 11px;
}

.scene-relation-list strong { color: var(--accent); font-weight: 500; }

.scene-beat-item,
.scene-unplaced-list li {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.scene-beat-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}

.scene-beat-item.is-selected,
.scene-unplaced-list li.is-selected {
  box-shadow: inset 2px 0 0 var(--accent);
}

.scene-beat-item__select,
.scene-unplaced-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.scene-beat-item__sequence {
  width: 24px;
  color: var(--accent);
  font-family: var(--font-display);
  font-size: 18px;
  text-align: center;
}

.scene-beat-item__copy,
.scene-unplaced-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.scene-beat-item__copy strong,
.scene-unplaced-card strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.scene-beat-item__copy small,
.scene-unplaced-card small {
  color: var(--text-muted);
  font-size: 10px;
}

.scene-beat-item__actions,
.scene-unplaced-card__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.scene-unplaced-list li {
  padding: 9px 0;
}

.scene-unplaced-card { width: 100%; }
.scene-unplaced-card__actions { justify-content: flex-end; padding: 0 8px 4px; }
.scene-unplaced-more { margin-top: 10px; }

.scene-board-empty {
  margin: 12px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.scene-material-board__mobile-tabs { display: none; }

.scene-material-board button:focus-visible {
  outline: 2px solid var(--control-focus, var(--accent));
  outline-offset: 2px;
}

@media (max-width: 760px) {
  .scene-material-board__header { padding: 10px 12px; }
  .scene-material-board__mobile-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--archive-gold) 36%, transparent);
  }
  .scene-material-board__mobile-tabs button,
  .scene-material-board button {
    min-height: 44px;
  }
  .scene-material-board__layout { display: block; overflow-y: auto; }
  .scene-material-board__main,
  .scene-board-region--unplaced { display: none; overflow: visible; }
  .scene-material-board__layout[data-mobile-tab='relations'] .scene-material-board__main,
  .scene-material-board__layout[data-mobile-tab='beats'] .scene-material-board__main {
    display: block;
    padding: 12px;
  }
  .scene-material-board__layout[data-mobile-tab='relations'] .scene-board-region--beats,
  .scene-material-board__layout[data-mobile-tab='beats'] .scene-board-region--relations {
    display: none;
  }
  .scene-material-board__layout[data-mobile-tab='unplaced'] .scene-board-region--unplaced {
    display: block;
    padding: 12px;
    border-left: 0;
  }
  .scene-beat-item { grid-template-columns: minmax(0, 1fr); }
  .scene-beat-item__actions { justify-content: flex-end; }
  .scene-relation-list li { grid-template-columns: minmax(0, 1fr); }
}
</style>
