/**
 * 核心服务集成测试（精简版）
 */

import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt,
  buildPromptSequence,
  buildNarrativeConstraints
} from '../services/promptBuilder'
import { getShotTypes, inferShotTypeFromEmotion } from '../types/director'
import { extractShotsFromPoetryLab, toMarkdown } from '../services/shotExporter'

describe('PromptBuilder', () => {
  it('builds system prompt with style', () => {
    const prompt = buildSystemPrompt('narrator', { style: 'webnovel' })
    expect(prompt).toContain('网文风')
  })

  it('builds narrative constraints', () => {
    const prompt = buildNarrativeConstraints({ currentPeriod: '清晨', currentScene: '酒馆' })
    expect(prompt).toContain('清晨')
    expect(prompt).toContain('硬性约束')
  })

  it('builds complete prompt sequence', () => {
    const messages = buildPromptSequence({
      templateKey: 'narrator',
      worldBookEntries: [{ name: '测试', type: 'character', content: '测试内容' }]
    })
    expect(messages.length).toBeGreaterThan(0)
  })
})

describe('Director Types', () => {
  it('provides shot types', () => {
    const types = getShotTypes()
    expect(types.length).toBe(5)
  })

  it('infers shot type from emotion', () => {
    expect(inferShotTypeFromEmotion('fear')).toBe('extreme_close_up')
  })
})

describe('ShotExporter', () => {
  it('extracts shots from nodes', () => {
    const nodes = [
      { id: '1', content: '夜色', extraFields: { shotType: 'wide' } }
    ]
    const shots = extractShotsFromPoetryLab({ nodes, edges: [] })
    expect(shots.length).toBe(1)
    expect(shots[0].content).toBe('夜色')
  })

  it('exports to markdown', () => {
    const md = toMarkdown([{ sequence: 1, content: '测试', shotType: 'wide', camera: 'fixed', duration: 3 }])
    expect(md).toContain('分镜脚本')
  })
})
