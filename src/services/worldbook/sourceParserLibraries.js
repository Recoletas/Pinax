import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

export async function loadSourcePdf() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjs
}
export async function loadSourceMammoth() {
  const module = await import('mammoth')
  const library = module.default || module
  // Mammoth's browser entry expects arrayBuffer; its Node entry expects buffer.
  return { extractRawText: ({ buffer }) => library.extractRawText({ buffer, arrayBuffer: buffer }) }
}
