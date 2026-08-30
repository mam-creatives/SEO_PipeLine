import { describe, expect, test } from 'vitest'
import type { CrawledPage } from '../../core/types.js'
import { detectCrawlabilityIssues } from './detectCrawlabilityIssues.js'

const page = (overrides: Partial<CrawledPage>): CrawledPage => ({
  url: 'https://ornek.com/',
  statusCode: 200,
  finalUrl: 'https://ornek.com/',
  fetchError: null,
  title: 't',
  metaDescription: 'd',
  canonicalUrl: 'https://ornek.com/',
  h1s: ['h'],
  headingOrder: ['h1'],
  hasSchemaOrg: true,
  schemaTypes: [],
  schemaFields: [],
  ogComplete: true,
  imagesMissingAlt: 0,
  wordCount: 100,
  bodyText: '',
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
  viewportMeta: null,
  langAttribute: null,
  mixedContentCount: 0,
  imagesMissingDimensions: 0,
  ...overrides,
})

describe('detectCrawlabilityIssues', () => {
  test('sitemap boşsa "sitemap yok" bulgusu üretir', () => {
    const findings = detectCrawlabilityIssues([page({})], [])
    expect(findings.some((f) => f.title.includes('sitemap.xml bulunamadı'))).toBe(true)
  })

  test('sitemap varsa "sitemap yok" bulgusu üretmez', () => {
    const findings = detectCrawlabilityIssues([page({})], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('sitemap.xml bulunamadı'))).toBe(false)
  })

  test('noindex + sitemap\'te olan sayfa için çelişki bulgusu üretir', () => {
    const findings = detectCrawlabilityIssues([page({ metaRobots: 'noindex,follow' })], ['https://ornek.com/'])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes('çelişkili'))).toBe(true)
  })

  test('noindex ama sitemap\'te değilse çelişki bulgusu üretmez', () => {
    const findings = detectCrawlabilityIssues([page({ metaRobots: 'noindex' })], ['https://baska-sayfa.com/'])
    expect(findings.some((f) => f.title.includes('çelişkili'))).toBe(false)
  })

  test('sitemap\'te olup taranamayan URL\'ler için bulgu üretir', () => {
    const findings = detectCrawlabilityIssues([page({})], ['https://ornek.com/', 'https://ornek.com/hic-taranmadi'])
    expect(findings.some((f) => f.title.includes('taranamayan 1 URL'))).toBe(true)
  })

  test('tüm sitemap URL\'leri tarandıysa unreached bulgusu üretmez', () => {
    const findings = detectCrawlabilityIssues([page({})], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('taranamayan'))).toBe(false)
  })

  test('X-Robots-Tag: noindex — HTML\'de iz yoksa bile kritik bulgu üretir', () => {
    const findings = detectCrawlabilityIssues([page({ xRobotsTag: 'noindex' })], [])
    expect(findings.some((f) => f.severity === 'critical' && f.title.includes('HTTP başlığıyla indekslemeye kapatılmış'))).toBe(true)
  })

  test('X-Robots-Tag yoksa ya da noindex içermiyorsa bulgu üretmez', () => {
    const findings = detectCrawlabilityIssues([page({ xRobotsTag: 'max-image-preview:large' })], [])
    expect(findings.some((f) => f.title.includes('HTTP başlığıyla'))).toBe(false)
  })

  test('X-Robots-Tag noindex + sitemap\'te olan sayfa için de çelişki bulgusu üretir (meta değil, başlık kaynaklı)', () => {
    const findings = detectCrawlabilityIssues([page({ xRobotsTag: 'noindex' })], ['https://ornek.com/'])
    const contradiction = findings.find((f) => f.title.includes('çelişkili'))
    expect(contradiction?.evidence).toContain('X-Robots-Tag')
  })

  test('Content-Type html içermiyorsa düşük önemde bulgu üretir', () => {
    const findings = detectCrawlabilityIssues([page({ contentType: 'application/pdf' })], [])
    expect(findings.some((f) => f.severity === 'low' && f.title.includes('Content-Type'))).toBe(true)
  })

  test('Content-Type text/html ise bulgu üretmez', () => {
    const findings = detectCrawlabilityIssues([page({ contentType: 'text/html' })], [])
    expect(findings.some((f) => f.title.includes('Content-Type'))).toBe(false)
  })

  test('Faz 5.5 — HTTPS sayfada karma içerik varsa yüksek önemde bulgu üretir', () => {
    const findings = detectCrawlabilityIssues([page({ url: 'https://ornek.com/', mixedContentCount: 2 })], [])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes('karma içerik'))).toBe(true)
  })

  test('Faz 5.5 — mixedContentCount 0 ise bulgu üretmez', () => {
    const findings = detectCrawlabilityIssues([page({ url: 'https://ornek.com/', mixedContentCount: 0 })], [])
    expect(findings.some((f) => f.title.includes('karma içerik'))).toBe(false)
  })

  test('Faz 5.5 — taranan ama sitemap\'te olmayan sayfalar için düşük önemde bulgu üretir', () => {
    const tracked = page({ url: 'https://ornek.com/' })
    const untracked = page({ url: 'https://ornek.com/blog/yeni-yazi' })
    const findings = detectCrawlabilityIssues([tracked, untracked], ['https://ornek.com/'])
    expect(findings.some((f) => f.severity === 'low' && f.title.includes("sitemap.xml'de olmayan 1 sayfa"))).toBe(true)
  })

  test('Faz 5.5 — tüm taranan sayfalar sitemap\'teyse ters yön bulgusu üretmez', () => {
    const tracked = page({ url: 'https://ornek.com/' })
    const findings = detectCrawlabilityIssues([tracked], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('sitemap.xml\'de olmayan'))).toBe(false)
  })
})
