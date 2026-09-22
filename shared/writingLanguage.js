// Pure language policy. UI locale never enters manuscript identity or offsets.
export const WRITING_LANGUAGES = Object.freeze(['', 'zh-CN', 'en', 'mixed'])
export function normalizeManuscriptLanguage(value) {
  return WRITING_LANGUAGES.includes(value) ? value : ''
}
export function inferWritingLanguage(text) {
  const source = String(text || '')
  const han = (source.match(/\p{Script=Han}/gu) || []).length
  const latin = (source.match(/\p{Script=Latin}/gu) || []).length
  if (han && latin && Math.min(han, latin) / Math.max(han, latin) > 0.2) return 'mixed'
  return han > latin ? 'zh-CN' : latin ? 'en' : ''
}
export function resolveWritingLanguagePolicy({ manuscriptLanguage = '', assistantLanguage = 'zh-CN', outputLanguage = '', text = '' } = {}) {
  return Object.freeze({
    manuscriptLanguage: normalizeManuscriptLanguage(manuscriptLanguage),
    assistantLanguage: assistantLanguage === 'en' ? 'en' : 'zh-CN',
    outputLanguage: normalizeManuscriptLanguage(outputLanguage) || inferWritingLanguage(text) || normalizeManuscriptLanguage(manuscriptLanguage)
  })
}
export function validateWritingLanguagePolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['manuscriptLanguage', 'assistantLanguage', 'outputLanguage'].includes(key))
    || !WRITING_LANGUAGES.includes(value.manuscriptLanguage)
    || !['zh-CN', 'en'].includes(value.assistantLanguage)
    || !WRITING_LANGUAGES.includes(value.outputLanguage)) return { valid: false, reason: 'invalid-language-policy' }
  return { valid: true, policy: Object.freeze({ ...value }) }
}
export function writingLanguageInstruction(policy) {
  if (!validateWritingLanguagePolicy(policy).valid) return ''
  const output = policy.outputLanguage === 'en' ? 'English' : policy.outputLanguage === 'zh-CN' ? 'Simplified Chinese' : 'the original passage language(s), preserving mixed language'
  return `Language contract: explanations, answer, reason and rationale must use ${policy.assistantLanguage === 'en' ? 'English' : 'Simplified Chinese'}, unless the author explicitly requests another explanation language in this task. Replacement and new manuscript text use ${output}, unless the author explicitly requests another output language in this task. Copy exact/quote and names verbatim, without translation or Unicode normalization. Keep JSON keys, IDs and enum values unchanged. Preserve the author’s spelling convention, tense, point of view and quotation style. Do not translate the manuscript when explaining it. Language is not a reason to increase the token budget.`
}
export function defaultWritingTitle(kind, language, index = 1) {
  const en = language === 'en'
  return ({ chapter: en ? `Chapter ${index}` : `第 ${index} 章`, book: en ? 'Untitled manuscript' : '未命名作品', body: en ? 'Manuscript' : '正文', preface: en ? 'Front matter' : '卷首', imported: en ? 'Imported manuscript' : '导入书稿' })[kind]
}
