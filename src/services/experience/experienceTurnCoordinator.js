import { runExperienceAgentGeneration } from "../agents/storyagent/experienceAgentRoute.js"
import { recordMemory } from "../api"
import { archiveMemoryCandidate, listScopedActiveMemoryCandidates } from "../memory/memoryCandidates"
import { buildNarrativeKernel } from "../agents/narrativeKernel"
import { recordPromptSnapshot } from "../agents/promptSnapshot.js"
import { recordAgentRequestTrace, summarizeAgentEnvelope } from "../agents/agentRequestTrace.js"
import { serializeAgentBlockContent } from "../../../shared/agentContextContract.js"
import { buildNarrativeContinuityFrame } from "../agents/narrativeContinuityFrame"
import { getNarrativeResourceIndex } from "../agents/narrativeResourceIndex"
import { buildNarrativeContextAudit } from "../agents/narrativeContextAudit"
import { createNarrativeToolRegistry } from "../agents/narrativeToolRegistry"
import { buildTurnReceipt, createNarrativeAgentContextLedger, runNarrativeAgentGeneration } from "../agents/narrativeAgentOrchestrator"
import { buildNarrativeSceneThread } from "../agents/narrativeSceneThread"
import { createNarrativeProductionObserver, recordNarrativeProductionRun } from "../agents/narrativeProductionMetrics"
import { useWorldStore } from "../../stores/worldStore"
import { createMessageId, createNarrativeTurnRecord, commitNarrativeTurnRecord, failNarrativeTurnRecord } from "../../../shared/narrativeTurnContract.js"
import { normalizeNarrativeIntent, intentToOrchestratorMode } from "../../../shared/narrativeGenerationIntentContract.js"
import { bindRoleplayNarration, commitRoleplayNarration, commitRoleplayRenarration, archiveDurableRoleplayTurns, failRoleplayNarration } from "./roleplay/roleplayWorkflow.js"
import { createExperienceTurnCoordinator } from '@pinax/core/experience/experienceTurnCoordinator'
const emitMechanismReady = mechanism => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('story-mechanism-ready', { detail: mechanism })) }
const logError = (...args) => globalThis.console?.error?.(...args)
const shared = createExperienceTurnCoordinator({ runExperienceAgentGeneration, recordMemory, archiveMemoryCandidate, listScopedActiveMemoryCandidates, buildNarrativeKernel, recordPromptSnapshot, recordAgentRequestTrace, summarizeAgentEnvelope, serializeAgentBlockContent, buildNarrativeContinuityFrame, getNarrativeResourceIndex, buildNarrativeContextAudit, createNarrativeToolRegistry, buildTurnReceipt, createNarrativeAgentContextLedger, runNarrativeAgentGeneration, buildNarrativeSceneThread, createNarrativeProductionObserver, recordNarrativeProductionRun, getWorldState: useWorldStore, createMessageId, createNarrativeTurnRecord, commitNarrativeTurnRecord, failNarrativeTurnRecord, normalizeNarrativeIntent, intentToOrchestratorMode, bindRoleplayNarration, commitRoleplayNarration, commitRoleplayRenarration, archiveDurableRoleplayTurns, failRoleplayNarration, emitMechanismReady, logError })
export const { cancelExperienceTurn, runExperienceTurn } = shared
