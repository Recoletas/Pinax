<script setup>
import { computed, ref, watch } from 'vue'
import { MAX_AUTHORING_PRESENT_CHARACTERS } from '../../services/agents/authoring/authoringSceneAnchors.js'

// worldbook scene closure Task 10：右侧检查器的现场调整（受控组件）。
// 不访问 store/localStorage/provider；所有状态经 props 进入、事件上抛。
// 布局固定为 时间 → 地点 → 人物，无三 tab 切换。

const props = defineProps({
  draft: { type: Object, required: true },
  worldbookStatus: { type: String, required: true },
  characterCandidates: { type: Array, default: () => [] },
  locationCandidates: { type: Array, default: () => [] },
  missingCharacterIds: { type: Array, default: () => [] },
  missingLocationId: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: Object, default: null },
  canUndo: { type: Boolean, default: false },
  canRestoreInheritance: { type: Boolean, default: false }
})

const emit = defineEmits(['update-draft', 'save', 'cancel', 'undo', 'restore-inheritance', 'bind-worldbook', 'open-worldbook', 'search', 'run-intent'])

const locationQuery = ref('')
const peopleQuery = ref('')
const selectionNotice = ref('')

watch(() => props.draft?.unitId, () => {
  locationQuery.value = ''
  peopleQuery.value = ''
  selectionNotice.value = ''
})

function patchDraft(patch) {
  emit('update-draft', { ...props.draft, ...patch })
}

const timeLabel = computed(() => props.draft?.time?.label || '')
const timePeriod = computed(() => props.draft?.time?.period || '')
const worldbookReady = computed(() => props.worldbookStatus === 'bound')

// 页面候选构建器同时搜索名称与别名，并保证已选条目置顶；这里不能再按名称
// 二次过滤，否则用世界书别名命中的实体会在 UI 层被错误丢掉。
const filteredLocations = computed(() => props.locationCandidates)
const filteredPeople = computed(() => props.characterCandidates)

function togglePerson(candidate) {
  const current = new Set(props.draft.presentCharacterIds || [])
  const removing = current.has(candidate.id)
  if (!removing && current.size >= MAX_AUTHORING_PRESENT_CHARACTERS) {
    selectionNotice.value = `当前场最多保留 ${MAX_AUTHORING_PRESENT_CHARACTERS} 位在场人物，请先移除一位。`
    return
  }
  selectionNotice.value = ''
  if (removing) current.delete(candidate.id)
  else current.add(candidate.id)
  patchDraft({
    presentCharacterIds: [...current],
    viewpointCharacterId: removing && props.draft.viewpointCharacterId === candidate.id
      ? ''
      : props.draft.viewpointCharacterId
  })
}

function isSelected(candidate) {
  return (props.draft.presentCharacterIds || []).includes(candidate.id)
}

// C1-2 作用范围语义：加入当前场仍走受控草稿保存；另外两种选择只上抛
// 一次性意图，组件自身绝不把它们写进 scene anchor。
function requestRunIntent(candidate, entityKind, mode) {
  selectionNotice.value = ''
  if (entityKind === 'character' && mode === 'next-passage') {
    const current = new Set(props.draft.presentCharacterIds || [])
    if (!current.has(candidate.id) && current.size >= MAX_AUTHORING_PRESENT_CHARACTERS) {
      selectionNotice.value = `当前场最多保留 ${MAX_AUTHORING_PRESENT_CHARACTERS} 位在场人物，请先移除一位。`
      return
    }
  }
  emit('run-intent', { mode, entityKind, entityId: candidate.id })
}

function setViewpoint(candidate) {
  const current = new Set(props.draft.presentCharacterIds || [])
  current.add(candidate.id)
  patchDraft({
    presentCharacterIds: [...current],
    viewpointCharacterId: props.draft.viewpointCharacterId === candidate.id ? '' : candidate.id
  })
}

function isViewpoint(candidate) {
  return props.draft.viewpointCharacterId === candidate.id
}
</script>

<template>
  <section class="scene-curation" aria-label="现场调整表单">

    <div v-if="draft.originAxis === 'worldbook-mismatch'" class="scene-curation__warning is-conflict" role="status">
      <span>这份现场来自旧世界书。时间已保留；失效的人物与地点需要移除或改选后才能保存。</span>
    </div>

    <div v-if="worldbookStatus === 'missing'" class="scene-curation__warning">
      <span>原世界书不可用，已有现场仍会保留。</span>
      <button type="button" @click="emit('bind-worldbook')">重新关联</button>
    </div>
    <div v-else-if="worldbookStatus === 'unbound'" class="scene-curation__warning">
      <span>关联世界书后，可以直接选择人物和地点。</span>
      <button type="button" @click="emit('bind-worldbook')">关联世界书</button>
    </div>

    <p class="scene-curation__scope-note">
      保存当前场＝纠正当前；下一段安排在采纳后生效；带入本次推演不会改动现场。
    </p>

    <div class="writing-inspector__list scene-curation__body">
      <section class="scene-curation__group">
        <header class="scene-curation__group-head">
          <strong>时间</strong>
          <small>可不依赖世界书</small>
        </header>
        <div class="scene-curation__time-grid">
          <label class="scene-curation__field">
            <span>时间标签</span>
            <input
              type="text"
              :value="timeLabel"
              data-test="curation-time-label"
              placeholder="如：雨季第三夜"
              @input="patchDraft({ time: { ...props.draft.time, label: $event.target.value } })"
            />
          </label>
          <label class="scene-curation__field">
            <span>时段</span>
            <input
              type="text"
              :value="timePeriod"
              data-test="curation-time-period"
              placeholder="如：深夜"
              @input="patchDraft({ time: { ...props.draft.time, period: $event.target.value } })"
            />
          </label>
        </div>
      </section>

      <section class="scene-curation__group">
        <header class="scene-curation__group-head">
          <strong>地点</strong>
          <small v-if="!draft.locationId">选择圆点并保存＝纠正当前</small>
          <button v-else type="button" @click="patchDraft({ locationId: '' })">清除</button>
        </header>
        <input
          v-if="worldbookReady"
          type="text"
          :value="locationQuery"
          class="scene-curation__search"
          data-test="curation-location-query"
          placeholder="搜索世界书地点"
          @input="emit('search', { axis: 'location', query: $event.target.value }); locationQuery = $event.target.value"
        />
        <ul v-if="worldbookReady" class="scene-curation__options" aria-label="地点候选">
          <li v-for="candidate in filteredLocations" :key="candidate.id">
            <button
              type="button"
              class="scene-curation__option"
              :aria-pressed="(draft.locationId === candidate.id).toString()"
              @click="patchDraft({ locationId: candidate.id })"
            ><span aria-hidden="true">{{ draft.locationId === candidate.id ? '●' : '○' }}</span><span>{{ candidate.name }}</span></button>
            <span v-if="draft.locationId !== candidate.id" class="scene-curation__scope">
              <button type="button" class="scene-curation__scope-btn" @click="requestRunIntent(candidate, 'location', 'next-passage')">下一段转场</button>
              <button type="button" class="scene-curation__scope-btn" @click="requestRunIntent(candidate, 'location', 'run-only')">带入本次推演</button>
            </span>
          </li>
        </ul>
        <p v-if="worldbookReady && missingLocationId" class="scene-curation__invalid-ref">
          <span>地点引用已失效 · {{ missingLocationId }}</span>
          <button type="button" @click="patchDraft({ locationId: '' })">移除</button>
        </p>
        <p v-if="!worldbookReady" class="scene-curation__empty">关联世界书后选择本场地点。</p>
        <p v-else-if="!filteredLocations.length" class="scene-curation__empty">
          {{ locationQuery ? '没有匹配的地点。' : '世界书中还没有地点。' }}
          <button v-if="!locationQuery" type="button" @click="emit('open-worldbook')">打开世界书</button>
        </p>
      </section>

      <section class="scene-curation__group">
        <header class="scene-curation__group-head">
          <strong>在场人物</strong>
          <small>{{ draft.viewpointCharacterId ? '已指定视角' : '点＋并保存＝纠正当前' }}</small>
        </header>
        <input
          v-if="worldbookReady"
          type="text"
          :value="peopleQuery"
          class="scene-curation__search"
          data-test="curation-people-query"
          placeholder="搜索世界书人物"
          @input="emit('search', { axis: 'character', query: $event.target.value }); peopleQuery = $event.target.value"
        />
        <ul v-if="worldbookReady" class="scene-curation__people" aria-label="人物候选">
          <li v-for="candidate in filteredPeople" :key="candidate.id">
            <button
              type="button"
              class="scene-curation__person-toggle"
              :aria-pressed="isSelected(candidate).toString()"
              @click="togglePerson(candidate)"
            ><span aria-hidden="true">{{ isSelected(candidate) ? '✓' : '＋' }}</span><span>{{ candidate.name }}</span></button>
            <button
              v-if="isSelected(candidate)"
              type="button"
              class="scene-curation__viewpoint"
              :aria-pressed="isViewpoint(candidate).toString()"
              @click="setViewpoint(candidate)"
            >{{ isViewpoint(candidate) ? '当前视角' : '设为视角' }}</button>
            <span v-if="!isSelected(candidate)" class="scene-curation__scope">
              <button
                type="button"
                class="scene-curation__scope-btn"
                title="约束下一段推演；采纳草稿后才进入当前场"
                @click="requestRunIntent(candidate, 'character', 'next-passage')"
              >下一段入场</button>
              <button
                type="button"
                class="scene-curation__scope-btn"
                title="只带入本次推演，不改动现场"
                @click="requestRunIntent(candidate, 'character', 'run-only')"
              >带入本次推演</button>
            </span>
          </li>
          <li v-for="id in missingCharacterIds" :key="`missing:${id}`" class="scene-curation__invalid-ref">
            <span>人物引用已失效 · {{ id }}</span>
            <button type="button" @click="togglePerson({ id })">移除</button>
          </li>
        </ul>
        <p v-if="!worldbookReady" class="scene-curation__empty">关联世界书后添加在场人物。</p>
        <p v-else-if="!filteredPeople.length" class="scene-curation__empty">
          {{ peopleQuery ? '没有匹配的人物。' : '世界书中还没有人物。' }}
          <button v-if="!peopleQuery" type="button" @click="emit('open-worldbook')">打开世界书</button>
        </p>
      </section>
    </div>

    <p v-if="error || selectionNotice" class="scene-curation__error" role="alert">{{ error?.message || selectionNotice }}</p>

    <footer class="writing-inspector__actions scene-curation__actions">
      <button type="button" data-test="curation-save" :disabled="busy" @click="emit('save')">保存当前场</button>
      <button type="button" data-test="curation-cancel" :disabled="busy" @click="emit('cancel')">取消</button>
      <button v-if="canUndo" type="button" data-test="curation-undo" :disabled="busy" @click="emit('undo')">撤销上次保存</button>
      <button
        v-if="canRestoreInheritance"
        type="button"
        data-test="curation-restore-inheritance"
        :disabled="busy"
        @click="emit('restore-inheritance')"
      >恢复沿用前文</button>
    </footer>
  </section>
</template>

<style scoped>
/* 外层标题与返回动作由 AuthoringInspectorDetail 唯一拥有。 */
.scene-curation {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-size: 13px;
}
.scene-curation__warning {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  margin: 0 0 4px;
  padding: 9px 0 11px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.scene-curation__warning button,
.scene-curation__empty button,
.scene-curation__group-head button {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--archive-olive-strong);
  font: inherit;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.scene-curation__body {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
}
.scene-curation__scope-note {
  margin: 0;
  padding: 8px 0 10px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}
.scene-curation__group {
  display: grid;
  gap: 8px;
  padding: 13px 0 15px;
  border-bottom: 1px solid var(--border-subtle);
}
.scene-curation__group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.scene-curation__group-head strong {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}
.scene-curation__group-head small,
.scene-curation__group-head button {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 400;
}
.scene-curation__time-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.65fr);
  gap: 12px;
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
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 4px 0 5px;
}
.scene-curation__field input:focus-visible,
.scene-curation__search:focus-visible {
  outline: none;
  border-bottom-color: var(--control-focus, currentColor);
}
.scene-curation__search {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text-primary);
  font: 12px/1.5 var(--font-sans, sans-serif);
  padding: 4px 0 5px;
}
.scene-curation__options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}
.scene-curation__options li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
}
.scene-curation__option,
.scene-curation__person-toggle,
.scene-curation__viewpoint {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.scene-curation__scope {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.scene-curation__scope-btn {
  appearance: none;
  min-height: 26px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.scene-curation__scope-btn:hover {
  color: var(--archive-olive);
  border-bottom-color: color-mix(in srgb, var(--archive-olive) 55%, transparent);
}
.scene-curation__option {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 7px;
  width: 100%;
  padding: 5px 0;
  text-align: left;
}
.scene-curation__option[aria-pressed='true'],
.scene-curation__person-toggle[aria-pressed='true'],
.scene-curation__viewpoint[aria-pressed='true'] {
  color: var(--archive-olive-strong);
}
.scene-curation__people {
  list-style: none;
  margin: 0;
  padding: 0;
}
.scene-curation__people li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
}
.scene-curation__person-toggle {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 7px;
  padding: 5px 0;
  text-align: left;
  cursor: pointer;
}
.scene-curation__viewpoint {
  padding: 4px 0;
  font-size: 10px;
}
.scene-curation__option:hover,
.scene-curation__person-toggle:hover,
.scene-curation__viewpoint:hover {
  color: var(--archive-olive);
}
.scene-curation__option:focus-visible,
.scene-curation__person-toggle:focus-visible,
.scene-curation__viewpoint:focus-visible,
.scene-curation__scope-btn:focus-visible,
.scene-curation__warning button:focus-visible,
.scene-curation__empty button:focus-visible,
.scene-curation__group-head button:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.scene-curation__empty {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.scene-curation__empty button {
  margin-left: 5px;
}
.scene-curation__invalid-ref {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 6px 0;
  color: var(--signal-danger, #a04b3c);
  font-size: 10px;
}
.scene-curation__people li.scene-curation__invalid-ref {
  display: flex;
}
.scene-curation__invalid-ref button {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.scene-curation__error {
  margin: 0;
  font-size: 12px;
  color: var(--signal-danger, #a04b3c);
}

@media (max-width: 720px) {
  .scene-curation__options li,
  .scene-curation__people li {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 1px 0;
  }

  .scene-curation__scope {
    grid-column: 1 / -1;
    justify-self: stretch;
    gap: 12px;
  }

  .scene-curation__scope-btn {
    min-height: 44px;
    padding: 0 4px;
    font-size: 12px;
  }

  .scene-curation__option,
  .scene-curation__person-toggle,
  .scene-curation__viewpoint {
    min-height: 44px;
  }

  .scene-curation__viewpoint {
    justify-self: end;
    font-size: 12px;
  }
}
</style>
