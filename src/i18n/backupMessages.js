import { tr, uiLocale } from './index.js'

// Compatibility adapter for legacy backup messages. IDs and captured values
// remain verbatim; restore decisions still use the original plan and codes.
const patterns = [
  [/^备份回合检查点\((.*), (.*)\) 早于当前会话\((.*)\)，恢复将回退更新的回合历史$/, 'Backup checkpoint ({a}, {b}) predates the current session ({c}). Restoring will roll back newer turn history.'],
  [/^(\d+) 个模型配置密钥键被排除，不会导入$/, '{a} model credential keys were excluded and will not be imported.'],
  [/^(\d+) 个媒体在备份中没有二进制，恢复后仅保留元数据$/, '{a} media items have no binary in the backup. Only their metadata will be restored.'],
  [/^不支持的备份版本：(.*)$/, 'Unsupported backup version: {a}'],
  [/^键 (.*) 的值不是字符串$/, 'The value of key {a} is not a string.']
]
export function backupMessage(message) {
  const source = String(message || '')
  if (uiLocale.value !== 'en') return source
  for (const [pattern, template] of patterns) {
    const match = source.match(pattern)
    if (match) return template.replace(/\{([abc])\}/g, (_, key) => match[key.charCodeAt(0) - 96])
  }
  return tr(source)
}
