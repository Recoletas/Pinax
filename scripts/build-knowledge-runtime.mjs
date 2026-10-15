import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const source = JSON.parse(fs.readFileSync(new URL('../shared/knowledgeRuntimeSource.json', import.meta.url), 'utf8'))
const root = path.resolve(import.meta.dirname, '..')
const output = path.resolve(process.env.PINAX_KNOWLEDGE_RUNTIME || path.join(root, '.runtime/knowledge'))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-knowledge-build-'))
const run = (cmd, args, cwd = temp) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
try {
  if (fs.existsSync(output)) throw new Error('Knowledge runtime exists; select a new PINAX_KNOWLEDGE_RUNTIME candidate.')
  const checkout = path.join(temp, 'source')
  run('git', ['init', checkout])
  run('git', ['remote', 'add', 'origin', source.repository], checkout)
  run('git', ['fetch', '--depth', '1', 'origin', source.commit], checkout)
  const archive = execFileSync('git', ['archive', 'FETCH_HEAD', 'core/src', 'core/package.json', 'core/package-lock.json', 'core/tsconfig.json', 'adapters/src', 'adapters/package.json', 'adapters/tsconfig.json', 'contracts', 'kit/hypergraph.rag.json', 'tools/kit-compile.py', 'LICENSE'], { cwd: checkout, maxBuffer: 32 * 1024 * 1024 })
  const archiveFile = path.join(temp, 'source.tar')
  fs.writeFileSync(archiveFile, archive)
  const exported = path.join(temp, 'export'); fs.mkdirSync(exported)
  run('tar', ['-xf', archiveFile, '-C', exported])
  const core = path.join(exported, 'core')
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], core)
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', '../adapters/tsconfig.json'], core)
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], core)
  run('npm', ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], core)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const staged = fs.mkdtempSync(`${output}.stage-`)
  try {
    for (const dir of ['core', 'adapters']) {
      fs.mkdirSync(path.join(staged, dir))
      for (const name of ['dist', 'package.json']) fs.cpSync(path.join(exported, dir, name), path.join(staged, dir, name), { recursive: true })
    }
    fs.cpSync(path.join(core, 'node_modules'), path.join(staged, 'core/node_modules'), { recursive: true, verbatimSymlinks: true })
    for (const name of ['contracts', 'kit', 'tools', 'LICENSE']) fs.cpSync(path.join(exported, name), path.join(staged, name), { recursive: true })
    fs.mkdirSync(path.join(staged, 'knowledge'))
    // Upstream source cards are private. Preserve the published graph and label metadata-only hits.
    const lockSha256 = createHash('sha256').update(fs.readFileSync(path.join(core, 'package-lock.json'))).digest('hex')
    fs.writeFileSync(path.join(staged, 'runtime-source.json'), JSON.stringify({ ...source, lockSha256 }, null, 2))
    fs.renameSync(staged, output)
  } catch (error) { fs.rmSync(staged, { recursive: true, force: true }); throw error }
  console.log(`Knowledge runtime ready: ${output}; source ${source.commit}`)
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
