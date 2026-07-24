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
import { useTransientLayer } from '../composables/useTransientLayer'

const props = defineProps({
  open: { type: Boolean, default: false },
  inline: { type: Boolean, default: false },
  hideClose: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

function emitClose() {
  emit('close')
}

useTransientLayer({
  id: 'time-settings',
  isOpen: computed(() => props.open && !props.inline),
  onClose: emitClose,
  initialFocus: () => document.querySelector('.time-settings__close, .time-settings input')
})

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

<style>
.time-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop, 800);
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
  gap: 14px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft, var(--border)) 18%, transparent);
  border-radius: 3px;
  background: linear-gradient(
    112deg,
    color-mix(in srgb, var(--archive-olive, var(--accent)) 3%, var(--archive-paper-soft, var(--bg-secondary))),
    var(--archive-paper-soft, var(--bg-secondary)) 68%
  );
  color: var(--archive-ink, var(--text-primary));
}

.time-settings__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.time-settings__kicker {
  display: block;
  color: color-mix(in srgb, var(--archive-olive-strong, var(--accent)) 64%, var(--archive-ink-soft, var(--text-muted)));
  font-family: var(--font-sans, sans-serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.time-settings__title {
  margin: 2px 0 0;
  color: var(--archive-ink, var(--text-primary));
  font-family: var(--font-sans, sans-serif);
  font-size: 16px;
  font-weight: 720;
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
  position: relative;
  margin: 0;
  padding: 10px 12px 10px 15px;
  border: 0;
  background: linear-gradient(
    105deg,
    color-mix(in srgb, var(--archive-olive, var(--accent)) 3%, var(--archive-paper-soft, var(--bg-primary))),
    var(--archive-paper-soft, var(--bg-primary)) 72%
  );
  color: color-mix(in srgb, var(--archive-ink, var(--text-secondary)) 82%, var(--archive-ink-soft, var(--text-muted)));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.time-settings__preview::before {
  content: "";
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 4px;
  background: linear-gradient(
    180deg,
    var(--experience-signal-warm, var(--archive-gold-soft, var(--border))) 0 18%,
    var(--archive-olive-strong, var(--accent)) 18% 74%,
    var(--experience-signal-cool, var(--archive-olive, var(--accent))) 74% 100%
  );
  clip-path: polygon(0 0, 100% 2px, 100% calc(100% - 2px), 0 100%);
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
  color: color-mix(in srgb, var(--archive-ink-soft, var(--text-muted)) 84%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-size: 11px;
  font-weight: 600;
}

.time-settings-field input {
  width: 100%;
  box-sizing: border-box;
  min-height: 36px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft, var(--border)) 22%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-paper-soft, var(--bg-primary)) 86%, transparent);
  color: var(--archive-ink, var(--text-primary));
  font: inherit;
  font-size: 13px;
}

.time-settings-field input:hover {
  border-color: color-mix(in srgb, var(--archive-olive, var(--accent)) 34%, var(--border));
}

.time-settings-field input:focus {
  border-color: var(--archive-olive, var(--accent));
  outline: 2px solid color-mix(in srgb, var(--archive-olive, var(--accent)) 12%, transparent);
  outline-offset: 0;
}

.time-settings__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.time-settings__btn {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid color-mix(in srgb, var(--archive-ink-soft, var(--border)) 24%, transparent);
  border-radius: 2px;
  background: color-mix(in srgb, var(--archive-paper-soft, var(--bg-primary)) 76%, transparent);
  color: color-mix(in srgb, var(--archive-ink, var(--text-secondary)) 84%, transparent);
  font-family: var(--font-sans, sans-serif);
  font-weight: 650;
  cursor: pointer;
}

.time-settings__btn--primary {
  border-color: color-mix(in srgb, var(--archive-olive-strong, var(--accent)) 62%, var(--border));
  background: var(--archive-olive-strong, var(--accent));
  color: var(--archive-paper-soft, var(--accent-text));
}

.time-settings__btn:hover,
.time-settings__btn:focus-visible {
  border-color: var(--archive-olive, var(--accent));
  outline: none;
}

.time-settings__btn--primary:hover,
.time-settings__btn--primary:focus-visible {
  background: color-mix(in srgb, var(--archive-olive-strong, var(--accent)) 86%, var(--archive-ink, black));
}

@media (max-width: 520px) {
  .time-settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
