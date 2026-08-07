import { describe, expect, it } from 'vitest'
import { generatePlaceFleshOut } from '../services/settingPlaceGeneration.js'

const worldbook = { id: 'w', updatedAt: '1', worldDescription: 'desc' }

describe('place flesh-out truncation resilience', () => {
  it('requests enough output tokens to comfortably fit a strict-schema place JSON', async () => {
    let captured = null
    const impl = async (request) => {
      captured = request
      return { drafts: { places: [{ name: '幽冥城', kind: 'fortress', scale: 'regional', aliases: [], terrainHints: [], keywords: [], description: 'desc', relations: [] }] } }
    }
    const result = await generatePlaceFleshOut({
      worldbook,
      seed: { name: '幽冥城', kind: 'fortress', scale: 'regional' },
      sendStructuredGenerationImpl: impl
    })
    expect(result.ok).toBe(true)
    expect(captured.options.max_tokens).toBeGreaterThanOrEqual(4000)
  })

  it('surfaces a clear Chinese message when the upstream response is truncated', async () => {
    const impl = async () => {
      const err = new Error('upstream incomplete')
      err.code = 'STRUCTURED_GENERATION_RESPONSE_INCOMPLETE'
      throw err
    }
    const result = await generatePlaceFleshOut({
      worldbook,
      seed: { name: '幽冥城', kind: 'fortress', scale: 'regional' },
      sendStructuredGenerationImpl: impl
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('STRUCTURED_GENERATION_RESPONSE_INCOMPLETE')
    expect(result.reason).toContain('截断')
    expect(result.place).toBeNull()
  })

  it('allows create mode with no name (model invents the name)', async () => {
    const impl = async () => ({
      drafts: { places: [{ name: '涌现场', kind: 'site', scale: 'local', aliases: [], terrainHints: [], keywords: [], description: 'desc', relations: [] }] }
    })
    const result = await generatePlaceFleshOut({
      worldbook,
      seed: { name: '' },
      mode: 'create',
      sendStructuredGenerationImpl: impl
    })
    expect(result.ok).toBe(true)
    expect(result.place.name).toBe('涌现场')
  })

  it('still rejects expand mode with no name', async () => {
    const impl = async () => ({ drafts: { places: [] } })
    const result = await generatePlaceFleshOut({
      worldbook,
      seed: { name: '' },
      mode: 'expand',
      sendStructuredGenerationImpl: impl
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('PLACE_SEED_NAME_EMPTY')
  })
})