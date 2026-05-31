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
import {
  buildEditingPackage,
  buildEditingPackageZip,
  extractShotsFromChapter,
  extractShotsFromNarrativeAssets,
  extractShotsFromRelationCanvas,
  extractShotsFromProseEssay,
  toFCPXML,
  toJianyingDraft,
  toMarkdown,
  toPremiereCSV
} from '../services/shotExporter'

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
  it('extracts shots from relation canvas tree nodes', () => {
    const nodes = [
      {
        id: '1',
        text: '夜色',
        emotion: 'calm',
        extraFields: {
          shotType: 'wide',
          cameraMovement: 'pan',
          duration: 4
        },
        parentId: null
      },
      {
        id: '2',
        text: '路灯',
        examples: ['光线落在街角'],
        parentId: '1'
      }
    ]
    const shots = extractShotsFromRelationCanvas({
      nodes,
      edges: [{ sourceId: '1', targetId: '2', type: 'JUMP_CUT' }]
    })

    expect(shots.length).toBe(2)
    expect(shots[0].content).toBe('夜色')
    expect(shots[0].tone).toBe('淡蓝冷色调')
    expect(shots[1].dialogue).toBe('光线落在街角')
    expect(shots[1].transition).toBe('cut')
  })

  it('exports to markdown', () => {
    const md = toMarkdown([{ sequence: 1, content: '测试', shotType: 'wide', camera: 'fixed', duration: 3 }])
    expect(md).toContain('分镜脚本')
  })

  it('maps prose essay director fields into shared shots and premiere csv', () => {
    const shots = extractShotsFromProseEssay({
      cards: [
        {
          id: 'card-1',
          content: '街灯亮起',
          emotion: 'calm',
          extraFields: {
            shotType: 'wide',
            cameraMovement: 'pan',
            duration: 5,
            dialogue: '今晚很安静',
            soundEffects: '雨声'
          }
        }
      ],
      timeline: [
        {
          cardId: 'card-1',
          assetId: 'asset-1',
          order: 0,
          duration: 5,
          relationType: 'continuation',
          relationLabel: '前后镜',
          imageReferences: [{
            id: 'img-1',
            assetId: 'asset-img-1',
            source: 'asset',
            title: '街灯参考',
            width: 1024,
            height: 768
          }]
        }
      ]
    })

    const csv = toPremiereCSV(shots)
    const md = toMarkdown(shots)
    const jianying = toJianyingDraft(shots)
    const fcpxml = toFCPXML(shots)

    expect(shots[0].sound).toBe('雨声')
    expect(shots[0].assetId).toBe('asset-1')
    expect(shots[0].relationLabel).toBe('前后镜')
    expect(shots[0].imageReferences[0]).toMatchObject({ id: 'img-1', assetId: 'asset-img-1', source: 'asset' })
    expect(csv).toContain('序号,素材ID,关系,景别,运镜,时长(秒),画面描述,台词,音效,参考图')
    expect(csv).toContain('街灯亮起')
    expect(csv).toContain('雨声')
    expect(csv).toContain('街灯参考@asset 1024x768')
    expect(md).toContain('| 素材 | asset-1 |')
    expect(md).toContain('| 承接 | 前后镜 |')
    expect(md).toContain('| 参考图 | 街灯参考@asset 1024x768 |')
    expect(jianying.tracks.videoTracks[0].clips[0]).toMatchObject({
      assetId: 'asset-1',
      relation: { type: 'continuation', label: '前后镜' }
    })
    expect(jianying.tracks.videoTracks[0].clips[0].referenceImages[0].assetId).toBe('asset-img-1')
    expect(fcpxml).toContain('<asset_id>asset-1</asset_id>')
    expect(fcpxml).toContain('<relation_label>前后镜</relation_label>')
  })

  it('builds a stable editing package manifest and file list', () => {
    const shots = extractShotsFromProseEssay({
      cards: [
        {
          id: 'card-1',
          assetId: 'asset-1',
          content: '街灯亮起',
          extraFields: {
            shotType: 'wide',
            cameraMovement: 'pan',
            duration: 5
          }
        }
      ],
      timeline: [
        {
          cardId: 'card-1',
          assetId: 'asset-1',
          order: 0,
          relationType: 'continuation',
          relationLabel: '前后镜'
        }
      ]
    })

    const pkg = buildEditingPackage(shots, {
      topic: '雨夜街道',
      storyboardDocumentId: 'doc-1',
      storyboardVersionId: 'ver-1',
      exportedAt: '2026-05-28T00:00:00.000Z'
    })

    expect(pkg.schemaVersion).toBe(2)
    expect(pkg.manifest).toMatchObject({
      packageType: 'storyboard-editing-package',
      topic: '雨夜街道',
      shotCount: 1,
      durationSeconds: 5
    })
    expect(pkg.files.map((file) => file.path)).toEqual([
      'manifest.json',
      'storyboard.md',
      'premiere.csv',
      'jianying-draft.json',
      'timeline.fcpxml',
      'metadata.json'
    ])
    expect(pkg.formats.markdown).toContain('雨夜街道')
    expect(pkg.formats.premiereCsv).toContain('asset-1')
    expect(pkg.formats.metadata.storyboardVersionId).toBe('ver-1')
    expect(JSON.parse(pkg.files.find((file) => file.path === 'metadata.json').content).shots[0].relationLabel).toBe('前后镜')

    const zip = buildEditingPackageZip(pkg)
    const zipText = new TextDecoder().decode(zip)
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(zipText).toContain('manifest.json')
    expect(zipText).toContain('storyboard.md')
    expect(zipText).toContain('timeline.fcpxml')
    expect(zipText).toContain('metadata.json')
  })

  it('extracts shots from narrative assets and chapter outline blocks', () => {
    const assetShots = extractShotsFromNarrativeAssets({
      sourceLabel: '体验会话',
      assets: [
        {
          id: 'asset-1',
          kind: 'event',
          title: '雾港冲突',
          content: '主角在雾港发现旧案线索。'
        },
        {
          id: 'asset-2',
          kind: 'character-fact',
          title: '林舟的顾虑',
          content: '林舟不信任守卫。'
        }
      ]
    })

    const chapterShots = extractShotsFromChapter({
      chapterTitle: '第一章',
      outlineItems: [
        {
          id: 'outline-1',
          assetKind: 'draft-prose',
          title: '开场',
          content: '夜色压下来，街灯一盏盏亮起。'
        }
      ]
    })

    expect(assetShots).toHaveLength(2)
    expect(assetShots[0].notes).toContain('体验会话')
    expect(assetShots[0].shotType).toBe('wide')
    expect(chapterShots).toHaveLength(1)
    expect(chapterShots[0].notes).toContain('第一章')
    expect(chapterShots[0].content).toBe('开场')
  })
})
