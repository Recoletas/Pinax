import { useNotesIllustrationInteraction } from './useNotesIllustrationInteraction.js'

// Composition boundary for the Notes illustration surface. Generation/media
// persistence stays injected by the page editor/catalog owners; pointer,
// selection, presentation and teardown are exposed as one workspace contract.
export function useNotesIllustrationWorkspace(options) {
  const interaction = useNotesIllustrationInteraction(options)
  function reset() {
    interaction.cancelIllustrationDrag()
    interaction.resetSelection()
  }
  return { ...interaction, reset }
}
