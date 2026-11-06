import { createProjectOutlineRepository } from '@pinax/core/usecases/projectOutlineRepository'
import { findWritingBook, loadWritingBooks, saveWritingBooksDurable } from './writingBooksRepository.js'
import { mutationFailure, mutationSuccess } from '../storage/durableMutationResult.js'
export * from '@pinax/core/usecases/projectOutlineRepository'
export const { listOutlineNodes, listOutlineEdges, getOutlineNode, upsertOutlineNode, addOutlineEdge, removeOutlineEdge, updateChapterMapping } = createProjectOutlineRepository({ findWritingBook, loadWritingBooks, saveWritingBooksDurable, mutationFailure, mutationSuccess })
