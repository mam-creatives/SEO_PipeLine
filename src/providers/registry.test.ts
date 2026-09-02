import { describe, expect, test } from 'vitest'
import type { Env, ProjectConfig } from '../config/schema.js'
import { selectProviders } from './registry.js'

const config: ProjectConfig = {
  domain: 'ornek.com',
  brandName: 'Örnek',
  brandTokens: ['örnek'],
  seedCompetitors: [],
  seedKeywords: ['örnek'],
  aiQueries: [],
  auditUrls: [],
  locale: 'tr-TR',
  mockSeed: 42,
  crawlMaxPages: 300,
  crawlMaxDepth: 5,
  crawlExcludePaths: [],
  crawlEnabled: true,
}

const emptyEnv: Env = {}

describe('selectProviders — crawl', () => {
  test('CRAWL_PROVIDER=live ve crawlEnabled varsayılan (true) ise gerçek sağlayıcı seçilir', () => {
    const providers = selectProviders({ ...emptyEnv, CRAWL_PROVIDER: 'live' }, config)
    expect(providers.crawl.isMock).toBe(false)
  })

  test('CRAWL_PROVIDER verilmezse crawlEnabled true olsa bile mock kalır', () => {
    const providers = selectProviders(emptyEnv, config)
    expect(providers.crawl.isMock).toBe(true)
  })

  // Dış denetim bulgusu (2026-09-02) — bilgekampus.com gibi JS-fingerprint tabanlı bir
  // anti-bot katmanı arkasındaki siteler için: CRAWL_PROVIDER global olduğundan, bu
  // TEK müşteriyi diğerlerini etkilemeden mock'a düşürmenin yolu crawlEnabled:false.
  test('crawlEnabled:false ise CRAWL_PROVIDER=live olsa bile mock\'a düşer', () => {
    const providers = selectProviders({ ...emptyEnv, CRAWL_PROVIDER: 'live' }, { ...config, crawlEnabled: false })
    expect(providers.crawl.isMock).toBe(true)
  })

  test('mockCategories listesi crawlEnabled:false olduğunda "crawl" içerir', () => {
    const providers = selectProviders({ ...emptyEnv, CRAWL_PROVIDER: 'live' }, { ...config, crawlEnabled: false })
    expect(providers.mockCategories).toContain('crawl')
  })
})
