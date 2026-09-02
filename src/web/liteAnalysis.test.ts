import { describe, expect, test, vi } from 'vitest'
import { ProviderError } from '../core/errors.js'
import { err, ok, type Result } from '../core/result.js'
import type { AiAnswer, CrawledPage, SerpSnapshot, TechAudit } from '../core/types.js'
import { runLiteAnalysis, type LiteAnalysisDeps } from './liteAnalysis.js'
import { openDailyBudget } from './rateLimit.js'

vi.mock('./ssrfGuard.js', () => ({
  assertPublicDomain: vi.fn(async (domain: string) => ok({ domain, resolvedIp: '93.184.216.34' })),
}))

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

const techAudit: TechAudit = {
  url: 'https://ornek.com/',
  lcpMs: 2000,
  inpMs: 150,
  cls: 0.05,
  performanceScore: 90,
  issues: [],
}

const baseDeps = (): LiteAnalysisDeps => ({
  crawlPage: vi.fn(async (): Promise<Result<CrawledPage, ProviderError>> => ok(page)),
  auditUrl: null,
  askGeo: null,
  fetchSerp: null,
  serpBudget: null,
})

describe('runLiteAnalysis', () => {
  test('crawl başarısız olursa hatayı döner, diğer adımlar hiç çağrılmaz', async () => {
    const auditUrl = vi.fn()
    const deps: LiteAnalysisDeps = {
      ...baseDeps(),
      crawlPage: async () => err(new ProviderError('crawl', 'ağ hatası')),
      auditUrl,
    }
    const result = await runLiteAnalysis('ornek.com', [], deps)
    expect(result.ok).toBe(false)
    expect(auditUrl).not.toHaveBeenCalled()
  })

  test('CWV/GEO/SerpApi deps null ise ilgili bölümler atlanır, uyarı eklenir', async () => {
    const result = await runLiteAnalysis('ornek.com', ['Örnek soru?'], baseDeps())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.techAudit).toBeNull()
      expect(result.value.geoResults).toEqual([])
      expect(result.value.competitors).toBeNull()
      expect(result.value.warnings.length).toBeGreaterThan(0)
    }
  })

  test('CWV başarılı olursa techAudit ve cwvDiagnosis dolar', async () => {
    const deps: LiteAnalysisDeps = {
      ...baseDeps(),
      auditUrl: async (): Promise<Result<TechAudit, ProviderError>> => ok(techAudit),
    }
    const result = await runLiteAnalysis('ornek.com', [], deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.techAudit).toEqual(techAudit)
  })

  test('GEO sorularının her biri için askGeo çağrılır, marka geçen cevap mentioned:true üretir', async () => {
    const askGeo = vi.fn(async (query: string): Promise<Result<AiAnswer, ProviderError>> =>
      ok({ query, model: 'test', text: 'Örnek Ajans harika bir seçim.' }),
    )
    const deps: LiteAnalysisDeps = { ...baseDeps(), askGeo }
    const result = await runLiteAnalysis('ornek.com', ['Soru 1?', 'Soru 2?'], deps)
    expect(askGeo).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.geoResults).toHaveLength(2)
      expect(result.value.geoResults.every((r) => r.mentioned)).toBe(true)
    }
  })

  test('fetchSerp verilse bile günlük bütçe tükenmişse SerpApi hiç çağrılmaz', async () => {
    const budget = openDailyBudget(':memory:', 1)
    budget.tryConsume() // kotayı tüket
    const fetchSerp = vi.fn()
    const deps: LiteAnalysisDeps = { ...baseDeps(), fetchSerp, serpBudget: budget }
    const result = await runLiteAnalysis('ornek.com', [], deps)
    expect(fetchSerp).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.competitors).toBeNull()
    budget.close()
  })

  test('bütçe varsa fetchSerp çağrılır ve rakipler doldurulur', async () => {
    const budget = openDailyBudget(':memory:', 5)
    const serpSnapshot: SerpSnapshot = {
      keyword: 'Örnek Ajans',
      entries: [
        { domain: 'ornek.com', url: 'https://ornek.com/', position: 1 },
        { domain: 'rakip.com', url: 'https://rakip.com/', position: 2 },
      ],
      hasFeaturedSnippet: false,
      hasAiOverview: false,
    }
    const deps: LiteAnalysisDeps = {
      ...baseDeps(),
      fetchSerp: async (): Promise<Result<SerpSnapshot, ProviderError>> => ok(serpSnapshot),
      serpBudget: budget,
    }
    const result = await runLiteAnalysis('ornek.com', [], deps)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.competitors).not.toBeNull()
    budget.close()
  })
})
