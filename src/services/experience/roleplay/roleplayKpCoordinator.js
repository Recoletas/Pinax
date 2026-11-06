import { ensureRoleplaySessionState, getRoleplayScenarioView } from "./roleplayWorkflow.js"
import { withExclusiveRunLock } from "../run/runLock.js"
import { createRoleplayKpCoordinator } from '@pinax/core/experience/roleplay/roleplayKpCoordinator'
const shared = createRoleplayKpCoordinator({ ensureRoleplaySessionState, getRoleplayScenarioView, withExclusiveRunLock })
export const { ROLEPLAY_KP_BUDGET_LIMITS, ROLEPLAY_KP_STATUSES, findKpRunForBranch, buildKpBeatDirective, getRoleplayKpRunView, runRoleplayKpCycle, getRoleplayKpStatusView, ROLEPLAY_KP_TASK_ID } = shared
