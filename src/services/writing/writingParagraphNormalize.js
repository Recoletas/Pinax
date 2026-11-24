// 整理段落：把 TXT 式“每行一段、行首全角空格缩进”的段落拆成真正的段落。
// 只处理纯文本段落（不含行内节点）；带格式的段落原样保留，避免破坏标记。
// 首行缩进由排版设置负责，因此去掉行首的全角空格/制表符。
// 若首段与章节标题相同，则视为导入时重复的标题行并移除。

const LEADING_INDENT = /^[\u3000\t ]+/u
const TRAILING_SPACE = /[\u3000\t ]+$/u

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

function compact(text) {
  return String(text || '').replace(/[\s\u3000]+/gu, '')
}

function isPlainTextBlock(node) {
  if (!node?.isTextblock || node.type.name !== 'paragraph') return false
  let plain = true
  node.content.forEach((child) => { if (!child.isText) plain = false })
  return plain
}

// 把一个纯文本段落按换行拆成若干 [from, to) 片段，去掉行首缩进和行尾空白。
function paragraphPieces(node) {
  const text = node.textContent
  const pieces = []
  let start = 0
  for (const line of text.split('\n')) {
    const end = start + line.length
    const lead = line.match(LEADING_INDENT)?.[0].length || 0
    const trail = line.slice(lead).match(TRAILING_SPACE)?.[0].length || 0
    if (end - trail > start + lead) pieces.push([start + lead, end - trail])
    start = end + 1
  }
  return pieces
}

/**
 * @param {import('@tiptap/pm/state').EditorState} state
 * @param {{ title?: string, idFactory?: (prefix: string) => string }} options
 * @returns {{ tr: import('@tiptap/pm/state').Transaction | null, splitParagraphs: number, strippedIndents: number, removedTitle: boolean }}
 */
export function normalizeParagraphsTransaction(state, { title = '', idFactory = makeId } = {}) {
  const tr = state.tr
  const result = { tr: null, splitParagraphs: 0, strippedIndents: 0, removedTitle: false }
  const titleKey = compact(title)
  let firstParagraphSeen = false
  const replacements = []

  state.doc.forEach((unit, unitPos) => {
    if (unit.type.name !== 'writingUnit') return
    const children = []
    let changed = false
    unit.content.forEach((child) => {
      if (!isPlainTextBlock(child)) {
        if (child.isTextblock) firstParagraphSeen = true
        children.push(child)
        return
      }
      const pieces = paragraphPieces(child)
      if (!firstParagraphSeen && pieces.length) {
        firstParagraphSeen = true
        const [from, to] = pieces[0]
        if (titleKey && compact(child.textContent.slice(from, to)) === titleKey && (pieces.length > 1 || state.doc.textContent.length > child.textContent.length)) {
          pieces.shift()
          result.removedTitle = true
          changed = true
        }
      }
      const original = child.textContent
      const untouched = pieces.length === 1 && pieces[0][0] === 0 && pieces[0][1] === original.length
      if (untouched) { children.push(child); return }
      if (!pieces.length) {
        // 只含空白（或仅是被移除的标题行）的段落丢弃；真正的空段落保留。
        if (original.length) { changed = true; return }
        children.push(child)
        return
      }
      changed = true
      if (pieces.length > 1) result.splitParagraphs += 1
      else result.strippedIndents += 1
      pieces.forEach(([from, to], index) => {
        const attrs = index === 0
          ? { ...child.attrs, nodeRevision: Number(child.attrs?.nodeRevision || 0) + 1 }
          : { ...child.attrs, nodeId: idFactory('node'), nodeRevision: 0 }
        children.push(child.type.create(attrs, child.content.cut(from, to), child.marks))
      })
    })
    if (!changed) return
    if (!children.length) children.push(state.schema.nodes.paragraph.create())
    const attrs = { ...unit.attrs, unitRevision: Number(unit.attrs?.unitRevision || 0) + 1 }
    replacements.push({ pos: unitPos, size: unit.nodeSize, node: unit.type.create(attrs, children, unit.marks) })
  })

  if (!replacements.length) return result
  for (const { pos, size, node } of replacements.reverse()) tr.replaceWith(pos, pos + size, node)
  result.tr = tr
  return result
}
