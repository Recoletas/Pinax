import { ref } from 'vue'
import { requestAdvisorTask } from '../services/advisorTaskService'

function createAdvisorResultId() {
  return `advisor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeAdvisorInput(input) {
  if (typeof input === 'string') {
    const question = input.trim()
    return {
      label: question,
      question,
      scope: '',
      taskType: '',
      target: null,
      options: {}
    }
  }

  if (!input || typeof input !== 'object') {
    return {
      label: '',
      question: '',
      scope: '',
      taskType: '',
      target: null,
      options: {}
    }
  }

  const question = String(input.question || input.label || '').trim()
  const label = String(input.label || question).trim()

  return {
    label,
    question,
    scope: String(input.scope || '').trim(),
    taskType: String(input.taskType || '').trim(),
    target: input.target || null,
    options: input.options || {},
    mode: String(input.mode || '').trim() || undefined
  }
}

export function useAdvisor() {
  const advisorOpen = ref(false)
  const advisorLoading = ref(false)
  const advisorMessages = ref([])
  const advisorResults = ref([])

  async function askAdvisor(input, contextProvider) {
    if (advisorLoading.value) return

    const task = normalizeAdvisorInput(input)
    if (!task.question) return

    advisorLoading.value = true
    advisorMessages.value.push({ role: 'user', content: task.label || task.question })

    try {
      if (typeof contextProvider !== 'function') {
        throw new Error('未配置上下文函数')
      }

      const context = await contextProvider()
      const taskResult = await requestAdvisorTask({
        context,
        question: task.question,
        scope: task.scope,
        taskType: task.taskType,
        target: task.target,
        options: task.options,
        mode: task.mode
      })
      advisorResults.value.push({
        id: taskResult.result?.id || createAdvisorResultId(),
        status: 'pending',
        ...(taskResult.result || {})
      })
      advisorMessages.value.push({ role: 'advisor', content: taskResult.advice })
    } catch (e) {
      advisorMessages.value.push({ role: 'advisor', content: `获取建议失败：${e.message || e}` })
    } finally {
      advisorLoading.value = false
    }
  }

  function openAdvisor() {
    advisorOpen.value = true
  }

  function closeAdvisor() {
    advisorOpen.value = false
  }

  function clearAdvisorMessages() {
    advisorMessages.value = []
    advisorResults.value = []
  }

  function updateAdvisorResultStatus(resultId, status, detail = '') {
    const result = advisorResults.value.find((item) => item.id === resultId)
    if (!result) return
    result.status = status
    result.statusDetail = detail
  }

  return {
    advisorOpen,
    advisorLoading,
    advisorMessages,
    advisorResults,
    askAdvisor,
    openAdvisor,
    closeAdvisor,
    clearAdvisorMessages,
    updateAdvisorResultStatus
  }
}
