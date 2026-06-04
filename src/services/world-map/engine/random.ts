/**
 * 可种子化的伪随机数生成器（基于 alea npm 包）
 */

import alea from 'alea'

export function seedRandom(seed: string): () => number {
  return alea(seed)
}

/** 高斯随机数（Box-Muller） */
export function gauss(rng: () => number, mean = 0, std = 1): number {
  const u1 = rng()
  const u2 = rng()
  const z0 = Math.sqrt(-2.0 * Math.log(u1 || 1e-10)) * Math.cos(2.0 * Math.PI * u2)
  return z0 * std + mean
}

/** 在范围内的随机整数 [min, max] */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

/** 概率 p 返回 true */
export function chance(rng: () => number, p: number): boolean {
  return rng() < p
}

/** 从数组中随机选一个 */
export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}
