import { describe, it, expect } from 'vitest'
import { getItem, setItem, removeItem, STORAGE_KEYS } from '@/composables/useStorage'

describe('useStorage', () => {
  describe('getItem', () => {
    it('should return null for non-existent key', () => {
      const result = getItem('non_existent_key_xyz')
      expect(result).toBeNull()
    })

    it('should parse valid JSON', () => {
      localStorage.setItem('test_key', JSON.stringify({ foo: 'bar' }))
      const result = getItem('test_key')
      expect(result).toEqual({ foo: 'bar' })
      localStorage.removeItem('test_key')
    })

    it('should return null for invalid JSON', () => {
      localStorage.setItem('test_key', 'not valid json')
      const result = getItem('test_key')
      expect(result).toBeNull()
      localStorage.removeItem('test_key')
    })

    it('should return null for null localStorage value', () => {
      localStorage.setItem('test_key', 'null')
      const result = getItem('test_key')
      expect(result).toBeNull()
      localStorage.removeItem('test_key')
    })
  })

  describe('setItem', () => {
    it('should store JSON stringified value', () => {
      setItem('test_key', { foo: 'bar' })
      expect(localStorage.getItem('test_key')).toBe('{"foo":"bar"}')
      localStorage.removeItem('test_key')
    })

    it('should handle primitives', () => {
      setItem('test_key', 123)
      expect(localStorage.getItem('test_key')).toBe('123')
      localStorage.removeItem('test_key')
    })
  })

  describe('removeItem', () => {
    it('should remove item from localStorage', () => {
      localStorage.setItem('test_key', 'value')
      removeItem('test_key')
      expect(localStorage.getItem('test_key')).toBeNull()
    })
  })

  describe('STORAGE_KEYS', () => {
    it('should have all required keys', () => {
      expect(STORAGE_KEYS.QUICK_NOTE_DRAFT).toBeDefined()
      expect(STORAGE_KEYS.WRITING_BOOKS).toBeDefined()
      expect(STORAGE_KEYS.PROSE_CARDS_V1).toBeDefined()
      expect(STORAGE_KEYS.POETRY_IDEA_TREE_V2).toBeDefined()
      expect(STORAGE_KEYS.API_SETTINGS).toBeDefined()
      expect(STORAGE_KEYS.GAME_SETTINGS).toBeDefined()
    })

    it('should have versioned keys for prose and poetry', () => {
      expect(STORAGE_KEYS.PROSE_CARDS_V1).toContain('_v1')
      expect(STORAGE_KEYS.POETRY_IDEA_TREE_V2).toContain('_v2')
    })
  })
})