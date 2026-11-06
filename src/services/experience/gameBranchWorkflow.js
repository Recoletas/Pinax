
import { createGameBranchWorkflow } from '@pinax/core/experience/gameBranchWorkflow'
const debugLog = (...args) => { if (import.meta.env?.DEV) globalThis.console?.debug?.(...args) }
const shared = createGameBranchWorkflow({ debugLog })
export const { gameBranchWorkflowActions } = shared
