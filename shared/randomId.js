import { v4 as uuidV4 } from 'uuid'

// randomUUID is restricted to secure contexts; getRandomValues also works on
// ordinary HTTP. Keep UUID formatting in the established uuid implementation.
export function randomUUID(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID()
  if (typeof cryptoImpl?.getRandomValues !== 'function') {
    throw new Error('Secure random number generation is unavailable')
  }
  return uuidV4({ random: cryptoImpl.getRandomValues(new Uint8Array(16)) })
}
