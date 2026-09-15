/**
 * U4：可信 speaker → 视觉 tone 的稳定映射。
 *
 * 只消费已有展示字段（speakerId / speaker / role），不参与角色识别，
 * 不修改消息数据。同一 key 永远同一 tone；未知/空 → neutral。
 * tone 数量上限 4（不含 neutral），对应主题低饱和 token。
 */

export const SPEAKER_TONES = Object.freeze(['olive', 'rose', 'gold', 'teal'])
const NEUTRAL = 'neutral'

function hashKey(value) {
  let hash = 2166136261
  const source = String(value || '')
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * @param {{ speakerId?: string, speaker?: string, role?: string }|null} block
 * @returns {'olive'|'rose'|'gold'|'teal'|'neutral'} 稳定 tone；玩家固定 teal
 */
export function speakerToneOf(block = {}) {
  const speakerId = String(block?.speakerId || '').trim()
  const name = String(block?.speaker || '').trim()
  if (!speakerId && !name) {
    return block?.role === 'user' ? 'teal' : NEUTRAL
  }
  // 玩家固定 teal（与 NPC 区分的稳定信号）
  if (speakerId === 'player' || block?.role === 'user') return 'teal'
  const key = speakerId || name
  return SPEAKER_TONES[hashKey(key) % SPEAKER_TONES.length]
}

/** 组 class 计算：连续同 speaker 的 block 只在组首带 start、组尾带 end。 */
export function speakerGroupMarkers(blocks = []) {
  const markers = []
  let previousSpeaker = null
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index] || {}
    const current = String(block?.speakerId || block?.speaker || '').trim()
    const next = blocks[index + 1]
    const nextSpeaker = next ? String(next?.speakerId || next?.speaker || '').trim() : ''
    markers.push({
      speakerGroupStart: Boolean(current) && current !== previousSpeaker,
      speakerGroupEnd: Boolean(current) && current !== nextSpeaker
    })
    previousSpeaker = current
  }
  return markers
}

export default { SPEAKER_TONES, speakerToneOf, speakerGroupMarkers }
