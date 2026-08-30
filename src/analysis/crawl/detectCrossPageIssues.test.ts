import { describe, expect, test } from 'vitest'
import type { CrawledPage } from '../../core/types.js'
import { detectCrossPageIssues } from './detectCrossPageIssues.js'

const page = (url: string, overrides: Partial<CrawledPage> = {}): CrawledPage => ({
  url,
  statusCode: 200,
  finalUrl: url,
  fetchError: null,
  title: 'Benzersiz Başlık',
  metaDescription: 'd',
  canonicalUrl: url,
  h1s: ['Benzersiz H1'],
  headingOrder: ['h1'],
  hasSchemaOrg: false,
  schemaTypes: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 300,
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  likelyClientRendered: false,
  depth: 0,
  hreflangs: [],
  ...overrides,
})

describe('detectCrossPageIssues', () => {
  test('hepsi benzersizse hiç bulgu üretmez', () => {
    const pages = [page('https://x.com/a'), page('https://x.com/b', { title: 'Başka Başlık', h1s: ['Başka H1'] })]
    expect(detectCrossPageIssues(pages)).toEqual([])
  })

  test('aynı title\'ı paylaşan 2 sayfanın İKİSİ için de bulgu üretir', () => {
    const pages = [
      page('https://x.com/a', { title: 'Aynı Başlık' }),
      page('https://x.com/b', { title: 'Aynı Başlık', h1s: ['Farklı H1 B'] }),
    ]
    const findings = detectCrossPageIssues(pages)
    const titleFindings = findings.filter((f) => f.title.includes('title'))
    expect(titleFindings).toHaveLength(2)
    expect(titleFindings.map((f) => f.url)).toEqual(['https://x.com/a', 'https://x.com/b'])
  })

  test('evidence alanında kardeş URL listelenir, kendi URL\'i hariç tutulur', () => {
    const pages = [
      page('https://x.com/a', { title: 'Aynı Başlık' }),
      page('https://x.com/b', { title: 'Aynı Başlık', h1s: ['Farklı H1 B'] }),
    ]
    const finding = detectCrossPageIssues(pages).find((f) => f.url === 'https://x.com/a')
    expect(finding?.evidence).toContain('https://x.com/b')
    expect(finding?.evidence).not.toContain('https://x.com/a')
  })

  test('aynı ilk H1\'i paylaşan sayfalar için low severity bulgu üretir', () => {
    const pages = [
      page('https://x.com/a', { h1s: ['Aynı H1'] }),
      page('https://x.com/b', { title: 'Farklı Başlık B', h1s: ['Aynı H1'] }),
    ]
    const findings = detectCrossPageIssues(pages)
    expect(findings.some((f) => f.title.includes('H1') && f.severity === 'low')).toBe(true)
  })

  test('title/H1 eksik (null/boş) sayfalar yanlışlıkla "duplicate" sayılmaz', () => {
    const pages = [
      page('https://x.com/a', { title: null, h1s: [] }),
      page('https://x.com/b', { title: null, h1s: [] }),
    ]
    expect(detectCrossPageIssues(pages)).toEqual([])
  })

  test('3 sayfa aynı title\'ı paylaşıyorsa grup sayısı 3 olarak raporlanır', () => {
    const pages = [
      page('https://x.com/a', { title: 'Aynı', h1s: ['H-a'] }),
      page('https://x.com/b', { title: 'Aynı', h1s: ['H-b'] }),
      page('https://x.com/c', { title: 'Aynı', h1s: ['H-c'] }),
    ]
    const findings = detectCrossPageIssues(pages)
    expect(findings.every((f) => f.title.includes('3 sayfa'))).toBe(true)
    expect(findings).toHaveLength(3)
  })

  test('4xx/5xx sayfalar gruplamaya dahil edilmez', () => {
    const pages = [
      page('https://x.com/a', { title: 'Aynı Başlık' }),
      page('https://x.com/b', { title: 'Aynı Başlık', statusCode: 404 }),
    ]
    expect(detectCrossPageIssues(pages)).toEqual([])
  })

  test('Faz 4.3 — 2+ farklı dil öneki VE hiç hreflang yoksa site geneli bulgu üretir', () => {
    const pages = [
      page('https://x.com/tr/urun', { title: 'TR Ürün', h1s: ['TR H1'] }),
      page('https://x.com/en/product', { title: 'EN Product', h1s: ['EN H1'] }),
    ]
    const findings = detectCrossPageIssues(pages)
    const hreflangFinding = findings.find((f) => f.title.includes('hreflang'))
    expect(hreflangFinding).toBeDefined()
    expect(hreflangFinding?.url).toBeNull()
    expect(hreflangFinding?.evidence).toContain('en')
    expect(hreflangFinding?.evidence).toContain('tr')
  })

  test('Faz 4.3 — tek dil öneki varsa (çok dilli sinyal yok) bulgu üretilmez', () => {
    const pages = [
      page('https://x.com/tr/urun-a', { title: 'A', h1s: ['A'] }),
      page('https://x.com/tr/urun-b', { title: 'B', h1s: ['B'] }),
    ]
    expect(detectCrossPageIssues(pages).some((f) => f.title.includes('hreflang'))).toBe(false)
  })

  test('Faz 4.3 — çok dilli sinyal var ama en az bir sayfada hreflang varsa bulgu üretilmez', () => {
    const pages = [
      page('https://x.com/tr/urun', { title: 'TR', h1s: ['TR H1'], hreflangs: ['tr', 'en'] }),
      page('https://x.com/en/product', { title: 'EN', h1s: ['EN H1'] }),
    ]
    expect(detectCrossPageIssues(pages).some((f) => f.title.includes('hreflang'))).toBe(false)
  })

  test('Faz 4.3 — dil öneki içermeyen path\'ler yanlış pozitif üretmez', () => {
    const pages = [
      page('https://x.com/hakkimizda', { title: 'A', h1s: ['A'] }),
      page('https://x.com/hizmetler', { title: 'B', h1s: ['B'] }),
    ]
    expect(detectCrossPageIssues(pages).some((f) => f.title.includes('hreflang'))).toBe(false)
  })
})
