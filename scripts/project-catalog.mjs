#!/usr/bin/env node
// Explicit offline utility; never discovers or synchronizes registered projects.
import { openProjectCatalog } from '../server/services/projectCatalogDb.js'

const [action, root, ...args] = process.argv.slice(2)
if (!['status', 'sync', 'search'].includes(action) || !root || action === 'search' && !args[0]) {
  console.error('Usage: node scripts/project-catalog.mjs status|sync|search /absolute/project/path [query|--verify-content]')
  process.exitCode = 2
} else {
  let catalog
  try {
    catalog = openProjectCatalog(root, { readOnly: action !== 'sync' })
    const result = action === 'sync' ? catalog.sync({ verifyContent: args.includes('--verify-content') })
      : action === 'search' ? catalog.search(args[0]) : catalog.status()
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error.code || 'CATALOG_ERROR', message: error.message, details: error.details }))
    process.exitCode = 1
  } finally { catalog?.close() }
}
