export const WRITING_INTERACTION_OWNER = Object.freeze({
  EDITOR: 'editor',
  IME: 'ime-composition',
  MODAL: 'modal',
  COMMAND_MENU: 'command-menu',
  INSPECTOR_EDIT: 'inspector-edit',
  BLOCK_COMPOSER: 'block-composer',
  BLOCK_REVIEW: 'block-review',
  QUICK_WORD: 'quick-word',
  INLINE_REQUEST: 'inline-request',
  INLINE_REVIEW: 'inline-review'
})

const PASSIVE_INLINE_BLOCKERS = new Set([
  WRITING_INTERACTION_OWNER.IME,
  WRITING_INTERACTION_OWNER.MODAL,
  WRITING_INTERACTION_OWNER.COMMAND_MENU,
  WRITING_INTERACTION_OWNER.INSPECTOR_EDIT,
  WRITING_INTERACTION_OWNER.BLOCK_COMPOSER,
  WRITING_INTERACTION_OWNER.BLOCK_REVIEW,
  WRITING_INTERACTION_OWNER.QUICK_WORD
])

export function resolveWritingInteractionOwner(state = {}) {
  if (state.composing) return WRITING_INTERACTION_OWNER.IME
  if (state.modalOpen) return WRITING_INTERACTION_OWNER.MODAL
  if (state.commandMenuOpen) return WRITING_INTERACTION_OWNER.COMMAND_MENU
  if (state.inspectorEditing) return WRITING_INTERACTION_OWNER.INSPECTOR_EDIT
  if (state.blockPreviewOpen) return WRITING_INTERACTION_OWNER.BLOCK_REVIEW
  if (state.blockComposerOpen) return WRITING_INTERACTION_OWNER.BLOCK_COMPOSER
  if (state.quickWordActive) return WRITING_INTERACTION_OWNER.QUICK_WORD
  if (state.inlineSuggestionVisible) return WRITING_INTERACTION_OWNER.INLINE_REVIEW
  if (state.inlineSuggestionRequesting) return WRITING_INTERACTION_OWNER.INLINE_REQUEST
  return WRITING_INTERACTION_OWNER.EDITOR
}

export function blocksPassiveInlineSuggestion(owner) {
  return PASSIVE_INLINE_BLOCKERS.has(String(owner || ''))
}

export function canArmPassiveInlineSuggestion(input = {}) {
  if (blocksPassiveInlineSuggestion(input.interactionOwner)) return false
  if (input.currentNodeEmpty) return false
  return true
}
