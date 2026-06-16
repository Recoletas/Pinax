import { getResolvedApiSettings } from './api'
import { runGenerationTask } from './generationService'
import {
  getSettingField,
  getSettingSection,
  summarizeStructuredSettings
} from './settingPanelSchema'

function normalizeDraft(content) {
  return String(content || '')
    .replace(/^```[\s\S]*?\n?/, '')
    .replace(/```$/g, '')
    .trim()
}

export function buildSettingGenerationMessages({ worldbook, sectionKey, fieldKey, userBrief = '' }) {
  const section = getSettingSection(sectionKey)
  const field = getSettingField(sectionKey, fieldKey)
  if (!section || !field) throw new Error('设定字段不存在')

  const context = summarizeStructuredSettings(worldbook?.structuredSettings, {
    exclude: { sectionKey, fieldKey }
  })

  const userLines = [
    `世界书：${worldbook?.name || '未命名世界书'}`,
    worldbook?.worldDescription ? `基础世界设定：${worldbook.worldDescription}` : '',
    `设定分区：${section.label}`,
    `目标字段：${field.label}`,
    context ? `已填写设定：\n${context}` : '已填写设定：无',
    userBrief ? `用户补充要求：${userBrief}` : '',
    '',
    '请生成该字段内容。',
    '要求：',
    '1. 只输出可直接写入字段的正文。',
    '2. 不输出标题、解释、项目符号、Markdown 代码块。',
    '3. 保持与已填写设定一致，不制造冲突。',
    '4. 内容应具体，有可执行设定信息，避免空泛评价。'
  ].filter(Boolean)

  return [
    {
      role: 'system',
      content: '你是小说设定编辑，负责补全结构化世界书字段。输出必须克制、清晰、可直接保存。'
    },
    {
      role: 'user',
      content: userLines.join('\n')
    }
  ]
}

export function buildSettingPromptPreview(options) {
  return buildSettingGenerationMessages(options)
    .map((message) => `【${message.role}】\n${message.content}`)
    .join('\n\n')
}

export async function generateSettingFieldDraft(options) {
  const settings = await getResolvedApiSettings()
  if (!settings?.baseUrl || !settings?.apiKey || !settings?.model) {
    return { ok: false, reason: '未检测到可用 AI 配置。' }
  }

  const result = await runGenerationTask({
    taskType: `worldbook.setting.${options.sectionKey}.${options.fieldKey}`,
    baseMessages: buildSettingGenerationMessages(options),
    settings,
    generationOptions: {
      temperature: 0.45,
      max_tokens: 900,
      max_input_chars: 12000
    },
    attempts: [
      { name: 'setting-field-draft' }
    ],
    parseContent: normalizeDraft,
    isValidParsed: (text) => Boolean(String(text || '').trim())
  })

  if (!result?.success) {
    return { ok: false, reason: 'AI 未返回可用设定草稿。' }
  }

  return {
    ok: true,
    content: normalizeDraft(result.parsed || result.content)
  }
}

// 整 section 批量：串行 + cooperative abort。
//   - signal?.aborted 只在 await 之后检查 → 丢弃结果 + 停止后续字段
//   - 不取消 in-flight `runGenerationTask`（避免穿透 scope）
//   - 单字段失败不阻塞后续字段；用 results Map 区分 ok / reason
export async function generateSettingSectionDraft({ sectionKey, worldbook, userBrief = '', signal = null, onProgress = null } = {}) {
  const section = getSettingSection(sectionKey)
  if (!section) return new Map()

  const results = new Map()
  const fields = section.fields

  for (let i = 0; i < fields.length; i++) {
    if (signal?.aborted) {
      results.set(fields[i].key, { ok: false, reason: 'aborted', index: i })
      break
    }
    const field = fields[i]
    onProgress?.({ index: i, total: fields.length, field })
    try {
      const draft = await generateSettingFieldDraft({
        worldbook,
        sectionKey,
        fieldKey: field.key,
        userBrief
      })
      if (signal?.aborted) {
        results.set(field.key, { ok: false, reason: 'aborted', index: i })
        break
      }
      if (!draft.ok) {
        results.set(field.key, { ok: false, reason: draft.reason || '生成失败', index: i })
      } else {
        results.set(field.key, { ok: true, content: draft.content, fieldLabel: field.label, index: i })
      }
    } catch (e) {
      if (signal?.aborted) {
        results.set(field.key, { ok: false, reason: 'aborted', index: i })
        break
      }
      results.set(field.key, { ok: false, reason: e?.message || '生成失败', index: i })
    }
  }

  return results
}
