import { afterEach, describe, expect, test, vi } from 'vitest'
import { ProviderError } from '../core/errors.js'
import { err, ok, type Result } from '../core/result.js'
import type { CrawledPage } from '../core/types.js'
import { researchDomainWithGemini } from './researchClient.js'

const page: CrawledPage = {
  url: 'https://ornek.com/',
  statusCode: 200,
  finalUrl: 'https://ornek.com/',
  fetchError: null,
  title: 'Örnek Ajans',
  metaDescription: 'Dijital pazarlama ajansı.',
  canonicalUrl: null,
  h1s: ['Örnek Ajans'],
  headingOrder: [],
  hasSchemaOrg: false,
  schemaTypes: [],
  schemaFields: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 50,
  bodyText: 'Dijital pazarlama ve SEO hizmetleri sunuyoruz.',
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
}

const crawlPageOk = async (): Promise<Result<CrawledPage, ProviderError>> => ok(page)
const crawlPageFails = async (): Promise<Result<CrawledPage, ProviderError>> =>
  err(new ProviderError('crawl', 'ağ hatası'))

const geminiResponse = (candidateText: string): Response =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: candidateText }] } }] }), { status: 200 })

const validSuggestionText = JSON.stringify({
  brandName: 'Örnek Ajans',
  brandTokens: ['örnek ajans'],
  seedKeywords: ['dijital pazarlama ajansı', 'seo ajansı'],
  seedCompetitors: [],
  aiQueries: ['İstanbul\'da en iyi dijital pazarlama ajansı hangisi?'],
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('researchDomainWithGemini', () => {
  test('crawl başarısız olursa Gemini\'ye hiç istek atmadan hatayı döner', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await researchDomainWithGemini('ornek.com', 'test-key', crawlPageFails)

    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Gemini geçerli öneri döndürürse başarıyla ayrıştırılmış sonucu verir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiResponse(validSuggestionText)))

    const result = await researchDomainWithGemini('ornek.com', 'test-key', crawlPageOk)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.brandName).toBe('Örnek Ajans')
      expect(result.value.seedKeywords).toContain('seo ajansı')
    }
  })

  test('Gemini hata statüsü dönerse açıklayıcı hata döner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))

    const result = await researchDomainWithGemini('ornek.com', 'test-key', crawlPageOk)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('500')
  })

  test('Gemini geçersiz JSON döndürürse açıklayıcı hata döner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiResponse('bu json değil')))

    const result = await researchDomainWithGemini('ornek.com', 'test-key', crawlPageOk)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('geçerli JSON değil')
  })

  test('fetch ağ hatası fırlatırsa (timeout vb.) yakalanıp Result\'a çevrilir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await researchDomainWithGemini('ornek.com', 'test-key', crawlPageOk)

    expect(result.ok).toBe(false)
  })
})
