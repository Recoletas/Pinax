<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { tr } from '../../i18n/index.js'
import { loadWritingBooks, subscribeWritingBooks } from '../../services/writing/writingBooksRepository.js'
import { settingContext } from '../../services/worldbook/settingContextModel.js'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { vWorkbenchTooltip } from '../workbench/workbenchTooltip.js'
const props = defineProps({ bookId: String, worldbook: Object, entry: Object, chapterId: String, busy: Boolean })
const emit = defineEmits(['locate', 'entry', 'map'])
const books = ref(loadWritingBooks())
const unsubscribe = subscribeWritingBooks(() => { books.value = loadWritingBooks() })
onBeforeUnmount(unsubscribe)
const context = computed(() => settingContext({ book: books.value.find(book => String(book.id) === props.bookId), worldbook: props.worldbook, entry: props.entry, chapterId: props.chapterId }))
const limit = ref(12), historyLimit = ref(8)
watch(() => [props.bookId, props.worldbook?.id, props.entry?.id], () => { limit.value = 12; historyLimit.value = 8 })
const relevantHere = computed(() => props.entry?.type === 'character'
  ? context.value.chapterScene?.people.some(person => String(person.id) === String(props.entry.id))
  : props.entry?.type === 'location' && String(context.value.chapterScene?.location?.id) === String(props.entry.id))
</script>
<template>
  <div class="setting-context" data-test="setting-context">
    <section class="setting-context__section">
      <header><WorkbenchIcon name="scene" :size="16" /><h3>{{ tr('本章场景') }}</h3><span v-if="context.chapter">{{ context.chapter.title }}</span></header>
      <template v-if="context.chapterScene">
        <p class="setting-context__caption">{{ tr('本章末段的场景记录') }}</p>
        <dl>
          <div><dt>{{ tr('地点') }}</dt><dd><button v-if="context.chapterScene.location" type="button" :disabled="busy" @click="emit('entry', context.chapterScene.location)">{{ context.chapterScene.location.name }}<WorkbenchIcon name="arrow-right" :size="13" /></button><span v-else>{{ tr('未记录') }}</span></dd></div>
          <div><dt>{{ tr('时间') }}</dt><dd>{{ context.chapterScene.time || tr('未记录') }}</dd></div>
          <div><dt>{{ tr('在场') }}</dt><dd class="setting-context__people"><button v-for="person in context.chapterScene.people" :key="person.id" type="button" :disabled="busy" @click="emit('entry', person)">{{ person.name }}</button><span v-if="!context.chapterScene.people.length">{{ tr('未记录') }}</span></dd></div>
        </dl>
        <p v-if="entry?.type === 'character' && !relevantHere" class="setting-context__caption">{{ tr('这段场景中未记录此人在场，无法据此确认当前位置。') }}</p>
        <button type="button" class="setting-context__link" :disabled="busy" @click="emit('locate', context.chapterScene)"><WorkbenchIcon name="chapter" :size="15" />{{ tr('回到场景正文') }}<WorkbenchIcon name="arrow-right" :size="14" /></button>
      </template>
      <p v-else class="setting-context__empty">{{ context.chapter ? tr('本章尚无有效场景记录，可在正文的推演中设置。') : tr('先打开一章正文，即可对照本章场景。') }}</p>
    </section>
    <section v-if="context.location" class="setting-context__section">
      <header><WorkbenchIcon name="map" :size="16" /><h3>{{ tr('地图') }}</h3><span>{{ tr(context.location.mapStatusLabel) }}</span></header>
      <p v-if="context.location.mapName || context.location.region" class="setting-context__caption">{{ [context.location.mapName, context.location.region].filter(Boolean).join(' · ') }}</p>
      <p v-if="context.location.mapStatus !== 'confirmed'" class="setting-context__caption">{{ tr('地图中的落点需确认，不会按名称自动绑定。') }}</p>
      <button type="button" class="setting-context__link" :disabled="busy || !context.location.canOpenMap" @click="emit('map', { entryId: entry.id, placeId: context.location.placeId })">{{ tr(context.location.mapStatus === 'confirmed' ? '在地图中查看' : '打开地图核对') }}<WorkbenchIcon name="arrow-right" :size="14" /></button>
    </section>
    <section v-if="['character', 'location'].includes(entry?.type)" class="setting-context__section">
      <header><WorkbenchIcon name="history" :size="16" /><h3>{{ tr(entry.type === 'character' ? '出场记录' : '发生于此') }}</h3><span>{{ context.scenes.length }}</span></header>
      <p class="setting-context__caption">{{ tr('按章节顺序，仅列已记录的场景。') }}</p>
      <ol class="setting-context__timeline"><li v-for="scene in context.scenes.slice(0, limit)" :key="scene.id"><button type="button" :disabled="busy" @click="emit('locate', scene)"><strong>{{ scene.chapterTitle }}</strong><span v-if="scene.time || scene.location?.name">{{ [scene.time, scene.location?.name].filter(Boolean).join(' · ') }}</span><small v-if="scene.people.length">{{ scene.people.map(person => person.name).join('、') }}</small></button><button v-if="scene.location" type="button" class="setting-context__map-action" :aria-label="tr('查看「{name}」的地图', { name: scene.location.name })" v-workbench-tooltip="tr('查看地图')" :disabled="busy" @click="emit('map', { entryId: scene.location.id })"><WorkbenchIcon name="map" :size="15" /></button></li></ol>
      <p v-if="!context.scenes.length" class="setting-context__empty">{{ tr('暂无场景记录。正文里的名称提及仍可在底栏查看。') }}</p>
      <button v-if="context.scenes.length > limit" type="button" class="setting-context__link" @click="limit += 12">{{ tr('显示更多') }}</button>
    </section>
    <section v-if="context.history.length" class="setting-context__section">
      <header><WorkbenchIcon name="event-file" :size="16" /><h3>{{ tr('世界历史') }}</h3><span>{{ context.history.length }}</span></header>
      <ol class="setting-context__timeline"><li v-for="event in context.history.slice(0, historyLimit)" :key="event.id"><button type="button" :disabled="busy" @click="emit('map', { entryId: entry?.type === 'location' ? entry.id : '', placeId: event.placeId, historyNodeId: event.id })"><strong>{{ event.title || tr('未命名事件') }}</strong><span v-if="event.time">{{ event.time }}</span><small v-if="event.summary && event.summary !== event.title">{{ event.summary }}</small></button></li></ol>
      <button v-if="context.history.length > historyLimit" type="button" class="setting-context__link" @click="historyLimit += 8">{{ tr('显示更多') }}</button>
    </section>
  </div>
</template>
<style scoped>
.setting-context { padding: 4px 20px 28px; font: 13px/1.65 var(--font-interface); color: var(--text-primary); }
.setting-context__section { padding: 20px 0; }
.setting-context__section + .setting-context__section { border-top: 1px solid var(--hairline-soft); }
header { display: flex; align-items: center; gap: 8px; min-height: 24px; }
header > svg { color: var(--text-muted); }
h3 { margin: 0; font-size: 13px; font-weight: 600; }
header > span { margin-inline-start: auto; min-width: 0; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); font-size: 11px; }
.setting-context__caption, .setting-context__empty { margin: 10px 0; color: var(--text-muted); font-size: 12px; line-height: 1.75; }
dl { margin: 16px 0 12px; } dl > div { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 12px; padding-block: 5px; }
dt { color: var(--text-muted); } dd { margin: 0; overflow-wrap: anywhere; }
button { border: 0; background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; border-radius: 6px; }
button:hover:not(:disabled) { background: var(--nav-hover); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
dd button { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px; margin-inline-start: -4px; text-align: start; }
.setting-context__people { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.setting-context__link { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 6px; margin-inline-start: -6px; color: var(--text-secondary); font-size: 12px; }
.setting-context__link > svg:last-child { margin-inline-start: auto; }
.setting-context__timeline { margin: 12px 0 0; padding: 0; list-style: none; }
li { position: relative; display: flex; align-items: center; padding-inline-start: 17px; border-inline-start: 1px solid var(--hairline-soft); margin-inline-start: 4px; }
li::before { content: ''; position: absolute; top: 21px; inset-inline-start: -3px; width: 5px; height: 5px; border-radius: 50%; background: var(--text-muted); }
li > button:first-child { display: grid; flex: 1; gap: 3px; min-width: 0; padding: 10px 6px; text-align: start; overflow-wrap: anywhere; }
li strong { font-weight: 500; } li span, li small { color: var(--text-muted); font-size: 12px; }
.setting-context__map-action { display: grid; place-items: center; flex: none; width: 32px; min-height: 32px; color: var(--text-muted); }
@media (pointer: coarse) { button, dd button, .setting-context__link, .setting-context__map-action { min-height: 44px; } }
</style>
