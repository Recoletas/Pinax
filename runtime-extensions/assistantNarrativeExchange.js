import { randomUUID } from 'node:crypto'

// The browser owns the editor's frozen narrative context. Await its result as a
// regular pi tool call, without ending the assistant turn or writing the document.
export function createAssistantNarrativeExchange(bookId, emit) {
  const pending = new Map()
  return {
    request(callId, request, signal) {
      if (signal?.aborted) return Promise.reject(signal.reason || new Error('请求已停止。'))
      const nonce = randomUUID()
      return new Promise((resolve, reject) => {
        const finish = (error, result) => {
          pending.delete(nonce)
          signal?.removeEventListener('abort', abort)
          if (error) reject(error); else resolve(result)
        }
        const abort = () => finish(signal.reason || new Error('请求已停止。'))
        pending.set(nonce, { callId, finish })
        signal?.addEventListener('abort', abort, { once: true })
        emit(`event: narrative.request\ndata: ${JSON.stringify({ bookId, callId, nonce, request })}\n\n`)
      })
    },
    accept(input) {
      const owner = pending.get(input?.nonce)
      if (!owner || input.bookId !== bookId || input.callId !== owner.callId) return { ok: false, error: 'generation-request-not-active' }
      if (input.error) owner.finish(new Error(String(input.error)))
      else if (typeof input.text === 'string' && input.text.trim()) owner.finish(null, { text: input.text })
      else return { ok: false, error: 'invalid-generation-result' }
      return { ok: true }
    }
  }
}
