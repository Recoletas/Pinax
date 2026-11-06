export * from '@pinax/core/experience/roleplay/third-party/storyforgeDice'

/** 生产用 uint32 源：crypto.getRandomValues（浏览器与 Node ≥19 都可用）。 */
export function createCryptoUint32Source() {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw Object.assign(new Error('[ttrpg-dice] 当前环境没有可用的 crypto.getRandomValues'), {
      code: 'ROLEPLAY_DICE_NO_RNG'
    })
  }
  const buffer = new Uint32Array(8)
  let cursor = 8
  return function nextUint32() {
    if (cursor >= buffer.length) {
      cryptoObj.getRandomValues(buffer)
      cursor = 0
    }
    return buffer[cursor++]
  }
}
