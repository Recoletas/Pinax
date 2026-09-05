// 旧 chapter.outlineItems → 项目级大纲的惰性、可重入迁移（Phase 3）。
// 原则：
// - 手写项保留原 item id（migrationSource 记录），内容零丢失；
// - 同素材项转引用（assetId 记录），不复制素材正文；
// - 同一 item 出现在多个章节 → 分叉，进入一次性冲突审阅，不静默合并；
// - 迁移未完成时兼容 reader 继续工作，不双写真源。

import { normalizeOutlineNode, normalizeOutlineNodes } from './projectOutlineRepository.js'

function text(value) {
  return String(value ?? '').trim()
}

// 扫描全书：返回迁移计划（不写入）。
// items: chapter.outlineItems[]（含 id/title/content/assetId?）。
export function planChapterOutlineMigration(book) {
  const chapters = Array.isArray(book?.chapters) ? book.chapters : []
  const existingNodes = normalizeOutlineNodes(book?.outlineNodes)
  const migratedSources = new Set(existingNodes.map((node) => node.migrationSource).filter(Boolean))
  const plan = { create: [], conflicts: [], skipped: [] }
  const bySource = new Map()

  for (const chapter of chapters) {
    const items = Array.isArray(chapter?.outlineItems) ? chapter.outlineItems : []
    for (const item of items) {
      const itemId = text(item?.id)
      if (!itemId) continue
      if (migratedSources.has(itemId)) {
        plan.skipped.push({ itemId, chapterId: chapter.id })
        continue
      }
      const fingerprint = `${text(item?.title)}::${text(item?.content)}`
      if (!bySource.has(fingerprint)) bySource.set(fingerprint, [])
      bySource.get(fingerprint).push({ itemId, chapterId: chapter.id, item })
    }
  }

  for (const [, occurrences] of bySource) {
    if (occurrences.length > 1) {
      // 分叉：同一内容挂在多章，进入冲突审阅，不自动归并。
      plan.conflicts.push({
        fingerprint: `${text(occurrences[0].item?.title)}::${text(occurrences[0].item?.content)}`,
        title: text(occurrences[0].item?.title),
        occurrences
      })
      continue
    }
    const { itemId, chapterId, item } = occurrences[0]
    const assetId = text(item?.assetId || item?.source?.assetId)
    plan.create.push({
      migrationSource: itemId,
      chapterId,
      node: normalizeOutlineNode({
        title: text(item?.title) || '未命名节点',
        intent: text(item?.content),
        status: 'drafted',
        chapterRefs: [chapterId],
        migrationSource: itemId,
        sourceRefs: assetId ? [`asset:${assetId}`] : []
      }),
      assetId
    })
  }
  return plan
}

// 执行迁移：幂等——已迁移的 migrationSource 跳过；
// 分叉项不迁移（等待用户在冲突审阅中裁决后按单点手动 upsert）。
// 返回 { ok, created, skipped, conflicts, done }。
export function applyChapterOutlineMigration(book, plan) {
  const existingNodes = normalizeOutlineNodes(book?.outlineNodes)
  const migratedSources = new Set(existingNodes.map((node) => node.migrationSource).filter(Boolean))
  const created = []
  const skipped = [...(Array.isArray(plan?.skipped) ? plan.skipped : [])]
  for (const entry of plan.create || []) {
    if (migratedSources.has(entry.migrationSource)) {
      skipped.push({ itemId: entry.migrationSource, alreadyMigrated: true })
      continue
    }
    const node = { ...normalizeOutlineNode(entry.node), migrationSource: entry.migrationSource }
    existingNodes.push(node)
    migratedSources.add(entry.migrationSource)
    created.push(node)
  }
  book.outlineNodes = existingNodes
  return {
    ok: true,
    created,
    skipped,
    conflicts: plan.conflicts || [],
    // done = 再无未迁移且未分叉的 item。
    done: (plan.conflicts || []).length === 0
  }
}
