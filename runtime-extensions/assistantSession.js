import path from 'node:path'
import { createHash } from 'node:crypto'
import { AgentHarness, BACKGROUND_CONTEXT, DEFAULT_COMPACTION_SETTINGS, JsonlSessionRepo, withAbortSignal } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { cleanAssistantResumeHistory } from './requestModelTransport.js'
import { completeAssistantSummary } from './assistantCompactionTransport.js'
import { createNativeAssistantSessionModule } from './nativeAssistantSessionCore.js'

function createSessionStorage({ tasksDir, bookId }) {
  const root = path.resolve(tasksDir, 'pi-sessions')
  const cwd = path.join(root, createHash('sha256').update(String(bookId || '')).digest('hex'))
  return { cwd, repository: new JsonlSessionRepo({ sessionsRoot: root, fileSystem: new NodeExecutionEnv({ cwd: root }) }) }
}
export const { createAssistantSession, compactAssistantSession } = createNativeAssistantSessionModule({ AgentHarness, BACKGROUND_CONTEXT, DEFAULT_COMPACTION_SETTINGS, withAbortSignal, createSessionStorage, cleanAssistantResumeHistory, completeAssistantSummary })
