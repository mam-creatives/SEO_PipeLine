import type { ProjectConfig } from '../../config/schema.js'
import { ProviderError } from '../../core/errors.js'
import { hashString, mulberry32, randomInt } from '../../core/random.js'
import { err, ok } from '../../core/result.js'
import { extractRootDomain, normalizeTr, slugify } from '../../core/text.js'
import type { KeywordGap } from '../../core/types.js'
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
  CrawlProvider,
  CruxProvider,
  IndexingProvider,
  KeywordGapProvider,
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

/**
 * Faz 4.4 — "rakipte var, sende yok" keyword'leri. Uydurma metin yerine mevcut AYAKKABI_KEYWORDS
 * evrenini (`config`/`fetchProfile`'daki gibi) yeniden kullanır — tutarlı sentetik tema.
 */
export const createMockKeywordGapProvider = (): KeywordGapProvider => ({
  name: 'mock-keyword-gap',
  isMock: true,
  fetchGapKeywords: async (domain, competitorDomains) =>
    ok(
      competitorDomains.flatMap((competitorDomain): KeywordGap[] => {
        const rng = mulberry32(hashString(`${domain}:${competitorDomain}`))
        const sampleSize = randomInt(rng, 2, 5)
        return Array.from({ length: sampleSize }, (_, index): KeywordGap | null => {
          const fixture = AYAKKABI_KEYWORDS[(index + hashString(competitorDomain)) % AYAKKABI_KEYWORDS.length]
          if (fixture === undefined) return null
          return {
            keyword: fixture.keyword,
            competitorDomain,
            competitorPosition: randomInt(rng, 1, 10),
            volume: fixture.volume,
          }
        }).filter((gap): gap is KeywordGap => gap !== null)
      }),
    ),
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
      config.seedKeywords.slice(0, GSC_MOCK_ROW_COUNT).flatMap((keyword, index) => {
        const rng = mulberry32(hashString(normalizeTr(keyword)))
        const impressions = randomInt(rng, 200, 6000)
        const clicks = randomInt(rng, 1, Math.max(2, Math.round(impressions / 20)))
        const primary = {
          query: keyword,
          page: `https://${config.domain}/${slugify(keyword)}`,
          clicks,
          impressions,
          ctr: Number((clicks / impressions).toFixed(4)),
          avgPosition: randomInt(rng, 10, 90) / 10,
        }
        // İlk sorgu deterministik olarak yamyamlık (cannibalization) örneği taşır — aksi halde
        // rapor bölümü mock modda hep boş kalır ve uçtan uca test asla tetiklenmez.
        if (index !== 0) return [primary]
        const secondaryImpressions = Math.round(impressions * 0.5)
        const secondaryClicks = Math.max(1, Math.round(secondaryImpressions / 25))
        const secondary = {
          query: keyword,
          page: `https://${config.domain}/blog/${slugify(keyword)}`,
          clicks: secondaryClicks,
          impressions: secondaryImpressions,
          ctr: Number((secondaryClicks / secondaryImpressions).toFixed(4)),
          avgPosition: randomInt(rng, 91, 150) / 10,
        }
        return [primary, secondary]
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

/**
 * Deterministik p75 üretir (URL hash'inden) — gerçek CrUX'un "bazı metrikler
 * yetersiz trafikte eksik gelir" davranışını taklit etmez, mock modun amacı
 * akışı kanıtlamaktır: her zaman üç metrik de dolu döner.
 */
export const createMockCruxProvider = (): CruxProvider => ({
  name: 'mock-crux',
  isMock: true,
  fetchFieldCwv: async (url) => {
    const rng = mulberry32(hashString(url))
    return ok({
      url,
      formFactor: 'ALL_FORM_FACTORS',
      lcpMs: randomInt(rng, 1800, 4200),
      inpMs: randomInt(rng, 120, 350),
      cls: randomInt(rng, 2, 18) / 100,
    })
  },
})

/**
 * Dış denetim bulgusu (2026-08-31, BLOKER 1) — bu fonksiyon önceden müşterinin GERÇEK
 * anasayfasını (`config.domain` + `/`) bilinçli olarak kusurlu döndürüyordu (title/h1/schema
 * yok). Sonuç: `CRAWL_PROVIDER=live` unutulduğunda (tam olarak `.env`'de eksik kalınca olan
 * şey) rapor, müşterinin GERÇEK domaininde "title yok / H1 yok / meta description yok" diye
 * KRİTİK bulgu yayınlıyordu — canlı siteden `curl` ile doğrulandığında üçü de yanlıştı.
 * README'nin kendi ifadesiyle bu "en tehlikeli sessiz hata".
 *
 * Düzeltme: anasayfa artık SAĞLIKLI şablonu alır (aşağıdaki "diğer URL'ler" dalıyla aynı
 * şekil). "Kusurlu sayfa" demosu — crawlFindings'in mock/e2e testte boş kalmaması için hâlâ
 * gerekli — artık anasayfadan linklenen, adından bile mock olduğu belli AYRI bir sentinel yola
 * taşındı: `/ornek-mock-sayfa`. `crawlSite.ts`'in BFS'i yalnız aynı-site linkleri takip ettiği
 * için (`isSameSite`) tamamen ayrı bir domain kullanılamıyor — bu yüzden aynı domain altında
 * ama gerçek bir sayfa olamayacak kadar belirgin bir yol seçildi.
 */
const MOCK_DEMO_FINDING_PATH = '/ornek-mock-sayfa'

export const createMockCrawlProvider = (config: ProjectConfig): CrawlProvider => ({
  name: 'mock-crawl',
  isMock: true,
  fetchPage: async (url) => {
    const isDemoFindingPage = extractRootDomain(url) === config.domain && new URL(url).pathname === MOCK_DEMO_FINDING_PATH
    if (isDemoFindingPage) {
      return ok({
        url,
        statusCode: 200,
        finalUrl: url,
        fetchError: null,
        title: null,
        metaDescription: '',
        canonicalUrl: url,
        h1s: [],
        headingOrder: ['h3', 'h2'],
        hasSchemaOrg: false,
        schemaTypes: [],
        schemaFields: [],
        ogComplete: false,
        imagesMissingAlt: 1,
        wordCount: 120,
        bodyText: 'Bu, mock crawler\'ın örnek bulgu üretmek için ürettiği sentetik bir sayfadır — gerçek sitede yoktur.',
        metaRobots: null,
        internalLinks: [],
        externalLinkCount: 2,
        likelyClientRendered: false,
        depth: 0,
        hreflangs: [],
        xRobotsTag: null,
        contentType: 'text/html',
        headerHreflangs: [],
        securityHeaders: [],
        redirectChain: [],
        redirectLoop: false,
        viewportMeta: null,
        langAttribute: null,
        mixedContentCount: 0,
        imagesMissingDimensions: 1,
      })
    }
    const isRealHomepage = extractRootDomain(url) === config.domain && new URL(url).pathname === '/'
    if (isRealHomepage) {
      return ok({
        url,
        statusCode: 200,
        finalUrl: url,
        fetchError: null,
        title: `Sayfa — ${url}`,
        metaDescription: 'Örnek açıklama metni.',
        canonicalUrl: url,
        h1s: ['Ana Başlık'],
        headingOrder: ['h1', 'h2'],
        hasSchemaOrg: true,
        schemaTypes: ['WebPage'],
        schemaFields: [{ type: 'WebPage', keys: [] }],
        ogComplete: true,
        imagesMissingAlt: 0,
        wordCount: 400,
        bodyText: `Ana Başlık ile ilgili örnek içerik. ${url} sayfasının açıklaması ve detayları burada yer alır.`,
        metaRobots: null,
        // MOCK_DEMO_FINDING_PATH linki BURADA — BFS anasayfadan başladığı için sentinel
        // sayfa yalnız buradan erişilebilir olmalı, aksi halde crawlFindings mock modda hep boş kalır.
        internalLinks: ['hakkimizda', 'hizmetlerimiz', MOCK_DEMO_FINDING_PATH.slice(1)].map((path) => ({
          sourceUrl: url,
          targetUrl: `https://${config.domain}/${path}`,
          anchorText: path,
          isInternal: true,
        })),
        externalLinkCount: 2,
        likelyClientRendered: false,
        depth: 0,
        hreflangs: [],
        xRobotsTag: null,
        contentType: 'text/html',
        headerHreflangs: [],
        securityHeaders: [],
        redirectChain: [],
        redirectLoop: false,
        viewportMeta: 'width=device-width, initial-scale=1',
        langAttribute: 'tr',
        mixedContentCount: 0,
        imagesMissingDimensions: 0,
      })
    }
    const rng = mulberry32(hashString(url))
    return ok({
      url,
      statusCode: 200,
      finalUrl: url,
      fetchError: null,
      title: `Sayfa — ${url}`,
      metaDescription: 'Örnek açıklama metni.',
      canonicalUrl: url,
      h1s: ['Ana Başlık'],
      headingOrder: ['h1', 'h2'],
      hasSchemaOrg: true,
      schemaTypes: ['WebPage'],
      schemaFields: [{ type: 'WebPage', keys: [] }],
      ogComplete: true,
      imagesMissingAlt: 0,
      wordCount: randomInt(rng, 150, 600),
      bodyText: `Ana Başlık ile ilgili örnek içerik. ${url} sayfasının açıklaması ve detayları burada yer alır.`,
      metaRobots: null,
      internalLinks: [],
      externalLinkCount: 0,
      likelyClientRendered: false,
      depth: 0,
      hreflangs: [],
      xRobotsTag: null,
      contentType: 'text/html',
      headerHreflangs: [],
      securityHeaders: [],
      redirectChain: [],
      redirectLoop: false,
      viewportMeta: 'width=device-width, initial-scale=1',
      langAttribute: 'tr',
      mixedContentCount: 0,
      imagesMissingDimensions: 0,
    })
  },
  fetchRobotsRules: async () => ok({ isAllowed: () => true, sitemaps: [] }),
  fetchSitemapUrls: async () => ok([]),
})
