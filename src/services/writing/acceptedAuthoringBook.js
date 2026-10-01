import { readonly, shallowRef } from 'vue'

const acceptedBookId = shallowRef('')

// Published only when Authoring's book activation transaction accepts a switch.
// Observer/memory project ids cannot change the visible author's selection.
export const acceptedAuthoringBookId = readonly(acceptedBookId)

export function publishAcceptedAuthoringBookId(bookId) {
  acceptedBookId.value = String(bookId || '').trim()
}
