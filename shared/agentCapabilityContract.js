import { AGENT_CONTEXT_PROFILES } from './agentContextProfiles.js'

export const WORKFLOW_KINDS = Object.freeze([
  'local',
  'structured-one-shot',
  'validated-chain',
  'agent-loop',
  'background-derive',
  'shadow-observer'
])

const rows = [
  ['source.parse', 'settings', 'local', 'source-import', 'source-input.v1', 'source-report.v1', 'local-cache'],
  ['settings.import.extract', 'settings', 'validated-chain', 'source-import', 'source-selection.v1', 'setting-candidates.v1', 'review-draft'],
  ['settings.foundation.generate', 'settings', 'structured-one-shot', 'setting-foundation', 'setting-brief.v1', 'setting-draft.v1', 'review-draft'],
  ['settings.candidates.extract', 'settings', 'validated-chain', 'setting-section', 'setting-sources.v1', 'setting-candidates.v1', 'review-draft'],
  ['settings.field.complete', 'settings', 'structured-one-shot', 'setting-field', 'setting-field.v1', 'setting-draft.v1', 'review-draft'],
  ['settings.section.complete', 'settings', 'validated-chain', 'setting-section', 'setting-section.v1', 'setting-draft-batch.v1', 'review-draft'],
  ['settings.draft.revise', 'settings', 'structured-one-shot', 'setting-field', 'setting-revision.v1', 'setting-draft.v1', 'review-draft'],
  ['settings.places.extract', 'settings', 'validated-chain', 'setting-places', 'setting-sources.v1', 'place-candidates.v1', 'review-draft'],
  ['settings.place.fleshout', 'settings', 'structured-one-shot', 'setting-place', 'place-draft.v1', 'place-draft.v1', 'review-draft'],
  ['settings.research.plan', 'settings', 'structured-one-shot', 'setting-research', 'research-brief.v1', 'research-query-plan.v1', 'ephemeral'],
  ['settings.research.claims', 'settings', 'validated-chain', 'setting-research', 'research-sources.v1', 'research-claims.v1', 'review-draft'],
  ['settings.maintenance.audit', 'settings', 'validated-chain', 'setting-maintenance', 'worldbook-revision.v1', 'maintenance-suggestions.v1', 'review-only'],
  ['authoring.continue', 'authoring', 'agent-loop', 'narrative-scene', 'authoring-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.advance', 'authoring', 'agent-loop', 'narrative-scene', 'authoring-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.simulate.character', 'authoring', 'agent-loop', 'narrative-scene', 'character-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.simulate.scene', 'authoring', 'agent-loop', 'narrative-scene', 'scene-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.insert', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'direct-text'],
  ['authoring.rewrite', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'review-draft'],
  ['authoring.expand', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'review-draft'],
  ['authoring.shorten', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'text-patch.v1', 'review-draft'],
  ['authoring.complete.inline', 'authoring', 'structured-one-shot', 'writing-cursor', 'cursor-window.v1', 'text-patch.v1', 'ephemeral'],
  ['authoring.review.selection', 'authoring', 'structured-one-shot', 'writing-selection', 'text-target.v1', 'review-suggestions.v1', 'review-only'],
  ['authoring.review.chapter', 'authoring', 'validated-chain', 'writing-chapter', 'chapter-revision.v1', 'review-suggestions.v1', 'review-only'],
  ['authoring.next-actions', 'authoring', 'structured-one-shot', 'narrative-advisor', 'scene-revision.v1', 'action-options.v1', 'ephemeral'],
  ['authoring.scene.directions', 'authoring', 'structured-one-shot', 'scene-direction', 'scene-pressure.v1', 'scene-directions.v1', 'ephemeral'],
  ['authoring.knowledge.query', 'authoring', 'validated-chain', 'authoring-knowledge', 'authoring-knowledge-query.v1', 'authoring-knowledge-answer.v1', 'review-only'],
  ['authoring.dialogue-options', 'authoring', 'structured-one-shot', 'narrative-dialogue', 'scene-revision.v1', 'dialogue-options.v1', 'ephemeral'],
  ['authoring.emergence', 'authoring', 'validated-chain', 'narrative-state', 'runtime-revision.v1', 'runtime-candidate.v1', 'review-draft'],
  ['authoring.trigger', 'authoring', 'validated-chain', 'narrative-scene', 'trigger-intent.v1', 'prose-segment.v1', 'direct-text'],
  ['authoring.context.compact', 'authoring', 'structured-one-shot', 'narrative-memory', 'context-window.v1', 'memory-summary.v1', 'derived-state'],
  ['authoring.asset.summarize', 'authoring', 'structured-one-shot', 'asset-summary', 'asset-selection.v1', 'asset-summary.v1', 'review-draft'],
  ['observer.entities.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-entities.v1', 'derived-state'],
  ['observer.relations.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-relations.v1', 'derived-state'],
  ['observer.events.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-events.v1', 'derived-state'],
  ['observer.timeline.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'derived-timeline.v1', 'derived-state'],
  ['observer.memory.derive', 'observer', 'background-derive', 'observer-manuscript', 'document-delta.v1', 'memory-candidates.v1', 'derived-state'],
  ['observer.quality.inspect', 'observer', 'shadow-observer', 'observer-quality', 'prose-segment.v1', 'quality-metrics.v1', 'metrics-only'],
  ['materials.refine', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'text-patch.v1', 'review-draft'],
  ['materials.classify', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'material-actions.v1', 'review-draft'],
  ['materials.split', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'material-actions.v1', 'review-draft'],
  ['materials.relate', 'materials', 'structured-one-shot', 'materials-selection', 'asset-selection.v1', 'material-actions.v1', 'review-draft'],
  ['canvas.organize', 'canvas', 'structured-one-shot', 'canvas-neighborhood', 'canvas-selection.v1', 'canvas-actions.v1', 'review-draft'],
  ['canvas.relate', 'canvas', 'structured-one-shot', 'canvas-neighborhood', 'canvas-selection.v1', 'canvas-actions.v1', 'review-draft'],
  ['canvas.transition', 'canvas', 'structured-one-shot', 'canvas-neighborhood', 'canvas-selection.v1', 'canvas-actions.v1', 'review-draft'],
  ['storyboard.review', 'storyboard', 'structured-one-shot', 'storyboard-version', 'storyboard-version.v1', 'storyboard-actions.v1', 'review-draft'],
  ['storyboard.video.prompt', 'storyboard', 'structured-one-shot', 'storyboard-shot', 'storyboard-shot.v1', 'generation-request.v1', 'review-draft']
]

// 集成 owner 授权的目录修订：只追加派生只读元数据，不改动任何 id / workflowKind /
// contextProfile / schema / effectPolicy。capability 与 maxContextChars 均由既有字段
// 确定性推导（workflowKind+effectPolicy → capability；contextProfile → profile 预算）。
function deriveCapability(workflowKind, effectPolicy) {
  if (workflowKind === 'local' || effectPolicy === 'local-cache') return 'local'
  return 'text'
}

export const CANONICAL_AGENT_TASKS = Object.freeze(rows.map(([
  id, owner, workflowKind, contextProfile, inputSchema, resultSchema, effectPolicy
]) => Object.freeze({
  id,
  owner,
  workflowKind,
  contextProfile,
  inputSchema,
  resultSchema,
  effectPolicy,
  capability: deriveCapability(workflowKind, effectPolicy),
  maxContextChars: AGENT_CONTEXT_PROFILES[contextProfile]?.maxChars ?? null
})))

const byId = new Map(CANONICAL_AGENT_TASKS.map((task) => [task.id, task]))
export const listCanonicalAgentTaskIds = () => [...byId.keys()]
export const getCanonicalAgentTask = (id) => byId.get(String(id || '').trim()) || null

export const LEGACY_CAPABILITY_ALIASES = Object.freeze({
  'worldbook.import.structure': 'settings.import.extract',
  'experience.next-actions': 'authoring.next-actions',
  'experience.emergence': 'authoring.emergence',
  'experience.memory.compress': 'authoring.context.compact',
  'experience.asset-summary': 'authoring.asset.summarize',
  'writing.continue': 'authoring.continue',
  'writing.rewrite': 'authoring.rewrite',
  'writing.review': 'authoring.review.chapter',
  'writing.fix.selection': 'authoring.rewrite',
  'writing.fix.paragraph': 'authoring.rewrite',
  'writing.continue.light': 'authoring.complete.inline',
  'writing.close.thread': 'authoring.review.selection',
  'writing.chapter.health': 'authoring.review.chapter',
  'advisor.fix.selection': 'authoring.rewrite',
  'advisor.fix.paragraph': 'authoring.rewrite',
  'advisor.continue.light': 'authoring.complete.inline',
  'advisor.close.thread': 'authoring.review.selection',
  'advisor.review.chapter': 'authoring.review.chapter'
})

export const resolveLegacyTaskAlias = (id) => {
  const requested = String(id || '').trim()
  return LEGACY_CAPABILITY_ALIASES[requested] || requested
}
