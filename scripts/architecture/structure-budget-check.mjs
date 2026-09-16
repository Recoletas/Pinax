import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(import.meta.dirname, '../..')
const srcRoot = join(root, 'src')
const limits = new Map([
  ['src/pages/Authoring.vue', [10900, 125]],
  ['src/pages/Notes.vue', [3300, 18]],
  ['src/pages/ProseEssay.vue', [3450, 18]],
  ['src/pages/Experience.vue', [3550, 28]],
  ['src/stores/gameStore.js', [2300, 30]]
])

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

function source(path) {
  return readFileSync(join(root, path), 'utf8')
}

function moduleEdges(code) {
  const edges = []
  const pattern = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|import\s*\()(['"])([^'"]+)\1/g
  for (const match of code.matchAll(pattern)) edges.push(match[2])
  return edges
}

function resolveRelative(from, specifier) {
  if (!specifier.startsWith('.')) return ''
  const base = resolve(dirname(from), specifier)
  for (const candidate of [base, `${base}.js`, `${base}.vue`, join(base, 'index.js')]) {
    try { if (statSync(candidate).isFile()) return candidate } catch {}
  }
  return ''
}

const productionFiles = filesUnder(srcRoot).filter((path) => ['.js', '.vue'].includes(extname(path)) && !path.includes('/__tests__/'))
const graph = new Map(productionFiles.map((path) => [path, moduleEdges(readFileSync(path, 'utf8'))
  .map((edge) => resolveRelative(path, edge)).filter(Boolean)]))
const cycles = []
const visiting = new Set()
const visited = new Set()
function visit(node, stack = []) {
  if (visiting.has(node)) {
    const start = stack.indexOf(node)
    cycles.push([...stack.slice(start), node].map((path) => relative(root, path)))
    return
  }
  if (visited.has(node)) return
  visiting.add(node)
  for (const next of graph.get(node) || []) visit(next, [...stack, node])
  visiting.delete(node)
  visited.add(node)
}
for (const node of graph.keys()) visit(node)

const rows = [...limits].map(([path, [lineLimit, importLimit]]) => {
  const code = source(path)
  return { path, lines: code.split(/\r?\n/).length, imports: moduleEdges(code).length, lineLimit, importLimit }
})
const serviceRootCount = readdirSync(join(srcRoot, 'services')).filter((name) => name.endsWith('.js')).length
const experimentalEdges = productionFiles.flatMap((path) => moduleEdges(readFileSync(path, 'utf8'))
  .filter((edge) => edge.includes('experimental/')).map((edge) => `${relative(root, path)} -> ${edge}`))
const repositoryEdges = productionFiles.filter((path) => path.includes('/pages/')).flatMap((path) => moduleEdges(readFileSync(path, 'utf8'))
  .filter((edge) => /Repository|Storage|Store/.test(edge)).map((edge) => `${relative(root, path)} -> ${edge}`))

console.log('file/root\tlines/imports\tlimit')
for (const row of rows) console.log(`${row.path}\t${row.lines}/${row.imports}\t${row.lineLimit}/${row.importLimit}`)
console.log(`src/services root JS\t${serviceRootCount}\t20`)
console.log(`production cycles\t${cycles.length}\t0`)
console.log(`production experimental edges\t${experimentalEdges.length}\t0`)
console.log(`page repository/storage imports\t${repositoryEdges.length}\treport-only`)
for (const cycle of cycles) console.log(`cycle: ${cycle.join(' -> ')}`)
for (const edge of experimentalEdges) console.log(`experimental: ${edge}`)
for (const edge of repositoryEdges) console.log(`page-owner: ${edge}`)

if (process.argv.includes('--enforce')) {
  const failed = rows.some((row) => row.lines > row.lineLimit || row.imports > row.importLimit)
    || serviceRootCount > 20 || cycles.length > 0 || experimentalEdges.length > 0
  if (failed) process.exitCode = 1
}
