const MEDIA_DATABASE_NAME = 'pinax-media'
const MEDIA_BINARY_STORE_NAME = 'assets'

export async function readImageBinaryDimensions(blob, mimeType = '') {
  if (!String(blob.type || mimeType).startsWith('image/')) return {}
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(blob)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close?.()
      if (size.width > 0 && size.height > 0) return size
    } catch { /* Try the browser image decoder before preserving legacy dimensions. */ }
  }
  if (typeof globalThis.Image !== 'function' || !globalThis.URL?.createObjectURL) return {}
  return new Promise((resolve) => {
    const image = new globalThis.Image()
    const url = globalThis.URL.createObjectURL(blob)
    let finished = false
    const finish = (size) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      globalThis.URL.revokeObjectURL(url)
      resolve(size)
    }
    const timer = setTimeout(() => finish({}), 10000)
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : {})
    image.onerror = () => finish({})
    image.src = url
  })
}

export async function normalizeBinary(binary) {
  if (binary instanceof Blob) return binary
  if (binary instanceof ArrayBuffer) return new Blob([binary])
  if (ArrayBuffer.isView(binary)) return new Blob([binary])
  if (typeof binary === 'string' && binary.startsWith('data:')) return dataUrlToBlob(binary)
  throw new Error('媒体资产缺少可存储的二进制内容')
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('无法读取媒体内容'))
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl) {
  const separator = dataUrl.indexOf(',')
  if (separator < 0) throw new Error('媒体 data URL 格式无效')
  const header = dataUrl.slice(5, separator)
  const encoded = dataUrl.slice(separator + 1)
  const [mimeType = 'application/octet-stream', encoding = ''] = header.split(';')
  const decoded = encoding === 'base64' ? atob(encoded) : decodeURIComponent(encoded)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

function runIndexedDbRequest(indexedDBImpl, mode, execute) {
  if (!indexedDBImpl?.open) return Promise.reject(new Error('当前环境不支持 IndexedDB 媒体存储'))

  return openMediaDatabase(indexedDBImpl).then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_BINARY_STORE_NAME, mode)
    const request = execute(transaction.objectStore(MEDIA_BINARY_STORE_NAME))
    let result = null

    request.onsuccess = () => { result = request.result ?? null }
    request.onerror = () => reject(request.error || new Error('媒体二进制存储请求失败'))
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error || new Error('媒体二进制存储事务失败'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error || new Error('媒体二进制存储事务已取消'))
    }
  }))
}

function openMediaDatabase(indexedDBImpl) {
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(MEDIA_DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MEDIA_BINARY_STORE_NAME)) {
        request.result.createObjectStore(MEDIA_BINARY_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开媒体数据库'))
  })
}

export function createIndexedDbBinaryStore(options = {}) {
  const indexedDBImpl = options.indexedDBImpl || globalThis.indexedDB
  return {
    put: (id, blob) => runIndexedDbRequest(indexedDBImpl, 'readwrite', (store) => store.put(blob, id)),
    get: (id) => runIndexedDbRequest(indexedDBImpl, 'readonly', (store) => store.get(id)),
    delete: (id) => runIndexedDbRequest(indexedDBImpl, 'readwrite', (store) => store.delete(id)),
    keys: () => runIndexedDbRequest(indexedDBImpl, 'readonly', (store) => store.getAllKeys())
  }
}
