import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeProjectDatabase, openProjectDatabase } from '../electron/projects/projectDatabase.mjs'
import { dryRunLegacyProjectMigration, importLegacyProject } from '../electron/migration/legacyProjectImporter.mjs'

const root = await mkdtemp(join(tmpdir(), 'pinax-迁移-smoke-'))
try {
  const bundlePath = join(root, '浏览器旧项目.json')
  const destinationDirectory = join(root, '雾港纪事')
  const source = {
    app: 'Pinax',
    schemaVersion: 2,
    exportedAt: '2026-08-21T12:00:00.000Z',
    keys: {
      writing_books: JSON.stringify([{
        id: 'book-smoke',
        title: '雾港纪事',
        chapters: [{ id: 'chapter-smoke', title: '潮声', content: '# 潮声\n\n雾从码头升起。' }]
      }]),
      'worldbook_wb-smoke': JSON.stringify({
        id: 'wb-smoke',
        name: '雾港',
        entries: [{ id: 'place-smoke', type: 'location', name: '旧码头', content: '退潮时露出黑色石阶。' }]
      }),
      writing_sessions: JSON.stringify([{ id: 'session-smoke', messages: [] }]),
      apiSettings: JSON.stringify({ apiKey: 'must-not-import' })
    }
  }
  await writeFile(bundlePath, JSON.stringify(source), 'utf8')

  const preview = await dryRunLegacyProjectMigration({ bundlePath })
  assert.equal(preview.report.total, 3)
  assert.equal(preview.report.counts.converted, 2)

  const imported = await importLegacyProject({ bundlePath, destinationParentDirectory: root, name: '雾港纪事' })
  assert.equal(imported.alreadyImported, false)
  const repeated = await importLegacyProject({ bundlePath, destinationParentDirectory: root, name: '雾港纪事' })
  assert.equal(repeated.alreadyImported, true)
  assert.equal(repeated.bundleId, imported.bundleId)

  const database = openProjectDatabase(join(destinationDirectory, '.pinax/project.sqlite'))
  const items = database.listTextItems()
  assert.equal(items.filter(item => item.kind === 'chapter').length, 1)
  assert.equal(items.filter(item => item.kind === 'reference').length, 1)
  assert.equal(database.listLegacyImportRecords(imported.bundleId).length, preview.report.total)
  assert.equal(database.getLegacyImport(imported.bundleId).state, 'complete')
  const chapter = items.find(item => item.kind === 'chapter')
  closeProjectDatabase(database)
  assert.equal(await readFile(join(destinationDirectory, chapter.relativePath), 'utf8'), '潮声\n\n雾从码头升起。')

  process.stdout.write(`desktop legacy migration smoke passed: ${preview.report.total} records, idempotent re-import\n`)
} finally {
  await rm(root, { recursive: true, force: true })
}
