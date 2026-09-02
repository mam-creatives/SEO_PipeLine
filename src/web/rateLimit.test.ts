import { afterEach, describe, expect, test } from 'vitest'
import { createIpRateLimiter, openDailyBudget, type DailyBudget } from './rateLimit.js'

describe('createIpRateLimiter', () => {
  test('pencere içinde limiti aşmayan istekleri kabul eder', () => {
    const isAllowed = createIpRateLimiter(60_000, 3)
    expect(isAllowed('1.2.3.4')).toBe(true)
    expect(isAllowed('1.2.3.4')).toBe(true)
    expect(isAllowed('1.2.3.4')).toBe(true)
  })

  test('pencere içinde limiti aşan istekleri reddeder', () => {
    const isAllowed = createIpRateLimiter(60_000, 2)
    expect(isAllowed('1.2.3.4')).toBe(true)
    expect(isAllowed('1.2.3.4')).toBe(true)
    expect(isAllowed('1.2.3.4')).toBe(false)
  })

  test('farklı IP\'ler birbirinden bağımsız sayılır', () => {
    const isAllowed = createIpRateLimiter(60_000, 1)
    expect(isAllowed('1.1.1.1')).toBe(true)
    expect(isAllowed('2.2.2.2')).toBe(true)
    expect(isAllowed('1.1.1.1')).toBe(false)
  })

  test('pencere süresi geçince sayaç sıfırlanır', async () => {
    const isAllowed = createIpRateLimiter(10, 1)
    expect(isAllowed('1.2.3.4')).toBe(true)
    expect(isAllowed('1.2.3.4')).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(isAllowed('1.2.3.4')).toBe(true)
  })
})

describe('openDailyBudget', () => {
  let budget: DailyBudget

  afterEach(() => {
    budget.close()
  })

  test('limit dolana kadar tüketime izin verir', () => {
    budget = openDailyBudget(':memory:', 3)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
  })

  test('remaining() kalan kotayı doğru raporlar', () => {
    budget = openDailyBudget(':memory:', 2)
    expect(budget.remaining()).toBe(2)
    budget.tryConsume()
    expect(budget.remaining()).toBe(1)
    budget.tryConsume()
    expect(budget.remaining()).toBe(0)
  })

  test('kota bittiğinde tryConsume hiçbir şey yazmadan false döner (sayaç artmaz)', () => {
    budget = openDailyBudget(':memory:', 1)
    expect(budget.tryConsume()).toBe(true)
    expect(budget.tryConsume()).toBe(false)
    expect(budget.tryConsume()).toBe(false)
    expect(budget.remaining()).toBe(0)
  })
})
