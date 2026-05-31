import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/composables/useStorage'
import {
  buildWritingNoteTitle,
  createWritingNote,
  createWritingNoteFromAsset,
  listWritingNotes,
  replaceWritingNotes,
  prependWritingNote
} from '@/services/writingNotes'

describe('writingNotes', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.WRITING_NOTES)
  })

  it('builds note titles from content first line', () => {
    expect(buildWritingNoteTitle('第一行标题\n第二行内容', '速记')).toBe('第一行标题')
  })

  it('prepends normalized notes into storage', () => {
    const note = prependWritingNote({
      title: '  ',
      content: '  第一段素材  ',
      wordCount: 4,
      source: {
        type: 'narrative-asset',
        assetId: 'asset-1',
        assetKind: 'event'
      }
    })

    expect(note.title).toBe('第一段素材')
    expect(note.content).toBe('第一段素材')
    expect(note.wordCount).toBe(4)
    expect(note.source).toMatchObject({
      type: 'narrative-asset',
      assetId: 'asset-1',
      assetKind: 'event'
    })
    expect(listWritingNotes()).toHaveLength(1)
    expect(listWritingNotes()[0].title).toBe('第一段素材')
  })

  it('creates a writing note from an asset with source metadata', () => {
    const note = createWritingNoteFromAsset({
      id: 'asset-9',
      title: '雾港',
      content: '名称：雾港\n关键词：潮湿、雾气',
      kind: 'worldbook-draft',
      projectId: 'book-1',
      source: {
        type: 'experience-session',
        id: 'session-1',
        messageIds: ['m1', 'm2']
      }
    })

    expect(note).toMatchObject({
      title: '雾港',
      content: '名称：雾港\n关键词：潮湿、雾气',
      contentFormat: 'md',
      source: {
        type: 'narrative-asset',
        assetId: 'asset-9',
        assetKind: 'worldbook-draft',
        projectId: 'book-1',
        sourceType: 'experience-session',
        sourceId: 'session-1'
      }
    })
  })

  it('creates a note with a generated title when content is empty', () => {
    const note = createWritingNote({
      title: '',
      content: '',
      fallbackLabel: '素材'
    })

    expect(note.title).toContain('素材 ')
    expect(note.content).toBe('')
  })

  it('rejects empty material content', () => {
    expect(() => prependWritingNote({ content: '   ' })).toThrow('素材内容不能为空')
  })

  it('replaces the full note list', () => {
    const next = replaceWritingNotes([
      {
        id: 'note-1',
        title: '旧标题',
        content: '第一条内容',
        wordCount: 5
      },
      {
        id: 'note-2',
        title: '',
        content: '第二条内容'
      }
    ])

    expect(next).toHaveLength(2)
    expect(listWritingNotes()).toHaveLength(2)
    expect(listWritingNotes()[0]).toMatchObject({
      id: 'note-1',
      title: '旧标题',
      content: '第一条内容',
      wordCount: 5
    })
    expect(listWritingNotes()[1].title).toBe('第二条内容')
  })
})
