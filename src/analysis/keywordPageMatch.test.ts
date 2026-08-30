import { describe, expect, test } from 'vitest'
import type { CrawledPage, GscRow, KeywordSnapshotRow, SerpSnapshot } from '../core/types.js'
import { matchKeywordsToPages } from './keywordPageMatch.js'

const row = (overrides: Partial<KeywordSnapshotRow>): KeywordSnapshotRow => ({
  keyword: 'spor ayakkabı',
  volume: 1000,
  difficulty: 0.4,
  cpc: 1.2,
  intent: 'commercial',
  clusterId: 'ayakk-commercial',
  clientRank: null,
  ...overrides,
})

const page = (overrides: Partial<CrawledPage>): CrawledPage => ({
  url: 'https://ornek.com/spor-ayakkabi',
  statusCode: 200,
  finalUrl: 'https://ornek.com/spor-ayakkabi',
  fetchError: null,
  title: 'Spor Ayakkabı Modelleri',
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
  bodyText: 'En iyi spor ayakkabı modelleri burada, fiyat ve stok bilgisi.',
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

describe('matchKeywordsToPages', () => {
  test('GSC gösterimi varsa GSC eşleşmesi tercih edilir', () => {
    const gscRows: GscRow[] = [
      { query: 'spor ayakkabı', page: 'https://ornek.com/spor-ayakkabi', clicks: 10, impressions: 500, ctr: 0.02, avgPosition: 5 },
    ]
    const matches = matchKeywordsToPages([row({})], [page({})], gscRows, [], 'ornek.com')
    expect(matches[0]).toMatchObject({ url: 'https://ornek.com/spor-ayakkabi', matchSource: 'gsc' })
  })

  test('birden fazla GSC sayfası varsa en çok gösterim alan seçilir', () => {
    const gscRows: GscRow[] = [
      { query: 'spor ayakkabı', page: 'https://ornek.com/az-gosterim', clicks: 1, impressions: 50, ctr: 0.02, avgPosition: 8 },
      { query: 'spor ayakkabı', page: 'https://ornek.com/cok-gosterim', clicks: 10, impressions: 900, ctr: 0.01, avgPosition: 3 },
    ]
    const matches = matchKeywordsToPages([row({})], [], gscRows, [], 'ornek.com')
    expect(matches[0]?.url).toBe('https://ornek.com/cok-gosterim')
  })

  test('GSC verisi yoksa SERP\'teki müşteri URL\'i kullanılır', () => {
    const serps: SerpSnapshot[] = [
      {
        keyword: 'spor ayakkabı',
        entries: [{ position: 3, domain: 'ornek.com', url: 'https://ornek.com/spor-ayakkabi' }],
        hasFeaturedSnippet: false,
        hasAiOverview: false,
      },
    ]
    const matches = matchKeywordsToPages([row({})], [], [], serps, 'ornek.com')
    expect(matches[0]).toMatchObject({ url: 'https://ornek.com/spor-ayakkabi', matchSource: 'serp' })
  })

  test('ne GSC ne SERP eşleşmesi yoksa url null, matchSource none', () => {
    const matches = matchKeywordsToPages([row({})], [], [], [], 'ornek.com')
    expect(matches[0]).toMatchObject({ url: null, matchSource: 'none', inTitle: false, inH1: false, inBody: false })
  })

  test('eşleşen sayfa taranmışsa title/H1/body sinyalleri doğru hesaplanır', () => {
    const gscRows: GscRow[] = [
      { query: 'spor ayakkabı', page: 'https://ornek.com/spor-ayakkabi', clicks: 5, impressions: 100, ctr: 0.05, avgPosition: 4 },
    ]
    const matches = matchKeywordsToPages([row({})], [page({})], gscRows, [], 'ornek.com')
    expect(matches[0]).toMatchObject({ inTitle: true, inH1: true, inBody: true })
  })

  test('eşleşen sayfa crawl kapsamı dışındaysa (taranmadıysa) on-page alanları false — uydurma yok', () => {
    const gscRows: GscRow[] = [
      { query: 'spor ayakkabı', page: 'https://ornek.com/hic-taranmadi', clicks: 5, impressions: 100, ctr: 0.05, avgPosition: 4 },
    ]
    const matches = matchKeywordsToPages([row({})], [], gscRows, [], 'ornek.com')
    expect(matches[0]).toMatchObject({ url: 'https://ornek.com/hic-taranmadi', matchSource: 'gsc', inTitle: false, inH1: false, inBody: false })
  })

  test('keyword title/H1/body\'de geçmiyorsa false döner', () => {
    const gscRows: GscRow[] = [
      { query: 'kadın çanta', page: 'https://ornek.com/spor-ayakkabi', clicks: 5, impressions: 100, ctr: 0.05, avgPosition: 4 },
    ]
    const matches = matchKeywordsToPages([row({ keyword: 'kadın çanta' })], [page({})], gscRows, [], 'ornek.com')
    expect(matches[0]).toMatchObject({ inTitle: false, inH1: false, inBody: false })
  })

  test('Türkçe büyük/küçük harf farkı eşleşmeyi bozmaz (İ/i sorunu)', () => {
    const gscRows: GscRow[] = [
      { query: 'SPOR AYAKKABI', page: 'https://ornek.com/spor-ayakkabi', clicks: 5, impressions: 100, ctr: 0.05, avgPosition: 4 },
    ]
    const matches = matchKeywordsToPages([row({})], [page({})], gscRows, [], 'ornek.com')
    expect(matches[0]?.matchSource).toBe('gsc')
  })
})
