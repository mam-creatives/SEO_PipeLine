import { describe, expect, test } from 'vitest'
import { mapWithConcurrency } from './concurrency.js'

describe('mapWithConcurrency', () => {
  test('sonuçlar girdi sırasını korur (worker\'lar farklı hızda bitse bile)', async () => {
    const delays = [30, 10, 20]
    const result = await mapWithConcurrency(delays, 3, async (delayMs) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return delayMs
    })
    expect(result).toEqual([30, 10, 20])
  })

  test('boş dizi hiç worker çalıştırmadan boş döner', async () => {
    const result = await mapWithConcurrency([], 4, async () => {
      throw new Error('çağrılmamalıydı')
    })
    expect(result).toEqual([])
  })

  test('eşzamanlılık limiti aynı anda çalışan worker sayısını sınırlar', async () => {
    let active = 0
    let maxActive = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return item
    })
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  // Dış denetim bulgusu (2026-08-31, Faz C) — opsiyonel `onProgress`: verilmezse davranış
  // değişmez (geriye dönük uyumlu); verilirse her iş bitince (tamamlanan, toplam) ile çağrılır.
  describe('onProgress', () => {
    test('verilmezse mevcut davranış değişmez', async () => {
      const result = await mapWithConcurrency([1, 2, 3], 2, async (item) => item * 2)
      expect(result).toEqual([2, 4, 6])
    })

    test('her iş bitince (tamamlanan, toplam) ile çağrılır', async () => {
      const calls: Array<readonly [number, number]> = []
      await mapWithConcurrency(
        [1, 2, 3],
        1,
        async (item) => item,
        (completed, total) => {
          calls.push([completed, total])
        },
      )
      expect(calls).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ])
    })

    test('toplam çağrı sayısı iş sayısına eşittir (eşzamanlılık limitinden bağımsız)', async () => {
      let callCount = 0
      await mapWithConcurrency(
        [1, 2, 3, 4, 5],
        3,
        async (item) => item,
        () => {
          callCount += 1
        },
      )
      expect(callCount).toBe(5)
    })
  })
})
