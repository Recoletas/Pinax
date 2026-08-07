export const LETTERING_DIRECTIONS = Object.freeze([
  { value: 'horizontal', label: '横排' },
  { value: 'vertical', label: '竖排' }
])

export function analyzeComicLettering(page = {}) {
  const canvas = normalizeCanvas(page.canvas)
  const issues = []
  const panels = Array.isArray(page.panels) ? page.panels : []

  panels.forEach((panel) => {
    const objects = Array.isArray(panel.letteringObjects) ? panel.letteringObjects : []
    objects.forEach((object, index) => {
      const box = normalizeBox(object.box)
      const style = normalizeStyle(object.style, object.type)
      const label = `${panel.order || index + 1}格 · ${typeLabel(object.type)}`
      const maxLines = Math.max(1, Math.floor((box[3] * canvas.height - 12) / (style.fontSize * 1.45)))
      const estimatedLines = estimateLineCount(object.text, box[2] * canvas.width, style.fontSize, style.textDirection)
      if (estimatedLines > maxLines) {
        issues.push({
          id: `overflow:${panel.id}:${object.id}`,
          severity: 'blocking',
          panelId: panel.id,
          objectId: object.id,
          message: `${label}文字可能溢出，预计 ${estimatedLines} 行，容纳约 ${maxLines} 行`
        })
      }

      const safeInsetX = canvas.safeInset / canvas.width
      const safeInsetY = canvas.safeInset / canvas.height
      if (box[0] < safeInsetX || box[1] < safeInsetY
        || box[0] + box[2] > 1 - safeInsetX
        || box[1] + box[3] > 1 - safeInsetY) {
        issues.push({
          id: `safe:${panel.id}:${object.id}`,
          severity: 'warning',
          panelId: panel.id,
          objectId: object.id,
          message: `${label}超出安全区，印刷或切片时可能靠近边缘`
        })
      }

      if (['speech', 'thought'].includes(object.type) && !validPoint(object.tailTarget)) {
        issues.push({
          id: `tail:${panel.id}:${object.id}`,
          severity: 'warning',
          panelId: panel.id,
          objectId: object.id,
          message: `${label}尚未设置尾巴指向`
        })
      }

      if (style.textDirection === 'vertical' && style.textAlign === 'left') {
        issues.push({
          id: `direction:${panel.id}:${object.id}`,
          severity: 'warning',
          panelId: panel.id,
          objectId: object.id,
          message: `${label}为竖排但使用左对齐，建议改为居中或右对齐`
        })
      }
    })

    for (let leftIndex = 0; leftIndex < objects.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < objects.length; rightIndex += 1) {
        const left = normalizeBox(objects[leftIndex].box)
        const right = normalizeBox(objects[rightIndex].box)
        const overlap = intersectionArea(left, right)
        if (overlap > Math.min(left[2] * left[3], right[2] * right[3]) * 0.2) {
          issues.push({
            id: `overlap:${panel.id}:${objects[leftIndex].id}:${objects[rightIndex].id}`,
            severity: 'warning',
            panelId: panel.id,
            objectId: objects[rightIndex].id,
            message: `${panel.order || leftIndex + 1}格文字框互相遮挡，请检查阅读顺序`
          })
        }
      }
    }

    const focalPoint = panel.direction?.focalPoint
    if (validPoint(focalPoint)) {
      objects.forEach((object) => {
        const box = normalizeBox(object.box)
        if (focalPoint.x >= box[0] && focalPoint.x <= box[0] + box[2]
          && focalPoint.y >= box[1] && focalPoint.y <= box[1] + box[3]) {
          issues.push({
            id: `focus:${panel.id}:${object.id}`,
            severity: 'warning',
            panelId: panel.id,
            objectId: object.id,
            message: `${panel.order || ''}格文字框遮挡视觉焦点，建议移动或缩小`
          })
        }
      })
    }
  })

  return {
    ok: !issues.some((issue) => issue.severity === 'blocking'),
    blocking: issues.filter((issue) => issue.severity === 'blocking'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
    issues
  }
}

export function buildComicPublicationReport(page = {}) {
  const lettering = analyzeComicLettering(page)
  const missingImages = (page.panels || []).filter((panel) => {
    const route = page.colorMode === 'monochrome'
      ? ['rough', 'line', 'tones', 'effects']
      : ['rough', 'line', 'flats', 'render', 'effects']
    const finalStage = route[route.length - 1]
    return !panel.production?.[finalStage]?.selectedArtifactId && !panel.selectedTakeId
  }).map((panel) => ({
    id: `image:${panel.id}`,
    severity: 'blocking',
    panelId: panel.id,
    message: `${panel.order}格尚未选择最终画面`
  }))
  const issues = [...missingImages, ...lettering.issues]
  return {
    ok: !issues.some((issue) => issue.severity === 'blocking'),
    blocking: issues.filter((issue) => issue.severity === 'blocking'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
    issues
  }
}

export function estimateLineCount(value, width, fontSize, direction = 'horizontal') {
  const text = String(value || '').trim()
  if (!text) return 0
  if (direction === 'vertical') return Math.max(1, Math.ceil(Array.from(text.replace(/\n/g, '')).length / Math.max(1, Math.floor(width / fontSize))))
  const charactersPerLine = Math.max(1, Math.floor(width / (fontSize * 1.05)))
  return text.split(/\n/).reduce((total, paragraph) => total + Math.max(1, Math.ceil(Array.from(paragraph).length / charactersPerLine)), 0)
}

function normalizeCanvas(input = {}) {
  const width = Math.max(1, Number(input.width) || 1200)
  const height = Math.max(1, Number(input.height) || 1600)
  return {
    width,
    height,
    safeInset: Math.max(0, Number(input.safeInset) || 48)
  }
}

function normalizeBox(input) {
  const values = Array.isArray(input) ? input.map(Number) : []
  const width = clamp(values[2], 0.12, 1, 0.38)
  const height = clamp(values[3], 0.08, 1, 0.2)
  return [clamp(values[0], 0, 1 - width, 0.5), clamp(values[1], 0, 1 - height, 0.1), width, height]
}

function normalizeStyle(input = {}, type = 'speech') {
  const source = input && typeof input === 'object' ? input : {}
  return {
    fontSize: clamp(source.fontSize, 10, 72, type === 'sfx' ? 32 : 22),
    textAlign: ['left', 'center', 'right'].includes(source.textAlign) ? source.textAlign : type === 'caption' ? 'left' : 'center',
    textDirection: source.textDirection === 'vertical' ? 'vertical' : 'horizontal'
  }
}

function validPoint(point) {
  return Boolean(point) && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
    && Number(point.x) >= 0 && Number(point.x) <= 1 && Number(point.y) >= 0 && Number(point.y) <= 1
}

function intersectionArea(left, right) {
  const width = Math.max(0, Math.min(left[0] + left[2], right[0] + right[2]) - Math.max(left[0], right[0]))
  const height = Math.max(0, Math.min(left[1] + left[3], right[1] + right[3]) - Math.max(left[1], right[1]))
  return width * height
}

function clamp(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function typeLabel(type) {
  return { speech: '对白', thought: '心声', caption: '旁白', sfx: '拟声' }[type] || '文字'
}

export default {
  analyzeComicLettering,
  buildComicPublicationReport,
  estimateLineCount
}
