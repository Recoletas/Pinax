import { characterArt } from '@/config/characterArt'

export function useCharacterArt() {
  function resolveArt({ poseId }) {
    if (typeof poseId !== 'string' || poseId === '') {
      throw new Error(`useCharacterArt: poseId must be a non-empty string, got ${JSON.stringify(poseId)}`)
    }
    const entry = characterArt.find((e) => e.id === poseId)
    if (!entry) {
      throw new Error(`useCharacterArt: unknown poseId "${poseId}"`)
    }
    return { src: entry.src, status: entry.status, label: entry.label }
  }
  return { resolveArt }
}
