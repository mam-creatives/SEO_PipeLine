import { describe, expect, test } from 'vitest'
import type { GscRow } from '../core/types.js'
import { detectCannibalization } from './detectCannibalization.js'

const row = (overrides: Partial<GscRow>): GscRow => ({
  query: 'ayakkabı',
  page: 'https://ornek.com/ayakkabi',
  clicks: 10,
  impressions: 1000,
  ctr: 0.01,
  avgPosition: 5,
  ...overrides,
})

describe('detectCannibalization', () => {
  test('tek sayfalı sorgu bulgu üretmez', () => {
    expect(detectCannibalization([row({})])).toEqual([])
  })

  test('boş page (v6 öncesi göç edilmiş veri) hiç tetiklemez', () => {
    const rows = [row({ page: '', impressions: 1000 }), row({ page: '', impressions: 500 })]
    expect(detectCannibalization(rows)).toEqual([])
  })

  test('ikincil sayfanın gösterimi eşiğin (%20) üzerindeyse bulgu üretir', () => {
    const rows = [
      row({ page: 'https://ornek.com/urun', impressions: 1000 }),
      row({ page: 'https://ornek.com/blog/urun', impressions: 300 }),
    ]
    const findings = detectCannibalization(rows)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.category).toBe('content')
    expect(findings[0]?.severity).toBe('high')
    expect(findings[0]?.url).toBe('https://ornek.com/urun')
    expect(findings[0]?.title).toContain('ayakkabı')
    expect(findings[0]?.evidence).toContain('1000 gösterim')
    expect(findings[0]?.evidence).toContain('300 gösterim')
  })

  test('ikincil sayfanın gösterimi eşiğin altındaysa bulgu üretmez (gürültü elenir)', () => {
    const rows = [
      row({ page: 'https://ornek.com/urun', impressions: 1000 }),
      row({ page: 'https://ornek.com/eski-urun', impressions: 100 }),
    ]
    expect(detectCannibalization(rows)).toEqual([])
  })

  test('birden fazla ikincil sayfa varsa hepsi ayrı bulgu olarak döner', () => {
    const rows = [
      row({ page: 'https://ornek.com/a', impressions: 1000 }),
      row({ page: 'https://ornek.com/b', impressions: 400 }),
      row({ page: 'https://ornek.com/c', impressions: 300 }),
    ]
    expect(detectCannibalization(rows)).toHaveLength(2)
  })

  test('farklı sorgular bağımsız değerlendirilir', () => {
    const rows = [
      row({ query: 'a', page: 'https://ornek.com/a1', impressions: 1000 }),
      row({ query: 'a', page: 'https://ornek.com/a2', impressions: 500 }),
      row({ query: 'b', page: 'https://ornek.com/b1', impressions: 1000 }),
    ]
    const findings = detectCannibalization(rows)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.title).toContain('"a"')
  })

  test('impact phaseShare\'e göre değişir — daha yüksek pay daha yüksek impact', () => {
    const lowShare = detectCannibalization([
      row({ query: 'x', page: 'https://ornek.com/1', impressions: 1000 }),
      row({ query: 'x', page: 'https://ornek.com/2', impressions: 250 }),
    ])[0]
    const highShare = detectCannibalization([
      row({ query: 'y', page: 'https://ornek.com/1', impressions: 1000 }),
      row({ query: 'y', page: 'https://ornek.com/2', impressions: 900 }),
    ])[0]
    expect(highShare?.impact).toBeGreaterThan(lowShare?.impact ?? 0)
  })
})
