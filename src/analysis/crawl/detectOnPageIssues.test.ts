import { describe, expect, test } from 'vitest'
import type { CrawledPage } from '../../core/types.js'
import { detectOnPageIssues } from './detectOnPageIssues.js'

const page = (overrides: Partial<CrawledPage>): CrawledPage => ({
  url: 'https://ornek.com/',
  statusCode: 200,
  finalUrl: 'https://ornek.com/',
  fetchError: null,
  title: 'İyi Bir Başlık',
  metaDescription: 'Makul uzunlukta bir açıklama.',
  canonicalUrl: 'https://ornek.com/',
  h1s: ['Ana Başlık'],
  headingOrder: ['h1', 'h2'],
  hasSchemaOrg: true,
  schemaTypes: ['WebPage'],
  ogComplete: true,
  imagesMissingAlt: 0,
  wordCount: 300,
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  ...overrides,
})

describe('detectOnPageIssues', () => {
  test('sorunsuz sayfa hiç bulgu üretmez', () => {
    expect(detectOnPageIssues([page({})])).toEqual([])
  })

  test('4xx/5xx sayfalar değerlendirilmez', () => {
    expect(detectOnPageIssues([page({ statusCode: 404, title: null, h1s: [] })])).toEqual([])
  })

  test('title yoksa critical bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ title: null })])
    expect(findings.some((f) => f.severity === 'critical' && f.category === 'onpage')).toBe(true)
  })

  test('title çok uzunsa low bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ title: 'x'.repeat(80) })])
    expect(findings.some((f) => f.title.includes('uzun'))).toBe(true)
  })

  test('meta description boşsa (null değil, "") medium bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ metaDescription: '' })])
    expect(findings.some((f) => f.severity === 'medium' && f.title.includes('description'))).toBe(true)
  })

  test('h1 yoksa high bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ h1s: [] })])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes('h1'))).toBe(true)
  })

  test('birden fazla h1 varsa medium bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ h1s: ['A', 'B'] })])
    expect(findings.some((f) => f.title.includes('2 adet'))).toBe(true)
  })

  test('canonical yoksa medium bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ canonicalUrl: null })])
    expect(findings.some((f) => f.title.includes('Canonical'))).toBe(true)
  })

  test('schema.org yoksa low bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ hasSchemaOrg: false })])
    expect(findings.some((f) => f.title.includes('schema.org'))).toBe(true)
  })

  test('og eksikse low bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ ogComplete: false })])
    expect(findings.some((f) => f.title.includes('Open Graph'))).toBe(true)
  })

  test('alt eksik görsel varsa medium bulgu üretir', () => {
    const findings = detectOnPageIssues([page({ imagesMissingAlt: 3 })])
    expect(findings.some((f) => f.evidence.includes('imagesMissingAlt: 3'))).toBe(true)
  })

  test('gerçek mamcreatives kusurları (title yok + h1 yok + schema yok) dört+ ayrı bulgu üretir', () => {
    const findings = detectOnPageIssues([
      page({ title: null, metaDescription: '', h1s: [], hasSchemaOrg: false, ogComplete: false }),
    ])
    expect(findings.every((f) => f.category === 'onpage')).toBe(true)
    expect(findings.length).toBeGreaterThanOrEqual(4)
  })
})
