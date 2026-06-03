import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tmpDir = mkdtempSync(join(tmpdir(), 'openclaw-test-'))
vi.stubEnv('OPENCLAW_DEVICE_IDENTITY_PATH', join(tmpDir, 'pinax-device.json'))
vi.stubEnv('OPENCLAW_GATEWAY_TOKEN', 'test-token')

const ws = {
  instances: [],
  last: null,
  onMessage: null,
  onError: null,
  onClose: null
}

class FakeWebSocket {
  constructor(url, options) {
    this.url = url
    this.options = options
    this.sent = []
    this.readyState = 0
    ws.instances.push(this)
    ws.last = this
  }
  send(data) {
    this.sent.push(JSON.parse(data))
  }
  close(code, reason) {
    this.readyState = 3
  }
  on(event, handler) {
    if (event === 'message') ws.onMessage = handler
    if (event === 'error') ws.onError = handler
    if (event === 'close') ws.onClose = handler
  }
}

vi.mock('ws', () => ({ default: FakeWebSocket }))

const { getAdvice } = await import('../../server/services/openclawService.js')

function tick() {
  return new Promise((r) => setImmediate(r))
}

function emit(type, payload, id) {
  const body = { type }
  if (payload !== undefined) body.payload = payload
  if (id !== undefined) body.id = id
  ws.onMessage({ toString: () => JSON.stringify(body) })
}

function emitChallenge(nonce = 'nonce-1') {
  emit('event', { nonce }, undefined)
  // event type uses .event discriminator, not .id — re-emit correctly
  ws.onMessage({
    toString: () => JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce } })
  })
}

function emitResForLastSent(ok, payload) {
  const last = ws.last.sent[ws.last.sent.length - 1]
  ws.onMessage({
    toString: () => JSON.stringify({ type: 'res', id: last.id, ok, payload: payload || {} })
  })
}

function emitChatFinal(text, runId = 'run-1') {
  ws.onMessage({
    toString: () => JSON.stringify({
      type: 'event',
      event: 'chat',
      payload: { state: 'final', runId, message: { content: text } }
    })
  })
}

describe('openclawService', () => {
  beforeEach(() => {
    ws.instances.length = 0
    ws.last = null
    ws.onMessage = null
    ws.onError = null
    ws.onClose = null
  })

  it('connects via ws, signs device, sends chat, returns advice text', async () => {
    const promise = getAdvice(
      { chapter: '第一章', note: '线索' },
      '怎么改',
      { taskType: 'advisor.fix.selection', target: { kind: 'selection', text: '原文' } }
    )

    await tick()
    expect(ws.last).not.toBeNull()
    expect(ws.last.url).toBe('ws://127.0.0.1:18789')

    emitChallenge('nonce-1')
    await tick()

    const connectReq = ws.last.sent.find((m) => m.method === 'connect')
    expect(connectReq).toBeDefined()
    expect(connectReq.params.auth.token).toBe('test-token')
    expect(connectReq.params.device.id).toMatch(/^[0-9a-f]{64}$/)
    expect(connectReq.params.device.signature).toBeTypeOf('string')
    expect(connectReq.params.device.publicKey).toBeTypeOf('string')

    emitResForLastSent(true, { type: 'hello-ok' })
    await tick()

    const chatReq = ws.last.sent.find((m) => m.method === 'chat.send')
    expect(chatReq).toBeDefined()
    expect(chatReq.params.message).toContain('任务类型：advisor.fix.selection')
    expect(chatReq.params.message).toContain('目标文本/范围')
    expect(chatReq.params.message).toContain('"chapter": "第一章"')
    expect(chatReq.params.message).toContain('用户的问题：怎么改')

    emitResForLastSent(true, { runId: 'run-1' })
    await tick()
    emitChatFinal('建议文本')

    const result = await promise
    expect(result).toBe('建议文本')
  })

  it('rejects when no token configured', async () => {
    vi.stubEnv('OPENCLAW_GATEWAY_TOKEN', '')
    await expect(getAdvice({ chapter: 'x' }, 'q')).rejects.toThrow('缺少 OPENCLAW_GATEWAY_TOKEN')
    vi.stubEnv('OPENCLAW_GATEWAY_TOKEN', 'test-token')
  })

  it('rejects blank questions', async () => {
    await expect(getAdvice({ chapter: 'x' }, '   ')).rejects.toThrow('缺少 context 或 question 参数')
  })
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})
