// Version 1: Han code points + Unicode non-Han words. Internal apostrophes
// belong to a word; hyphens split words; numbers count; emoji/punctuation do not.
// Deliberately deterministic across ICU/browser versions. Never changes source.
export function writingTextMetrics(value, language = '') {
  const text = String(value ?? '')
  const han = (text.match(/\p{Script=Han}/gu) || []).length
  const words = (text.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu) || []).length
  return { version: 1, han, words, count: han + words, unit: language === 'en' && !han ? 'words' : 'characters-and-words', utf16Length: text.length }
}
export function countWritingText(value, language = '') { return writingTextMetrics(value, language).count }
