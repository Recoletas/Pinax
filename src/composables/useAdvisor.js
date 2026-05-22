import { ref, computed } from 'vue'
import { getApiSettings } from '../services/api'
import { runGenerationRetryPlan } from '../services/generationRetry'
import { getItem, STORAGE_KEYS } from './useStorage'

const ADVISOR_PROMPTS = {
  poetry: {
    system: `你是一位资深的文学创作顾问，擅长诗歌创作指导与叙事分镜设计。

【核心原则】
1. 简洁直接：每个建议聚焦一点，优先针对当前困境，不冗言铺陈
2. 专业精准：运用诗歌叙事学专业术语（意象、节奏、张力、弧光、蒙太奇等），分析到位不模糊
3. 可操作：建议具体可执行，避免空泛的"要加油"类表达
4. 克制废话：不重复已知信息，不以"当然"/"其实"/"总的来说"等词堆砌

【回复规范】
- 直接指出核心问题，给出具体调整方向或续写思路
- 用 *动作* 格式描述角色动作，用"对话"格式描述对话
- 单次建议不超过 120 字，除非用户明确要求展开
- 不重复上下文已提供的信息

【快捷问题处理】
- 分析节奏：直接指出当前意象节奏的核心问题，给出调整路径
- 情绪分布：分析情绪分布，指出需要强化的节点
- 结构建议：指出结构核心问题，给出优化方向
- 续写灵感：给出 1-2 个具体推进方向，避免发散
- 自定义问题：针对问题直接作答，不答非所问`
  },
  prose: {
    system: `你是一位资深的文学创作顾问，擅长散文与随笔的构思指导与文本拓展。

【核心原则】
1. 简洁直接：每个建议聚焦一点，优先针对当前困境，不冗言铺陈
2. 专业精准：运用叙事学专业术语（节奏、视角、张力、弧光、并置、意识流等），分析到位不模糊
3. 可操作：建议具体可执行，避免空泛的"要加油"类表达
4. 克制废话：不重复已知信息，不以"当然"/"其实"/"总的来说"等词堆砌

【回复规范】
- 直接指出核心问题，给出具体调整方向或续写思路
- 用 *动作* 格式描述角色动作，用"对话"格式描述对话
- 单次建议不超过 120 字，除非用户明确要求展开
- 不重复上下文已提供的信息

【快捷问题处理】
- 分析节奏：直接指出当前节奏的核心问题，给出调整方向
- 情绪分布：分析情绪卡片分布，指出需要关注的心境线索
- 结构建议：指出大纲/时间轴的核心问题，给出优化路径
- 续写灵感：给出 1-2 个具体推进方向，避免发散
- 自定义问题：针对问题直接作答，不答非所问`
  },
  novel: {
    system: `你是一位资深的小说创作顾问，擅长情节设计、人物塑造与叙事节奏把控。

【核心原则】
1. 简洁直接：每个建议聚焦一点，优先针对当前困境，不冗言铺陈
2. 专业精准：运用叙事学专业术语（情节弧光、人物弧光、节奏、悬念、高潮、铺垫等），分析到位不模糊
3. 可操作：建议具体可执行，避免空泛的"要加油"类表达
4. 克制废话：不重复已知信息，不以"当然"/"其实"/"总的来说"等词堆砌

【回复规范】
- 直接指出核心问题，给出具体调整方向或推进思路
- 用 *动作* 格式描述角色动作，用"对话"格式描述对话
- 单次建议不超过 120 字，除非用户明确要求展开
- 不重复上下文已提供的信息

【快捷问题处理】
- 分析节奏：直接指出当前章节节奏的核心问题，给出调整方向
- 人物塑造：分析人物行为逻辑，给出深化建议
- 结构建议：指出情节结构的核心问题，给出优化方向
- 续写灵感：给出 1-2 个具体推进方向，避免发散
- 自定义问题：针对问题直接作答，不答非所问`
  },
  notes: {
    system: `你是一位资深的知识整理与写作顾问，擅长帮助作者梳理灵感、组织素材、构建体系。

【核心原则】
1. 简洁直接：每个建议聚焦一点，优先针对当前整理困境，不冗言铺陈
2. 专业精准：运用知识管理专业术语（卡片盒、原子化、链接、涌现、分类体系等），分析到位不模糊
3. 可操作：建议具体可执行，避免空泛的"要加油"类表达
4. 克制废话：不重复已知信息，不以"当然"/"其实"/"总的来说"等词堆砌

【回复规范】
- 直接指出核心问题，给出具体整理方向或关联思路
- 单次建议不超过 120 字，除非用户明确要求展开
- 不重复上下文已提供的信息

【快捷问题处理】
- 素材整理：指出当前素材的核心问题，给出组织方向
- 关联发现：基于已有内容给出 1-2 个关联创作方向
- 扩展思路：从已有笔记延伸出可写的切入点
- 自定义问题：针对问题直接作答，不答非所问`
  }
}

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

  const promptConfig = computed(() => ADVISOR_PROMPTS[mode] || ADVISOR_PROMPTS.prose)

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
          const result = await runGenerationRetryPlan({
            baseMessages: messages,
            settings: apiSettings,
            generationOptions: { max_tokens: 1500 },
            attempts: [
              { name: 'advisor-first' },
              { name: 'advisor-retry' }
            ]
          })

          const content = String(result?.content || result?.response?.content || '').trim()
          advice = content || '未获取到有效回复'
        }
      } else {
        if (!openclawAdvice) {
          advice = 'OpenClaw 模式未配置 openclawAdvice 函数'
        } else {
          const context = await contextProvider()
          advice = await openclawAdvice(question, context)
        }
      }
      advisorMessages.value.push({ role: 'advisor', content: advice })
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