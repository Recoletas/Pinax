// 一次 AI 正文插入 = 一个可撤销的文档事务。
// 回执绑定修订：只有文档仍处于 afterRevision/afterText 时才允许请求级撤销。
// 修订指纹 = 长度 + djb2 哈希，同长度修改也会产生不同 revision。
export function fingerprintDocument(text) {
  const value = String(text ?? '')
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = (((hash << 5) + hash) + value.charCodeAt(index)) >>> 0
  }
  return `${value.length.toString(36)}-${hash.toString(36)}`
}

export function buildDocumentRevision(prefix, text) {
  return `${String(prefix || 'doc')}:${fingerprintDocument(text)}`
}

export function applyAuthoringText(document, patch) {
  if (patch.from < 0 || patch.to < patch.from || patch.to > document.text.length) throw new Error('invalid-text-range')
  const nextText = document.text.slice(0, patch.from) + patch.text + document.text.slice(patch.to)
  const nextRevision = `${document.revision}:${patch.requestId}`
  return {
    document: { ...document, text: nextText, revision: nextRevision },
    receipt: Object.freeze({
      requestId: patch.requestId,
      beforeRevision: document.revision,
      afterRevision: nextRevision,
      beforeText: document.text,
      afterText: nextText
    })
  }
}

export function undoAuthoringText(document, receipt) {
  if (document.revision !== receipt.afterRevision || document.text !== receipt.afterText) return null
  return { ...document, text: receipt.beforeText, revision: receipt.beforeRevision }
}
