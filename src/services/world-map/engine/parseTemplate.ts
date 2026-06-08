/**
 * 模板字符串 → typed op list
 *
 * Round 2 Stage 5 引入 — `enforceTemplateContract` 用 typed ops 评估
 * 模板满足的合同（如"含 N 个 Strait 算地中海中心水域"）。
 *
 * 输出：Array<{ tool, args: string[] }>
 * 注：仅解析 dispatch 用的 tool 名,不强校验 args 数量 / 范围,
 *     args 错位（例 Range 只有 3 列）由 `applyTemplate` 既存逻辑静默忽略。
 */
import type { HeightmapTemplate } from './types'

export type TemplateTool = 'Hill' | 'Pit' | 'Range' | 'Trough' | 'Strait' | 'Smooth' | 'Mask' | 'Invert' | 'Add' | 'Multiply' | 'Unknown'

export interface TemplateOp {
  tool: TemplateTool
  args: string[]
  /** 原始行（trim 后）— 留作 debug / 报告层 */
  raw: string
}

const TOOL_SET: ReadonlySet<string> = new Set([
  'Hill', 'Pit', 'Range', 'Trough', 'Strait', 'Smooth', 'Mask', 'Invert', 'Add', 'Multiply',
])

/**
 * 把 Azgaar 模板字符串解析成 typed op list。
 * 空行 / 纯空白行被忽略,其他行 split 空白。
 */
export function parseTemplate(templateString: string): TemplateOp[] {
  const lines = templateString.split('\n')
  const ops: TemplateOp[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const els = line.split(/\s+/)
    const tool = els[0]
    const typedTool: TemplateTool = TOOL_SET.has(tool) ? (tool as TemplateTool) : 'Unknown'
    ops.push({ tool: typedTool, args: els.slice(1), raw: line })
  }
  return ops
}

/** 模板名 → 该模板是否使用了 Strait。mediterranean 完整合同会用此判定"中心水域"。 */
export function templateHasStrait(ops: TemplateOp[]): boolean {
  return ops.some(op => op.tool === 'Strait')
}

/** 模板名 → 该模板的 Strait op 列表（mediterranean / oldWorld 会有多个） */
export function templateStraitOps(ops: TemplateOp[]): TemplateOp[] {
  return ops.filter(op => op.tool === 'Strait')
}

/** 工具:用模板 ID 查 HEIGHTMAP_TEMPLATES,避免 caller 重复 import */
export function parseTemplateById(id: HeightmapTemplate): TemplateOp[] {
  // 间接 import 避免循环依赖(parseTemplate → heightmap-templates → parseTemplate)
  // HEIGHTMAP_TEMPLATES 的 template 字段是字符串。直接读 import 更省事,
  // 但为了不引入循环,这里只导函数,具体 ID → 字符串的映射由 caller 提供。
  throw new Error('parseTemplateById: not implemented; use parseTemplate(HEIGHTMAP_TEMPLATES[id].template) instead')
}
