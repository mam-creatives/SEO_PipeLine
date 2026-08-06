/**
 * mulberry32 — tohumlanabilir, deterministik PRNG.
 * Mock sağlayıcıların "rastgele görünen ama tekrarlanabilir" veri üretmesi için.
 */
export type Rng = () => number

export const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Verilen aralıkta deterministik tam sayı üretir (min ve max dahil). */
export const randomInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min

/** String'i deterministik 32-bit tohuma çevirir (FNV-1a) — keyword bazlı mock veri üretimi için. */
export const hashString = (text: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
