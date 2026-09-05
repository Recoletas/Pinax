/**
 * 生成器合同（计划 §3.3 / §4.2）。
 *
 * 规则：
 * - 首版只允许一个 active world generator；Mapgen4 只是可选 terrain refinement；
 * - adapter 接收显式 seed/sub-seed，禁止读 `Math.random()`；
 * - 每阶段可取消，返回 typed progress/error；
 * - 失败不覆盖当前 MapDocument；
 * - 输出前执行 schema validation 和 feature ID uniqueness；
 * - 生成器不能写业务真源：输出只有 map-native feature、binding candidate、relation candidate。
 */

import type { MapDocumentV2, MapGeneratorReceipt } from '../model/mapDocumentV2'
import type { MapFeature } from '../model/mapFeature'
import type { MapBindingCandidate } from '../model/mapBindingV2'

export type GeneratorStage =
  | 'heightmap'
  | 'climate'
  | 'hydrology'
  | 'political'
  | 'settlements'
  | 'routes'
  | 'labels'
  | 'terrain-refine'

export interface GeneratorProgress {
  stage: GeneratorStage
  /** 0-1 */
  ratio: number
}

export type GeneratorErrorCode =
  | 'cancelled'
  | 'invalid-config'
  | 'worker-failed'
  | 'quota-exceeded'
  | 'validation-failed'

export interface GeneratorError {
  code: GeneratorErrorCode
  message: string
}

export interface RelationCandidate {
  /** 世界书地点身份对，或地图对象对（关系类型由上层语义决定）。 */
  fromKey: string
  toKey: string
  kind: 'adjacent' | 'river' | 'route'
  reason: string
}

/** 生成器输出的三类结果（计划 §3.3），不含任何业务写入。 */
export interface GeneratorOutput {
  document: MapDocumentV2
  bindingCandidates: MapBindingCandidate[]
  relationCandidates: RelationCandidate[]
}

export interface GeneratorRequest {
  seed: string
  /** 显式 sub-seed：局部重算不得影响其他稳定层（计划 P7）。 */
  subSeeds?: Partial<Record<GeneratorStage, string>>
  projectId: string
  worldbookId: string
  /** 生成目标版本号；生成器不得自行递增 revision。 */
  targetRevision: number
  signal?: AbortSignal
  onProgress?: (progress: GeneratorProgress) => void
}

export interface WorldGeneratorAdapter {
  id: MapGeneratorReceipt['id']
  version: string
  /** 上游 commit（adapted source 可追溯性）。 */
  upstreamCommit?: string
  generate(request: GeneratorRequest): Promise<GeneratorOutput>
}

/** config 稳定性哈希：同 seed + config 结构必须输出确定（计划 P7 退出条件）。 */
export function computeConfigHash(config: unknown): string {
  const stable = stableStringify(config ?? null)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < stable.length; i++) {
    const ch = stable.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

/** 输出前门禁：ID 唯一性（schema validation 由 validateMapDocumentV2 负责）。 */
export function assertUniqueFeatureIds(features: MapFeature[]): void {
  const seen = new Set<string>()
  for (const f of features) {
    if (seen.has(f.mapObjectId)) {
      throw new Error(`duplicate mapObjectId in generator output: ${f.mapObjectId}`)
    }
    seen.add(f.mapObjectId)
  }
}
