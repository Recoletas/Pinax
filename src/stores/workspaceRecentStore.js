import { defineStore } from 'pinia'
import {
  getWorkspaceRecentSnapshot,
  resolveWorkspaceRecentEntries,
  resolveWorkspaceRecentEntry,
  subscribeWorkspaceRecentHistory
} from '../services/workspace/workspaceRecentHistory.js'

let stopHistory = null
let resolutionSequence = 0

export const useWorkspaceRecentStore = defineStore('workspaceRecent', {
  state: () => ({ entries: [], resolvedEntries: [], hydrated: false, persistenceNotice: '' }),
  getters: {
    continueEntry: state => state.resolvedEntries[0] || null,
    bookLastUsedAt: state => state.entries.reduce((index, entry) => {
      index[entry.bookId] = Math.max(index[entry.bookId] || 0, entry.lastUsedAt)
      return index
    }, Object.create(null))
  },
  actions: {
    hydrate() {
      const apply = snapshot => {
        this.entries = snapshot.entries
        this.persistenceNotice = snapshot.persistenceNotice
        this.refreshResolvedEntries()
      }
      if (this.hydrated) { this.refreshResolvedEntries(); return }
      this.hydrated = true
      apply(getWorkspaceRecentSnapshot())
      if (!stopHistory) stopHistory = subscribeWorkspaceRecentHistory(apply)
    },
    async refreshResolvedEntries() {
      const sequence = ++resolutionSequence
      const resolved = await resolveWorkspaceRecentEntries(this.entries)
      if (sequence !== resolutionSequence) return
      this.resolvedEntries = resolved.filter(entry => entry.reason !== 'book-removed')
    },
    async resolveForOpen(entry) {
      const resolved = await resolveWorkspaceRecentEntry(entry)
      if (!resolved.available) {
        this.resolvedEntries = this.resolvedEntries.map(item => item.key === entry.key ? resolved : item)
      }
      return resolved
    }
  }
})
