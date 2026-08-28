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
  ogComplete: true,
  imagesMissingAlt: 0,
  wordCount: 100,
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
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
})
