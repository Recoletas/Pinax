import { ref, computed } from 'vue'
import { getApiSettings, sendChatStream } from '../services/api'
import { getItem, STORAGE_KEYS } from './useStorage'
import { getAdvisorPrompt } from '../services/promptRegistry'

async function resolveApiSettings() {
  const localRaw = getItem(STORAGE_KEYS.API_SETTINGS) || {}
  if (localRaw.baseUrl && localRaw.apiKey && localRaw.model) return localRaw
  try {
    const remoteRaw = await getApiSettings()
    return {
      provider: localRaw.provider || remoteRaw.provider || 'openai',
      baseUrl: localRaw.baseUrl || remoteRaw.baseUrl || '',
      apiKey: localRaw.apiKey || remoteRaw.apiKey || '',
      model: localRaw.model || remoteRaw.model || ''
    }
  } catch {
    return localRaw
  }
}

export function useAdvisor(mode = 'prose') {
  const advisorOpen = ref(false)
  const advisorLoading = ref(false)
  const advisorMessages = ref([])
  const advisorInput = ref('')
  const backend = ref('openai')

  const promptConfig = computed(() => getAdvisorPrompt(mode))

  async function askAdvisor(question, contextProvider, openclawAdvice) {
    if (advisorLoading.value) return
    advisorLoading.value = true
    advisorInput.value = ''
    advisorMessages.value.push({ role: 'user', content: question })

    try {
      let advice = ''
      if (backend.value === 'openai') {
        if (!contextProvider) {
          advice = 'AI 模式未配置 contextProvider 函数'
          advisorMessages.value.push({ role: 'advisor', content: advice })
        } else {
          const context = await contextProvider()
          const apiSettings = await resolveApiSettings()
          if (!apiSettings.baseUrl || !apiSettings.apiKey || !apiSettings.model) {
            throw new Error('未配置 AI，请先在设置中填写 API 信息')
          }
          const messages = [
            { role: 'system', content: promptConfig.value.system },
            { role: 'user', content: `当前创作上下文：\n${JSON.stringify(context, null, 2)}\n\n用户的问题：${question}` }
          ]

          // 添加一个空的顾问消息占位符
          const messageIndex = advisorMessages.value.length
          advisorMessages.value.push({ role: 'advisor', content: '' })

          // 使用流式 API
          let fullContent = ''

          await sendChatStream(
            messages,
            null,
            null,
            apiSettings,
            { max_tokens: 1500 },
            {
              onChunk: (chunk) => {
                if (chunk.content) {
                  fullContent += chunk.content
                  // 实时更新消息内容
                  if (advisorMessages.value[messageIndex]) {
                    advisorMessages.value[messageIndex].content = fullContent
                  }
                }
              },
              onComplete: (result) => {
                // 流式完成
                if (advisorMessages.value[messageIndex]) {
                  advisorMessages.value[messageIndex].content = result.content || fullContent || '未获取到有效回复'
                }
              },
              onError: (error) => {
                console.error('Advisor stream error:', error)
                if (advisorMessages.value[messageIndex]) {
                  advisorMessages.value[messageIndex].content = `获取建议失败：${error.message}`
                }
              }
            }
          )
        }
      } else {
        if (!openclawAdvice) {
          advice = 'OpenClaw 模式未配置 openclawAdvice 函数'
        } else {
          const context = await contextProvider()
          advice = await openclawAdvice(question, context)
        }
        advisorMessages.value.push({ role: 'advisor', content: advice })
      }
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
  }

  return {
    advisorOpen,
    advisorLoading,
    advisorMessages,
    advisorInput,
    backend,
    askAdvisor,
    openAdvisor,
    closeAdvisor,
    clearAdvisorMessages,
    promptConfig
  }
}
