export function createAuthoringProjectAdapter({ projectId, projectRevision, document, narrative }) {
  const project = Object.freeze({ id: String(projectId), revision: String(projectRevision) })
  return Object.freeze({
    getProject: () => project,
    getDocumentTarget: () => Object.freeze({ type: 'document', id: String(document.id), revision: String(document.revision) }),
    getNarrativeTarget: () => Object.freeze({ type: 'narrative-scene', id: String(narrative.sessionId), revision: String(narrative.sceneRevision) }),
    readDocument: () => Object.freeze({ ...document }),
    readNarrative: () => Object.freeze({ ...narrative })
  })
}
