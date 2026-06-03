/**
 * 构造一个 jsdom canvas 元素给 renderMap 用
 *
 * 在 Node.js 测试环境下没有真实的 HTMLCanvasElement，需要用 jsdom
 * 模拟。jsdom 的 canvas.getContext('2d') 默认返回 null，所以我们
 * 注入一个 stub ctx —— 包含 renderer.ts 实际调用的方法（其它方法
 * 静默成功），足以测试"不抛错"。
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html>')
const document = dom.window.document

/** 构造一个 stub 2d context：所有方法都返回有意义的值（如 measureText 返回 {width:0}） */
function makeStubCtx() {
  const noop = () => {}
  // 通用结构体：包含常见链式方法 + 属性
  const makeStruct = () => ({
    width: 0,
    height: 0,
    data: new Uint8ClampedArray(4),
    addColorStop: noop,        // 渐变 API
    addColorStop: noop,
  })
  return new Proxy({
    canvas: { width: 0, height: 0 },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    imageSmoothingEnabled: true,
    shadowColor: '',
    shadowBlur: 0,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => makeStruct(),
    createRadialGradient: () => makeStruct(),
    createPattern: () => makeStruct(),
    getImageData: () => makeStruct(),
  }, {
    get(target, prop) {
      if (prop in target) return target[prop]
      // 默认方法返回 noop（链式调用支持 + 静默成功）
      return noop
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
  })
}

export function createCanvas(w, h) {
  // 用普通对象模拟 canvas（避开 jsdom canvas 的 width/height 限制）
  const ctx = makeStubCtx()
  const canvas = {
    width: w,
    height: h,
    getContext: () => ctx,
  }
  return canvas
}
