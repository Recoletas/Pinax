import { performance } from 'node:perf_hooks'
import fixtures from './fixtures/writing-notebook-r0-samples.js'
import {
  createWritingDocument,
  getChapterMarkdown,
  getChapterPlainText,
  getWritingBlockAtPosition,
  getWritingDocumentMarkdown,
  getWritingDocumentPlainText,
  mergeWritingDocumentFromMarkdown,
  markWritingNodeChanged,
  validateWritingDocument
} from '../src/services/writing/writingDocumentSchema.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const results = []
for (const fixture of fixtures) {
  const startedAt = performance.now()
  const document = createWritingDocument(fixture.markdown)
  const elapsedMs = performance.now() - startedAt
  const validation = validateWritingDocument(document)
  const roundTrip = getWritingDocumentMarkdown(document)
  const ids = document.content.map((node) => node.attrs.blockId)

  assert(validation.valid, `${fixture.id}: ${validation.errors.join(', ')}`)
  assert(new Set(ids).size === ids.length, `${fixture.id}: duplicate block IDs`)
  assert(roundTrip === fixture.markdown, `${fixture.id}: markdown round-trip changed source`)
  if (fixture.markdown) assert(getWritingDocumentPlainText(document).length > 0, `${fixture.id}: plain text is empty`)

  if (fixture.id === 'short') {
    const firstNode = document.content[0]
    const changedNode = markWritingNodeChanged(firstNode, [{ type: 'text', text: '改写后的场景' }])
    const changedDocument = { ...document, content: [changedNode, ...document.content.slice(1)] }
    const changedMarkdown = getWritingDocumentMarkdown(changedDocument)
    assert(changedMarkdown.startsWith('# 改写后的场景\n'), 'changed node did not render as Markdown')
    assert(changedNode.attrs.revision === 1, 'changed node revision did not increment')
    assert(changedMarkdown.includes('“你也是今天到的吗？”她问。'), 'unchanged neighbor was lost')
  }

  results.push({
    id: fixture.id,
    label: fixture.label,
    chars: fixture.markdown.length,
    blocks: document.content.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    roundTrip: true
  })
}

const longFixture = results.find((item) => item.id === 'hundred-k')
assert(longFixture && longFixture.chars >= 100000, '100k fixture was not measured')

const structuredChapter = {
  content: '过时的 Markdown 投影',
  editorDocument: createWritingDocument('# 结构化章节\n\n正文来自编辑文档。')
}
assert(getChapterMarkdown(structuredChapter) === '# 结构化章节\n\n正文来自编辑文档。', 'structured chapter projection was not preferred')
  assert(getChapterPlainText(structuredChapter).includes('正文来自编辑文档'), 'structured chapter plain text was not readable')
  assert(getChapterMarkdown({ content: '旧章节正文', editorDocument: { schemaVersion: 2 } }) === '旧章节正文', 'legacy chapter fallback failed')
const blockTarget = getWritingBlockAtPosition(structuredChapter.editorDocument, 18)
assert(blockTarget?.blockId === structuredChapter.editorDocument.content[1].attrs.blockId, 'cursor did not resolve to the expected block')
assert(blockTarget?.blockRevision === 0 && blockTarget.end > blockTarget.start, 'block anchor range is invalid')
const reconciled = mergeWritingDocumentFromMarkdown(
  '# 结构化章节\n\n正文已经修改。\n\n新增一段。',
  structuredChapter.editorDocument
)
assert(reconciled.content[0].attrs.blockId === structuredChapter.editorDocument.content[0].attrs.blockId, 'unchanged heading block ID was not preserved')
assert(reconciled.content[1].attrs.blockId === structuredChapter.editorDocument.content[1].attrs.blockId, 'edited block ID was not preserved')
assert(reconciled.content[1].attrs.revision === 1, 'edited block revision did not increment')
assert(reconciled.content[2].attrs.blockId !== reconciled.content[1].attrs.blockId, 'new block reused an existing block ID')

console.log(JSON.stringify({
  phase: 'WNB-1-projection',
  fixtureCount: results.length,
  results,
  gate: {
    schemaValid: true,
    markdownRoundTrip: true,
    uniqueBlockIds: true,
    longChapterMeasured: true,
    chapterProjectionPreferred: true,
    legacyChapterFallback: true,
    stableBlockAnchor: true,
    markdownReconciliation: true
  }
}, null, 2))
