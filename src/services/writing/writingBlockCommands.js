export const WRITING_BLOCK_COMMANDS = Object.freeze([
  { id: 'ai-continue', group: 'generate', label: '从这里续写', requiresCollapsed: true },
  { id: 'rewrite', group: 'revise', label: '改写', requiresSelection: true },
  { id: 'expand', group: 'revise', label: '扩写', requiresSelection: true },
  { id: 'condense', group: 'revise', label: '精简', requiresSelection: true },
  { id: 'review-chapter', group: 'review', label: '审查本章' },
  { id: 'split-unit', group: 'structure', label: '拆分单元', requiresCollapsed: true },
  { id: 'merge-unit', group: 'structure', label: '合并单元', requiresCollapsed: true },
  { id: 'collect-material', group: 'collect', label: '收为素材' },
  { id: 'remember-selection', group: 'collect', label: '记住选区', requiresSelection: true }
])

export function resolveWritingBlockCommands(context = {}) {
  const hasSelection = Boolean(context.hasSelection)
  return WRITING_BLOCK_COMMANDS.filter((command) => {
    if (command.requiresSelection && !hasSelection) return false
    if (command.requiresCollapsed && hasSelection) return false
    return true
  })
}
