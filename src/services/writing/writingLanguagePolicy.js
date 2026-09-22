import { resolveWritingLanguagePolicy } from '../../../shared/writingLanguage.js'
import { getAssistantLanguage } from '../../i18n/index.js'
import { loadWritingBooks, findWritingBook } from './writingBooksRepository.js'
export function getBookLanguage(projectId) {
  return findWritingBook(loadWritingBooks(), projectId)?.manuscriptLanguage || ''
}
export function freezeWritingLanguage({ projectId, text = '', manuscriptLanguage, outputLanguage = '' } = {}) {
  return resolveWritingLanguagePolicy({ manuscriptLanguage: manuscriptLanguage ?? getBookLanguage(projectId), assistantLanguage: getAssistantLanguage(), outputLanguage, text })
}
