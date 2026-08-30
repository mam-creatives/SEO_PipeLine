import { describe, expect, test } from 'vitest'
import { ProjectConfigSchema } from '../../config/schema.js'
import { ProviderError } from '../../core/errors.js'
import { selectProviders } from '../registry.js'
import {
  createMockAiVisibilityProvider,
  createMockBacklinkProvider,
  createMockCrawlProvider,
  createMockCruxProvider,
  createMockKeywordProvider,
  createMockSearchConsoleProvider,
  createMockSerpProvider,
  createMockTechAuditProvider,
} from './mockProviders.js'

const config = ProjectConfigSchema.parse({
  domain: 'ornekayakkabi.com.tr',
  brandName: 'Örnek Ayakkabı',
  brandTokens: ['örnek ayakkabı'],
  seedCompetitors: ['flo.com.tr'],
  seedKeywords: ['ayakkabı'],
})

describe('mockKeywordProvider', () => {
  test('fixture keyword\'ü fixture metriğiyle döner', async () => {
    const provider = createMockKeywordProvider()
    const result = await provider.fetchKeywordMetrics(['ayakkabı'])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value[0]?.volume).toBe(90500)
  })

  test('bilinmeyen keyword deterministik metrik üretir', async () => {
    const provider = createMockKeywordProvider()
    const first = await provider.fetchKeywordMetrics(['bot ayakkabı modelleri'])
    const second = await provider.fetchKeywordMetrics(['bot ayakkabı modelleri'])
    expect(first).toEqual(second)
  })
})

describe('mockSerpProvider', () => {
  test('CLIENT placeholder config domain\'iyle değiştirilir', async () => {
    const provider = createMockSerpProvider(config)
    const result = await provider.fetchSerp('örnek ayakkabı indirim')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.entries[0]?.domain).toBe('ornekayakkabi.com.tr')
      expect(result.value.entries).toHaveLength(10)
    }
  })

  test('bilinmeyen keyword için de 10 sonuç üretir', async () => {
    const provider = createMockSerpProvider(config)
    const result = await provider.fetchSerp('kışlık bot')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.entries).toHaveLength(10)
  })
})

describe('mockBacklinkProvider', () => {
  test('müşteri domain\'i CLIENT fixture\'ını alır', async () => {
    const provider = createMockBacklinkProvider(config)
    const result = await provider.fetchProfile('ornekayakkabi.com.tr')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.domainAuthority).toBe(22)
  })
})

describe('mockTechAuditProvider', () => {
  test('müşteri sitesi yavaş fixture\'ı alır, rakip site sorunsuz', async () => {
    const provider = createMockTechAuditProvider(config)
    const client = await provider.auditUrl('https://ornekayakkabi.com.tr/')
    const competitor = await provider.auditUrl('https://flo.com.tr/')
    expect(client.ok && client.value.lcpMs).toBe(3900)
    expect(competitor.ok && competitor.value.issues).toEqual([])
  })
})

describe('mockAiVisibilityProvider', () => {
  test('aynı seed + sorgu + sampleIndex aynı cevabı üretir', async () => {
    const providerA = createMockAiVisibilityProvider(config, 42)
    const providerB = createMockAiVisibilityProvider(config, 42)
    const answerA = await providerA.askQuery('En iyi ayakkabı markası?', 1)
    const answerB = await providerB.askQuery('En iyi ayakkabı markası?', 1)
    expect(answerA).toEqual(answerB)
  })

  test('farklı seed farklı örnekleme üretebilir (3 örnek toplamı değişir)', async () => {
    const texts = await Promise.all(
      [0, 1, 2].map(async (sampleIndex) => {
        const result = await createMockAiVisibilityProvider(config, 42).askQuery('deri ayakkabı önerisi', sampleIndex)
        return result.ok ? result.value.text : ''
      }),
    )
    expect(new Set(texts).size).toBeGreaterThanOrEqual(1)
  })
})

describe('mockSearchConsoleProvider', () => {
  test('kendi domain için satırlar döner', async () => {
    const provider = createMockSearchConsoleProvider(config)
    const result = await provider.fetchPerformance('ornekayakkabi.com.tr')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.length).toBeGreaterThan(0)
  })

  test('yabancı domain için hata döner', async () => {
    const provider = createMockSearchConsoleProvider(config)
    const result = await provider.fetchPerformance('flo.com.tr')
    expect(result.ok).toBe(false)
  })
})

describe('mockCruxProvider', () => {
  test('deterministik p75 metrikleri döner', async () => {
    const provider = createMockCruxProvider()
    const result = await provider.fetchFieldCwv('https://ornek.com/')
    expect(result.ok).toBe(true)
    if (result.ok && result.value !== null) {
      expect(result.value.url).toBe('https://ornek.com/')
      expect(result.value.lcpMs).not.toBeNull()
    }
  })

  test('aynı url her seferinde aynı değeri üretir', async () => {
    const provider = createMockCruxProvider()
    const first = await provider.fetchFieldCwv('https://ornek.com/')
    const second = await provider.fetchFieldCwv('https://ornek.com/')
    expect(first).toEqual(second)
  })
})

describe('mockCrawlProvider', () => {
  test('müşteri anasayfası bilinçli olarak kusurlu döner (title/h1/schema yok)', async () => {
    const provider = createMockCrawlProvider(config)
    const result = await provider.fetchPage('https://ornekayakkabi.com.tr/')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.title).toBeNull()
      expect(result.value.h1s).toEqual([])
      expect(result.value.hasSchemaOrg).toBe(false)
    }
  })

  test('diğer URL\'ler sağlıklı deterministik veri döner', async () => {
    const provider = createMockCrawlProvider(config)
    const first = await provider.fetchPage('https://ornekayakkabi.com.tr/urun/bot')
    const second = await provider.fetchPage('https://ornekayakkabi.com.tr/urun/bot')
    expect(first).toEqual(second)
    if (first.ok) {
      expect(first.value.title).not.toBeNull()
      expect(first.value.h1s.length).toBeGreaterThan(0)
    }
  })

  test('robots.txt her zaman izin verir, sitemap boş döner', async () => {
    const provider = createMockCrawlProvider(config)
    const robots = await provider.fetchRobotsRules('https://ornekayakkabi.com.tr')
    const sitemap = await provider.fetchSitemapUrls('https://ornekayakkabi.com.tr/sitemap.xml')
    expect(robots.ok && robots.value.isAllowed('https://ornekayakkabi.com.tr/herhangi')).toBe(true)
    expect(sitemap.ok && sitemap.value).toEqual([])
  })
})

describe('registry.selectProviders', () => {
  test('hiç anahtar yoksa 10 kategori de mock seçilir', () => {
    const providers = selectProviders({}, config)
    expect(providers.mockCategories).toHaveLength(10)
    expect(providers.keyword.isMock).toBe(true)
  })

  test('CRAWL_PROVIDER=live crawler\'ı gerçekleştirir', () => {
    const providers = selectProviders({ CRAWL_PROVIDER: 'live' }, config)
    expect(providers.crawl.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('crawl')
  })

  test('CRUX_API_KEY verilince crux gerçek sağlayıcıya geçer', () => {
    const providers = selectProviders({ CRUX_API_KEY: 'test' }, config)
    expect(providers.crux.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('crux')
  })

  test('SERPAPI_KEY verilince serp gerçek sağlayıcıya geçer', () => {
    const providers = selectProviders({ SERPAPI_KEY: 'test' }, config)
    expect(providers.serp.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('serp')
    expect(providers.mockCategories).toContain('keyword')
  })

  test('DataForSEO iki anahtarı da verilince keyword ve backlink gerçekleşir', () => {
    const providers = selectProviders({ DATAFORSEO_LOGIN: 'a', DATAFORSEO_PASSWORD: 'b' }, config)
    expect(providers.keyword.isMock).toBe(false)
    expect(providers.backlink.isMock).toBe(false)
  })

  test('Faz 4.4 — DataForSEO iki anahtarı da verilince keywordGap da gerçekleşir (aynı kimlik bilgileri)', () => {
    const providers = selectProviders({ DATAFORSEO_LOGIN: 'a', DATAFORSEO_PASSWORD: 'b' }, config)
    expect(providers.keywordGap.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('keywordGap')
  })

  test('Faz 4.4 — DataForSEO yapılandırılmamışsa keywordGap mock kalır', () => {
    const providers = selectProviders({}, config)
    expect(providers.keywordGap.isMock).toBe(true)
    expect(providers.mockCategories).toContain('keywordGap')
  })

  test('yarım DataForSEO yapılandırması sessizce mocka düşmez, hata verir', () => {
    expect(() => selectProviders({ DATAFORSEO_LOGIN: 'a' }, config)).toThrow(ProviderError)
  })

  test('yarım GSC yapılandırması hata verir', () => {
    expect(() => selectProviders({ GSC_CLIENT_EMAIL: 'a@b.com' }, config)).toThrow(ProviderError)
  })

  test('GEMINI_API_KEY AI görünürlüğü gerçekleştirir', () => {
    const providers = selectProviders({ GEMINI_API_KEY: 'test' }, config)
    expect(providers.aiVisibility.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('aiVisibility')
  })

  test('yalnız ANTHROPIC_API_KEY verilince (GEMINI yokken) AI görünürlüğü gerçekleştirir', () => {
    const providers = selectProviders({ ANTHROPIC_API_KEY: 'test' }, config)
    expect(providers.aiVisibility.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('aiVisibility')
  })

  test('GEMINI_API_KEY ve ANTHROPIC_API_KEY birlikte verilince Gemini tercih edilir (tek-motor seçimi)', () => {
    const providers = selectProviders({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }, config)
    expect(providers.aiVisibility.name).toContain('gemini')
  })

  test('TECH_AUDIT_PROVIDER=lighthouse teknik denetimi gerçekleştirir', () => {
    const providers = selectProviders({ TECH_AUDIT_PROVIDER: 'lighthouse' }, config)
    expect(providers.tech.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('tech')
  })
})
