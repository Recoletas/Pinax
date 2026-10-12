import fs from 'node:fs'
import path from 'node:path'
// Copy, never remove, old journals. A divergent destination is never overwritten.
export function preserveStoryAgentJournals(legacy, destination) {
  if (path.resolve(legacy) === path.resolve(destination) || !fs.existsSync(legacy)) return 0
  fs.mkdirSync(destination, { recursive: true })
  let count = 0
  for (const entry of fs.readdirSync(legacy, { withFileTypes: true })) {
    if (!entry.isFile() || !/^task-[a-zA-Z0-9_-]+\.jsonl$/.test(entry.name)) continue
    const source = fs.readFileSync(path.join(legacy, entry.name), 'utf8')
    if (!source.endsWith('\n')) throw new Error('Task journal is still being written; stop the old runtime before migrating.')
    for (const line of source.split('\n').filter(Boolean)) JSON.parse(line)
    const target = path.join(destination, entry.name)
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target, 'utf8')
      if (existing === source || existing.startsWith(source)) continue
      if (!source.startsWith(existing)) throw new Error('Task journal migration conflict: ' + entry.name)
    }
    const temporary = `${target}.migrating`
    fs.writeFileSync(temporary, source, { mode: 0o600 }); fs.renameSync(temporary, target); count++
  }
  return count
}
