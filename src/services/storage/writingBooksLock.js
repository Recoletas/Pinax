// Only the synchronous part of the callback can publish chapter changes.
// The browser retains the actual lock until an async callback settles.
let insideWriter = false
export const ownsWritingBooksLock = () => insideWriter

export function withWritingBooksLock(action) {
  if (!globalThis.navigator?.locks?.request) return action()
  return navigator.locks.request('pinax-writing-books-save', () => {
    insideWriter = true
    try { return action() } finally { insideWriter = false }
  })
}
