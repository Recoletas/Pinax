// A quoted fragment can omit the words that make an action a promise, a denial
// or hearsay. Recover its enclosing source sentence before interpreting it.
// Qualifiers live in the claim text so every existing ledger/backup/reader path
// preserves them, including consumers that do not understand extraction metadata.
const sentenceBoundary = /[。！？；\n.!?;]/u
const commitment = /答应|承诺|许诺|允诺|打算|计划|准备(?:去|要|在|到|把|将|明)|将要|将会|即将|拟于|拟定|明(?:天|早|晚|日)|下(?:周|个月|星期)|日后|\b(?:promis(?:e[ds]?|ing)|pledged?|plans? to|planned to|intend(?:s|ed)? to|will|going to|tomorrow|next week)\b/iu
const conditional = /如果|假如|假使|倘若|也许|或许|可能|说不定|未必|恐怕|\b(?:if|might|may|perhaps|possibly|would)\b/iu
const reported = /据说|传闻|听说|听闻|声称|谎称|谎话|梦见|梦到|梦里|(?:说|问|回答|喊|道)[：:“「『]|\b(?:reportedly|rumou?red|claimed|heard that|dream(?:ed|t) (?:of|that))\b/iu
const negative = /没有|并未|从未|未曾|不曾|未能|尚未|并非|不是|不会|不能|拒绝|否认|\b(?:not|never|didn't|hasn't|haven't|won't|isn't|wasn't|denied|refused)\b/iu

function compactWithOffsets(value) {
  const source = String(value || '')
  let compact = ''
  const offsets = []
  for (let index = 0; index < source.length; index += 1) {
    if (/\s/u.test(source[index])) continue
    compact += source[index]
    offsets.push(index)
  }
  return { source, compact, offsets }
}

export function recoverExtractionEvidence(quote, sourceText) {
  const { source, compact, offsets } = compactWithOffsets(sourceText)
  const needle = String(quote || '').replace(/\s/gu, '')
  if (!needle) return ''
  const contexts = new Set()
  for (let at = compact.indexOf(needle); at >= 0; at = compact.indexOf(needle, at + 1)) {
    let start = offsets[at]
    let end = offsets[at + needle.length - 1] + 1
    while (start > 0 && !sentenceBoundary.test(source[start - 1])) start -= 1
    while (start < offsets[at] && /[”’」』]/u.test(source[start])) start += 1
    // A quote already ending at punctuation must not swallow the next sentence.
    const lastContent = source.slice(start, end).replace(/[”’」』]+$/u, '').slice(-1)
    if (!sentenceBoundary.test(lastContent)) {
      while (end < source.length && !sentenceBoundary.test(source[end])) end += 1
      if (end < source.length) end += 1
    }
    while (/[”’」』]/u.test(source[end] || '')) end += 1
    contexts.add(source.slice(start, end).trim())
    // The same bare verb in a promise and in its later fulfillment cannot be
    // assigned a source by choosing the first occurrence. Ask for a full quote.
    if (contexts.size > 1) return ''
  }
  return [...contexts][0] || ''
}

export function preserveExtractionSemantics({ predicate, object, quote, polarity }) {
  const claimText = `${predicate} ${object}`
  const qualifiers = []
  // This is a conservative evidence guard, not a general semantic parser. It
  // never invents a completed action or removes the author's exact evidence.
  if (commitment.test(quote) && !commitment.test(claimText)) qualifiers.push('计划或承诺')
  if ((polarity === 'report' || reported.test(quote)) && !reported.test(claimText) && !/说|转述|\bsaid\b/iu.test(predicate)) qualifiers.push('原文转述')
  if ((polarity === 'hedged' || conditional.test(quote)) && !conditional.test(claimText)) qualifiers.push('条件或推测')
  if ((polarity === 'negative' || negative.test(quote)) && !negative.test(claimText)) qualifiers.push('否定')
  // A sentence may contain both a promise and a completed action, or someone
  // else's denial. Do not guess which modifier governs the extracted verb.
  // Retain the original assertion verbatim instead of upgrading the fragment
  // into a fact or adding a possibly incorrect negation to it.
  return qualifiers.length
    ? { predicate: `原文记载（${predicate}）`, object: quote, qualifiers }
    : { predicate, object, qualifiers }
}
