<script setup>
import { computed, ref, watch } from 'vue'

// worldbook scene closure Task 10：右侧检查器的现场调整（受控组件）。
// 不访问 store/localStorage/provider；所有状态经 props 进入、事件上抛。
// 布局固定为 时间 → 地点 → 人物，无三 tab 切换。

const props = defineProps({
  draft: { type: Object, required: true },
  worldbookStatus: { type: String, required: true },
  characterCandidates: { type: Array, default: () => [] },
  locationCandidates: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  error: { type: Object, default: null },
  canUndo: { type: Boolean, default: false }
})

const emit = defineEmits(['update-draft', 'save', 'cancel', 'undo', 'bind-worldbook', 'search'])

const locationQuery = ref('')
const peopleQuery = ref('')

watch(() => props.draft?.unitId, () => {
  locationQuery.value = ''
  peopleQuery.value = ''
})

function patchDraft(patch) {
  emit('update-draft', { ...props.draft, ...patch })
}

const timeLabel = computed(() => props.draft?.time?.label || '')
const timePeriod = computed(() => props.draft?.time?.period || '')

const filteredLocations = computed(() => filterCandidates(props.locationCandidates, locationQuery.value))
const filteredPeople = computed(() => filterCandidates(props.characterCandidates, peopleQuery.value))

// 就地过滤：候选列表已由页面按查询词搜索完整目录，这里只做本地二次收敛。
function filterCandidates(candidates, query) {
  const normalized = String(query).trim().toLocaleLowerCase()
  if (!normalized) return candidates
  return candidates.filter((item) => item.name.toLocaleLowerCase().includes(normalized))
}

function togglePerson(candidate) {
  const current = new Set(props.draft.presentCharacterIds || [])
  if (current.has(candidate.id)) current.delete(candidate.id)
  else current.add(candidate.id)
  patchDraft({ presentCharacterIds: [...current] })
}

function isSelected(candidate) {
  return (props.draft.presentCharacterIds || []).includes(candidate.id)
}
</script>

<template>
  <section class="writing-inspector-detail scene-curation" aria-label="现场调整">
    <button type="button" class="writing-inspector-detail__back" @click="emit('cancel')">← 取消并返回</button>
    <h3 class="scene-curation__title">现场调整 · 当前落笔处</h3>

    <p v-if="worldbookStatus === 'missing'" class="scene-curation__warning">
      世界书已缺失
      <button type="button" @click="emit('bind-worldbook')">重新关联</button>
    </p>
    <p v-else-if="worldbookStatus === 'unbound'" class="scene-curation__warning">
      未关联世界书
      <button type="button" @click="emit('bind-worldbook')">关联世界书</button>
    </p>

    <div class="writing-inspector__list scene-curation__body">
      <label class="scene-curation__field">
        <span>时间标签</span>
        <input
          type="text"
          :value="timeLabel"
          data-test="curation-time-label"
          @input="patchDraft({ time: { ...props.draft.time, label: $event.target.value } })"
        />
      </label>
      <label class="scene-curation__field">
        <span>时间段</span>
        <input
          type="text"
          :value="timePeriod"
          data-test="curation-time-period"
          @input="patchDraft({ time: { ...props.draft.time, period: $event.target.value } })"
        />
      </label>

      <div class="scene-curation__field">
        <span>地点</span>
        <input
          type="text"
          :value="locationQuery"
          data-test="curation-location-query"
          placeholder="搜索绑定世界书中的地点"
          @input="emit('search', { axis: 'location', query: $event.target.value }); locationQuery = $event.target.value"
        />
        <ul class="scene-curation__options" role="listbox" aria-label="地点候选">
          <li v-for="candidate in filteredLocations" :key="candidate.id">
            <button
              type="button"
              role="option"
              :aria-selected="(draft.locationId === candidate.id).toString()"
              @click="patchDraft({ locationId: candidate.id })"
            >{{ candidate.name }}</button>
          </li>
          <li v-if="!filteredLocations.length && !locationQuery" class="scene-curation__empty">打开世界书</li>
        </ul>
      </div>

      <div class="scene-curation__field">
        <span>在场人物</span>
        <input
          type="text"
          :value="peopleQuery"
          data-test="curation-people-query"
          placeholder="搜索绑定世界书中的人物"
          @input="emit('search', { axis: 'character', query: $event.target.value }); peopleQuery = $event.target.value"
        />
        <ul class="scene-curation__options" role="listbox" aria-label="人物候选">
          <li v-for="candidate in filteredPeople" :key="candidate.id">
            <button
              type="button"
              role="option"
              :aria-selected="isSelected(candidate).toString()"
              @click="togglePerson(candidate)"
            >{{ isSelected(candidate) ? '✓' : '' }} {{ candidate.name }}</button>
          </li>
          <li v-if="!filteredPeople.length && !peopleQuery" class="scene-curation__empty">打开世界书</li>
        </ul>
      </div>
    </div>

    <p v-if="error" class="scene-curation__error" role="alert">{{ error.message }}</p>

    <footer class="writing-inspector__actions scene-curation__actions">
      <button type="button" data-test="curation-save" :disabled="busy" @click="emit('save')">保存</button>
      <button type="button" data-test="curation-cancel" :disabled="busy" @click="emit('cancel')">取消</button>
      <button v-if="canUndo" type="button" data-test="curation-undo" :disabled="busy" @click="emit('undo')">撤销上次保存</button>
    </footer>
  </section>
</template>

<style scoped>
/* 复用检查器既有结构类（.writing-inspector__list / __actions），不另造视觉克隆。 */
.scene-curation {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.scene-curation__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--text-primary);
}
.scene-curation__warning {
  margin: 0;
  font-size: 12px;
  color: var(--signal-danger, #a04b3c);
}
.scene-curation__warning button,
.scene-curation__empty {
  font-size: 11px;
}
.scene-curation__warning button {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  text-decoration: underline dotted;
  cursor: pointer;
  padding: 0 2px;
}
.scene-curation__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.scene-curation__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scene-curation__field > span {
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.scene-curation__field input {
  border: none;
  border-bottom: 1px dashed var(--border);
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 2px 0;
}
.scene-curation__field input:focus-visible {
  outline: none;
  border-bottom-color: var(--control-focus, currentColor);
}
.scene-curation__options {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
}
.scene-curation__options button {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 1px 2px;
  cursor: pointer;
}
.scene-curation__options button:hover,
.scene-curation__options button[aria-selected='true'] {
  color: var(--archive-olive);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.scene-curation__options button:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.scene-curation__empty {
  color: var(--text-secondary);
}
.scene-curation__error {
  margin: 0;
  font-size: 12px;
  color: var(--signal-danger, #a04b3c);
}
</style>
