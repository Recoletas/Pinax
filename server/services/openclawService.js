import WebSocket from 'ws'
import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import {
  randomUUID,
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  sign,
  createHash
} from 'crypto'

const AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main'
const GATEWAY_BASE_URL = process.env.OPENCLAW_BASE_URL || 'http://127.0.0.1:18789'
const OPENCLAW_TIMEOUT_MS = Number.isFinite(Number(process.env.OPENCLAW_TIMEOUT_MS))
  ? Math.max(5000, Math.floor(Number(process.env.OPENCLAW_TIMEOUT_MS)))
  : 45000
const DEVICE_IDENTITY_PATH = process.env.OPENCLAW_DEVICE_IDENTITY_PATH
  || join(homedir(), '.openclaw', 'identity', 'pinax-device.json')

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

const ADVISOR_TASK_INSTRUCTIONS = {
  'advisor.fix.selection': '任务：修正选区文字。输出简洁可替换结果。',
  'advisor.fix.paragraph': '任务：修正当前段落。输出简洁可替换段落。',
  'advisor.close.thread': '任务：收束当前线索。给 1-2 个自然收束方式。',
  'advisor.review.chapter': '任务：章节体检。输出 summary/issues/action，每段简洁。',
  'advisor.continue.light': '任务：轻续一句。只给一条短建议。'
}

function readGatewayTokenFromConfig() {
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    if (!existsSync(configPath)) return ''
    const raw = JSON.parse(readFileSync(configPath, 'utf8'))
    const token = raw?.gateway?.auth?.token
    return typeof token === 'string' ? token.trim() : ''
  } catch {
    return ''
  }
}

function resolveGatewayToken() {
  return (process.env.OPENCLAW_GATEWAY_TOKEN || readGatewayTokenFromConfig() || '').trim()
}

function serializeContext(context) {
  if (typeof context === 'string') return context.trim()
  if (context == null) return ''
  if (typeof context === 'object') {
    try {
      return JSON.stringify(context, null, 2)
    } catch {
      return String(context).trim()
    }
  }
  return String(context).trim()
}

function normalizeTaskType(taskType) {
  const value = String(taskType || '').trim()
  return value || 'advisor.review.chapter'
}

function getTaskInstruction(taskType) {
  return ADVISOR_TASK_INSTRUCTIONS[taskType] || ADVISOR_TASK_INSTRUCTIONS['advisor.review.chapter']
}

function getTaskOutputInstruction(taskType) {
  if (taskType === 'advisor.fix.selection' || taskType === 'advisor.fix.paragraph') {
    return `输出要求：只输出一个 JSON 对象，不要 Markdown。格式：
{
  "task": "${taskType}",
  "mode": "replace",
  "summary": "一句话",
  "replacement": "完整替换文本",
  "issues": []
}`
  }

  return [
    '输出要求：',
    'summary',
    '一句话总结（<=40字）',
    '',
    'issues',
    '- 最多3条，每条一句',
    '',
    'action',
    '- 最多3条可执行动作'
  ].join('\n')
}

function base64UrlEncode(inputBuffer) {
  return inputBuffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function derivePublicKeyRaw(publicKeyPem) {
  const key = createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32
    && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

function buildDeviceId(publicKeyPem) {
  return createHash('sha256').update(derivePublicKeyRaw(publicKeyPem)).digest('hex')
}

function loadOrCreateDeviceIdentity(filePath = DEVICE_IDENTITY_PATH) {
  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      if (
        parsed?.version === 1
        && typeof parsed.deviceId === 'string'
        && typeof parsed.publicKeyPem === 'string'
        && typeof parsed.privateKeyPem === 'string'
      ) {
        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem
        }
      }
    }
  } catch {
    // fall through
  }

  const pair = generateKeyPairSync('ed25519')
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const payload = {
    version: 1,
    deviceId: buildDeviceId(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now()
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  try {
    chmodSync(filePath, 0o600)
  } catch {
    // best effort
  }

  return {
    deviceId: payload.deviceId,
    publicKeyPem: payload.publicKeyPem,
    privateKeyPem: payload.privateKeyPem
  }
}

function buildDeviceAuthPayload({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  return [
    'v2',
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token || '',
    nonce
  ].join('|')
}

function buildSignedDevice(challengeNonce, token, scopes) {
  const identity = loadOrCreateDeviceIdentity()
  const signedAt = Date.now()
  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: 'gateway-client',
    clientMode: 'backend',
    role: 'operator',
    scopes,
    signedAtMs: signedAt,
    token,
    nonce: challengeNonce
  })
  const signature = base64UrlEncode(sign(null, Buffer.from(payload, 'utf8'), createPrivateKey(identity.privateKeyPem)))
  return {
    id: identity.deviceId,
    publicKey: base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem)),
    signature,
    signedAt,
    nonce: challengeNonce
  }
}

function extractTextFromChatMessage(message) {
  if (!message || typeof message !== 'object') return ''

  if (typeof message.text === 'string') return message.text.trim()
  if (typeof message.content === 'string') return message.content.trim()

  if (Array.isArray(message.content)) {
    const text = message.content
      .map((item) => (item && typeof item === 'object' && typeof item.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (text) return text
  }

  return ''
}

function extractTextFromHistoryMessages(messages) {
  if (!Array.isArray(messages)) return ''

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]
    if (!item || typeof item !== 'object') continue
    if (item.role !== 'assistant') continue

    if (typeof item.text === 'string' && item.text.trim()) {
      return item.text.trim()
    }

    if (typeof item.content === 'string' && item.content.trim()) {
      return item.content.trim()
    }

    if (Array.isArray(item.content)) {
      const text = item.content
        .map((part) => (part && typeof part === 'object' && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n')
        .trim()
      if (text) return text
    }
  }

  return ''
}

export async function getAdvice(context, question, taskMeta = {}) {
  const token = resolveGatewayToken()
  if (!token) {
    throw new Error('缺少 OPENCLAW_GATEWAY_TOKEN，请先配置网关 Token')
  }

  const contextText = serializeContext(context)
  const questionText = String(question || '').trim()
  const taskType = normalizeTaskType(taskMeta.taskType)
  const targetText = serializeContext(taskMeta.target)
  const optionsText = serializeContext(taskMeta.options)

  if (!contextText || !questionText) {
    throw new Error('缺少 context 或 question 参数')
  }

  const userMessage = [
    `任务类型：${taskType}`,
    getTaskInstruction(taskType),
    getTaskOutputInstruction(taskType),
    targetText ? `目标文本/范围：\n${targetText}` : '',
    optionsText ? `任务选项：\n${optionsText}` : '',
    `当前创作上下文：\n${contextText}`,
    `用户的问题：${questionText}`
  ].filter(Boolean).join('\n\n')

  const wsUrl = GATEWAY_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '')
  const connectId = randomUUID()
  const sendId = randomUUID()
  const historyId = randomUUID()
  const requestId = randomUUID()
  const idempotencyKey = `pinax_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const sessionKey = `agent:${AGENT_ID}:pinax:${requestId}`

  return new Promise((resolve, reject) => {
    let settled = false
    let runId = ''
    let waitingHistory = false

    const ws = new WebSocket(wsUrl, {
      perMessageDeflate: false,
      headers: { 'User-Agent': 'Pinax-OpenClaw-Client/1.0.0' }
    })

    const done = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
      ws.close(1000, 'done')
    }

    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error instanceof Error ? error : new Error(String(error)))
      ws.close(1008, 'error')
    }

    const timeout = setTimeout(() => {
      fail(new Error(`OpenClaw Gateway 调用超时（${Math.floor(OPENCLAW_TIMEOUT_MS / 1000)}秒）`))
    }, OPENCLAW_TIMEOUT_MS)

    ws.on('message', (data) => {
      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }

      if (message.type === 'event' && message.event === 'connect.challenge') {
        const nonce = message.payload?.nonce
        if (!nonce || typeof nonce !== 'string') {
          fail(new Error('gateway connect challenge missing nonce'))
          return
        }

        const scopes = ['operator.read', 'operator.write']
        ws.send(JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'gateway-client',
              version: '1.0.0',
              platform: 'linux',
              mode: 'backend'
            },
            role: 'operator',
            scopes,
            caps: [],
            commands: [],
            permissions: {},
            auth: { token },
            device: buildSignedDevice(nonce, token, scopes)
          }
        }))
        return
      }

      if (message.type === 'res' && message.id === connectId) {
        if (!message.ok || message.payload?.type !== 'hello-ok') {
          fail(new Error(`connect failed: ${message.error?.message || message.error || 'unknown error'}`))
          return
        }

        ws.send(JSON.stringify({
          type: 'req',
          id: sendId,
          method: 'chat.send',
          params: {
            sessionKey,
            message: userMessage,
            idempotencyKey,
            timeoutMs: OPENCLAW_TIMEOUT_MS
          }
        }))
        return
      }

      if (message.type === 'res' && message.id === sendId) {
        if (!message.ok) {
          fail(new Error(`chat.send failed: ${message.error?.message || message.error || 'unknown error'}`))
          return
        }
        runId = typeof message.payload?.runId === 'string' ? message.payload.runId : runId
        return
      }

      if (message.type === 'res' && message.id === historyId) {
        if (!message.ok) {
          fail(new Error(`chat.history failed: ${message.error?.message || message.error || 'unknown error'}`))
          return
        }

        const content = extractTextFromHistoryMessages(message.payload?.messages)
        if (!content) {
          fail(new Error('OpenClaw 返回空内容'))
          return
        }
        done(content)
        return
      }

      if (message.type === 'event' && message.event === 'chat') {
        const payload = message.payload || {}
        if (runId && payload.runId && payload.runId !== runId) return

        if (payload.state === 'error') {
          fail(new Error(`chat error: ${payload.errorMessage || 'unknown error'}`))
          return
        }

        if (payload.state !== 'final') return

        const content = extractTextFromChatMessage(payload.message)
        if (!content) {
          if (!waitingHistory) {
            waitingHistory = true
            ws.send(JSON.stringify({
              type: 'req',
              id: historyId,
              method: 'chat.history',
              params: {
                sessionKey,
                limit: 20
              }
            }))
          }
          return
        }

        done(content)
      }
    })

    ws.on('error', (error) => {
      fail(new Error(`WebSocket error: ${error.message}`))
    })

    ws.on('close', (code, reason) => {
      if (!settled && code !== 1000) {
        fail(new Error(`WebSocket closed: ${reason?.toString() || code}`))
      }
    })
  })
}
