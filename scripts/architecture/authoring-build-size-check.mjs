import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const limit = 1_450_000
const assets = resolve(import.meta.dirname, '../../dist/assets')
const matches = readdirSync(assets)
  .filter((name) => /^Authoring-.*\.js$/.test(name))
  .map((name) => ({ name, bytes: statSync(resolve(assets, name)).size }))
if (!matches.length) {
  console.error('Authoring build chunk not found in dist/assets')
  process.exit(1)
}
for (const item of matches) console.log(`${item.name}: ${item.bytes} bytes (limit ${limit})`)
if (matches.some((item) => item.bytes > limit)) process.exitCode = 1
