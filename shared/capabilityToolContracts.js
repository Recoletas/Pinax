// 能力任务 submit 工具契约全表（BeatPlan 五件套模式）：taskType → 强制提交工具。
// schema 是模型面的形状约束（对齐 openclawService 输出协议卡）；字段级规则与语义校验
// （引文逐字、evidenceRefs 授权、nodeId/offset 映射、typedActions 事务）保持在宿主既有归一化器——不进 agent prompt。
// 门控：advisor 任务面健康且任务有 spec → 走 agent 循环；否则回落漏斗直连（双层 fail-open）。
// 本表为派生视图：taskType 键一律用 canonical（agentCapabilityContract.js）id，零豁免——
// D7 裁定（2026-10-08）清掉了原 experience.* 两把不可达死键（门禁 scripts/check-capability-catalog-sync.mjs）。

const REVIEW_FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'mode', 'summary', 'findings'],
  properties: {
    task: { type: 'string' },
    mode: { type: 'string', enum: ['review'] },
    summary: { type: 'string', description: '一句话总结本批次' },
    findings: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'issueType', 'severity', 'reason', 'target'],
        properties: {
          kind: { type: 'string', enum: ['proofing', 'consistency'] },
          issueType: { type: 'string', enum: ['typo', 'punctuation', 'quote', 'repetition', 'grammar', 'naming', 'time', 'number', 'scene-conflict'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          reason: { type: 'string', description: '指出具体、可核查的问题' },
          target: {
            type: 'object',
            additionalProperties: false,
            required: ['nodeId', 'startOffset', 'endOffset', 'exact'],
            properties: {
              nodeId: { type: 'string' },
              startOffset: { type: 'integer', minimum: 0 },
              endOffset: { type: 'integer', minimum: 0 },
              exact: { type: 'string', description: '必须与范围逐字一致的原文' }
            }
          },
          replacement: { type: ['string', 'null'], description: '只替换 exact 的确定修正；没有唯一修法时必须为 null' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number', minimum: 0, maximum: 1 }
        }
      }
    },
    issues: { type: 'array', items: { type: 'string' } }
  }
}

const REWRITE_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'summary'],
  properties: {
    task: { type: 'string' },
    mode: { type: 'string', enum: ['replace', 'candidates'] },
    summary: { type: 'string', description: '一句话' },
    replacement: { type: 'string', description: 'mode=replace：完整替换文本' },
    candidates: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'replacement'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          replacement: { type: 'string' },
          rationale: { type: 'string' },
          patches: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['nodeId', 'replacement'],
              properties: {
                nodeId: { type: 'string', description: '必须与目标片段完全一致' },
                replacement: { type: 'string' }
              }
            }
          }
        }
      }
    },
    issues: { type: 'array', items: { type: 'string' } }
  }
}

const KNOWLEDGE_ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer'],
  properties: {
    answer: { type: 'string', description: '面向作者的简洁回答；资料不足时明确写当前资料中没有找到' },
    claims: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'confidence'],
        properties: {
          text: { type: 'string', description: '一个可独立核查的结论' },
          confidence: { type: 'string', enum: ['supported', 'partial', 'unsupported'] },
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
          inputs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'value'],
              properties: {
                label: { type: 'string' },
                value: { type: 'number' },
                unit: { type: 'string' },
                evidenceRefs: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          expression: { type: 'string', description: '只含数字、+ - * / 与括号的可复算算式' },
          result: { type: 'string' },
          unit: { type: 'string' }
        }
      }
    }
  }
}

const MEMORY_CLAIMS_SCHEMA = {
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
          quote: { type: 'string', description: '支撑该事实的原句（逐字复制，含全部限定词）' },
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

const TYPED_ACTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'actions'],
  properties: {
    summary: { type: 'string', description: '一句话' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'label', 'payload'],
        properties: {
          type: { type: 'string', description: '该任务允许的 action 类型（见任务指令卡）' },
          label: { type: 'string' },
          payload: { type: 'object', description: '按指令卡定义的 payload 字段' }
        }
      }
    }
  }
}

const SCENE_DIRECTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ready', 'insufficient-evidence'] },
    missing: { type: 'array', items: { type: 'string' }, description: 'status=insufficient-evidence：缺少的事实' },
    pressure: {
      type: 'object',
      additionalProperties: false,
      required: ['statement'],
      properties: {
        statement: { type: 'string', description: '一句有真实取舍的场景压力' },
        evidenceRefs: { type: 'array', items: { type: 'string' } }
      }
    },
    directions: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'action', 'immediateGain', 'cost'],
        properties: {
          id: { type: 'string', description: '稳定短 ID' },
          title: { type: 'string' },
          action: { type: 'string', description: '人物实际采取的行动或信息处置' },
          immediateGain: { type: 'string', description: '一个眼前所得' },
          cost: { type: 'string', description: '一个代价' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          entityRefs: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
}

const REHEARSAL_STEP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['response', 'change', 'choices', 'evidenceRefs', 'consequences'],
  properties: {
    response: { type: 'string', description: '40-180 字、紧接上一刻的具体动作/对白回应（最多 600 字符）' },
    change: { type: 'string', description: '一句本次假想局面变化（80 字以内）' },
    choices: { type: 'array', minItems: 0, maxItems: 3, items: { type: 'string', description: '可试的具体行动（每条 ≤80 字符）' } },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
    consequences: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        required: ['kind'],
        properties: {
          kind: { type: 'string', enum: ['knowledge', 'commitment'] },
          knowerRef: { type: 'string' },
          factKey: { type: 'string' },
          promisorRef: { type: 'string' },
          beneficiaryRef: { type: 'string' },
          state: { type: 'string', enum: ['promised', 'conditioned', 'refused', 'withdrawn'] },
          content: { type: 'string' },
          condition: { type: 'string' },
          commitmentKey: { type: 'string', description: '更新既有承诺时原样带上' },
          source: {
            type: 'object',
            required: ['kind', 'quote'],
            properties: {
              kind: { type: 'string', enum: ['action', 'response'] },
              quote: { type: 'string', description: '逐字原句' }
            }
          }
        }
      }
    }
  }
}

const DEFAULT_ADVICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary'],
  properties: {
    summary: { type: 'string', description: '一句话总结（≤40 字）' },
    issues: { type: 'array', maxItems: 3, items: { type: 'string' } },
    action: { type: 'array', maxItems: 3, items: { type: 'string' } }
  }
}

const TYPED_ACTION_FAMILIES = {
  'materials.classify': { actionTypes: ['material-classification'] },
  'materials.split': { actionTypes: ['material-split'] },
  'materials.relate': { actionTypes: ['material-relations'] },
  'canvas.organize': { actionTypes: ['canvas-layout'] },
  'canvas.relate': { actionTypes: ['canvas-relations'] },
  'canvas.transition': { actionTypes: ['canvas-transition'] },
  'storyboard.review': { actionTypes: ['storyboard-shot-patch'] },
  'storyboard.video.prompt': { actionTypes: ['generation-request'] },
  'authoring.next-actions': { actionTypes: ['runtime-candidate'] },
  'authoring.emergence': { actionTypes: ['runtime-candidate'] }
}

function typedActionsSpec(taskType, description) {
  const family = TYPED_ACTION_FAMILIES[taskType] || { actionTypes: [] }
  return {
    toolName: 'submit_typed_actions',
    description: `${description} 允许的 action.type：${family.actionTypes.join(' | ')}。payload 字段规则见任务指令卡。`,
    schema: TYPED_ACTIONS_SCHEMA,
    actionTypes: family.actionTypes
  }
}

export const CAPABILITY_TOOL_SPECS = {
  'authoring.review.chapter': {
    toolName: 'submit_review_findings',
    description: '提交章节体检结果（proofing/consistency findings，带精确定位 target）。',
    schema: REVIEW_FINDINGS_SCHEMA
  },
  'authoring.rewrite': {
    toolName: 'submit_rewrite_result',
    description: '提交改写结果：mode=replace（单替换）或 candidates（多候选/多块 patches）。',
    schema: REWRITE_RESULT_SCHEMA
  },
  'authoring.complete.inline': {
    toolName: 'submit_rewrite_result',
    description: '提交行内续写：mode=replace，replacement 只含一句正文。',
    schema: REWRITE_RESULT_SCHEMA
  },
  'materials.refine': {
    toolName: 'submit_rewrite_result',
    description: '提交素材精简改写结果。',
    schema: REWRITE_RESULT_SCHEMA
  },
  'authoring.knowledge.query': {
    toolName: 'submit_knowledge_answer',
    description: '提交授权证据问答结果：answer/claims（含 evidenceRefs）/missingInformation/calculations。',
    schema: KNOWLEDGE_ANSWER_SCHEMA
  },
  'memory.extraction': {
    toolName: 'submit_memory_claims',
    description: '提交记忆事实三元组提案（quote 必须逐字复制原句）；无可提取事实时 proposals 空数组并给出 unextractable.reason。',
    schema: MEMORY_CLAIMS_SCHEMA
  },
  'authoring.scene.directions': {
    toolName: 'submit_scene_directions',
    description: '提交场景压力与 2-3 个因果方向；证据不足时 status=insufficient-evidence 并列出 missing。',
    schema: SCENE_DIRECTIONS_SCHEMA
  },
  'authoring.rehearsal.step': {
    toolName: 'submit_rehearsal_step',
    description: '提交隔离试演单步回应与后果登记（quote 逐字；未列出的事实/人物不登记）。',
    schema: REHEARSAL_STEP_SCHEMA
  },
  ...Object.fromEntries(Object.entries(TYPED_ACTION_FAMILIES).map(([taskType, family]) => [
    taskType,
    typedActionsSpec(taskType, '提交结构化修改动作（typedActions）。')
  ])),
  'authoring.review.selection': {
    toolName: 'submit_default_advice',
    description: '提交收束建议：summary/issues/action。',
    schema: DEFAULT_ADVICE_SCHEMA
  },
  'authoring.asset.summarize': {
    toolName: 'submit_default_advice',
    description: '提交素材摘要：summary/issues/action。',
    schema: DEFAULT_ADVICE_SCHEMA
  }
}

export function getCapabilityToolSpec(taskType) {
  return CAPABILITY_TOOL_SPECS[String(taskType || '')] || null
}

export const CAPABILITY_TASK_TYPES = Object.keys(CAPABILITY_TOOL_SPECS)
