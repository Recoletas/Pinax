import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  getResolvedApiSettings: vi.fn()
}))

vi.mock('../services/generationService', () => ({
  runGenerationTask: vi.fn()
}))

import { getResolvedApiSettings } from '../services/api'
import { runGenerationTask } from '../services/generationService'
import { generatePoetryDirectingTreeByLLM, parseLineTree } from '../services/poetryGeneration'
import { generateProseCardExtensions, parseCardBlock } from '../services/proseGeneration'
import { parseJsonFromAiContent, tryAiGenerateWorldbookJsonFromBrief } from '../services/worldbookImportGeneration'

const getResolvedApiSettingsMock = vi.mocked(getResolvedApiSettings)
const runGenerationTaskMock = vi.mocked(runGenerationTask)

describe('feature generation services', () => {
  beforeEach(() => {
    getResolvedApiSettingsMock.mockReset()
    runGenerationTaskMock.mockReset()
    getResolvedApiSettingsMock.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'key',
      model: 'demo'
    })
  })

  it('parses poetry line trees and tags directing generation tasks', async () => {
    const parsedTree = parseLineTree([
      'BEGIN_LINES',
      'L1|N1|P0|雨夜',
      'L2|N2|P1|路灯',
      'END_LINES'
    ].join('\n'))

    expect(parsedTree.title).toBe('雨夜')
    expect(parsedTree.children[0].title).toBe('路灯')

    runGenerationTaskMock.mockResolvedValueOnce({
      success: true,
      parsed: parsedTree,
      attempts: []
    })

    const result = await generatePoetryDirectingTreeByLLM('雨夜街道', 2, 2)

    expect(result).toBe(parsedTree)
    expect(runGenerationTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'poetry.directing-tree',
        baseMessages: expect.any(Array)
      })
    )
  })

  it('parses prose card blocks and tags prose extension tasks', async () => {
    const parsedCards = parseCardBlock('BEGIN_CARDS\n[{"content":"潮湿的窗台","emotion":"平静"}]\nEND_CARDS')
    expect(parsedCards).toEqual([{ content: '潮湿的窗台', emotion: '平静' }])

    runGenerationTaskMock.mockResolvedValueOnce({
      success: true,
      parsed: parsedCards,
      attempts: []
    })

    const result = await generateProseCardExtensions({
      cardContent: '潮湿的窗台',
      settings: { model: 'demo' }
    })

    expect(result.parsed).toEqual(parsedCards)
    expect(runGenerationTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'prose.expand-card',
        baseMessages: expect.any(Array)
      })
    )
  })

  it('parses worldbook JSON and tags quick import generation tasks', async () => {
    const parsedWorldbook = parseJsonFromAiContent('```json\n{"entries":[{"name":"灯塔"}]}\n```')
    expect(parsedWorldbook.entries[0].name).toBe('灯塔')

    runGenerationTaskMock.mockResolvedValueOnce({
      success: true,
      parsed: parsedWorldbook,
      attempts: []
    })

    const result = await tryAiGenerateWorldbookJsonFromBrief({
      genreLabel: '奇幻',
      brief: '灯塔守望者与海雾中的城邦。',
      targetCount: 6,
      nameHint: '雾港'
    })

    expect(result.ok).toBe(true)
    expect(result.parsed).toBe(parsedWorldbook)
    expect(runGenerationTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'worldbook.import.random',
        generationOptions: expect.objectContaining({
          response_format: { type: 'json_object' }
        })
      })
    )
  })
})
