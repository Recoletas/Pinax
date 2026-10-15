import { getMediaAsset } from '../media/mediaAssetStore.js'
import { tr } from '../../i18n/index.js'

// Editor JSON keeps the asset ID. The image URL only lives in this node view.
export function createWritingMediaReferenceView(initialNode) {
  const dom = document.createElement('figure')
  dom.setAttribute('data-media-reference', '')
  dom.contentEditable = 'false'
  const image = document.createElement('img')
  image.className = 'writing-media-reference__image'
  image.draggable = false
  image.hidden = true
  const caption = document.createElement('figcaption')
  caption.className = 'writing-media-reference__caption'
  const status = document.createElement('span')
  status.className = 'writing-media-reference__status'
  status.setAttribute('role', 'status')
  dom.append(image, caption, status)
  let node = initialNode, revision = 0, disposed = false, objectUrl = ''

  function releaseImage() {
    image.hidden = true
    image.removeAttribute('src')
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }

  async function load(assetId) {
    const ownRevision = ++revision
    releaseImage()
    status.hidden = false
    status.textContent = tr('正在读取图片…')
    try {
      const result = await getMediaAsset(assetId)
      if (disposed || revision !== ownRevision) return
      if (!result?.blob || result.asset.kind !== 'image') throw new Error('missing-image')
      objectUrl = URL.createObjectURL(result.blob)
      image.onload = () => {
        if (disposed || revision !== ownRevision) return
        image.hidden = false
        status.hidden = true
        dom.dataset.mediaState = 'ready'
      }
      image.onerror = () => {
        if (disposed || revision !== ownRevision) return
        releaseImage()
        status.textContent = tr('图片文件暂不可用')
        dom.dataset.mediaState = 'missing'
      }
      image.src = objectUrl
    } catch {
      if (disposed || revision !== ownRevision) return
      status.textContent = tr('图片文件暂不可用')
      dom.dataset.mediaState = 'missing'
    }
  }

  function render(nextNode) {
    const previousId = dom.dataset.mediaAssetId
    node = nextNode
    const assetId = String(node.attrs.mediaAssetId || '')
    dom.dataset.mediaAssetId = assetId
    dom.dataset.nodeid = String(node.attrs.nodeId || '')
    image.alt = String(node.attrs.alt || tr('正文插画'))
    caption.textContent = image.alt
    if (assetId !== previousId) {
      dom.dataset.mediaState = 'loading'
      void load(assetId)
    }
  }
  render(node)
  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== node.type) return false
      render(nextNode)
      return true
    },
    ignoreMutation: () => true,
    destroy() { disposed = true; revision += 1; image.onload = image.onerror = null; releaseImage() }
  }
}
