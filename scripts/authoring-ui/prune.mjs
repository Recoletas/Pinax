import { pruneAuthoringArtifactRuns } from './artifacts.mjs'

const dryRun = !process.argv.includes('--apply')

try {
  const result = await pruneAuthoringArtifactRuns({ dryRun })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  console.error('Authoring artifact prune failed:', error?.message || error)
  process.exitCode = 1
}
