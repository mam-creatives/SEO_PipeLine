import { describe, expect, test } from 'vitest'
import type { CrawledPage, KeywordPageMatch } from '../core/types.js'
import { detectKeywordContentIssues } from './detectKeywordContentIssues.js'

const match = (overrides: Partial<KeywordPageMatch>): KeywordPageMatch => ({
  keyword: 'spor ayakkabı',
  volume: 1000,
  url: 'https://ornek.com/urun',
  inTitle: true,
  inH1: true,
  inBody: true,
  matchSource: 'gsc',
  ...overrides,
})

const page = (overrides: Partial<CrawledPage> = {}): CrawledPage => ({
  url: 'https://ornek.com/urun',
  statusCode: 200,
  finalUrl: 'https://ornek.com/urun',
  fetchError: null,
  title: 'Spor Ayakkabı',
  metaDescription: 'd',
  canonicalUrl: null,
  h1s: ['Spor Ayakkabı'],
  headingOrder: ['h1'],
  hasSchemaOrg: false,
  schemaTypes: [],
  schemaFields: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 300,
  bodyText: 'içerik',
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

describe('detectKeywordContentIssues', () => {
  test('her sinyal doluysa hiç bulgu üretmez', () => {
    expect(detectKeywordContentIssues([match({})], [page()])).toEqual([])
  })

  test('title\'da yoksa yüksek önemde bulgu üretir', () => {
    const findings = detectKeywordContentIssues([match({ inTitle: false })], [page()])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes("title'da geçmiyor"))).toBe(true)
  })

  test('H1\'de yoksa orta önemde bulgu üretir', () => {
    const findings = detectKeywordContentIssues([match({ inH1: false })], [page()])
    expect(findings.some((f) => f.severity === 'medium' && f.title.includes("H1'de geçmiyor"))).toBe(true)
  })

  test('body\'de yoksa yüksek önemde bulgu üretir', () => {
    const findings = detectKeywordContentIssues([match({ inBody: false })], [page()])
    expect(findings.some((f) => f.severity === 'high' && f.title.includes('içeriğinde hiç geçmiyor'))).toBe(true)
  })

  test('url null ise (eşleşme yok, düşük hacim) on-page bulgusu üretmez', () => {
    const findings = detectKeywordContentIssues([match({ url: null, inTitle: false, matchSource: 'none' })], [page()])
    expect(findings.some((f) => f.title.includes("title'da"))).toBe(false)
  })

  test('eşleşen sayfa taranmadıysa (crawl kapsamı dışı) bulgu üretmez — uydurma yok', () => {
    const findings = detectKeywordContentIssues([match({ inTitle: false })], [])
    expect(findings).toEqual([])
  })

  test('eşleşen sayfa CSR şüpheliyse bulgu üretmez', () => {
    const findings = detectKeywordContentIssues([match({ inTitle: false })], [page({ likelyClientRendered: true })])
    expect(findings).toEqual([])
  })

  test('eşleşen sayfa 404 ise bulgu üretmez', () => {
    const findings = detectKeywordContentIssues([match({ inTitle: false })], [page({ statusCode: 404 })])
    expect(findings).toEqual([])
  })

  test('yüksek hacimli, hiç eşleşmeyen keyword için içerik boşluğu bulgusu üretir', () => {
    const findings = detectKeywordContentIssues(
      [match({ url: null, matchSource: 'none', volume: 5000, inTitle: false, inH1: false, inBody: false })],
      [],
    )
    expect(findings.some((f) => f.severity === 'medium' && f.title.includes('tespit edilemedi'))).toBe(true)
  })

  test('düşük hacimli, eşleşmeyen keyword için içerik boşluğu bulgusu üretmez — gürültü olurdu', () => {
    const findings = detectKeywordContentIssues(
      [match({ url: null, matchSource: 'none', volume: 10, inTitle: false, inH1: false, inBody: false })],
      [],
    )
    expect(findings.some((f) => f.title.includes('tespit edilemedi'))).toBe(false)
  })
})
