const AUTHORITY_RANK = Object.freeze({ locked: 500, canonical: 400, accepted: 300, derived: 200, imported: 100 })

export function createProjectKnowledgeFacade({ projectId, projectRevision, readers }) {
  if (!projectId || !projectRevision) throw new Error('project identity and revision are required')
  const project = Object.freeze({ id: String(projectId), revision: String(projectRevision) })
  return Object.freeze({
    project,
    async resolve(kinds, request = {}) {
      const blocks = []
      for (const kind of [...new Set(kinds || [])]) {
        const reader = readers?.[kind]
        if (typeof reader !== 'function') continue
        const value = await reader(request)
        blocks.push(...[].concat(value || []).map((entry) => ({ kind, authority: 'derived', ...entry })))
      }
      blocks.sort((a, b) => (AUTHORITY_RANK[b.authority] || 0) - (AUTHORITY_RANK[a.authority] || 0))
      return { project, blocks }
    }
  })
}
