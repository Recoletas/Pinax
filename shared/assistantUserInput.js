// Questions are author decisions, never permissions or instructions from sources.
export function normalizeAssistantQuestions(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) throw new Error('请提供 1 至 3 个问题。')
  const ids = new Set()
  const string = (value, max) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('问题内容为空或过长。')
    return value.trim()
  }
  const questions = input.map(question => {
    const id = string(question?.id, 80)
    if (ids.has(id)) throw new Error('问题 ID 不能重复。')
    ids.add(id)
    const options = question.options ?? []
    if (!Array.isArray(options) || options.length > 4) throw new Error('每个问题最多 4 个选项。')
    const labels = new Set()
    return { id, question: string(question.question, 1000), options: options.map(option => {
      const label = string(option?.label, 120)
      if (labels.has(label)) throw new Error('选项不能重复。')
      labels.add(label)
      return { label, description: option.description ? string(option.description, 400) : '' }
    }) }
  })
  // Keep the question result within the runtime's bounded tool transcript.
  if (JSON.stringify(questions).length + JSON.stringify(questions.map(item => item.question).join('\n\n')).length > 3400) throw new Error('问题过长，请只问本次需要作者决定的内容。')
  return questions
}

export function formatAssistantAnswers(questions, answers) {
  const normalized = normalizeAssistantQuestions(questions)
  return normalized.map(question => {
    const answer = answers?.[question.id]
    if (typeof answer !== 'string' || !answer.trim() || answer.length > 4000) throw new Error('请回答每个问题后继续。')
    return `${question.question}\n${answer.trim()}`
  }).join('\n\n')
}
