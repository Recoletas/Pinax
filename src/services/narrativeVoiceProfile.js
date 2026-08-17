export const NARRATIVE_VOICE_LIMITS = Object.freeze({
  maxStoredSamples: 6,
  maxStoredSampleChars: 240,
  maxSpeechStyleChars: 240,
  maxKernelSamples: 3,
  maxKernelVoiceChars: 720
})

const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)

function sampleText(value) {
  return clean(typeof value === 'string' ? value : value?.text, NARRATIVE_VOICE_LIMITS.maxStoredSampleChars)
}

export function extractMesExampleSamples(value, characterName = '') {
  const name = clean(characterName, 120)
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^([^:：]{1,80})\s*[:：]\s*(.+)$/)
      if (!match) return ''
      const speaker = clean(match[1], 80).replace(/^\{\{char\}\}$/i, name)
      return !name || speaker === name ? sampleText(match[2]) : ''
    })
    .filter(Boolean)
}

export function normalizeNarrativeVoiceProfile(input = {}, characterName = '') {
  const source = input?.voice && typeof input.voice === 'object' ? { ...input, ...input.voice } : input
  const rawSamples = Array.isArray(source?.samples)
    ? source.samples
    : source?.samples
      ? String(source.samples).split(/\r?\n/)
      : extractMesExampleSamples(source?.mes_example ?? source?.mesExample, characterName)
  const samples = [...new Set(rawSamples.map(sampleText).filter(Boolean))]
    .slice(0, NARRATIVE_VOICE_LIMITS.maxStoredSamples)
  return {
    speechStyle: clean(source?.speechStyle ?? source?.speakingStyle, NARRATIVE_VOICE_LIMITS.maxSpeechStyleChars),
    samples
  }
}

export function toKernelVoiceProfile(input = {}, characterName = '') {
  const profile = normalizeNarrativeVoiceProfile(input, characterName)
  let used = profile.speechStyle.length
  const samples = []
  for (const sample of profile.samples.slice(0, NARRATIVE_VOICE_LIMITS.maxKernelSamples)) {
    if (used + sample.length > NARRATIVE_VOICE_LIMITS.maxKernelVoiceChars) break
    samples.push(sample)
    used += sample.length
  }
  return { speechStyle: profile.speechStyle, samples }
}
