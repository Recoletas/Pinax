import { reactive } from 'vue'
import { randomUUID } from '../../../../shared/randomId.js'
import { createStoryAgentPanelSessions as createCorePanelSessions } from '@pinax/core/agent/panelSessionState'
export function createStoryAgentPanelSessions() { return createCorePanelSessions({ reactive, randomUUID }) }
