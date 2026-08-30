import { describe, expect, test } from 'vitest'
import type { CrawledPage, PageLink } from '../../core/types.js'
import { detectLinkIssues } from './detectLinkIssues.js'

const link = (overrides: Partial<PageLink>): PageLink => ({
  sourceUrl: 'https://ornek.com/',
  targetUrl: 'https://ornek.com/hakkimizda',
  anchorText: 'Hakkımızda',
  isInternal: true,
  ...overrides,
})

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

describe('detectLinkIssues', () => {
  test('hiç link yoksa ve tek sayfa seed ise bulgu üretmez', () => {
    expect(detectLinkIssues([page({})], ['https://ornek.com/'])).toEqual([])
  })

  test('404 dönen taranmış hedefe link veren sayfa için kırık link bulgusu üretir', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [link({ targetUrl: 'https://ornek.com/eski-sayfa' })] })
    const broken = page({ url: 'https://ornek.com/eski-sayfa', statusCode: 404 })
    const findings = detectLinkIssues([home, broken], ['https://ornek.com/'])
    expect(findings.some((f) => f.category === 'links' && f.title.includes('404'))).toBe(true)
  })

  test('hedef taranmadıysa (kuyrukta değil) kırık link iddia etmez', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [link({ targetUrl: 'https://ornek.com/hic-taranmadi' })] })
    expect(detectLinkIssues([home], ['https://ornek.com/'])).toEqual([])
  })

  test('ağ hatasıyla (fetchError) başarısız hedefe link veren sayfa için de kırık link bulgusu üretir', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [link({ targetUrl: 'https://ornek.com/zaman-asimi' })] })
    const failed = page({ url: 'https://ornek.com/zaman-asimi', statusCode: null, fetchError: 'timeout' })
    const findings = detectLinkIssues([home, failed], ['https://ornek.com/'])
    expect(findings.some((f) => f.category === 'links' && f.evidence.includes('timeout'))).toBe(true)
  })

  test('yönlendirmeye giden linki tespit eder', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [link({ targetUrl: 'https://ornek.com/eski' })] })
    const redirected = page({ url: 'https://ornek.com/eski', finalUrl: 'https://ornek.com/yeni' })
    const findings = detectLinkIssues([home, redirected], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('yönlendirme'))).toBe(true)
  })

  test('hiçbir sayfadan link almayan (seed olmayan) sayfayı öksüz işaretler', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [] })
    const orphan = page({ url: 'https://ornek.com/unutulmus-sayfa' })
    const findings = detectLinkIssues([home, orphan], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('Öksüz') && f.url === 'https://ornek.com/unutulmus-sayfa')).toBe(true)
  })

  test('seed URL kendisi linksiz olsa bile öksüz sayılmaz', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [] })
    const findings = detectLinkIssues([home], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('Öksüz'))).toBe(false)
  })

  test('bir sayfadan link alan sayfa öksüz sayılmaz', () => {
    const home = page({ url: 'https://ornek.com/', internalLinks: [link({ targetUrl: 'https://ornek.com/hakkimizda' })] })
    const linked = page({ url: 'https://ornek.com/hakkimizda' })
    const findings = detectLinkIssues([home, linked], ['https://ornek.com/'])
    expect(findings.some((f) => f.title.includes('Öksüz'))).toBe(false)
  })

  test('2\'den fazla adımlı yönlendirme zinciri bulgu üretir', () => {
    const withChain = page({
      url: 'https://ornek.com/eski',
      redirectChain: [
        { url: 'https://ornek.com/eski', statusCode: 301 },
        { url: 'https://ornek.com/orta', statusCode: 301 },
      ],
      finalUrl: 'https://ornek.com/yeni',
    })
    const findings = detectLinkIssues([withChain])
    expect(findings.some((f) => f.severity === 'medium' && f.title.includes('adımlı yönlendirme zinciri'))).toBe(true)
  })

  test('tek adımlı yönlendirme zincir bulgusu üretmez (yalnız 2+ adım)', () => {
    const singleHop = page({
      url: 'https://ornek.com/eski',
      redirectChain: [{ url: 'https://ornek.com/eski', statusCode: 301 }],
      finalUrl: 'https://ornek.com/yeni',
    })
    const findings = detectLinkIssues([singleHop])
    expect(findings.some((f) => f.title.includes('adımlı yönlendirme zinciri'))).toBe(false)
  })

  test('yönlendirme döngüsü kritik bulgu üretir', () => {
    const looped = page({
      url: 'https://ornek.com/a',
      redirectLoop: true,
      redirectChain: [
        { url: 'https://ornek.com/a', statusCode: 302 },
        { url: 'https://ornek.com/b', statusCode: 302 },
      ],
    })
    const findings = detectLinkIssues([looped])
    expect(findings.some((f) => f.severity === 'critical' && f.title.includes('döngü'))).toBe(true)
  })

  test('sitemap\'teki URL geçici (302) yönlendirmeyle başka yere gidiyorsa bulgu üretir', () => {
    const temp = page({
      url: 'https://ornek.com/kampanya',
      redirectChain: [{ url: 'https://ornek.com/kampanya', statusCode: 302 }],
      finalUrl: 'https://ornek.com/urun',
    })
    const findings = detectLinkIssues([temp], [], ['https://ornek.com/kampanya'])
    expect(findings.some((f) => f.severity === 'low' && f.title.includes('geçici yönlendirmeyle'))).toBe(true)
  })

  test('sitemap\'te olmayan geçici yönlendirme bulgu üretmez', () => {
    const temp = page({
      url: 'https://ornek.com/kampanya',
      redirectChain: [{ url: 'https://ornek.com/kampanya', statusCode: 302 }],
      finalUrl: 'https://ornek.com/urun',
    })
    const findings = detectLinkIssues([temp], [], [])
    expect(findings.some((f) => f.title.includes('geçici yönlendirmeyle'))).toBe(false)
  })

  test('sitemap\'teki URL kalıcı (301) yönlendirmeyle gidiyorsa geçici-yönlendirme bulgusu üretmez', () => {
    const permanent = page({
      url: 'https://ornek.com/kampanya',
      redirectChain: [{ url: 'https://ornek.com/kampanya', statusCode: 301 }],
      finalUrl: 'https://ornek.com/urun',
    })
    const findings = detectLinkIssues([permanent], [], ['https://ornek.com/kampanya'])
    expect(findings.some((f) => f.title.includes('geçici yönlendirmeyle'))).toBe(false)
  })
})
