import { ref, shallowRef, watch } from 'vue'
import { listWorldEditions, readWorldEdition } from '../services/memory/ledger/worldModelWorkspace'
import { tr } from '../i18n'

export function useWorldManuscriptEditions({ tab, revision, getScope, runLedger, clearPosition }) {
  const editions = shallowRef([])
  const editionId = ref('')
  const edition = shallowRef(null)
  const editionError = ref('')
  watch([tab, revision], async ([view], _, onCleanup) => {
    let active = true
    onCleanup(() => { active = false })
    if (view !== 'reader' && view !== 'uses') {
      editionId.value = ''
      editions.value = []
      return
    }
    editionError.value = ''
    try {
      const result = await runLedger(db => listWorldEditions(db, { scope: getScope() }))
      if (!active) return
      if (!result.ok) throw new Error(result.reason)
      editions.value = result.items
    } catch (error) {
      if (active) editionError.value = error.message
    }
  })
  watch(editionId, async (id, _, onCleanup) => {
    let active = true
    onCleanup(() => { active = false })
    edition.value = null
    editionError.value = ''
    clearPosition(editions.value.find(item => item.id === id)?.recordedSeq ?? null)
    if (!id) return
    try {
      const result = await runLedger(db => readWorldEdition(db, { scope: getScope(), editionId: id }))
      if (!active) return
      if (!result) throw new Error(tr('无法读取所选稿面修订。'))
      edition.value = result
    } catch (error) {
      if (active) editionError.value = error.message
    }
  }, { flush: 'sync' })
  return { editions, editionId, edition, editionError }
}
