/**
 * 可信说话者注册表（P4）。
 *
 * 从 player、dialogueCharacter、SceneCast、encounteredCharacters 和世界书角色条目构建。
 * marker speaker 解析返回 verified / unresolved / message-fallback 三种状态。
 * 只有 verified 或可信 message-fallback 才显示 speaker label；未知名称 → 未署名对白。
 */

function text(value, limit = 80) {
  return String(value ?? '').replace(/[\r\n|<>]/g, '').trim().slice(0, limit)
}

/**
 * 构建说话者注册表条目列表。
 * @param {{ player?, dialogueCharacter?, cast?, encountered?, worldbookCharacters? }} sources
 * @returns {Array<{speakerId, displayName, aliases, entityType, canSpeak, source}>}
 */
export function buildSpeakerRegistry(sources = {}) {
  const entries = []
  const push = (speakerId, displayName, entityType, source, canSpeak = true, aliases = []) => {
    const name = text(displayName)
    if (!name || !speakerId) return
    // 去重：同 speakerId 不重复
    if (entries.some((e) => e.speakerId === speakerId)) {
      const existing = entries.find((e) => e.speakerId === speakerId)
      if (name && !existing.aliases.includes(name) && existing.displayName !== name) {
        existing.aliases.push(name)
      }
      return
    }
    entries.push({ speakerId, displayName: name, aliases: aliases.map(text).filter(Boolean), entityType, canSpeak, source })
  }

  const player = sources.player
  if (player?.name) push('player', player.name, 'player', 'player')

  const dialogue = sources.dialogueCharacter
  if (dialogue?.name) push(`char:${dialogue.id || dialogue.name}`, dialogue.name, 'character', 'active-dialogue')

  for (const member of Array.isArray(sources.cast) ? sources.cast : []) {
    if (member?.name) push(member.speakerId || `char:${member.name}`, member.name, 'character', 'scene-cast')
  }

  for (const character of Array.isArray(sources.encountered) ? sources.encountered : []) {
    const name = text(character?.name || character)
    if (name) push(`char:${character?.id || name}`, name, 'character', 'runtime')
  }

  for (const character of Array.isArray(sources.worldbookCharacters) ? sources.worldbookCharacters : []) {
    const name = text(character?.name)
    if (name) push(`char:${character?.id || name}`, name, 'character', 'worldbook')
  }

  return entries
}

/**
 * 解析 speaker 名称 → trust 状态。
 * @returns {{ verified: boolean, speakerId: string, displayName: string, speakerRaw: string }}
 */
export function resolveSpeakerName(registry, name) {
  const cleaned = text(name)
  if (!cleaned || !Array.isArray(registry) || !registry.length) {
    return { verified: false, speakerId: '', displayName: cleaned, speakerRaw: cleaned }
  }
  const entry = registry.find((e) => (
    e.displayName === cleaned || e.aliases?.includes(cleaned)
  ))
  if (entry?.canSpeak) {
    return { verified: true, speakerId: entry.speakerId, displayName: entry.displayName, speakerRaw: cleaned }
  }
  // Unresolved → 未知名称，不显示伪造姓名
  return { verified: false, speakerId: '', displayName: '', speakerRaw: cleaned }
}

export default { buildSpeakerRegistry, resolveSpeakerName }
