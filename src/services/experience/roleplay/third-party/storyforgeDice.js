/**
 * StoryForge 骰式纯函数移植（MIT）。
 *
 * 来源（设计参考与代码复用清单见 docs/agent-runs/nightly-20260916/roleplay-summary.md）：
 *   upstream: https://github.com/yuanbw2025/storyforge
 *   file:     src/lib/ttrpg/dice.ts
 *   sha:      cd1236cfa5c7cbd307ed0dfac5487f9fe5c98aed
 *   license:  MIT, Copyright (c) 2026 yuanbw2025（保留声明，不因本仓库根许可证删除）
 *   修改说明: 去除 TypeScript 类型与 type barrel 依赖；算法（闭合骰式语法、
 *             范围校验、uint32 拒绝采样、trace 结构）原样保留；未移植
 *             sampleTtrpgDiceWithSha256V2（crypto.subtle 变体，本线用注入
 *             RNG / crypto.getRandomValues 已覆盖，不引入额外依赖面）。
 * 本模块是纯函数域：不读 store、不做 IO、不使用 eval。
 * Full MIT permission notice: public/third-party/storyforge-LICENSE.txt
 */

export const TTRPG_DIE_SIDES_MIN = 2
export const TTRPG_DIE_SIDES_MAX = 100
export const TTRPG_DICE_COUNT_MAX = 100
export const TTRPG_DICE_MODIFIER_ABS_MAX = 10000

function fail(message) {
  throw Object.assign(new Error(`[ttrpg-dice] ${message}`), { code: 'ROLEPLAY_DICE_INVALID' })
}

export function assertDieSides(value, label = '骰面') {
  if (!Number.isInteger(value) || Number(value) < TTRPG_DIE_SIDES_MIN || Number(value) > TTRPG_DIE_SIDES_MAX) {
    fail(`${label}必须为 d${TTRPG_DIE_SIDES_MIN}～d${TTRPG_DIE_SIDES_MAX}`)
  }
  return Number(value)
}

/**
 * 闭合骰式语法：只接受 NdM、NdM+K、NdM-K。空白/大小写仅是书写差异，
 * 规范形式恒为 `NdM±K`。注入表达式（如 `2d6;process.exit`）不匹配直接拒绝。
 */
export function parseDiceExpression(value) {
  if (typeof value !== 'string') fail('骰式必须是字符串')
  const compact = value.trim().toLowerCase().replace(/\s+/g, '')
  const match = /^(\d{1,3})d(\d{1,3})(?:([+-])(\d{1,5}))?$/.exec(compact)
  if (!match) fail('只支持 NdM、NdM+K 或 NdM-K，例如 2d6+1')
  const count = Number(match[1])
  if (!Number.isInteger(count) || count < 1 || count > TTRPG_DICE_COUNT_MAX) {
    fail(`单次骰子数量必须为 1～${TTRPG_DICE_COUNT_MAX}`)
  }
  const sides = assertDieSides(Number(match[2]))
  const magnitude = match[4] ? Number(match[4]) : 0
  const modifier = match[3] === '-' ? -magnitude : magnitude
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > TTRPG_DICE_MODIFIER_ABS_MAX) {
    fail(`修正值必须在 -${TTRPG_DICE_MODIFIER_ABS_MAX}～${TTRPG_DICE_MODIFIER_ABS_MAX}`)
  }
  return {
    count,
    sides,
    modifier,
    normalized: `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ''}`
  }
}

/** uint32 → 骰点。落在拒绝区时返回 null（避免模偏差），调用方重采样。 */
export function mapUint32ToDie(sample, sidesInput) {
  const sides = assertDieSides(sidesInput)
  if (!Number.isInteger(sample) || sample < 0 || sample > 0xffff_ffff) fail('随机样本必须是 uint32')
  const acceptedRange = Math.floor(0x1_0000_0000 / sides) * sides
  return sample < acceptedRange ? (sample % sides) + 1 : null
}

/**
 * 从注入的 uint32 源采样 count 颗骰子。nextUint32(sampleIndex) 由调用方提供
 * （生产为 crypto.getRandomValues，测试为固定序列），保证离线可复现。
 */
export function sampleDiceFromUint32({ count, sides, nextUint32 }) {
  if (!Number.isInteger(count) || count < 1 || count > TTRPG_DICE_COUNT_MAX) {
    fail(`单次骰子数量必须为 1～${TTRPG_DICE_COUNT_MAX}`)
  }
  const resolvedSides = assertDieSides(sides)
  if (typeof nextUint32 !== 'function') fail('nextUint32 必须是函数')
  const dice = []
  let consumedSamples = 0
  let rejectedSamples = 0
  while (dice.length < count) {
    const mapped = mapUint32ToDie(nextUint32(consumedSamples), resolvedSides)
    consumedSamples += 1
    if (mapped == null) rejectedSamples += 1
    else dice.push(mapped)
  }
  return {
    dice,
    trace: {
      algorithm: 'uint32-rejection-v2',
      sides: resolvedSides,
      requestedDice: count,
      consumedSamples,
      rejectedSamples
    }
  }
}

/** 生产用 uint32 源：crypto.getRandomValues（浏览器与 Node ≥19 都可用）。 */
export function createCryptoUint32Source() {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw Object.assign(new Error('[ttrpg-dice] 当前环境没有可用的 crypto.getRandomValues'), {
      code: 'ROLEPLAY_DICE_NO_RNG'
    })
  }
  const buffer = new Uint32Array(8)
  let cursor = 8
  return function nextUint32() {
    if (cursor >= buffer.length) {
      cryptoObj.getRandomValues(buffer)
      cursor = 0
    }
    return buffer[cursor++]
  }
}

/** 校验/归一化持久化后的 roll trace（恢复与幂等审计用）。 */
export function assertDiceRollTrace(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('roll trace 必须是对象')
  const row = value
  const expected = ['algorithm', 'consumedSamples', 'rejectedSamples', 'requestedDice', 'sides']
  if (Object.keys(row).sort().join(',') !== expected.slice().sort().join(',')) fail('roll trace 字段不精确')
  if (row.algorithm !== 'uint32-rejection-v2') fail('roll trace 算法无效')
  const sides = assertDieSides(row.sides, 'roll trace 骰面')
  const requestedDice = Number(row.requestedDice)
  const consumedSamples = Number(row.consumedSamples)
  const rejectedSamples = Number(row.rejectedSamples)
  if (!Number.isInteger(requestedDice) || requestedDice < 1 || requestedDice > TTRPG_DICE_COUNT_MAX
    || !Number.isInteger(consumedSamples) || consumedSamples < requestedDice
    || !Number.isInteger(rejectedSamples) || rejectedSamples < 0
    || consumedSamples !== requestedDice + rejectedSamples) {
    fail('roll trace 计数无效')
  }
  return { algorithm: 'uint32-rejection-v2', sides, requestedDice, consumedSamples, rejectedSamples }
}
