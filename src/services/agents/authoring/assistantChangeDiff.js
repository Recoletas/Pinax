// Line-oriented patience diff. Unique common lines anchor separate edits so
// unchanged paragraphs aren't reported as deleted and recreated.
const lines = text => {
  const value = String(text || '').replace(/\r\n/g, '\n')
  return value ? value.replace(/\n$/, '').split('\n') : []
}
export const assistantChangeGroup = change => change.kind === 'chapter' ? '正文' : change.kind === 'outline' ? '大纲' : change.entryType === 'character' ? '角色' : '设定'
export function assistantChangeDiff(change) {
  const before = lines(change.operation === 'insert' ? '' : change.before)
  const after = lines(change.after)
  const output = []
  function walk(a0, a1, b0, b1) {
    while (a0 < a1 && b0 < b1 && before[a0] === after[b0]) { output.push({ type: 'context', text: before[a0++] }); b0++ }
    let tail = 0
    while (a0 < a1 - tail && b0 < b1 - tail && before[a1 - tail - 1] === after[b1 - tail - 1]) tail++
    const ae = a1 - tail, be = b1 - tail
    const positions = (list, from, to) => {
      const map = new Map()
      for (let i = from; i < to; i++) map.set(list[i], map.has(list[i]) ? -1 : i)
      return map
    }
    const left = positions(before, a0, ae), right = positions(after, b0, be)
    const pairs = [...left].filter(([text, index]) => index >= 0 && right.has(text) && right.get(text) >= 0).map(([text, index]) => [index, right.get(text)])
    const tails = [], previous = []
    for (let i = 0; i < pairs.length; i++) {
      let low = 0, high = tails.length
      while (low < high) { const middle = (low + high) >> 1; if (pairs[tails[middle]][1] < pairs[i][1]) low = middle + 1; else high = middle }
      previous[i] = low ? tails[low - 1] : -1; tails[low] = i
    }
    const anchors = []
    for (let i = tails.at(-1); i != null && i >= 0; i = previous[i]) anchors.push(pairs[i])
    anchors.reverse()
    if (anchors.length) {
      for (const [ai, bi] of anchors) { walk(a0, ai, b0, bi); output.push({ type: 'context', text: before[ai] }); a0 = ai + 1; b0 = bi + 1 }
      walk(a0, ae, b0, be)
    } else {
      for (let i = a0; i < ae; i++) output.push({ type: 'remove', text: before[i] })
      for (let i = b0; i < be; i++) output.push({ type: 'add', text: after[i] })
    }
    for (let i = ae; i < a1; i++) output.push({ type: 'context', text: before[i] })
  }
  walk(0, before.length, 0, after.length)
  if (change.details) {
    const metadata = assistantChangeDiff({ before: change.detailsBaseline || '', after: JSON.stringify(change.details, null, 2) })
    output.push({ type: 'context', text: '结构属性' }, ...metadata.lines)
  }
  let oldLine = 0, newLine = 0
  return {
    added: output.filter(line => line.type === 'add').length,
    removed: output.filter(line => line.type === 'remove').length,
    lines: output.map(line => ({ ...line, oldLine: line.type === 'add' ? '' : ++oldLine, newLine: line.type === 'remove' ? '' : ++newLine }))
  }
}
