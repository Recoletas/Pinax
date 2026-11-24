<script setup>
import { computed, ref, watch } from 'vue'
import WorldTypedValueFields from './WorldTypedValueFields.vue'
import WorldPeriodEndFields from './WorldPeriodEndFields.vue'
import WorldPassageSourceFields from './WorldPassageSourceFields.vue'
import WorldClockPicker from './WorldClockPicker.vue'
import WorldEventContextFields from './WorldEventContextFields.vue'
import { tr } from '../../i18n'

const props = defineProps({
  book: { type: Object, required: true },
  entities: { type: Array, required: true },
  calendars: { type: Array, default: () => [] },
  busy: Boolean
})
const emit = defineEmits(['save'])
const subjectId = ref('')
const predicate = ref('')
const objectMode = ref('literal')
const objectId = ref('')
const literal = ref('')
const typedValue = ref(null)
const typed = computed(() => ['number', 'boolean'].includes(objectMode.value))
const kind = ref('relation')
const negative = ref(false)
const authority = ref('fact')
const time = ref('')
const clock = ref(null)
const periodEnd = ref(null)
const duration = ref(false)
const endDay = ref('')
const endEra = ref('')
const chosenCalendar = computed(() => props.calendars.find(row => row.id === (clock.value?.timelineId || 'default')))
watch(() => clock.value?.timelineId, () => { endEra.value = '' })
const span = computed(() => duration.value && authority.value === 'fact' && kind.value === 'event')
const factPosition = ref(null)
const eventContext = ref({ placeRefs: [], participants: [] })
const subject = computed(() => props.entities.find(entry => entry.id === subjectId.value))
const target = computed(() => props.entities.find(entry => entry.id === objectId.value))
const object = computed(() => objectMode.value === 'entity' ? target.value?.name : literal.value.trim())
const valid = computed(() => (!subjectId.value || subject.value) && predicate.value.trim() && (typed.value ? typedValue.value?.type === objectMode.value : object.value)
  && (!span.value || (time.value !== '' && endDay.value !== '' && Number.isSafeInteger(Number(endDay.value))))
  && (authority.value === 'rumor' || time.value === '' || Number.isSafeInteger(Number(time.value))))

function submit() {
  if (!valid.value || props.busy) return
  emit('save', {
    subjectKey: subject.value?.key || 'book:' + props.book.id,
    subjectLabel: subject.value?.name || props.book.title || tr('本作品'),
    predicate: predicate.value.trim(), ...(typed.value ? { literalValue: typedValue.value } : { object: object.value }),
    ...(objectMode.value === 'entity' ? { objectRef: target.value.key } : {}),
    ...(kind.value === 'event' ? { eventContext: eventContext.value } : {}),
    ...(clock.value && authority.value === 'fact' && time.value !== '' ? { storyClock: clock.value } : {}),
    ...(authority.value === 'fact' && kind.value !== 'event' && time.value !== '' && periodEnd.value ? { periodEnd: periodEnd.value } : {}),
    ...(span.value ? { eventEnd: { eraId: endEra.value || clock.value?.eraId || 'default', ordinal: Number(endDay.value) } } : {}),
    ...(authority.value === 'fact' && factPosition.value ? { book: props.book, factPosition: factPosition.value } : {}),
    ...(negative.value ? { polarity: 'negative' } : {}),
    kind: kind.value, authority: authority.value, storyAt: authority.value === 'fact' && time.value !== '' ? Number(time.value) : null
  })
}
</script>

<template>
  <form class="world-form" @submit.prevent="submit">
    <div class="world-fields">
      <label>{{ tr('陈述性质') }}
        <select v-model="authority" name="authority">
          <option value="fact">{{ tr('正式事实') }}</option>
          <option value="rumor">{{ tr('传闻或待证说法') }}</option>
        </select>
      </label>
      <label>{{ tr('陈述类型') }}
        <select v-model="kind">
          <option value="relation">{{ tr('关系') }}</option>
          <option value="state">{{ tr('状态') }}</option>
          <option value="event">{{ tr('一次事件') }}</option>
        </select>
      </label>
    </div>
    <div class="world-fields">
      <label>{{ tr('主体') }}
        <select v-model="subjectId" name="subject">
          <option value="">{{ tr('本作品') }}</option>
          <option v-for="entry in entities" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
        </select>
      </label>
      <label>{{ tr('谓词') }}
        <input v-model="predicate" name="predicate" required :placeholder="tr('例如居住于、结盟')" />
      </label>
    </div>
    <div class="world-fields">
      <label>{{ tr('陈述对象') }}
        <select v-model="objectMode" name="objectMode">
          <option value="literal">{{ tr('文字内容') }}</option>
          <option value="number">{{ tr('数值与单位') }}</option>
          <option value="boolean">{{ tr('布尔值（是或否）') }}</option>
          <option value="entity" :disabled="!entities.length">{{ tr('世界书条目') }}</option>
        </select>
      </label>
      <label v-if="objectMode === 'entity'">{{ tr('目标条目') }}
        <select v-model="objectId" name="target" required>
          <option value="" disabled>{{ tr('选择条目') }}</option>
          <option v-for="entry in entities" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
        </select>
      </label>
      <WorldTypedValueFields v-else-if="typed" :key="objectMode" :type="objectMode" @change="typedValue = $event" />
      <label v-else>{{ tr('内容') }}<input v-model="literal" required /></label>
    </div>
    <label><span><input v-model="negative" type="checkbox" /> {{ tr('否定这条陈述') }}</span></label>
    <WorldEventContextFields v-if="kind === 'event'" v-model="eventContext" :entities="entities" />
    <WorldClockPicker v-if="authority === 'fact'" v-model="clock" :calendars="calendars" />
    <label v-if="authority === 'fact'">{{ tr('故事时点（未知可留空）') }}<input v-model="time" name="storyAt" type="number" step="1" /></label>
    <WorldPeriodEndFields v-if="authority === 'fact' && kind !== 'event' && time !== ''" v-model="periodEnd" :calendar="chosenCalendar" :era-id="clock?.eraId" />
    <label v-if="kind === 'event' && authority === 'fact'"><span><input v-model="duration" type="checkbox" /> {{ tr('持续一段时间') }}</span></label>
    <div v-if="span" class="world-fields">
      <label v-if="chosenCalendar?.eras.length > 1">{{ tr('结束纪元') }}<select v-model="endEra" :aria-label="tr('结束纪元')">
        <option value="">{{ tr('与开始纪元相同') }}</option>
        <option v-for="era in chosenCalendar.eras" :key="era.id" :value="era.id">{{ era.label }}</option>
      </select></label>
      <label>{{ tr('从哪个故事序号起事件已结束') }}<input v-model="endDay" type="number" step="1" required /></label>
    </div>
    <WorldPassageSourceFields v-if="authority === 'fact'" v-model="factPosition" :book="book" />
    <button type="submit" :disabled="busy || !valid">{{ authority === 'fact' ? tr('登记为正式事实') : tr('保存为传闻') }}</button>
  </form>
</template>
