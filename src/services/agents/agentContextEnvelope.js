import {
  AGENT_CONTEXT_SCHEMA_VERSION,
  agentEnvelopeToPromptText,
  clipAgentContextEnvelope
} from '../../../shared/agentContextContract'

const CONTEXT_ENVELOPE_SCHEMA_VERSION = AGENT_CONTEXT_SCHEMA_VERSION

const BLOCK_KINDS = Object.freeze({
  SYSTEM: 'system',
  SELECTION: 'selection',
  SCENE: 'scene',
  CHARACTER: 'character',
  LOCATION: 'location',
  HISTORY: 'history',
  MEMORY: 'memory',
  REFERENCES: 'references',
  STYLE: 'style',
  RULES: 'rules',
  RAW: 'raw',
  OUTLINE: 'outline',
  WORLD_BOOK: 'worldbook',
  INBOX: 'inbox',
  LEGACY: 'legacy'
})

const DEFAULT_BLOCK_PRIORITIES = Object.freeze({
  system: 1000,
  rules: 900,
  style: 850,
  selection: 800,
  scene: 700,
  character: 600,
  location: 500,
  memory: 400,
  references: 350,
  outline: 300,
  worldbook: 250,
  inbox: 200,
  history: 150,
  raw: 100,
  legacy: 50
})

const DEFAULT_BUDGET = Object.freeze({
  maxChars: 16000
})

function safeStr(value, fallback = '') {
  if (value == null) return fallback
  return String(value)
}

function createBlock(kind, content, options = {}) {
  const priority = Number.isFinite(options.priority)
    ? options.priority
    : (DEFAULT_BLOCK_PRIORITIES[kind] || 100)
  return {
    kind: safeStr(kind),
    priority,
    content: content != null ? content : {},
    sourceRefs: Array.isArray(options.sourceRefs) ? options.sourceRefs : [],
    truncated: false,
    truncatedAt: null
  }
}

export {
  BLOCK_KINDS,
  DEFAULT_BLOCK_PRIORITIES,
  CONTEXT_ENVELOPE_SCHEMA_VERSION
}

export function buildContextEnvelope({
  surface = '',
  projectId = null,
  target = null,
  blocks = [],
  budget = {}
} = {}) {
  const normalizedTarget = target && typeof target === 'object'
    ? {
        type: safeStr(target.type),
        id: target.id != null ? safeStr(target.id) : null,
        revision: target.revision != null ? safeStr(target.revision) : null
      }
    : { type: '', id: null, revision: null }

  const cfg = { ...DEFAULT_BUDGET, ...budget }
  const maxChars = Math.max(1, Math.floor(Number(cfg.maxChars) || 16000))

  const normalizedBlocks = blocks.map((b) => {
    if (!b || typeof b !== 'object') return createBlock('raw', {})
    return createBlock(b.kind, b.content, {
      priority: b.priority,
      sourceRefs: b.sourceRefs
    })
  })

  normalizedBlocks.sort((a, b) => b.priority - a.priority)

  return {
    version: CONTEXT_ENVELOPE_SCHEMA_VERSION,
    surface: safeStr(surface),
    projectId: projectId != null ? safeStr(projectId) : null,
    target: normalizedTarget,
    blocks: normalizedBlocks,
    budget: {
      maxChars,
      usedChars: 0,
      truncated: false
    }
  }
}

export function addBlock(envelope, kind, content, options = {}) {
  if (!envelope || !Array.isArray(envelope.blocks)) return envelope
  const block = createBlock(kind, content, options)
  return {
    ...envelope,
    blocks: [...envelope.blocks, block].sort((a, b) => b.priority - a.priority)
  }
}

export function addSystemBlock(envelope, systemPrompt) {
  return addBlock(envelope, BLOCK_KINDS.SYSTEM, systemPrompt, {
    priority: DEFAULT_BLOCK_PRIORITIES.system
  })
}

export function addSelectionBlock(envelope, selectionContext, sourceRefs = []) {
  return addBlock(envelope, BLOCK_KINDS.SELECTION, selectionContext, {
    priority: DEFAULT_BLOCK_PRIORITIES.selection,
    sourceRefs
  })
}

export function addSceneBlock(envelope, sceneContext, sourceRefs = []) {
  return addBlock(envelope, BLOCK_KINDS.SCENE, sceneContext, {
    priority: DEFAULT_BLOCK_PRIORITIES.scene,
    sourceRefs
  })
}

export function addRawBlock(envelope, content, priority = 100) {
  return addBlock(envelope, BLOCK_KINDS.RAW, content, { priority })
}

export function clipContextEnvelope(envelope, maxCharsOverride) {
  return clipAgentContextEnvelope(envelope, maxCharsOverride)
}

export function toPromptText(envelope) {
  return agentEnvelopeToPromptText(envelope)
}
