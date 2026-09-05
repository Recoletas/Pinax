<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AuthoringSceneCuration from './AuthoringSceneCuration.vue'

// Plan Task 1.4 / spec §7.2-§7.3 / worldbook scene closure Task 10：右侧临时详情。
// 复用既有检查器容器的临时 inspector route：不是新常驻 tab、抽屉或 modal。
// 打开后焦点移到详情标题，关闭/切换由页面负责焦点返还。

const props = defineProps({
  detail: {
    type: Object,
    required: true
  },
  model: {
    type: Object,
    default: null
  },
  // Task 10：现场调整受控草稿与候选（组件自身不访问 store/provider）。
  curation: { type: Object, default: null },
  worldbookStatus: { type: String, default: 'unbound' },
  characterCandidates: { type: Array, default: () => [] },
  locationCandidates: { type: Array, default: () => [] },
  missingCharacterIds: { type: Array, default: () => [] },
  missingLocationId: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  error: { type: Object, default: null },
  canUndo: { type: Boolean, default: false },
  canRestoreInheritance: { type: Boolean, default: false }
})

const emit = defineEmits([
  'close',
  'set-actor',
  'open-full',
  'advance-with',
  'add-to-outline',
  'confirm-emergence',
  'dismiss-emergence',
  'open-source',
  'open-map',
  'update-draft',
  'save',
  'cancel',
  'undo',
  'restore-inheritance',
  'bind-worldbook',
  'open-worldbook',
  'search',
  'run-intent'
])

const UNSPECIFIED = '未指定'
const KIND_LABELS = {
  character: '人物',
  location: '地点',
  time: '时间',
  event: '事件',
  emergence: '涌现候选',
  sceneEdit: '现场调整'
}

const titleRef = ref(null)

const kindLabel = computed(() => (props.detail?.kind === 'scene-edit' ? KIND_LABELS.sceneEdit : KIND_LABELS[props.detail?.kind] || '详情'))
const displayName = computed(() => (props.detail?.kind === 'scene-edit' ? '' : props.model?.name?.trim() || UNSPECIFIED))
const sections = computed(() => (Array.isArray(props.model?.sections) ? props.model.sections : []))
const locationBridge = computed(() => (
  props.detail?.kind === 'location' && props.model?.locationBridge
    ? props.model.locationBridge
    : null
))
const locationMapSummary = computed(() => {
  const bridge = locationBridge.value
  if (!bridge) return ''
  return [
    bridge.mapStatusLabel,
    bridge.mapName,
    bridge.region,
    bridge.adjacentNames?.length ? `相邻 ${bridge.adjacentNames.join('、')}` : ''
  ].filter(Boolean).join(' · ')
})
const hasDetailActions = computed(() => ['character', 'location', 'time', 'event', 'emergence'].includes(props.detail?.kind))
const actionUnavailableReason = computed(() => (
  hasDetailActions.value && !props.model
    ? '这条详情已不在当前场，请返回后重新选择。'
    : ''
))

async function focusTitle() {
  await nextTick()
  titleRef.value?.focus({ preventScroll: true })
}

onMounted(focusTitle)
watch(() => `${props.detail?.kind || ''}:${props.detail?.id || ''}`, focusTitle)
</script>

<template>
  <section class="writing-inspector-detail" :aria-label="`${kindLabel}详情`">
    <button type="button" class="writing-inspector-detail__back" @click="detail.kind === 'scene-edit' ? emit('cancel') : emit('close')">
      {{ detail.kind === 'scene-edit' ? '← 取消并返回' : '← 返回当前场' }}
    </button>
    <h3 ref="titleRef" tabindex="-1" class="writing-inspector__context writing-inspector-detail__title">
      {{ kindLabel }}<template v-if="displayName"> · {{ displayName }}</template>
    </h3>

    <!-- Task 10：现场调整作为检查器的临时路由渲染。 -->
    <AuthoringSceneCuration
      v-if="detail.kind === 'scene-edit'"
      :draft="curation"
      :worldbook-status="worldbookStatus"
      :character-candidates="characterCandidates"
      :location-candidates="locationCandidates"
      :missing-character-ids="missingCharacterIds"
      :missing-location-id="missingLocationId"
      :busy="busy"
      :error="error"
      :can-undo="canUndo"
      :can-restore-inheritance="canRestoreInheritance"
      @update-draft="(draft) => emit('update-draft', draft)"
      @save="emit('save')"
      @cancel="emit('cancel')"
      @undo="emit('undo')"
      @restore-inheritance="emit('restore-inheritance')"
      @bind-worldbook="emit('bind-worldbook')"
      @open-worldbook="emit('open-worldbook')"
      @search="(payload) => emit('search', payload)"
      @run-intent="(payload) => emit('run-intent', payload)"
    />
    <slot v-if="detail.kind === 'scene-edit'" name="context" />

    <template v-else>
      <dl v-if="sections.length" class="writing-inspector__list writing-inspector-detail__sections">
        <div v-for="section in sections" :key="section.label" class="writing-inspector-detail__section">
          <dt>{{ section.label }}</dt>
          <dd>{{ section.value ? section.value : UNSPECIFIED }}</dd>
        </div>
      </dl>
      <p v-else class="writing-inspector-detail__empty">{{ UNSPECIFIED }}</p>
      <div
        v-if="locationBridge"
        class="writing-inspector-detail__map-line"
        data-test="scene-location-map-bridge"
      >
        <span><small>地图</small>{{ locationMapSummary || '未落图' }}</span>
        <button
          type="button"
          :disabled="!locationBridge.canOpenMap"
          @click="emit('open-map', detail)"
        >在地图中打开</button>
      </div>
      <p
        v-if="actionUnavailableReason"
        id="writing-inspector-detail-unavailable"
        class="writing-inspector-detail__unavailable"
        role="status"
      >{{ actionUnavailableReason }}</p>

      <footer
        v-if="hasDetailActions"
        class="writing-inspector__actions writing-inspector-detail__actions"
        :aria-describedby="actionUnavailableReason ? 'writing-inspector-detail-unavailable' : undefined"
      >
      <template v-if="detail.kind === 'character'">
        <button type="button" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('set-actor', model?.id || detail.id)">以此人物推演</button>
        <button type="button" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('open-full', detail)">打开完整人物设定</button>
      </template>
      <template v-else-if="detail.kind === 'location'">
        <button type="button" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('open-full', detail)">查看世界书地点</button>
      </template>
      <template v-else-if="detail.kind === 'time'">
        <button type="button" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('open-full', detail)">打开时间设置</button>
      </template>
      <template v-else-if="detail.kind === 'event'">
        <button type="button" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('advance-with', detail.id)">以此推进</button>
        <button type="button" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('add-to-outline', detail.id)">加入章节纲要</button>
      </template>
      <!-- spec §8.3：涌现候选审阅——确认/忽略/加入纲要/打开来源，不自动成为事实。 -->
        <template v-else-if="detail.kind === 'emergence'">
          <button type="button" data-test="emergence-confirm" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('confirm-emergence', detail.id)">确认</button>
          <button type="button" data-test="emergence-dismiss" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('dismiss-emergence', detail.id)">忽略</button>
          <button type="button" data-test="emergence-outline" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('add-to-outline', detail.id)">加入章节纲要</button>
          <button type="button" data-test="emergence-open-source" :disabled="Boolean(actionUnavailableReason)" :title="actionUnavailableReason || undefined" @click="emit('open-source', detail.id)">打开来源</button>
        </template>
      </footer>
    </template>
  </section>
</template>

<style scoped>
/* 沿用检查器批注密度与边注语义，不新增卡片墙。 */
.writing-inspector-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.writing-inspector-detail__back {
  appearance: none;
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 2px 0;
  cursor: pointer;
}
.writing-inspector-detail__back:hover {
  color: var(--archive-olive);
}
.writing-inspector-detail__back:focus-visible,
.writing-inspector-detail__title:focus-visible,
.writing-inspector-detail__actions button:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 1px;
}
.writing-inspector-detail__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--text-primary);
  /* Task 10：去掉 bespoke 左边框标题，改用共享 .writing-inspector__context 层级。 */
}
.writing-inspector-detail__sections {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.writing-inspector-detail__section dt {
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.writing-inspector-detail__section dd {
  margin: 2px 0 0;
  color: var(--text-primary);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.writing-inspector-detail__empty {
  margin: 0;
  color: var(--text-secondary);
}
.writing-inspector-detail__unavailable {
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.writing-inspector-detail__map-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.writing-inspector-detail__map-line span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.writing-inspector-detail__map-line small {
  margin-right: 8px;
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
}
.writing-inspector-detail__map-line button {
  flex: none;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  cursor: pointer;
}
.writing-inspector-detail__map-line button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.writing-inspector-detail__map-line button:focus-visible {
  outline: 2px solid var(--control-focus, currentColor);
  outline-offset: 2px;
}
@media (max-width: 760px) {
  .writing-inspector-detail__map-line {
    align-items: center;
  }
  .writing-inspector-detail__map-line button {
    min-height: 44px;
  }
}
.writing-inspector-detail__actions button:disabled {
  cursor: not-allowed;
  opacity: .5;
  text-decoration: none;
}
</style>
