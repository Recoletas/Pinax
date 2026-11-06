import { buildSourceChunks, normalizeSourceArtifact, normalizeSourceText, createFileInstanceId, hashSourceTextSha256, SOURCE_PARSE_SLOW_THRESHOLD_MS } from './worldbookSourceArchive'
import { extractEpub } from '../writing/epubAdapter'
import { loadSourcePdf, loadSourceMammoth } from './sourceParserLibraries.js'
import { createSourceParser } from '@pinax/core/worldbook/sourceParser'

export const { MAX_SOURCE_BYTES, MAX_PDF_SOURCE_BYTES, detectSourceKind, parseSourceFile, parseSourceFiles } = createSourceParser({ buildSourceChunks, normalizeSourceArtifact, normalizeSourceText, createFileInstanceId, hashSourceTextSha256, SOURCE_PARSE_SLOW_THRESHOLD_MS, extractEpub, loadPdf: loadSourcePdf, loadMammoth: loadSourceMammoth })
