import { lookup } from 'node:dns/promises'
import https from 'node:https'
import net from 'node:net'

export const MAX_VIDEO_DOWNLOAD_BYTES = 64 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 60000

function failure(code, message, status = 502) {
  return Object.assign(new Error(message), { code, status })
}

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  // Public global unicast only. This also excludes IPv4-mapped/compatible,
  // link-local, unique-local, multicast, NAT64 and unspecified addresses.
  return net.isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^(?:2001:(?:0:|db8:)|2002:)/i.test(address)
}

export async function resolveVideoDownloadTarget(value, { lookupImpl = lookup, signal } = {}) {
  let url
  try { url = new URL(value) } catch { throw failure('ERR_VIDEO_URL_BLOCKED', '视频原件地址无效', 400) }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      url.hostname === 'localhost' || url.hostname.endsWith('.local') || net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw failure('ERR_VIDEO_URL_BLOCKED', '视频原件地址不允许下载', 400)
  }
  signal?.throwIfAborted()
  let onAbort
  const addresses = await Promise.race([
    lookupImpl(url.hostname, { all: true, verbatim: true }),
    new Promise((_resolve, reject) => {
      onAbort = () => reject(signal.reason)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  ]).finally(() => signal?.removeEventListener('abort', onAbort))
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw failure('ERR_VIDEO_URL_BLOCKED', '视频原件地址指向受限网络', 400)
  }
  return { url, addresses }
}

function videoMime(buffer) {
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4'
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm'
  return ''
}

export async function downloadVideoOutput(value, options = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(failure('ERR_VIDEO_DOWNLOAD_TIMEOUT', '视频原件下载超时，请重试', 504)), DOWNLOAD_TIMEOUT_MS)
  timeout.unref?.()
  try {
    let next = value
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      controller.signal.throwIfAborted()
      const { url, addresses } = await resolveVideoDownloadTarget(next, { ...options, signal: controller.signal })
      controller.signal.throwIfAborted()
      const response = await new Promise((resolve, reject) => {
        // Pin the validated addresses to the actual TLS connection. Merely
        // checking DNS before fetch would leave a DNS-rebinding gap.
        const request = (options.requestImpl || https.get)(url, {
          signal: controller.signal,
          headers: { Accept: 'video/mp4, video/webm, application/octet-stream' },
          lookup: (_hostname, lookupOptions, callback) => lookupOptions.all
            ? callback(null, addresses)
            : callback(null, addresses[0].address, addresses[0].family)
        }, resolve)
        request.once('error', reject)
      })
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy()
        if (redirects === 3 || !response.headers.location) throw failure('ERR_VIDEO_REDIRECT', '视频原件跳转次数过多')
        next = new URL(response.headers.location, url).href
        continue
      }
      if (response.statusCode !== 200) {
        response.destroy()
        throw failure('ERR_VIDEO_DOWNLOAD_FAILED', '视频原件暂时无法下载，链接可能已过期')
      }
      const declaredSize = Number(response.headers['content-length'])
      if (declaredSize > MAX_VIDEO_DOWNLOAD_BYTES) {
        response.destroy()
        throw failure('ERR_VIDEO_TOO_LARGE', '视频超过 64 MB，请通过原链接下载', 413)
      }
      const chunks = []
      let size = 0
      for await (const chunk of response) {
        controller.signal.throwIfAborted()
        size += chunk.length
        if (size > MAX_VIDEO_DOWNLOAD_BYTES) {
          response.destroy()
          throw failure('ERR_VIDEO_TOO_LARGE', '视频超过 64 MB，请通过原链接下载', 413)
        }
        chunks.push(chunk)
      }
      const binary = Buffer.concat(chunks, size)
      const mimeType = videoMime(binary)
      if (!mimeType) throw failure('ERR_VIDEO_INVALID_BINARY', '渠道返回的文件不是可保存的视频')
      return { binary, mimeType }
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason || error
    if (error.code?.startsWith('ERR_VIDEO_')) throw error
    throw failure('ERR_VIDEO_DOWNLOAD_FAILED', '视频原件下载失败，请稍后重试')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}
