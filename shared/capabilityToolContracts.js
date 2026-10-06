// 能力任务 submit 工具契约（BeatPlan 五件套模式）：taskType → 强制提交工具（name/description/schema）。
// schema 是模型面的形状约束（宽松）；语义校验（引文逐字、evidenceRefs 授权、审校块映射）
// 保持在宿主既有归一化器（writingReviewContract / authoringKnowledgeAnswerContract / structuredExtraction）——不进 agent prompt。
export const CAPABILITY_TOOL_SPECS = {
  'authoring.review.chapter': {
    toolName: 'submit_review_findings',
    description: '提交章节体检结果：findings 数组（每条含 kind/issueType/severity/reason/target）与 summary。',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['findings', 'summary'],
      properties: {
        findings: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'issueType', 'severity', 'reason'],
            properties: {
              kind: { type: 'string', description: 'consistency/logic/grammar/style/pacing' },
              issueType: { type: 'string' },
              severity: { type: 'string', enum: ['major', 'minor', 'suggestion'] },
              reason: { type: 'string', description: '问题说明（引用原文依据）' },
              replacement: { type: 'string', description: '建议替换文本（可选）' },
              evidenceRefs: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        summary: { type: 'string', description: '整体体检摘要' }
      }
    }
  },
  'authoring.knowledge.query': {
    toolName: 'submit_knowledge_answer',
    description: '提交授权证据问答结果：answer/claims（含 evidenceRefs）/missingInformation/calculations。',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['answer'],
      properties: {
        answer: { type: 'string', description: '面向作者的完整回答' },
        claims: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'confidence'],
            properties: {
              text: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              evidenceRefs: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        missingInformation: { type: 'array', items: { type: 'string' } },
        calculations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'expression', 'result'],
            properties: {
              label: { type: 'string' },
              inputs: { type: 'array', items: { type: 'string' } },
              expression: { type: 'string' },
              result: { type: 'string' },
              unit: { type: 'string' }
            }
          }
        }
      }
    }
  },
  'memory.extraction': {
    toolName: 'submit_memory_claims',
    description: '提交记忆事实三元组提案（quote 必须逐字复制原句）；无可提取事实时 proposals 空数组并给出 unextractable.reason。',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['proposals'],
      properties: {
        proposals: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['subject', 'predicate', 'object', 'quote', 'polarity'],
            properties: {
              subject: { type: 'string' },
              predicate: { type: 'string' },
              object: { type: 'string' },
              quote: { type: 'string', description: '支撑该事实的原句（逐字复制）' },
              polarity: { type: 'string', enum: ['positive', 'negative', 'hedged', 'report'] },
              storyTime: {
                type: 'object',
                additionalProperties: false,
                properties: { precision: { type: 'string' }, expression: { type: 'string' } }
              },
              confidence: { type: 'number', minimum: 0, maximum: 1 }
            }
          }
        },
        unextractable: {
          type: 'object',
          additionalProperties: false,
          properties: { reason: { type: 'string' } }
        }
      }
    }
  }
}

export function getCapabilityToolSpec(taskType) {
  return CAPABILITY_TOOL_SPECS[String(taskType || '')] || null
}
