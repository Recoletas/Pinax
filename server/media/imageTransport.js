import { setTimeout as delay } from 'node:timers/promises'

// A failed POST may already have generated an image. Only failures that prove
// DNS/TCP connection establishment failed are safe to retry automatically.
function transportCauses(error, depth = 0) {
  if (!error || depth > 8) return [{ code: '', syscall: '' }]
  if (Array.isArray(error.errors) && error.errors.length) return error.errors.flatMap(item => transportCauses(item, depth + 1))
  if (error.cause) return transportCauses(error.cause, depth + 1)
  return [{ code: String(error.code || ''), syscall: String(error.syscall || '') }]
}
function beforeConnection(cause) {
  return ['ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(cause.code)
    || (cause.syscall === 'connect' && ['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH'].includes(cause.code))
}
export function describeImageTransportError(error) {
  const causes = transportCauses(error)
  const codes = [...new Set(causes.map(cause => cause.code).filter(Boolean))]
  const knownFailure = causes.length > 0 && causes.every(beforeConnection)
  let message = '图片服务连接中断，未收到完整结果'
  if (knownFailure) message = codes.some(code => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))
    ? '无法解析图片服务地址，本次未发出生成请求，请稍后重试'
    : '未能连接图片服务，本次未发出生成请求，请重试'
  else if (codes.includes('UND_ERR_HEADERS_TIMEOUT')) message = '等待图片服务响应超时，尚不能确认生成结果'
  else if (codes.includes('UND_ERR_BODY_TIMEOUT')) message = '图片结果传输超时，尚未收到完整图片'
  else if (codes.includes('ERR_IMAGE_RESPONSE_INVALID')) message = '图片服务返回的内容不完整，未能读取结果'
  else if (codes.some(code => ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))) message = '图片服务证书校验失败，请检查服务地址和网络代理'
  return { message, codes, generationOutcome: knownFailure ? 'known-failed' : 'outcome-unknown', retryBeforeSend: knownFailure }
}

export async function fetchImageWithConnectRetry(fetchImpl, url, init, { onRetry } = {}) {
  try {
    return await fetchImpl(url, init)
  } catch (error) {
    const failure = describeImageTransportError(error)
    if (init.signal?.aborted || !failure.retryBeforeSend) throw error
    onRetry?.(failure)
    await delay(500, undefined, { signal: init.signal })
    // One retry only. Response parsing and post-send failures never enter here.
    return fetchImpl(url, init)
  }
}
