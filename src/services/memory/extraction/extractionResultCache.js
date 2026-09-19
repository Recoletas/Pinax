// M07（nightly-20260918）：按原文修订冻结的提取结果缓存。
// 键 = 规范化（sourceRef, sourceRevision, 冻结原文）哈希——重复请求命中、
// 修订或原文变化不命中。缓存的是模型**原始解析输出**；逐项校验
//（validateMemoryExtractionResponse）每次调用重新执行，knownIdentities
// 变化不会吃到过期校验结果。存储为 localStorage 有界 LRU（可丢弃的派生
// 数据，刻意不进备份注册表）。
import { sha256HexOfText } from '../../contentHash'

const CACHE_KEY = 'memory_extraction_result_cache_v1'
const CACHE_LIMIT = 50

function readEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry.key === 'string' && entry.parsed) : []
  } catch {
    return []
  }
}

function writeEntries(entries) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, CACHE_LIMIT)))
  } catch {
    // 配额/不可写：缓存是优化不是依赖，静默放弃。
  }
}

// 缓存键：三要素缺一不可（同 ref 不同修订/同修订不同原文都是不同请求）。
export function extractionCacheKey({ sourceRef = '', sourceRevision = '', sourceText = '' } = {}) {
  // JSON 数组序列化定界，避免字符串拼接歧义；sha256 对确定文本稳定。
  return `sha256-${sha256HexOfText(JSON.stringify([String(sourceRef || ''), String(sourceRevision || ''), String(sourceText || '')]))}`
}

export function readCachedExtraction(key) {
  const entries = readEntries()
  const index = entries.findIndex(entry => entry.key === key)
  if (index < 0) return null
  const [entry] = entries.splice(index, 1)
  entries.unshift(entry)
  writeEntries(entries)
  return { parsed: entry.parsed, cachedAt: entry.cachedAt || null }
}

export function writeCachedExtraction(key, parsed) {
  if (!key || !parsed) return
  const entries = readEntries().filter(entry => entry.key !== key)
  entries.unshift({ key, parsed, cachedAt: Date.now() })
  writeEntries(entries)
}

export function clearCachedExtractions() {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* 尽力而为 */ }
}
