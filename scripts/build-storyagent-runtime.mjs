import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

const source = JSON.parse(fs.readFileSync(new URL('../shared/storyagentRuntimeSource.json', import.meta.url), 'utf8'))
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, '.runtime', 'storyagent')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pinax-agent-build-'))
const run = (command, args, cwd = temporary) => execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env })
try {
  const checkout = path.join(temporary, 'source')
  run('git', ['init', checkout])
  run('git', ['remote', 'add', 'origin', source.repository], checkout)
  run('git', ['fetch', '--depth', '1', 'origin', source.commit], checkout)
  // Export only tracked runtime sources; never include upstream node_modules or private config.
  const archive = execFileSync('git', ['archive', 'FETCH_HEAD', 'storyharness/src', 'storyharness/package.json', 'storyharness/package-lock.json', 'storyharness/tsconfig.json', 'storyharness/tsconfig.build.json', 'LICENSE'], { cwd: checkout, maxBuffer: 32 * 1024 * 1024 })
  const archiveFile = path.join(temporary, 'source.tar')
  fs.writeFileSync(archiveFile, archive)
  const exported = path.join(temporary, 'export'); fs.mkdirSync(exported)
  run('tar', ['-xf', archiveFile, '-C', exported])
  const harness = path.join(exported, 'storyharness')
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], harness)
  run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], harness)
  run('npm', ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], harness)
  const staged = `${output}.next`
  fs.rmSync(staged, { recursive: true, force: true }); fs.mkdirSync(staged, { recursive: true })
  for (const name of ['dist', 'node_modules', 'package.json', 'package-lock.json']) fs.cpSync(path.join(harness, name), path.join(staged, name), { recursive: true, verbatimSymlinks: true })
  const validateLinks = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        const resolved = fs.realpathSync(target)
        if (!resolved.startsWith(staged + path.sep)) throw new Error('Runtime symlink escapes package: ' + target)
      } else if (entry.isDirectory()) validateLinks(target)
    }
  }
  validateLinks(staged)
  fs.copyFileSync(path.join(exported, 'LICENSE'), path.join(staged, 'LICENSE'))
  const extensionDir = path.join(staged, 'dist', 'pinax')
  fs.copyFileSync(path.join(root, 'runtime-extensions', 'assistantProposalTool.js'), path.join(extensionDir, 'assistantProposalTool.js'))
  fs.copyFileSync(path.join(root, 'shared', 'assistantEditProposal.js'), path.join(extensionDir, 'assistantEditProposal.js'))
  const runnerPath = path.join(extensionDir, 'runner.js')
  let runner = fs.readFileSync(runnerPath, 'utf8')
  const insertion = '    const lookupTools = buildPinaxTools(snapshot, toolNames, toolHooks);'
  if (!runner.includes(insertion)) throw new Error('Pinned runtime extension location changed')
  runner = 'import { createAssistantProposalTool } from "./assistantProposalTool.js";\n' + runner.replace(insertion, insertion + '\n    if (req.taskKind === "assistant") lookupTools.push(createAssistantProposalTool(snapshot));')
  fs.writeFileSync(runnerPath, runner)
  const extensionSha256 = createHash('sha256').update(fs.readFileSync(path.join(root, 'runtime-extensions', 'assistantProposalTool.js'))).update(fs.readFileSync(path.join(root, 'shared', 'assistantEditProposal.js'))).digest('hex')
  const lockSha256 = createHash('sha256').update(fs.readFileSync(path.join(staged, 'package-lock.json'))).digest('hex')
  fs.writeFileSync(path.join(staged, 'runtime-source.json'), JSON.stringify({ ...source, extensionSha256, lockSha256, nodeMajor: Number(process.versions.node.split('.')[0]) }, null, 2))
  fs.rmSync(output, { recursive: true, force: true }); fs.renameSync(staged, output)
  console.log(`Agent runtime ready: ${output}; source ${source.commit}; lock ${lockSha256}`)
} finally { fs.rmSync(temporary, { recursive: true, force: true }) }
