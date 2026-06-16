import { ref, watch } from 'vue'
import { parseControlValue, serializeControlValue } from '../services/settingPanelSchema'

// chips / tags / list / forbidden 共用的 token-list 状态机
// 内部维护 Array；外部只看见 String（emit update:modelValue）
// props.modelValue 变化（外部 store 同步）时若与当前序列一致则不刷
export function useChipInput(props, emit) {
  const tokens = ref(parseControlValue(props.modelValue, props.delimiter, props.parseMode))
  const pending = ref('')

  watch(() => props.modelValue, (next) => {
    const nextTokens = parseControlValue(next, props.delimiter, props.parseMode)
    const currentSerialized = serializeControlValue(tokens.value, '\n')
    const nextSerialized = serializeControlValue(nextTokens, '\n')
    if (nextSerialized !== currentSerialized) {
      tokens.value = nextTokens
    }
  })

  function flushPending() {
    const value = pending.value
    if (!value.trim()) {
      pending.value = ''
      return
    }
    const pieces = parseControlValue(value, props.delimiter, props.parseMode)
    if (pieces.length > 0) {
      tokens.value = [...tokens.value, ...pieces]
      pending.value = ''
      emit('update:modelValue', serializeControlValue(tokens.value, '\n'))
    }
  }

  function onInput(e) {
    pending.value = e.target.value
    if (props.delimiter.some((d) => pending.value.includes(d))) {
      flushPending()
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      flushPending()
    } else if (e.key === 'Backspace' && pending.value === '' && tokens.value.length > 0) {
      e.preventDefault()
      tokens.value = tokens.value.slice(0, -1)
      emit('update:modelValue', serializeControlValue(tokens.value, '\n'))
    }
  }

  function onBlur() {
    flushPending()
  }

  function remove(i) {
    tokens.value = tokens.value.filter((_, idx) => idx !== i)
    emit('update:modelValue', serializeControlValue(tokens.value, '\n'))
  }

  return { tokens, pending, onInput, onKeydown, onBlur, remove }
}
