import { computed } from 'vue'
import { useSceneBackground } from './useSceneBackground'

// 5C v3 P1.A: per-pose figure bounding box (% of parent). The "negative
// space" panel-slot is the inverse of this bbox. v0: all stub poses share
// the same default (figure upper-right, panel-slot = lower-left). v1 (post
// art regen): per-character art will ship real bboxes keyed by poseId.
const POSE_BBOX = {
  default: { top: 8, right: 36, bottom: 96, left: 64 },
  'opening-cover': { top: 8, right: 36, bottom: 96, left: 64 },
  'opening-scene-01': { top: 8, right: 36, bottom: 96, left: 64 },
  'opening-scene-02': { top: 8, right: 36, bottom: 96, left: 64 },
  'opening-scene-03': { top: 8, right: 36, bottom: 96, left: 64 },
}

export function usePoseSlots() {
  const { currentScenePoseId } = useSceneBackground()
  const bbox = computed(() => POSE_BBOX[currentScenePoseId.value] || POSE_BBOX.default)
  return { bbox, currentScenePoseId }
}
