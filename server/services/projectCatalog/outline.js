import { catalogError } from './sources.js'

export function insertOutlineEdges(db, edges) {
  const insert = db.prepare('INSERT INTO catalog_outline_edges(edge_id, from_id, to_id, kind) VALUES (?, ?, ?, ?)')
  for (const edge of edges) {
    try { insert.run(edge.id, edge.fromNodeId, edge.toNodeId, edge.kind) } catch (error) {
      throw catalogError('CATALOG_OUTLINE_INTEGRITY', '大纲边引用缺失节点、存在自环或重复，保留旧目录', { edgeId: edge.id, cause: error.message })
    }
  }
}

// rowid is the public tie-breaker for items in one file. Keep it on edits
// and use the full replacement path for reordered, inserted or removed IDs.
export function patchOutline(db, file) {
  const rows = db.prepare('SELECT rowid, kind, CAST(item_id AS BLOB) id FROM catalog_items WHERE relative_path=? ORDER BY rowid').all(file.relative)
  const decode = new TextDecoder('utf-8', { ignoreBOM: true })
  if (file.items.length !== rows.length || rows.some((row, i) => row.kind !== file.items[i].kind || decode.decode(row.id) !== file.items[i].id)) return false

  const update = db.prepare(`UPDATE catalog_items SET title=$title, content=$content, tags=$tags, record_json=$record
    WHERE rowid=$rowid AND (title!=$title OR content!=$content OR tags!=$tags OR record_json!=$record)`)
  const changedEdges = []
  for (const [i, item] of file.items.entries()) {
    const { changes } = update.run({ $rowid: rows[i].rowid, $title: item.title, $content: item.content, $tags: item.tags, $record: JSON.stringify(item.data) })
    if (changes && item.kind === 'outline-edge') changedEdges.push(item.data)
  }
  if (changedEdges.length) {
    // Release every changed edge first so valid swaps of endpoint pairs can
    // pass the unique constraint, then let the same FK checks validate additions.
    const remove = db.prepare('DELETE FROM catalog_outline_edges WHERE edge_id=?')
    for (const edge of changedEdges) remove.run(edge.id)
    insertOutlineEdges(db, changedEdges)
  }
  return true
}
