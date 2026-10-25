// Shared by assistant orientation and frozen narrative context. No view or store dependencies.
const text = value => String(value ?? '').trim()

export function worldbookFoundation(worldbook = {}) {
  const placeholder = new Set(['自动创建的默认世界书', '默认世界书'])
  const description = text(worldbook.worldDescription || worldbook.description)
  const fields = [
    ['世界概述', placeholder.has(description) ? '' : description],
    ['写作风格', text(worldbook.writingStyle)],
    ['禁写边界', text(worldbook.forbidden)],
    ['风格示例', text(worldbook.examples)]
  ].filter(([, value]) => value)
  return {
    name: text(worldbook.name),
    content: fields.map(([label, value]) => `【${label}】\n${value}`).join('\n\n')
  }
}
