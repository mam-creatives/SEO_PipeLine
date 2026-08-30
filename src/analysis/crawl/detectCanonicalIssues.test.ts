import { describe, expect, test } from 'vitest'
import type { CrawledPage } from '../../core/types.js'
import { detectCanonicalIssues } from './detectCanonicalIssues.js'

const page = (overrides: Partial<CrawledPage>): CrawledPage => ({
  url: 'https://ornek.com/',
  statusCode: 200,
  finalUrl: 'https://ornek.com/',
  fetchError: null,
  title: 't',
  metaDescription: 'd',
  canonicalUrl: null,
  h1s: ['h'],
  headingOrder: ['h1'],
  hasSchemaOrg: false,
  schemaTypes: [],
  schemaFields: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 100,
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  likelyClientRendered: false,
  depth: 0,
  hreflangs: [],
  xRobotsTag: null,
  contentType: null,
  headerHreflangs: [],
  securityHeaders: [],
  redirectChain: [],
  redirectLoop: false,
  ...overrides,
})

describe('detectCanonicalIssues', () => {
  test('canonical yoksa hiçbir kural tetiklenmez', () => {
    expect(detectCanonicalIssues([page({})])).toEqual([])
  })

  test('canonical hedefi taranmadıysa (bilinmiyorsa) bulgu üretmez — uydurma yok', () => {
    const findings = detectCanonicalIssues([page({ canonicalUrl: 'https://ornek.com/hic-taranmadi' })])
    expect(findings).toEqual([])
  })

  test('non-self-referencing canonical TEK BAŞINA bulgu üretmez — kasıtlı kullanım yaygın', () => {
    const source = page({ url: 'https://ornek.com/varyant', canonicalUrl: 'https://ornek.com/asil' })
    const target = page({ url: 'https://ornek.com/asil', canonicalUrl: null })
    expect(detectCanonicalIssues([source, target])).toEqual([])
  })

  test('canonical hedefi 404 dönüyorsa kritik bulgu üretir', () => {
    const source = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://ornek.com/b' })
    const target = page({ url: 'https://ornek.com/b', statusCode: 404 })
    const findings = detectCanonicalIssues([source, target])
    expect(findings.some((f) => f.severity === 'critical' && f.title.includes('erişilemiyor'))).toBe(true)
  })

  test('canonical hedefi kendisi yönlendiriyorsa yüksek önemde bulgu üretir', () => {
    const source = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://ornek.com/b' })
    const target = page({
      url: 'https://ornek.com/b',
      redirectChain: [{ url: 'https://ornek.com/b', statusCode: 301 }],
      finalUrl: 'https://ornek.com/c',
    })
    const findings = detectCanonicalIssues([source, target])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes('kendisi bir yönlendirme'))).toBe(true)
  })

  test('canonical zinciri (A→B, B→C) yüksek önemde bulgu üretir', () => {
    const a = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://ornek.com/b' })
    const b = page({ url: 'https://ornek.com/b', canonicalUrl: 'https://ornek.com/c' })
    const c = page({ url: 'https://ornek.com/c', canonicalUrl: null })
    const findings = detectCanonicalIssues([a, b, c])
    expect(findings.some((f) => f.title.includes('Canonical zinciri'))).toBe(true)
  })

  test('canonical hedefi noindex ise yüksek önemde bulgu üretir', () => {
    const source = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://ornek.com/b' })
    const target = page({ url: 'https://ornek.com/b', metaRobots: 'noindex' })
    const findings = detectCanonicalIssues([source, target])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes("noindex'lenmiş bir sayfayı"))).toBe(true)
  })

  test('sayfa noindex ama başka sayfalar buraya canonical veriyorsa bulgu üretir (ters yön)', () => {
    const noindexed = page({ url: 'https://ornek.com/b', metaRobots: 'noindex' })
    const source = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://ornek.com/b' })
    const findings = detectCanonicalIssues([noindexed, source])
    expect(findings.some((f) => f.url === 'https://ornek.com/b' && f.title.includes('başka sayfalar buraya canonical'))).toBe(
      true,
    )
  })

  test('farklı domaine canonical düşük önemde bulgu üretir', () => {
    const findings = detectCanonicalIssues([page({ url: 'https://ornek.com/a', canonicalUrl: 'https://baska-domain.com/a' })])
    expect(findings.some((f) => f.severity === 'low' && f.title.includes('farklı bir domaine'))).toBe(true)
  })

  test('aynı domaine (www farkıyla) canonical bulgu üretmez', () => {
    const findings = detectCanonicalIssues([page({ url: 'https://ornek.com/a', canonicalUrl: 'https://www.ornek.com/a' })])
    expect(findings.some((f) => f.title.includes('farklı bir domaine'))).toBe(false)
  })

  test('trailing slash/www farkı "hedef taranmadı" sayılmaz — normalize edilip eşleşir', () => {
    const source = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://www.ornek.com/a/' })
    const target = page({ url: 'https://ornek.com/a', statusCode: 404 })
    const findings = detectCanonicalIssues([source, target])
    expect(findings.some((f) => f.title.includes('erişilemiyor'))).toBe(true)
  })

  test('4xx/CSR olmayan sağlıklı sayfalar arasında sorunsuz canonical hiç bulgu üretmez', () => {
    const source = page({ url: 'https://ornek.com/a', canonicalUrl: 'https://ornek.com/b' })
    const target = page({ url: 'https://ornek.com/b' })
    expect(detectCanonicalIssues([source, target])).toEqual([])
  })
})
