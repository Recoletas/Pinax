import { markdownImageDescriptors } from './assetMarkdown'

/**
 * C7 · 素材插画版式的纯计算（无 DOM/Vue 依赖，可单测）。
 * DOM 构建/事件生命周期仍归页面（Notes.vue 插画域）；这里只产出视图模型与纯换算。
 */

/** 版式基础宽度（相对容器百分比），拖拽缩放以此为基准。 */
export function imageBaseWidth(wrap) {
  if (wrap === 'inline') return 32
  if (wrap === 'top-bottom') return 68
  return 42
}

export function layoutLabel(presentation) {
  const labels = {
    inline: '嵌入文字',
    square: `四周型 · ${presentation.align === 'left' ? '左' : '右'}`,
    tight: `紧密型 · ${presentation.align === 'left' ? '左' : '右'}`,
    'top-bottom': '上下型',
    behind: '衬于文字下方',
    front: '浮于文字上方'
  }
  return labels[presentation.wrap] || '图片版式'
}

/**
 * 图版 figure 的纯视图模型：类名、aria 标签、内联样式。
 * 页面据此创建元素并附加事件，不再自行拼样式表达式。
 */
export function computeIllustrationFigureView({ presentation, interactive, selected, label, src }) {
  const baseWidth = imageBaseWidth(presentation.wrap)
  const widthPercent = Math.min(100, Math.max(16, baseWidth * presentation.scale))
  const className = [
    'narrative-illustration',
    `illustration-wrap--${presentation.wrap}`,
    `illustration-align--${presentation.align}`,
    interactive ? 'is-editable' : '',
    interactive && selected ? 'is-selected' : ''
  ].filter(Boolean).join(' ')

  const style = {
    width: `${widthPercent}%`,
    '--illustration-gap': `${presentation.textGap}px`
  }
  if (['behind', 'front'].includes(presentation.wrap)) {
    style.left = `${presentation.positionX}%`
    style.top = `${presentation.positionY}%`
  }
  if (presentation.wrap === 'tight') {
    style.shapeOutside = `url(${JSON.stringify(src)})`
    style.shapeImageThreshold = '0.12'
    style.shapeMargin = `${presentation.textGap}px`
  }

  return {
    tagName: presentation.wrap === 'inline' ? 'span' : 'figure',
    className,
    ariaLabel: `${label}，${layoutLabel(presentation)}`,
    style
  }
}

/** 媒体迁移/替换后，把旧 markdown 的内嵌图版式按键重映射到新 markdown。 */
export function remapEmbeddedImagePresentations(presentations, previousMarkdown, nextMarkdown) {
  const current = presentations && typeof presentations === 'object' ? presentations : {}
  const previous = markdownImageDescriptors(previousMarkdown)
  const next = markdownImageDescriptors(nextMarkdown)
  const remapped = { ...current }
  previous.forEach((descriptor, index) => {
    const replacement = next[index]
    if (!replacement || replacement.key === descriptor.key || !current[descriptor.key]) return
    remapped[replacement.key] = current[descriptor.key]
    delete remapped[descriptor.key]
  })
  return remapped
}
