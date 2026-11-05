export const isAssistantContextOverflow = value => /context[_ ](?:window|length).*exceed|exceed.*context[_ ](?:window|length)|prompt (?:is )?too long|input.*too long|context_length_exceeded|exceeded model token limit|模型上下文已满/i.test(String(value?.message || value || ''))
export function assistantErrorText(value) {
  const message = String(value?.message || value || '')
  if (message === '自动压缩后仍无法继续本轮任务，已有修改已保留。请查看模型容量配置或压缩失败原因。') return '上次任务因上下文超限未完成，已有修改已保留。'
  if (/^自动压缩(?:失败|后)/.test(message)) return message
  return isAssistantContextOverflow(message) ? '本轮模型请求超过服务商的上下文容量，已有修改已保留。' : message
}
