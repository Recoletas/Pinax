import { worldbookEntryRef } from '../writing/writingSourceRefs.js'
import { findWritingWorldbookEntriesByTerm } from '../writing/writingWorldbookMentions.js'

export const AUTHORING_ENTITY_CATEGORIES = Object.freeze([
  'person',
  'place',
  'organization',
  'ability',
  'item'
])

const CATEGORY_ENTRY_TYPES = Object.freeze({
  person: 'character',
  place: 'location',
  organization: 'organization',
  ability: 'lore',
  item: 'item'
})

const CATEGORY_LABELS = Object.freeze({
  person: '人物',
  place: '地点',
  organization: '组织',
  ability: '能力',
  item: '道具'
})

function text(value, max = 80) {
  return String(value || '').trim().slice(0, max)
}

function createSelectionId() {
  return `authoring-entity:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`
}

export function authoringEntityCategoryLabel(category) {
  return CATEGORY_LABELS[category] || ''
}

export function createAuthoringEntitySelection({
  text: selectedText = '',
  category = 'person',
  projectId = '',
  rationale = '',
  sourceKind = 'name-candidate',
  id = ''
} = {}) {
  const value = text(selectedText)
  if (!value || !AUTHORING_ENTITY_CATEGORIES.includes(category)) return null
  return Object.freeze({
    kind: 'authoring-entity-selection',
    schemaVersion: 1,
    id: text(id, 120) || createSelectionId(),
    projectId: text(projectId, 120),
    entityKind: category,
    text: value,
    rationale: text(rationale, 160),
    sourceKind: sourceKind === 'name-candidate' ? sourceKind : 'name-candidate'
  })
}

export function findAuthoringEntitySelectionConflicts(selection, worldbook = null) {
  if (selection?.kind !== 'authoring-entity-selection' || !selection.text || !worldbook?.id) return []
  const expectedType = CATEGORY_ENTRY_TYPES[selection.entityKind]
  return findWritingWorldbookEntriesByTerm(selection.text, worldbook)
    .map((entry) => Object.freeze({
      entryId: text(entry?.id, 120),
      sourceRef: worldbookEntryRef(entry?.id),
      name: text(entry?.name) || selection.text,
      type: text(entry?.type, 40) || 'general',
      sameType: String(entry?.type || '') === expectedType
    }))
    .filter((entry) => entry.entryId)
}

export function createAuthoringEntityEntryCommand(selection, {
  projectId = '',
  worldbookId = '',
  allowDuplicate = false
} = {}) {
  const targetProjectId = text(projectId, 120)
  const targetWorldbookId = text(worldbookId, 120)
  if (
    selection?.kind !== 'authoring-entity-selection'
    || !AUTHORING_ENTITY_CATEGORIES.includes(selection.entityKind)
    || !selection.text
    || !targetProjectId
    || !targetWorldbookId
    || (selection.projectId && selection.projectId !== targetProjectId)
  ) return null
  return Object.freeze({
    kind: 'create-worldbook-entry',
    schemaVersion: 1,
    selection,
    projectId: targetProjectId,
    worldbookId: targetWorldbookId,
    allowDuplicate: Boolean(allowDuplicate)
  })
}

export function buildAuthoringEntityEntry(command) {
  const selection = command?.selection
  if (
    command?.kind !== 'create-worldbook-entry'
    || selection?.kind !== 'authoring-entity-selection'
    || !AUTHORING_ENTITY_CATEGORIES.includes(selection.entityKind)
    || !selection.text
  ) return null
  return Object.freeze({
    name: selection.text,
    type: CATEGORY_ENTRY_TYPES[selection.entityKind],
    keys: Object.freeze([selection.text]),
    keysSecondary: Object.freeze([]),
    content: '',
    injection: Object.freeze({ mode: 'selective', probability: 100, cooldown: 0, depth: 1 }),
    metadata: Object.freeze({
      importSource: 'authoring-name-generator',
      basis: 'creative',
      reviewState: 'needs-review',
      authoringEntityKind: selection.entityKind,
      authoringSelectionId: selection.id
    })
  })
}

export function createAuthoringEntitySelectionReceipt(command, { entry = null, reused = false } = {}) {
  const selection = command?.selection
  if (command?.kind !== 'create-worldbook-entry' || !selection?.text || !entry?.id) return null
  return Object.freeze({
    schemaVersion: 1,
    action: 'create-worldbook-entry',
    status: reused ? 'reused' : 'created',
    value: selection.text,
    category: selection.entityKind,
    projectId: command.projectId,
    worldbookId: command.worldbookId,
    entryId: String(entry.id),
    sourceRef: worldbookEntryRef(entry.id)
  })
}
