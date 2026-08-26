import type { ProjectConfig } from '../../config/schema.js'
import { ProviderError } from '../../core/errors.js'
import { hashString, mulberry32, randomInt } from '../../core/random.js'
import { err, ok } from '../../core/result.js'
import { extractRootDomain, normalizeTr, slugify } from '../../core/text.js'
import {
  AYAKKABI_KEYWORDS,
  BACKLINK_FIXTURES,
  BRAND_NAME_BY_DOMAIN,
  CLIENT_PLACEHOLDER,
  CLIENT_TECH_AUDIT,
  GENERIC_SERP_POOL,
  GSC_FIXTURES,
  type KeywordFixture,
} from '../fixtures/ayakkabiFixtures.js'
import type {
  AiVisibilityProvider,
  BacklinkProvider,
  IndexingProvider,
  KeywordProvider,
  SearchConsoleProvider,
  SerpProvider,
  TechAuditProvider,
} from '../types.js'

const MOCK_MODEL_NAME = 'mock-llm'
const GSC_MOCK_ROW_COUNT = 6

const findFixture = (keyword: string): KeywordFixture | undefined =>
  AYAKKABI_KEYWORDS.find((fixture) => normalizeTr(fixture.keyword) === normalizeTr(keyword))

export const createMockKeywordProvider = (): KeywordProvider => ({
  name: 'mock-keyword',
  isMock: true,
  fetchKeywordMetrics: async (keywords) =>
    ok(
      keywords.map((keyword) => {
        const fixture = findFixture(keyword)
        if (fixture !== undefined) {
          return { keyword, volume: fixture.volume, difficulty: fixture.difficulty, cpc: fixture.cpc }
        }
        // Fixture'da olmayan keyword: hash'ten deterministik "makul" metrik türet
        const rng = mulberry32(hashString(normalizeTr(keyword)))
        return {
          keyword,
          volume: randomInt(rng, 100, 5000),
          difficulty: randomInt(rng, 15, 75) / 100,
          cpc: randomInt(rng, 20, 350) / 100,
        }
      }),
    ),
})

export const createMockSerpProvider = (config: ProjectConfig): SerpProvider => ({
  name: 'mock-serp',
  isMock: true,
  fetchSerp: async (keyword) => {
    const fixture = findFixture(keyword)
    const domains =
      fixture?.serpDomains ??
      // Bilinmeyen keyword: havuzu hash offset'iyle döndürerek deterministik top-10 üret
      GENERIC_SERP_POOL.map(
        (_, index) => GENERIC_SERP_POOL[(index + hashString(normalizeTr(keyword))) % GENERIC_SERP_POOL.length] as string,
      )
    const entries = domains.map((domain, index) => {
      const resolvedDomain = domain === CLIENT_PLACEHOLDER ? config.domain : domain
      return {
        position: index + 1,
        domain: resolvedDomain,
        url: `https://${resolvedDomain}/${slugify(keyword)}`,
      }
    })
    return ok({
      keyword,
      entries,
      hasFeaturedSnippet: fixture?.hasFeaturedSnippet ?? false,
      hasAiOverview: fixture?.hasAiOverview ?? false,
    })
  },
})

export const createMockBacklinkProvider = (config: ProjectConfig): BacklinkProvider => ({
  name: 'mock-backlink',
  isMock: true,
  fetchProfile: async (domain) => {
    const fixtureKey = domain === config.domain ? CLIENT_PLACEHOLDER : domain
    const fixture = BACKLINK_FIXTURES[fixtureKey]
    if (fixture !== undefined) {
      return ok({ domain, ...fixture })
    }
    const rng = mulberry32(hashString(domain))
    const refDomains = randomInt(rng, 50, 3000)
    return ok({
      domain,
      refDomains,
      backlinkCount: refDomains * randomInt(rng, 10, 60),
      domainAuthority: randomInt(rng, 20, 55),
    })
  },
})

export const createMockTechAuditProvider = (config: ProjectConfig): TechAuditProvider => ({
  name: 'mock-tech',
  isMock: true,
  auditUrl: async (url) => {
    if (extractRootDomain(url) === config.domain) {
      return ok({ url, ...CLIENT_TECH_AUDIT, issues: [...CLIENT_TECH_AUDIT.issues] })
    }
    const rng = mulberry32(hashString(extractRootDomain(url)))
    return ok({
      url,
      lcpMs: randomInt(rng, 1400, 2600),
      inpMs: randomInt(rng, 80, 220),
      cls: randomInt(rng, 2, 12) / 100,
      performanceScore: randomInt(rng, 70, 95),
      issues: [],
    })
  },
})

/**
 * AI görünürlük mock'u: gerçek LLM cevapları deterministik değildir;
 * bu mock da örnekleme başına farklı ama tohum bazında tekrarlanabilir cevap üretir.
 * Müşteri markası ~1/3 olasılıkla, rakipler otoritelerine paralel olasılıklarla geçer.
 */
export const createMockAiVisibilityProvider = (config: ProjectConfig, seed: number): AiVisibilityProvider => ({
  name: MOCK_MODEL_NAME,
  isMock: true,
  askQuery: async (query, sampleIndex) => {
    const rng = mulberry32(((seed ^ hashString(normalizeTr(query))) >>> 0) + sampleIndex * 101)
    const mentionProbabilities: readonly { readonly domain: string; readonly probability: number }[] = [
      { domain: 'flo.com.tr', probability: 0.8 },
      { domain: 'derimod.com.tr', probability: 0.5 },
      { domain: 'hotic.com.tr', probability: 0.3 },
      { domain: 'sneakscloud.com', probability: 0.2 },
    ]
    const mentionedBrands = mentionProbabilities
      .filter(({ probability }) => rng() < probability)
      .map(({ domain }) => BRAND_NAME_BY_DOMAIN[domain] ?? domain)
    const clientMentioned = rng() < 1 / 3

    const brandList = mentionedBrands.length > 0 ? mentionedBrands.join(', ') : 'çeşitli yerel markalar'
    const clientSentence = clientMentioned
      ? ` ${config.brandName} da kalite/fiyat dengesiyle öne çıkan seçenekler arasında yer alıyor.`
      : ''
    return ok({
      query,
      model: MOCK_MODEL_NAME,
      text: `"${query}" sorusu için: Türkiye'de ${brandList} sık önerilen markalar arasında.${clientSentence}`,
    })
  },
})

export const createMockSearchConsoleProvider = (config: ProjectConfig): SearchConsoleProvider => ({
  name: 'mock-gsc',
  isMock: true,
  fetchPerformance: async (domain) => {
    if (domain !== config.domain) {
      return err(
        new ProviderError('mock-gsc', `GSC yalnız kendi sitenin verisini verir — '${domain}' erişilemez`),
      )
    }
    // Satırlar config'in KENDİ keyword'lerinden türetilir. Sabit fixture kullanılınca
    // başka bir projenin raporuna yabancı veri sızıyordu (mamcreatives raporunda
    // "örnek ayakkabı" satırları çıkmıştı) — mock veri en azından doğru domaine ait görünmeli.
    return ok(
      config.seedKeywords.slice(0, GSC_MOCK_ROW_COUNT).map((keyword) => {
        const rng = mulberry32(hashString(normalizeTr(keyword)))
        const impressions = randomInt(rng, 200, 6000)
        const clicks = randomInt(rng, 1, Math.max(2, Math.round(impressions / 20)))
        return {
          query: keyword,
          clicks,
          impressions,
          ctr: Number((clicks / impressions).toFixed(4)),
          avgPosition: randomInt(rng, 10, 90) / 10,
        }
      }),
    )
  },
})

/**
 * Sağlıklı bir varsayılan döner (indeksli, canonical uyumlu) — mock'un amacı
 * sentetik hata üretmek değil, gerçek sağlayıcı yokken pipeline'ın akışını
 * kanıtlamak. Gerçek indeksleme sorunları yalnız gerçek GSC ile görünür.
 */
export const createMockIndexingProvider = (): IndexingProvider => ({
  name: 'mock-gsc-url-inspection',
  isMock: true,
  fetchIndexStatus: async (url) =>
    ok({
      url,
      coverageState: 'Submitted and indexed',
      robotsTxtState: 'ALLOWED',
      indexingState: 'INDEXING_ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      googleCanonical: url,
      userCanonical: url,
      lastCrawlTime: new Date().toISOString(),
    }),
})
