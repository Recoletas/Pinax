import { ref } from 'vue'

// 5C step 4: scene background state. Module-level ref so every consumer
// (CharacterBackdrop in OpeningPage + CharacterArchiveStrip tile highlight
// + future inline-detail overlays) reads the same currentScenePoseId.
const currentScenePoseId = ref('opening-cover')

export function useSceneBackground() {
  return {
    currentScenePoseId,
    setScene(poseId) {
      currentScenePoseId.value = poseId
    },
  }
}
