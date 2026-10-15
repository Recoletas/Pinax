// Keep the catalogue and retrieval code out of the manuscript's first load.
// Callers capture project and live-source inputs before invoking this facade.
export function createAuthoringKnowledgeQuerySession(options) {
  let pending = null
  function load() {
    if (!pending) pending = import('./authoringKnowledgeQuerySession.js')
      .then(module => module.createAuthoringKnowledgeQuerySession(options))
      .catch(error => { pending = null; throw error })
    return pending
  }
  return Object.freeze({
    prepare: async (...args) => (await load()).prepare(...args),
    collectCurrentRevisions: async (...args) => (await load()).collectCurrentRevisions(...args)
  })
}
