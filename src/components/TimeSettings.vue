<template>
  <Teleport v-if="!inline" to="body">
    <Transition name="modal-fade">
      <div
        v-if="open"
        class="time-settings-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="时间设定"
        @click.self="emitClose"
      >
        <section class="time-settings-panel">
          <TimeSettingsForm :hide-close="hideClose" @close="emitClose" />
        </section>
      </div>
    </Transition>
  </Teleport>
  <TimeSettingsForm v-else :hide-close="hideClose" @close="emitClose" />
</template>

<script setup>
import { computed, defineComponent, h, onMounted, reactive, watch } from 'vue'
import { useGameStore } from '../stores/gameStore'

defineProps({
  open: { type: Boolean, default: false },
  inline: { type: Boolean, default: false },
  hideClose: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

function emitClose() {
  emit('close')
}

const TimeSettingsForm = defineComponent({
  name: 'TimeSettingsForm',
  props: {
    hideClose: { type: Boolean, default: false }
  },
  emits: ['close'],
  setup(props, { emit }) {
    const gameStore = useGameStore()
    const form = reactive({
      eraName: '',
      year: '',
      month: '',
      day: ''
    })

    function syncFromStore() {
      const source = gameStore.writingTime || {}
      form.eraName = source.eraName || ''
      form.year = source.year || ''
      form.month = source.month || ''
      form.day = source.day || ''
    }

    onMounted(() => {
      if (typeof gameStore.loadWritingTime === 'function') {
        gameStore.loadWritingTime()
      }
      syncFromStore()
    })

    watch(() => gameStore.writingTime, syncFromStore, { deep: true })

    const preview = computed(() => {
      const era = String(form.eraName || '').trim()
      const year = String(form.year || '').trim()
      const month = String(form.month || '').trim()
      const day = String(form.day || '').trim()
      const head = [era, year ? `${year}年` : ''].filter(Boolean).join(' ')
      const tail = [month ? `${month}月` : '', day ? `${day}日` : ''].filter(Boolean).join('')
      return [head, tail].filter(Boolean).join(' · ') || '未登记时间'
    })

    function save() {
      if (typeof gameStore.saveWritingTime === 'function') {
        gameStore.saveWritingTime({
          ...(gameStore.writingTime || {}),
          eraName: form.eraName,
          year: form.year,
          month: form.month,
          day: form.day
        })
      }
      emit('close')
    }

    const field = (label, key, placeholder) => h('label', { class: 'time-settings-field' }, [
      h('span', label),
      h('input', {
        value: form[key],
        placeholder,
        onInput: (event) => { form[key] = event.target.value }
      })
    ])

    return () => h('div', { class: 'time-settings' }, [
      h('header', { class: 'time-settings__header' }, [
        h('div', [
          h('span', { class: 'time-settings__kicker' }, '时间锚点'),
          h('h3', { class: 'time-settings__title' }, '设定当前纪年')
        ]),
        !props.hideClose
          ? h('button', {
            class: 'time-settings__close',
            type: 'button',
            'aria-label': '关闭时间设定',
            onClick: () => emit('close')
          }, '×')
          : null
      ]),
      h('p', { class: 'time-settings__preview' }, preview.value),
      h('div', { class: 'time-settings__grid' }, [
        field('纪年', 'eraName', '灯痕历'),
        field('年份', 'year', '1173'),
        field('月份', 'month', '7'),
        field('日期', 'day', '12')
      ]),
      h('div', { class: 'time-settings__actions' }, [
        h('button', { class: 'time-settings__btn', type: 'button', onClick: syncFromStore }, '重置'),
        h('button', { class: 'time-settings__btn time-settings__btn--primary', type: 'button', onClick: save }, '保存')
      ])
    ])
  }
})
</script>

<style scoped>
.time-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--bg-overlay, black) 48%, transparent);
}

.time-settings-panel {
  width: min(420px, 100%);
}

.time-settings {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 8px;
  background: var(--surface-raised, var(--bg-secondary));
  color: var(--text-primary);
}

.time-settings__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.time-settings__kicker {
  display: block;
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.time-settings__title {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 1.2;
}

.time-settings__close {
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
}

.time-settings__preview {
  margin: 0;
  padding: 8px 10px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
}

.time-settings__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.time-settings-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.time-settings-field span {
  color: var(--text-muted);
  font-size: 11px;
}

.time-settings-field input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 9px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 80%, transparent);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.time-settings__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.time-settings__btn {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  color: var(--text-secondary);
  cursor: pointer;
}

.time-settings__btn--primary {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
  background: var(--accent);
  color: var(--accent-text);
}

@media (max-width: 520px) {
  .time-settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
