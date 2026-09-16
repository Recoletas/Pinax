// Authoring manifest tool authorization:
// derive an exact worldbook/memory allowlist from the frozen compiled manifest,
// then build a minimal NarrativeResourceIndex from the frozen representations.
// No live worldbook, memory repository, excluded item, dependency or provenance
// can expand this index.

import { createNarrativeResourceIndex } from '../narrativeResourceIndex.js'
import { createWritingContextManifestFingerprint } from './writingContextCompiler.js'

const COMPILED_MANIFEST_KIND = 'compiled-context-manifest'
const COMPILED_MANIFEST_SCHEMA_VERSION = 1
const AUTHORIZATION_SCHEMA_VERSION = 1
const READONLY_MAP_METHODS = Object.freeze(['get', 'has', 'entries', 'keys', 'values'])
const READONLY_MAP_MUTATORS = Object.freeze(['set', 'delete', 'clear'])

const AUTHORIZED_BLOCKS = Object.freeze({
  'worldbook-entry': Object.freeze({
    domain: 'world',
    refPrefix: 'worldbook-entry:'
  }),
  'history-node': Object.freeze({
    domain: 'history',
    refPrefix: 'history-node:'
  }),
  memory: Object.freeze({
    domain: 'memory',
    refPrefix: 'memory:'
  })
})

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function freezePlain(value) {
  if (Array.isArray(value)) {
    for (const item of value) freezePlain(item)
    return Object.freeze(value)
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) freezePlain(item)
    return Object.freeze(value)
  }
  return value
}

function createReadonlyMap(entries) {
  const target = new Map(entries)
  const cachedMethods = new Map()
  let facade

  Object.freeze(target)
  facade = new Proxy(target, {
    get(map, property) {
      if (READONLY_MAP_MUTATORS.includes(property)) {
        if (!cachedMethods.has(property)) {
          cachedMethods.set(property, () => {
            throw new TypeError('manifest-authorized narrative index is read-only')
          })
        }
        return cachedMethods.get(property)
      }
      if (property === 'forEach') {
        if (!cachedMethods.has(property)) {
          cachedMethods.set(property, (callback, thisArg) => {
            if (typeof callback !== 'function') throw new TypeError('callback must be a function')
            map.forEach((value, key) => callback.call(thisArg, value, key, facade))
          })
        }
        return cachedMethods.get(property)
      }

      const value = Reflect.get(map, property, map)
      if (property === Symbol.iterator || READONLY_MAP_METHODS.includes(property)) {
        if (!cachedMethods.has(value)) cachedMethods.set(value, value.bind(map))
        return cachedMethods.get(value)
      }
      return value
    },
    set() {
      throw new TypeError('manifest-authorized narrative index is read-only')
    },
    defineProperty() {
      throw new TypeError('manifest-authorized narrative index is read-only')
    },
    deleteProperty() {
      throw new TypeError('manifest-authorized narrative index is read-only')
    },
    setPrototypeOf() {
      throw new TypeError('manifest-authorized narrative index is read-only')
    }
  })
  return facade
}

function failure(reason, details = {}) {
  return freezePlain({ ok: false, reason, ...details })
}

function requiredText(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized && normalized === value ? normalized : ''
}

function canonicalSourceRef(value, prefix) {
  const sourceRef = requiredText(value)
  if (!sourceRef || !sourceRef.startsWith(prefix)) return null
  const sourceId = sourceRef.slice(prefix.length)
  if (!sourceId || sourceId !== sourceId.trim()) return null
  return { sourceRef, sourceId }
}

function authorizationFingerprint(input) {
  const source = JSON.stringify(input)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `manifest-tools-${(hash >>> 0).toString(36)}`
}

function validateManifest(manifest, projectId) {
  if (!isPlainObject(manifest)) return failure('manifest-invalid')
  if (manifest.kind !== COMPILED_MANIFEST_KIND) {
    return failure('manifest-kind-invalid', { expected: COMPILED_MANIFEST_KIND })
  }
  if (Number(manifest.schemaVersion) !== COMPILED_MANIFEST_SCHEMA_VERSION) {
    return failure('manifest-schema-version-unsupported', {
      expected: COMPILED_MANIFEST_SCHEMA_VERSION
    })
  }
  const manifestFingerprint = requiredText(manifest.fingerprint)
  if (!manifestFingerprint) return failure('manifest-fingerprint-missing')
  if (!Array.isArray(manifest.blocks)) return failure('manifest-blocks-invalid')

  const manifestProjectId = requiredText(manifest.target?.projectId)
  if (!manifestProjectId) return failure('manifest-project-id-missing')
  const requestedProjectId = requiredText(projectId)
  if (!requestedProjectId) return failure('project-id-missing')
  if (manifestProjectId !== requestedProjectId) {
    return failure('project-id-mismatch', {
      manifestProjectId,
      projectId: requestedProjectId
    })
  }
  const expectedFingerprint = createWritingContextManifestFingerprint({
    target: manifest.target,
    profile: manifest.profile,
    taskKind: manifest.taskKind,
    blocks: manifest.blocks,
    excluded: manifest.excluded,
    dependencies: manifest.dependencies
  })
  if (manifestFingerprint !== expectedFingerprint) {
    return failure('manifest-fingerprint-mismatch', {
      expected: expectedFingerprint,
      actual: manifestFingerprint
    })
  }
  return {
    ok: true,
    manifestFingerprint,
    projectId: manifestProjectId
  }
}

function readAuthorizedBinding(block, blockIndex) {
  const definition = AUTHORIZED_BLOCKS[block?.kind]
  if (!definition) return { ok: true, binding: null }
  if (!isPlainObject(block)) return failure('authorized-block-invalid', { blockIndex })

  const candidateId = requiredText(block.candidateId)
  if (!candidateId) return failure('authorized-block-candidate-id-missing', { blockIndex })
  const revision = requiredText(block.revision)
  if (!revision) {
    return failure('authorized-block-revision-missing', { blockIndex, candidateId })
  }
  if (typeof block.text !== 'string' || !block.text.trim()) {
    return failure('authorized-block-text-missing', { blockIndex, candidateId })
  }
  if (!Array.isArray(block.sourceRefs)) {
    return failure('authorized-block-source-refs-invalid', { blockIndex, candidateId })
  }

  const matchingRefs = block.sourceRefs.filter((sourceRef) => (
    typeof sourceRef === 'string' && sourceRef.startsWith(definition.refPrefix)
  ))
  if (matchingRefs.length !== 1) {
    return failure('authorized-block-canonical-ref-not-unique', {
      blockIndex,
      candidateId,
      expectedPrefix: definition.refPrefix,
      count: matchingRefs.length
    })
  }
  const canonical = canonicalSourceRef(matchingRefs[0], definition.refPrefix)
  if (!canonical) {
    return failure('authorized-block-canonical-ref-invalid', {
      blockIndex,
      candidateId,
      expectedPrefix: definition.refPrefix
    })
  }
  if (block.primarySourceRef !== canonical.sourceRef) {
    return failure('authorized-block-primary-ref-mismatch', {
      blockIndex,
      candidateId,
      sourceRef: canonical.sourceRef
    })
  }
  if (requiredText(block.sourceKind) !== block.kind) {
    return failure('authorized-block-source-kind-mismatch', {
      blockIndex,
      candidateId,
      sourceRef: canonical.sourceRef
    })
  }
  if (requiredText(block.sourceId) !== canonical.sourceId) {
    return failure('authorized-block-source-id-mismatch', {
      blockIndex,
      candidateId,
      sourceRef: canonical.sourceRef
    })
  }

  return {
    ok: true,
    binding: {
      domain: definition.domain,
      kind: block.kind,
      sourceRef: canonical.sourceRef,
      sourceId: canonical.sourceId,
      candidateId,
      revision,
      text: block.text,
      label: requiredText(block.label) || canonical.sourceId
    }
  }
}

export function deriveManifestToolAuthorization(manifest, { projectId } = {}) {
  const validation = validateManifest(manifest, projectId)
  if (!validation.ok) return validation

  const bindingsByRef = new Map()
  for (let blockIndex = 0; blockIndex < manifest.blocks.length; blockIndex += 1) {
    const result = readAuthorizedBinding(manifest.blocks[blockIndex], blockIndex)
    if (!result.ok) return result
    const binding = result.binding
    if (!binding) continue

    const existing = bindingsByRef.get(binding.sourceRef)
    if (existing) {
      if (
        existing.candidateId !== binding.candidateId
        || existing.revision !== binding.revision
        || existing.text !== binding.text
      ) {
        return failure('authorized-source-ref-conflict', {
          sourceRef: binding.sourceRef,
          candidateIds: [existing.candidateId, binding.candidateId]
        })
      }
      continue
    }
    bindingsByRef.set(binding.sourceRef, binding)
  }

  const bindings = [...bindingsByRef.values()]
    .sort((left, right) => left.sourceRef.localeCompare(right.sourceRef))
  const resourceIds = new Map()
  for (const binding of bindings) {
    const existing = resourceIds.get(binding.sourceId)
    if (existing && existing.sourceRef !== binding.sourceRef) {
      return failure('authorized-resource-id-collision', {
        sourceId: binding.sourceId,
        sourceRefs: [existing.sourceRef, binding.sourceRef]
      })
    }
    resourceIds.set(binding.sourceId, binding)
  }

  const worldbookRefs = bindings
    .filter((binding) => binding.domain === 'world')
    .map((binding) => binding.sourceRef)
  const memoryRefs = bindings
    .filter((binding) => binding.domain === 'memory')
    .map((binding) => binding.sourceRef)
  const historyRefs = bindings
    .filter((binding) => binding.domain === 'history')
    .map((binding) => binding.sourceRef)
  const authorization = {
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
    kind: 'manifest-tool-authorization',
    manifestFingerprint: validation.manifestFingerprint,
    projectId: validation.projectId,
    fingerprint: authorizationFingerprint({
      manifestFingerprint: validation.manifestFingerprint,
      projectId: validation.projectId,
      bindings: bindings.map(({ sourceRef, candidateId, revision, text }) => ({
        sourceRef,
        candidateId,
        revision,
        text
      }))
    }),
    worldbookRefs,
    historyRefs,
    memoryRefs,
    bindings
  }

  return { ok: true, authorization: freezePlain(authorization) }
}

function buildAuthorizedSnapshot(authorization) {
  const worldBindings = authorization.bindings.filter((binding) => binding.domain === 'world')
  const memoryBindings = authorization.bindings.filter((binding) => binding.domain === 'memory')
  const historyBindings = authorization.bindings.filter((binding) => binding.domain === 'history')
  return {
    projectId: authorization.projectId,
    sessionId: '',
    worldbook: {
      id: `manifest-worldbook:${authorization.fingerprint}`,
      name: '',
      description: '',
      worldDescription: '',
      openingHook: '',
      entries: worldBindings.map((binding) => ({
        id: binding.sourceId,
        name: binding.label,
        type: 'lore',
        keys: binding.label === binding.sourceId ? [] : [binding.label],
        content: binding.text,
        relations: {}
      }))
    },
    memories: memoryBindings.map((binding) => ({
      id: binding.sourceId,
      status: 'active',
      scope: 'project',
      scopeId: authorization.projectId,
      kind: 'memory',
      authority: 'accepted',
      confidence: 1,
      importance: 1,
      content: binding.text,
      sourceRefs: [binding.sourceRef],
      sourceRevision: binding.revision,
      metadata: { title: binding.label }
    })),
    additionalResources: historyBindings.map((binding) => ({
      id: binding.sourceId,
      domain: 'history',
      type: 'world-history',
      title: binding.label,
      summary: binding.text,
      sourceRefs: [binding.sourceRef],
      trust: 'canonical'
    })),
    runtimeState: {}
  }
}

function validateAuthorizedIndex(index, authorization) {
  const allowedByRef = new Map(authorization.bindings.map((binding) => [binding.sourceRef, binding]))
  const resources = Array.isArray(index?.resources) ? index.resources : []
  if (resources.length !== authorization.bindings.length) {
    return failure('authorized-index-resource-count-mismatch', {
      expected: authorization.bindings.length,
      actual: resources.length
    })
  }

  for (const item of resources) {
    if (!['world', 'history', 'memory'].includes(item?.domain)) {
      return failure('authorized-index-domain-leak', { domain: String(item?.domain || '') })
    }
    if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length !== 1) {
      return failure('authorized-index-source-refs-invalid', { resourceId: String(item?.id || '') })
    }
    const binding = allowedByRef.get(item.sourceRefs[0])
    if (!binding || binding.domain !== item.domain || binding.sourceId !== item.id) {
      return failure('authorized-index-source-not-authorized', {
        resourceId: String(item?.id || ''),
        sourceRef: String(item.sourceRefs[0] || '')
      })
    }
  }

  for (const domain of ['geo', 'politics']) {
    if ((index?.byDomain?.get(domain) || []).length > 0 || Number(index?.counts?.[domain] || 0) > 0) {
      return failure('authorized-index-domain-leak', { domain })
    }
  }
  if (resources.some((item) => item.domain === 'world' && item.type === 'overview')) {
    return failure('authorized-index-worldbook-overview-leak')
  }
  return { ok: true }
}

function createReadonlyAuthorizedIndex(index) {
  const resources = freezePlain([...index.resources])
  const domainResources = new Map()
  for (const resource of resources) {
    if (!domainResources.has(resource.domain)) domainResources.set(resource.domain, [])
    domainResources.get(resource.domain).push(resource)
  }

  const byDomainEntries = [...domainResources.entries()].map(([domain, items]) => [
    domain,
    freezePlain(items)
  ])
  const counts = Object.fromEntries(['world', 'geo', 'history', 'memory', 'politics'].map((domain) => [
    domain,
    domainResources.get(domain)?.length || 0
  ]))

  return freezePlain({
    schemaVersion: index.schemaVersion,
    projectId: index.projectId,
    sessionId: index.sessionId,
    revision: index.revision,
    resources,
    byId: createReadonlyMap(resources.map((resource) => [resource.id, resource])),
    byDomain: createReadonlyMap(byDomainEntries),
    counts
  })
}

export function createManifestAuthorizedNarrativeIndex({ manifest, projectId } = {}) {
  const derived = deriveManifestToolAuthorization(manifest, { projectId })
  if (!derived.ok) return derived

  let index
  try {
    index = createNarrativeResourceIndex(buildAuthorizedSnapshot(derived.authorization))
  } catch (error) {
    return failure('authorized-index-build-failed', {
      errorCode: requiredText(error?.code) || 'NARRATIVE_RESOURCE_INDEX_FAILED'
    })
  }
  const validation = validateAuthorizedIndex(index, derived.authorization)
  if (!validation.ok) return validation
  let readonlyIndex
  try {
    readonlyIndex = createReadonlyAuthorizedIndex(index)
  } catch (error) {
    return failure('authorized-index-seal-failed', {
      errorCode: requiredText(error?.code) || 'NARRATIVE_RESOURCE_INDEX_SEAL_FAILED'
    })
  }
  return freezePlain({ ok: true, authorization: derived.authorization, index: readonlyIndex })
}

export default {
  createManifestAuthorizedNarrativeIndex,
  deriveManifestToolAuthorization
}
