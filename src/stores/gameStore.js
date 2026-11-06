import { defineStore } from 'pinia'
import { sendAction as apiSendAction } from '../services/api'
import {
  resolveSelectedTextProviderConfig,
  toResolvedTextApiSettings
} from '../services/textProviderConfigStore'
import { buildHeuristicContextSummary, compressChatHistory } from '../services/contextCompression'
import {
  archiveMemoryCandidate
} from '../services/memory/memoryCandidates'
import { gameEmergenceActions } from '../services/experience/gameEmergenceCoordinator.js'
import { adventureTriggerActions } from '../services/experience/adventureTriggerCoordinator.js'
import { getItem, setItem, getTextItem, STORAGE_KEYS } from '../composables/useStorage'
import { useWorldStore } from './worldStore'
import {
  buildCreatedSessionRecord,
  buildCurrentSessionFields,
  deriveSessionTitle,
  findLatestSessionForWorldbook,
  flushSessionListWriter,
  getSessionListWriter
} from '../services/experience/gameSessionScheduler.js'
import { gameAuthoringObserverActions } from '../services/experience/gameAuthoringObserverCoordinator.js'
import { cancelExperienceTurn, runExperienceTurn } from '../services/experience/experienceTurnCoordinator.js'
import { assertRoleplaySendAllowed, loadRoleplayStateForSession } from '../services/experience/roleplay/roleplayWorkflow.js'
import {
  buildAdventureCreativeSourceRefs as buildCreativeSourceRefs,
  buildPlotJournalEntry as buildJournalEntry
} from '../services/experience/gameJournalProjection.js'
import { gameBranchWorkflowActions } from '../services/experience/gameBranchWorkflow.js'
import { createExperienceRuntime } from '@pinax/core/experience/experienceRuntime'
const debugLog = (...args) => { if (import.meta.env?.DEV) globalThis.console?.debug?.(...args) }
const readDialogueCharacters = () => globalThis.localStorage.getItem('dialogue_characters')
const writeDialogueCharacters = text => globalThis.localStorage.setItem('dialogue_characters', text)
const emitNarrativeStatus = status => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('narrative-agent-status', { detail: status })) }
const runtime = createExperienceRuntime({ apiSendAction, resolveSelectedTextProviderConfig, toResolvedTextApiSettings, buildHeuristicContextSummary, compressChatHistory, archiveMemoryCandidate, gameEmergenceActions, adventureTriggerActions, getItem, setItem, getTextItem, STORAGE_KEYS, getWorldState: useWorldStore, buildCreatedSessionRecord, buildCurrentSessionFields, deriveSessionTitle, findLatestSessionForWorldbook, flushSessionListWriter, getSessionListWriter, gameAuthoringObserverActions, cancelExperienceTurn, runExperienceTurn, assertRoleplaySendAllowed, loadRoleplayStateForSession, buildCreativeSourceRefs, buildJournalEntry, gameBranchWorkflowActions, debugLog, readDialogueCharacters, writeDialogueCharacters, emitNarrativeStatus })
export const useGameStore = defineStore('game', { state: runtime.createState, actions: runtime.actions })
