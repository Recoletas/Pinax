/**
 * 纯 JS SHA-256（同步）+ 来源内容哈希。
 *
 * 为什么不用 crypto.subtle：hashSourceText 的所有调用点都是同步纯函数
 * （buildSourceChunks / normalizeSourceArtifact 在循环内调用），异步化会
 * 波及整条解析链。这里按 64 字节块流式消费 UTF-8 编码，不构造全文字节
 * 副本，20MB 文本也不会产生额外大数组。
 *
 * FNV-1a（hashSourceText）保留用于旧数据兼容；永久内容身份升级为
 * SHA-256（32-bit FNV 碰撞概率不可忽略）。
 */

const K = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

const W = new Int32Array(64)

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n))
}

function utf8LengthOfCode(code) {
  if (code <= 0x7f) return 1
  if (code <= 0x7ff) return 2
  if (code <= 0xffff) return 3
  if (code <= 0x10ffff) return 4
  return -1
}

function writeUtf8(scratch, code) {
  if (code <= 0x7f) {
    scratch[0] = code
    return 1
  }
  if (code <= 0x7ff) {
    scratch[0] = 0xc0 | (code >> 6)
    scratch[1] = 0x80 | (code & 0x3f)
    return 2
  }
  if (code <= 0xffff) {
    scratch[0] = 0xe0 | (code >> 12)
    scratch[1] = 0x80 | ((code >> 6) & 0x3f)
    scratch[2] = 0x80 | (code & 0x3f)
    return 3
  }
  scratch[0] = 0xf0 | (code >> 18)
  scratch[1] = 0x80 | ((code >> 12) & 0x3f)
  scratch[2] = 0x80 | ((code >> 6) & 0x3f)
  scratch[3] = 0x80 | (code & 0x3f)
  return 4
}

export function sha256HexOfText(value) {
  const input = String(value ?? '')
  const block = new Uint8Array(64)
  const scratch = new Uint8Array(4)
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  let msgBytes = 0
  let cursor = 0

  const compress = () => {
    for (let t = 16; t < 64; t += 1) {
      const w15 = W[t - 15]
      const w2 = W[t - 2]
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + h) | 0
  }

  const absorbBlock = () => {
    for (let index = 0; index < 16; index += 1) {
      W[index] = ((block[index * 4] << 24) | (block[index * 4 + 1] << 16) | (block[index * 4 + 2] << 8) | block[index * 4 + 3]) | 0
    }
    compress()
  }

  // 按码点迭代，代理对只编码一次；逐字节进块，跨块字符自然衔接。
  for (const character of input) {
    const code = character.codePointAt(0)
    const length = utf8LengthOfCode(code)
    if (length < 0) continue // 无效码点跳过，不进入哈希
    const encoded = writeUtf8(scratch, code)
    msgBytes += encoded
    for (let index = 0; index < encoded; index += 1) {
      block[cursor] = scratch[index]
      cursor += 1
      if (cursor === 64) {
        absorbBlock()
        cursor = 0
      }
    }
  }

  // 填充：0x80、零，最后 8 字节大端比特长度。
  block[cursor] = 0x80
  cursor += 1
  if (cursor > 56) {
    block.fill(0, cursor, 64)
    absorbBlock()
    cursor = 0
  }
  block.fill(0, cursor, 56)
  const bitHigh = Math.floor(msgBytes / 0x20000000)
  const bitLow = (msgBytes % 0x20000000) << 3
  block[56] = (bitHigh >>> 24) & 0xff
  block[57] = (bitHigh >>> 16) & 0xff
  block[58] = (bitHigh >>> 8) & 0xff
  block[59] = bitHigh & 0xff
  block[60] = (bitLow >>> 24) & 0xff
  block[61] = (bitLow >>> 16) & 0xff
  block[62] = (bitLow >>> 8) & 0xff
  block[63] = bitLow & 0xff
  absorbBlock()

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('')
}
