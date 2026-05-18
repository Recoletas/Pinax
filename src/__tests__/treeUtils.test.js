import { describe, it, expect } from 'vitest'

// Tree utility functions extracted from PoetryLab for testing

function flattenTree(tree) {
  if (!tree) return []
  const result = []
  const queue = [tree]
  const seen = new Set()
  while (queue.length) {
    const node = queue.shift()
    if (!node || seen.has(node)) continue
    seen.add(node)
    result.push(node)
    if (node.children?.length) {
      for (const child of node.children) queue.push(child)
    }
  }
  return result
}

function reindexTree(node, depth = 0, parentId = null, seen = new Set()) {
  if (!node) return null
  if (seen.has(node)) return node
  seen.add(node)
  node.depth = depth
  node.parentId = parentId
  node.children = (node.children || []).map((child) => reindexTree(child, depth + 1, node.id, seen))
  return node
}

function cloneTree(node) {
  if (!node) return null
  return {
    id: node.id,
    parentId: node.parentId || null,
    depth: Number(node.depth || 0),
    text: String(node.text || ''),
    example: node.example || null,
    feedbackScore: Number(node.feedbackScore || 0),
    extraFields: node.extraFields || null,
    children: Array.isArray(node.children) ? node.children.map((child) => cloneTree(child)) : []
  }
}

describe('Tree utilities', () => {
  describe('flattenTree', () => {
    it('should return empty array for null tree', () => {
      expect(flattenTree(null)).toEqual([])
    })

    it('should return empty array for undefined tree', () => {
      expect(flattenTree(undefined)).toEqual([])
    })

    it('should return single node in array', () => {
      const tree = { id: '1', text: 'root', children: [] }
      expect(flattenTree(tree)).toEqual([tree])
    })

    it('should flatten children in breadth-first order', () => {
      const tree = {
        id: '1',
        text: 'root',
        children: [
          { id: '2', text: 'child1', children: [] },
          { id: '3', text: 'child2', children: [] }
        ]
      }
      const result = flattenTree(tree)
      expect(result.map(n => n.id)).toEqual(['1', '2', '3'])
    })

    it('should handle deep nesting', () => {
      const tree = {
        id: '1',
        text: 'level0',
        children: [{
          id: '2',
          text: 'level1',
          children: [{
            id: '3',
            text: 'level2',
            children: []
          }]
        }]
      }
      const result = flattenTree(tree)
      expect(result.map(n => n.id)).toEqual(['1', '2', '3'])
    })

    it('should not duplicate nodes in cycles', () => {
      const child = { id: '2', text: 'child', children: [] }
      const tree = { id: '1', text: 'root', children: [child] }
      child.children.push(tree) // create cycle
      const result = flattenTree(tree)
      expect(result.length).toBe(2)
    })
  })

  describe('reindexTree', () => {
    it('should return null for null node', () => {
      expect(reindexTree(null)).toBeNull()
    })

    it('should set depth to 0 for root', () => {
      const node = { id: '1', children: [] }
      const result = reindexTree(node)
      expect(result.depth).toBe(0)
    })

    it('should set parentId to null for root', () => {
      const node = { id: '1', children: [] }
      const result = reindexTree(node)
      expect(result.parentId).toBeNull()
    })

    it('should set depth to 1 for first children', () => {
      const node = {
        id: '1',
        children: [{ id: '2', children: [] }]
      }
      const result = reindexTree(node)
      expect(result.children[0].depth).toBe(1)
    })

    it('should set parentId to parent id', () => {
      const node = {
        id: '1',
        children: [{ id: '2', children: [] }]
      }
      const result = reindexTree(node)
      expect(result.children[0].parentId).toBe('1')
    })

    it('should handle deep nesting', () => {
      const tree = {
        id: '1',
        children: [{
          id: '2',
          children: [{ id: '3', children: [] }]
        }]
      }
      const result = reindexTree(tree)
      expect(result.depth).toBe(0)
      expect(result.children[0].depth).toBe(1)
      expect(result.children[0].children[0].depth).toBe(2)
    })
  })

  describe('cloneTree', () => {
    it('should return null for null node', () => {
      expect(cloneTree(null)).toBeNull()
    })

    it('should clone all basic fields', () => {
      const node = {
        id: '1',
        parentId: null,
        depth: 0,
        text: 'hello',
        example: 'example text',
        feedbackScore: 50,
        extraFields: { foo: 'bar' },
        children: []
      }
      const clone = cloneTree(node)
      expect(clone.id).toBe('1')
      expect(clone.text).toBe('hello')
      expect(clone.example).toBe('example text')
      expect(clone.feedbackScore).toBe(50)
      expect(clone.extraFields).toEqual({ foo: 'bar' })
    })

    it('should create deep copy of children', () => {
      const node = {
        id: '1',
        children: [{ id: '2', children: [] }]
      }
      const clone = cloneTree(node)
      expect(clone.children[0]).not.toBe(node.children[0])
      expect(clone.children[0].id).toBe('2')
    })

    it('should convert text to string', () => {
      const node = { id: '1', text: 123, children: [] }
      const clone = cloneTree(node)
      expect(clone.text).toBe('123')
    })

    it('should default feedbackScore to 0', () => {
      const node = { id: '1', children: [] }
      const clone = cloneTree(node)
      expect(clone.feedbackScore).toBe(0)
    })

    it('should handle empty children array', () => {
      const node = { id: '1', children: [] }
      const clone = cloneTree(node)
      expect(clone.children).toEqual([])
    })
  })
})