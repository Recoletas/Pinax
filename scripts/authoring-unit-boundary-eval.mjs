/* eslint-disable no-console */
// F1-4 offline calibration over the repository's imported Authoring fixture.
// This is an eval, not a core Vitest suite: it reports semantic boundary
// failure classes without spending the 20-file / 200-test budget.
import fs from 'node:fs'
import path from 'node:path'
import { createSceneBeatDraft } from '../src/services/agents/authoring/unitSemanticProjection.js'

const fixturePath = path.resolve(process.env.AUTHORING_FIXTURE || 'tmp/authoring-rollout/fixture-localstorage.json')
const outputPath = path.resolve(process.env.AUTHORING_BOUNDARY_REPORT || 'tmp/authoring-rollout/f1/f1-4-boundary-eval.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const books = JSON.parse(fixture.writing_books || '[]')
const chapters = books.flatMap((book) => (book.chapters || []).map((chapter) => ({
  book: book.title,
  title: chapter.title,
  text: String(chapter.content || '')
}))).filter((chapter) => chapter.text.trim())

function paragraphIndex(draft, paragraphId) {
  return draft.paragraphs.findIndex((paragraph) => paragraph.id === paragraphId)
}

function reviewChapter(chapter) {
  const draft = createSceneBeatDraft({ text: chapter.text })
  const splitBoundaries = draft.boundaries.filter((boundary) => boundary.split)
  const missedSceneTransitions = draft.paragraphs.flatMap((paragraph, index) => {
    if (index === 0 || !paragraph.axes.functions.includes('transition')) return []
    const boundary = draft.boundaries[index - 1]
    return boundary?.split ? [] : [{ paragraph: paragraph.text.slice(0, 80), boundaryKey: boundary?.key || '' }]
  })
  const dialogueFragmentation = splitBoundaries.flatMap((boundary) => {
    const index = paragraphIndex(draft, boundary.beforeParagraphId)
    const previous = draft.paragraphs[index - 1]
    const current = draft.paragraphs[index]
    const bothDialogue = previous?.axes.functions.includes('dialogue') && current?.axes.functions.includes('dialogue')
    return bothDialogue && boundary.reason !== 'readability-pressure'
      ? [{ previous: previous.text.slice(0, 60), current: current.text.slice(0, 60), reason: boundary.reason }]
      : []
  })
  const mergeReview = draft.units.filter((unit) => unit.paragraphIds.length > 10 || unit.text.length > 760)
    .map((unit) => ({ paragraphs: unit.paragraphIds.length, chars: unit.text.length, preview: unit.preview }))
  return {
    book: chapter.book,
    chapter: chapter.title,
    chars: chapter.text.length,
    paragraphs: draft.paragraphs.length,
    proposedUnits: draft.units.length,
    legacyFixedThreeUnits: Math.ceil(draft.paragraphs.length / 3),
    mechanicalThreePacking: draft.paragraphs.length >= 6 && draft.units.length === Math.ceil(draft.paragraphs.length / 3),
    classifications: {
      erroneousMergeReview: mergeReview,
      overFragmentationReview: splitBoundaries
        .filter((boundary) => boundary.reason === 'readability-pressure')
        .map((boundary) => ({ boundaryKey: boundary.key, reason: boundary.reason })),
      crossSceneOrMissedTransition: missedSceneTransitions,
      dialogueFragmentation,
      acceptableBoundaries: splitBoundaries
        .filter((boundary) => boundary.reason !== 'readability-pressure').length
    }
  }
}

const chapterReports = chapters.map(reviewChapter)
const longChapter = [...chapterReports].sort((left, right) => right.chars - left.chars)[0] || null
const summary = {
  chapterCount: chapterReports.length,
  longestChapter: longChapter?.chapter || '',
  longestChapterChars: longChapter?.chars || 0,
  longestChapterAvoidsFixedThree: Boolean(longChapter && !longChapter.mechanicalThreePacking),
  missedSceneTransitions: chapterReports.reduce((sum, chapter) => sum + chapter.classifications.crossSceneOrMissedTransition.length, 0),
  dialogueFragmentation: chapterReports.reduce((sum, chapter) => sum + chapter.classifications.dialogueFragmentation.length, 0),
  mergeReviewCount: chapterReports.reduce((sum, chapter) => sum + chapter.classifications.erroneousMergeReview.length, 0),
  readabilityReviewCount: chapterReports.reduce((sum, chapter) => sum + chapter.classifications.overFragmentationReview.length, 0)
}

const report = { generatedAt: new Date().toISOString(), fixture: path.relative(process.cwd(), fixturePath), summary, chapters: chapterReports }
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`[f1-4-boundary] chapters=${summary.chapterCount} longest=${summary.longestChapterChars} fixedThree=${!summary.longestChapterAvoidsFixedThree} missedTransitions=${summary.missedSceneTransitions} dialogueFragmentation=${summary.dialogueFragmentation} mergeReview=${summary.mergeReviewCount} readabilityReview=${summary.readabilityReviewCount}`)
if (!summary.longestChapterAvoidsFixedThree || summary.missedSceneTransitions || summary.dialogueFragmentation || summary.mergeReviewCount) process.exitCode = 1
