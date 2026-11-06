import { createNarrativeResourceIndex } from '../narrativeResourceIndex.js'
import { deriveManifestToolAuthorization, createManifestAuthorizedNarrativeIndex as createCoreIndex } from '@pinax/core/context/manifestToolAuthorization'
export { deriveManifestToolAuthorization }
export function createManifestAuthorizedNarrativeIndex(input) { return createCoreIndex({ ...input, createIndex: createNarrativeResourceIndex }) }
export default { deriveManifestToolAuthorization, createManifestAuthorizedNarrativeIndex }
