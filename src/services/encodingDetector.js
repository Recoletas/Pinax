/**
 * 来源文件编码识别：从"轮询解码"升级为"多候选解码 + 乱码特征评分"。
 *
 * 背景：中文网文常见 GB18030 / Big5 / UTF-16 文件，`file.text()` 固定按 UTF-8
 * 解码会产生乱码；而 GB18030 与 Big5 几乎能"成功"解码任何字节流，必须靠
 * 内容评分区分。这里只依赖原生 TextDecoder，不引入新依赖。
 */

export const SOURCE_ENCODING_CANDIDATES = Object.freeze([
  'utf-8',
  'gb18030',
  'big5',
  'utf-16le',
  'utf-16be'
])

export const ENCODING_CONFIDENCES = Object.freeze(['high', 'medium', 'low'])

// 高频汉字样本：覆盖现代汉语与网文最高频字，用于区分"正确解码"
// （大量命中高频字）与 GB18030/Big5 互相错解（产出大量生僻字）。
const COMMON_HANZI = Object.freeze((
  '的一是不了人我在有他这中大来上国和地也子时道出要于就得可你年生自会那后能对着事其里所去行过' +
  '家十用发天如然作方成者多日都三小军二无同么经法当起与好看学进种将还分此心前面又定见只主没公从' +
  '现说文开明力意长动行间理正外因些它已月两点想问但关很最重手实门回并物身由或气业被本所比等体' +
  '合新她活果接吗部感见需眼美听白走内黑王化争利海让放始强知难系电性情名老声边用位下把入给次话' +
  '水便拉住命觉空工几神己经首五机六古立七九八相与则带程加条回山口路市往何度样变斗快迟疑转刚备' +
  '真受再常满步声光界找持斯世师办层消近使散广期值计写共亲识单传风冷笑连城河湖港岛岸船灯雨雪云' +
  '火金木土石龙凤鸟兽刀剑弓马旗令官兵民帝王朝堂宫院府寺塔桥街巷村镇州县江湖血魂影梦星夜晨昏晓' +
  '春夏秋冬东南西北前后左右上下内外高低远近深浅大小多少长短轻重快慢生死胜负攻守进出开关始终彼'
).split(''))

const COMMON_HANZI_SET = new Set(COMMON_HANZI)

const HAN_RUN = /\p{Script=Han}/gu
const CJK_PUNCT = /[，。！？；：、“”‘’《》〈〉…—·「」『』（）【】〔〕]/g
const WESTERN_PUNCT = /[,.!?;:"'`()[\]{}<>]/g
// 乱码信号：U+FFFD、C1 控制区（0x80-0x9F）、拉丁补充/扩展区（U+00A0-U+024F）。
// GB18030 字节对（如 B5 DA）常构成"合法"UTF-8 双字节序列并解码成拉丁杂凑，
// 因此拉丁扩展字符与替换字符一样都是错解的强信号。
const MOJIBAKE_CHARS = /[\u0080-\u024f\u{fffd}]/gu
const ALLOWED_CONTROL = /[\t\n\r\f\v]/u

function text(value) {
  return String(value ?? '').trim()
}

function hasTextDecoder() {
  return typeof TextDecoder === 'function'
}

export function detectByteOrderMark(bytes) {
  if (!bytes || bytes.length < 2) return null
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', name: 'utf-8', bomLength: 3 }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', name: 'utf-16le', bomLength: 2 }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', name: 'utf-16be', bomLength: 2 }
  }
  return null
}

function decodeCandidate(bytes, encoding) {
  try {
    const decoder = new TextDecoder(encoding, { fatal: true })
    return { encoding, ok: true, strict: true, text: decoder.decode(bytes) }
  } catch {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false })
      return { encoding, ok: false, strict: false, text: decoder.decode(bytes) }
    } catch {
      return { encoding, ok: false, strict: false, text: '' }
    }
  }
}

function sampleOf(decoded, limit = 24000) {
  const value = String(decoded || '')
  if (value.length <= limit) return value
  // 头/中/尾三段采样，避免超长文本只看开头。
  const head = value.slice(0, Math.floor(limit * 0.5))
  const middleStart = Math.max(0, Math.floor(value.length / 2) - Math.floor(limit * 0.25))
  const middle = value.slice(middleStart, middleStart + Math.floor(limit * 0.25))
  const tail = value.slice(Math.max(0, value.length - Math.floor(limit * 0.25)))
  return `${head}\n${middle}\n${tail}`
}

/**
 * 乱码特征评分（0-100）：
 * - 常见汉字命中率（权重最大）：正确解码的中文文本高频字占比高。
 * - 替换字符率：U+FFFD 与 C1 控制区（0x80-0x9F）是错解的强信号。
 * - 中文标点 vs 西文标点：GB18030 错解成 Big5 时标点形态会异常。
 */
export function scoreDecodedText(decoded) {
  const sample = sampleOf(decoded)
  const total = sample.length
  if (!total) {
    return { score: 0, replacementRate: 1, commonHanziHitRate: 0, cjkPunctRatio: 0.5, hanRatio: 0 }
  }
  let hanCount = 0
  let commonHanCount = 0
  for (const match of sample.matchAll(HAN_RUN)) {
    for (const character of match[0]) {
      hanCount += 1
      if (COMMON_HANZI_SET.has(character)) commonHanCount += 1
    }
  }
  const cjkPunctCount = sample.match(CJK_PUNCT)?.length || 0
  const westernPunctCount = sample.match(WESTERN_PUNCT)?.length || 0
  const punctTotal = cjkPunctCount + westernPunctCount
  const garbageMatches = sample.match(MOJIBAKE_CHARS)?.length || 0
  let controlNoise = 0
  for (const character of sample) {
    const code = character.codePointAt(0)
    if (code < 32 && !ALLOWED_CONTROL.test(character)) controlNoise += 1
  }

  const replacementRate = (garbageMatches + controlNoise) / total
  const commonHanziHitRate = hanCount ? commonHanCount / hanCount : 0
  const cjkPunctRatio = punctTotal ? cjkPunctCount / punctTotal : 0.5
  const hanRatio = hanCount / total

  const hanScore = commonHanziHitRate * 45
  const densityScore = Math.min(1, hanRatio * 2) * 20
  const punctScore = punctTotal ? cjkPunctRatio * 15 : 7.5
  const cleanScore = (1 - Math.min(1, replacementRate * 12)) * 20

  return {
    score: Number((hanScore + densityScore + punctScore + cleanScore).toFixed(2)),
    replacementRate: Number(replacementRate.toFixed(5)),
    commonHanziHitRate: Number(commonHanziHitRate.toFixed(4)),
    cjkPunctRatio: Number(cjkPunctRatio.toFixed(4)),
    hanRatio: Number(hanRatio.toFixed(4))
  }
}

function utf16NullByteHint(bytes) {
  if (!bytes || bytes.length < 8) return 0
  const sampleLength = Math.min(bytes.length, 4096)
  let evenZeros = 0
  let oddZeros = 0
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) evenZeros += 1
      else oddZeros += 1
    }
  }
  return Math.max(evenZeros, oddZeros) / sampleLength
}

function confidenceFor(ranked) {
  const winner = ranked[0]
  const runnerUp = ranked[1]
  if (!winner) return 'low'
  if (winner.replacementRate > 0.02) return 'low'
  // 严格 UTF-8 解码成功且无乱码信号：若文本几乎不含汉字，说明本来就是
  // 西文/ASCII 文本（评分天然偏低），直接判高置信。
  if (winner.strict
    && winner.replacementRate <= 0.001
    && (winner.hanRatio < 0.05 || winner.score >= 55)) return 'high'
  if (winner.score >= 55 && (!runnerUp || winner.score - runnerUp.score >= 10)) return 'high'
  if (winner.score >= 38) return 'medium'
  return 'low'
}

/**
 * 识别字节流的编码并给出解释结果。
 *
 * 返回：
 * {
 *   encoding, confidence,
 *   text,                    // 按识别编码解码后的文本（低置信度也返回文本 + warnings）
 *   candidates: [{ encoding, score, strict, replacementRate, ... }],
 *   warnings: []
 * }
 *
 * 约束：低置信度不拒绝——返回 warnings 让用户决策（如"重新指定编码"）。
 */
export function detectEncodingFromBytes(bytes, options = {}) {
  const view = ArrayBuffer.isView(bytes)
    ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : new Uint8Array(bytes || [])
  const warnings = []
  if (!hasTextDecoder()) {
    return { encoding: 'utf-8', confidence: 'low', text: '', candidates: [], warnings: ['当前环境不支持 TextDecoder，无法识别编码。'] }
  }
  if (!view.length) {
    return { encoding: 'utf-8', confidence: 'low', text: '', candidates: [], warnings: ['文件为空，无法识别编码。'] }
  }

  const bom = detectByteOrderMark(view)
  if (bom) {
    const decoded = decodeCandidate(view.subarray(bom.bomLength), bom.encoding)
    return {
      encoding: bom.encoding,
      confidence: 'high',
      text: options.includeText === false ? '' : decoded.text,
      candidates: [{
        encoding: bom.encoding,
        score: 100,
        strict: decoded.strict,
        replacementRate: scoreDecodedText(decoded.text).replacementRate
      }],
      warnings: []
    }
  }
  const candidateEncodings = SOURCE_ENCODING_CANDIDATES.filter((encoding) => {
    // 无 BOM 时仅在有零字节线索时尝试 UTF-16，避免 ASCII 文本被误配成假汉字
    // （纯汉字的无 BOM UTF-16 会落入低置信度 + warnings，由用户决策）。
    if (encoding === 'utf-16le' || encoding === 'utf-16be') return utf16NullByteHint(view) >= 0.15
    return true
  })

  const scored = candidateEncodings.map((encoding) => {
    const decoded = decodeCandidate(view, encoding)
    const metrics = scoreDecodedText(decoded.text)
    return {
      encoding,
      strict: decoded.strict,
      score: metrics.score,
      ...metrics,
      text: decoded.text
    }
  }).sort((left, right) => right.score - left.score
    // 分数并列时保持声明优先级：utf-8 永远优先于 gb18030/big5（纯西文文本
    // 三者得分相同，不能按字典序把 big5 排到前面）。
    || SOURCE_ENCODING_CANDIDATES.indexOf(left.encoding) - SOURCE_ENCODING_CANDIDATES.indexOf(right.encoding))

  const winner = scored[0]
  if (!winner) {
    return { encoding: 'utf-8', confidence: 'low', text: '', candidates: [], warnings: ['无法解码该文件内容。'] }
  }

  const confidence = confidenceFor(scored)
  if (confidence !== 'high') {
    warnings.push(confidence === 'medium'
      ? `编码识别为 ${winner.encoding}，但置信度中等，请抽查正文是否乱码。`
      : `编码识别置信度低（候选：${scored.map((candidate) => `${candidate.encoding}(${candidate.score})`).join('、')}），请确认编码后重试。`)
  }
  if (winner.replacementRate > 0.02) {
    warnings.push(`解码后存在 ${(winner.replacementRate * 100).toFixed(1)}% 无法映射字符，原文可能损坏或编码不受支持。`)
  }

  return {
    encoding: winner.encoding,
    confidence,
    text: options.includeText === false ? '' : winner.text,
    candidates: scored.map(({ text: _text, ...rest }) => rest),
    warnings
  }
}

/**
 * 归一化编码检测结果供 artifact / 报告存储（不含全文，避免重复保存大文本）。
 */
export function normalizeEncodingDetection(detection) {
  const source = detection && typeof detection === 'object' ? detection : {}
  const confidence = ENCODING_CONFIDENCES.includes(source.confidence) ? source.confidence : 'low'
  return {
    detected: text(source.encoding || source.detected) || 'utf-8',
    confidence,
    candidates: (Array.isArray(source.candidates) ? source.candidates : [])
      .map((candidate) => ({
        encoding: text(candidate?.encoding),
        score: Number(candidate?.score) || 0,
        strict: Boolean(candidate?.strict),
        replacementRate: Number(candidate?.replacementRate) || 0
      }))
      .filter((candidate) => candidate.encoding)
      .slice(0, 8),
    warnings: (Array.isArray(source.warnings) ? source.warnings : []).map(text).filter(Boolean).slice(0, 16)
  }
}
