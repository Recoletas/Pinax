import { sendChat } from './api'

function createPlanRequestId() {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function resolveAttemptMessages(attempt, baseMessages, history) {
  if (Array.isArray(attempt?.messages) && attempt.messages.length > 0) {
    return attempt.messages
  }

  if (typeof attempt?.buildMessages === 'function') {
    const built = attempt.buildMessages({ baseMessages, history })
    if (Array.isArray(built) && built.length > 0) {
      return built
    }
  }

  if (Array.isArray(attempt?.appendMessages) && attempt.appendMessages.length > 0) {
    return [...baseMessages, ...attempt.appendMessages]
  }

  return [...baseMessages]
}

function evaluateAttemptSuccess({ parseContent, isValidParsed, parsed, content, parseError, response, index, attempt, history }) {
  if (typeof isValidParsed === 'function') {
    return Boolean(isValidParsed(parsed, {
      content,
      parseError,
      response,
      index,
      attempt,
      history
    }))
  }

  if (typeof parseContent === 'function') {
    return parsed != null
  }

  return Boolean(content.trim())
}

export async function runGenerationRetryPlan({
  baseMessages,
  settings,
  generationOptions = {},
  attempts = [],
  parseContent,
  isValidParsed,
  character = null,
  worldId = null
}) {
  if (!Array.isArray(baseMessages) || baseMessages.length === 0) {
    throw new Error('runGenerationRetryPlan requires non-empty baseMessages')
  }

  const normalizedAttempts = Array.isArray(attempts) && attempts.length > 0
    ? attempts
    : [{ name: 'attempt-1' }]

  const requestIdBase = generationOptions.request_id || createPlanRequestId()
  const history = []

  for (let index = 0; index < normalizedAttempts.length; index += 1) {
    const attempt = normalizedAttempts[index] || {}
    const messages = resolveAttemptMessages(attempt, baseMessages, history)

    let response = null
    let content = ''
    let parsed = null
    let parseError = null
    let requestError = null

    try {
      response = await sendChat(
        messages,
        character,
        worldId,
        settings,
        {
          ...generationOptions,
          retryCount: index,
          request_id: `${requestIdBase}_a${index}`
        }
      )
      content = String(response?.content || '')
    } catch (e) {
      requestError = e
    }

    if (!requestError && typeof parseContent === 'function') {
      try {
        parsed = parseContent(content)
      } catch (e) {
        parseError = e
      }
    }

    const success = requestError
      ? false
      : evaluateAttemptSuccess({
        parseContent,
        isValidParsed,
        parsed,
        content,
        parseError,
        response,
        index,
        attempt,
        history
      })

    const item = {
      index,
      name: attempt?.name || `attempt-${index + 1}`,
      messages,
      response,
      content,
      parsed,
      parseError,
      requestError,
      success
    }

    history.push(item)

    if (success) {
      return {
        success: true,
        attemptIndex: index,
        content,
        parsed,
        response,
        attempts: history
      }
    }

    if (requestError && index === normalizedAttempts.length - 1) {
      throw requestError
    }
  }

  const last = history[history.length - 1] || null
  return {
    success: false,
    attemptIndex: last?.index ?? -1,
    content: last?.content || '',
    parsed: last?.parsed ?? null,
    response: last?.response || null,
    attempts: history
  }
}
