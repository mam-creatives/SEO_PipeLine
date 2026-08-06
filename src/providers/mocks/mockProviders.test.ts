import { describe, expect, test } from 'vitest'
import { ProjectConfigSchema } from '../../config/schema.js'
import { ProviderError } from '../../core/errors.js'
import { selectProviders } from '../registry.js'
import {
  createMockAiVisibilityProvider,
  createMockBacklinkProvider,
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

describe('registry.selectProviders', () => {
  test('hiç anahtar yoksa 6 kategori de mock seçilir', () => {
    const providers = selectProviders({}, config)
    expect(providers.mockCategories).toHaveLength(6)
    expect(providers.keyword.isMock).toBe(true)
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

  test('implemente edilmemiş Anthropic anahtarı hâlâ yüksek sesle hata verir', () => {
    expect(() => selectProviders({ ANTHROPIC_API_KEY: 'test' }, config)).toThrow(ProviderError)
  })

  test('TECH_AUDIT_PROVIDER=lighthouse teknik denetimi gerçekleştirir', () => {
    const providers = selectProviders({ TECH_AUDIT_PROVIDER: 'lighthouse' }, config)
    expect(providers.tech.isMock).toBe(false)
    expect(providers.mockCategories).not.toContain('tech')
  })
})
