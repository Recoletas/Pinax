<script setup>
import { computed } from 'vue'
import { tr } from '../../i18n/index.js'

// 检查器「现场」页的只读概览（UX-03：桌面由左栏索引负责定位，右侧只放紧凑
// 概览与主动作；窄屏左栏收入抽屉，当前地点文字可直达详情）。
const props = defineProps({
  sceneProjection: { type: Object, default: null },
  notice: { type: String, default: '' },
  shelfSheetMode: { type: Boolean, default: false },
  activeWritingUnitId: { type: [String, Number], default: '' }
})
const emit = defineEmits(['open-detail', 'edit-request', 'if-entry', 'compose-open'])

const presentNames = computed(() => (
  (props.sceneProjection?.presentCharacters || []).map((person) => person.name).filter(Boolean).join('、')
))
</script>

<template>
  <div class="writing-inspector__body writing-scene-overview" data-authoring-inspector="scene">
    <p v-if="notice" class="writing-review-status" role="status">{{ notice }}</p>
    <dl class="writing-scene-overview__summary">
      <div><dt>{{ tr('时间') }}</dt><dd>{{ sceneProjection.time?.label || tr('未设置') }}</dd></div>
      <div><dt>{{ tr('人物') }}</dt><dd>{{ presentNames || tr('未设置') }}</dd></div>
      <div>
        <dt>{{ tr('地点') }}</dt>
        <dd>
          <button
            v-if="shelfSheetMode && sceneProjection.location?.id"
            class="writing-scene-overview__fact-link"
            type="button"
            :aria-label="tr(&quot;查看地点详情&quot;)"
            @click="emit('open-detail', { kind: 'location', id: sceneProjection.location.id })"
          >{{ sceneProjection.location.name }}</button>
          <template v-else>{{ sceneProjection.location?.name || tr('未设置') }}</template>
        </dd>
      </div>
    </dl>
    <section v-if="sceneProjection.unresolvedEvents?.length" class="writing-scene-overview__events" :aria-label="tr(&quot;本场未决事件&quot;)">
      <strong>{{ tr('全部未决事件') }}</strong>
      <button
        v-for="event in sceneProjection.unresolvedEvents"
        :key="event.id"
        type="button"
        @click="emit('open-detail', { kind: 'event', id: event.id })"
      >{{ event.label }}</button>
    </section>
    <div class="writing-inspector__actions">
      <button type="button" data-test="scene-overview-edit" @click="emit('edit-request')">{{ tr('调整当前场') }}</button>
      <button type="button" data-test="scene-overview-if" @click="emit('if-entry')">{{ tr('人物 IF 试验') }}</button>
      <button v-if="!activeWritingUnitId" type="button" @click="emit('compose-open')">{{ tr('推演本章开场') }}</button>
    </div>
  </div>
</template>
