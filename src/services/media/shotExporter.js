import { getAssetKindLabel } from './narrativeAssets'
import { getChapterMarkdown } from '../writing/writingDocumentSchema.js'
import { createShotExporter } from '@pinax/core/media/shotExporter'

const module = createShotExporter({ getAssetKindLabel, getChapterMarkdown })
export const { extractShotsFromRelationCanvas, extractShotsFromProseEssay, extractShotsFromNarrativeAssets, extractShotsFromChapter, toJianyingDraft, toFCPXML, toMarkdown, toPremiereCSV, buildEditingPackage, buildEditingPackageZip } = module
export default module.defaultApi
