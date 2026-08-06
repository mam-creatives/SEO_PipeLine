import { describe, expect, test } from 'vitest'
import { MAX_AUDIT_URLS } from '../config/constants.js'
import { ProjectConfigSchema } from '../config/schema.js'
import type { SerpSnapshot } from '../core/types.js'
import { selectAuditUrls, templateOf } from './selectAuditUrls.js'

const config = ProjectConfigSchema.parse({
  domain: 'ornekayakkabi.com.tr',
  brandName: 'Örnek Ayakkabı',
  brandTokens: ['örnek ayakkabı'],
  seedKeywords: ['ayakkabı'],
  auditUrls: ['https://ornekayakkabi.com.tr/'],
})

const serp = (keyword: string, entries: readonly { url: string; position: number }[]): SerpSnapshot => ({
  keyword,
  entries: entries.map((entry) => ({ ...entry, domain: new URL(entry.url).hostname })),
  hasFeaturedSnippet: false,
  hasAiOverview: false,
})

describe('templateOf', () => {
  test('anasayfa, tek segment ve bölümlü sayfalar ayrı şablonlara düşer', () => {
    expect(templateOf('https://x.tr/')).toBe('/')
    expect(templateOf('https://x.tr/spor-ayakkabi')).toBe('/:sayfa')
    expect(templateOf('https://x.tr/blog/ayakkabi-bakimi')).toBe('/blog/:sayfa')
  })

  test('aynı şablondaki farklı sayfalar aynı kimliği alır', () => {
    expect(templateOf('https://x.tr/blog/a')).toBe(templateOf('https://x.tr/blog/b'))
    expect(templateOf('https://x.tr/a')).not.toBe(templateOf('https://x.tr/blog/a'))
  })

  test('bozuk URL anasayfa sayılır, patlamaz', () => {
    expect(templateOf('bozuk-url')).toBe('/')
  })
})

describe('selectAuditUrls', () => {
  test('şablon başına EN İYİ sıradaki sayfa temsilci seçilir', () => {
    const serps = [
      serp('a', [{ url: 'https://ornekayakkabi.com.tr/kadin-ayakkabi', position: 7 }]),
      serp('b', [{ url: 'https://ornekayakkabi.com.tr/deri-ayakkabi', position: 2 }]),
    ]
    const urls = selectAuditUrls(serps, config)
    expect(urls).toContain('https://ornekayakkabi.com.tr/deri-ayakkabi')
    expect(urls).not.toContain('https://ornekayakkabi.com.tr/kadin-ayakkabi')
  })

  test('farklı şablonlar ayrı ayrı temsil edilir', () => {
    const serps = [
      serp('a', [{ url: 'https://ornekayakkabi.com.tr/deri-ayakkabi', position: 3 }]),
      serp('b', [{ url: 'https://ornekayakkabi.com.tr/blog/bakim', position: 5 }]),
    ]
    const urls = selectAuditUrls(serps, config)
    expect(urls).toContain('https://ornekayakkabi.com.tr/deri-ayakkabi')
    expect(urls).toContain('https://ornekayakkabi.com.tr/blog/bakim')
  })

  test('rakip URL adresleri seçilmez', () => {
    const serps = [serp('a', [{ url: 'https://flo.com.tr/spor', position: 1 }])]
    expect(selectAuditUrls(serps, config)).toEqual(['https://ornekayakkabi.com.tr/'])
  })

  test('config.auditUrls her zaman dahildir ve başta gelir', () => {
    const serps = [serp('a', [{ url: 'https://ornekayakkabi.com.tr/x', position: 1 }])]
    expect(selectAuditUrls(serps, config)[0]).toBe('https://ornekayakkabi.com.tr/')
  })

  test('toplam URL sayısı sınırlanır — her URL bir Lighthouse koşusu', () => {
    const serps = Array.from({ length: 20 }, (_, index) =>
      serp(`kw-${index}`, [{ url: `https://ornekayakkabi.com.tr/b${index}/sayfa`, position: index + 1 }]),
    )
    expect(selectAuditUrls(serps, config).length).toBeLessThanOrEqual(MAX_AUDIT_URLS)
  })
})
