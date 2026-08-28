import { describe, expect, test } from 'vitest'
import { EnvSchema, ProjectConfigSchema } from './schema.js'

const validConfig = {
  domain: 'ornekayakkabi.com.tr',
  brandName: 'Örnek Ayakkabı',
  brandTokens: ['örnek ayakkabı'],
  seedKeywords: ['ayakkabı'],
}

describe('ProjectConfigSchema', () => {
  test('geçerli minimal config varsayılanlarla parse edilir', () => {
    // Arrange & Act
    const result = ProjectConfigSchema.safeParse(validConfig)

    // Assert
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.locale).toBe('tr-TR')
      expect(result.data.seedCompetitors).toEqual([])
      expect(result.data.mockSeed).toBe(42)
    }
  })

  test('domain eksikse anlaşılır hata döner', () => {
    const { domain: _omitted, ...withoutDomain } = validConfig
    const result = ProjectConfigSchema.safeParse(withoutDomain)
    expect(result.success).toBe(false)
  })

  test('boş seedKeywords reddedilir', () => {
    const result = ProjectConfigSchema.safeParse({ ...validConfig, seedKeywords: [] })
    expect(result.success).toBe(false)
  })

  test('geçersiz auditUrls reddedilir', () => {
    const result = ProjectConfigSchema.safeParse({ ...validConfig, auditUrls: ['not-a-url'] })
    expect(result.success).toBe(false)
  })

  test('crawl alanları varsayılanlarla dolar', () => {
    const result = ProjectConfigSchema.safeParse(validConfig)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.crawlMaxPages).toBe(60)
      expect(result.data.crawlMaxDepth).toBe(3)
      expect(result.data.crawlExcludePaths).toEqual([])
    }
  })

  test('crawlMaxPages sıfır veya negatifse reddedilir', () => {
    const result = ProjectConfigSchema.safeParse({ ...validConfig, crawlMaxPages: 0 })
    expect(result.success).toBe(false)
  })
})

describe('EnvSchema', () => {
  test('boş string anahtar "yok" sayılır', () => {
    const result = EnvSchema.parse({ SERPAPI_KEY: '  ' })
    expect(result.SERPAPI_KEY).toBeUndefined()
  })

  test('dolu anahtar korunur', () => {
    const result = EnvSchema.parse({ ANTHROPIC_API_KEY: 'test-key' })
    expect(result.ANTHROPIC_API_KEY).toBe('test-key')
  })

  test('CRAWL_PROVIDER boşsa "yok" sayılır', () => {
    const result = EnvSchema.parse({ CRAWL_PROVIDER: '' })
    expect(result.CRAWL_PROVIDER).toBeUndefined()
  })

  test('CRAWL_PROVIDER=live kabul edilir', () => {
    const result = EnvSchema.parse({ CRAWL_PROVIDER: 'live' })
    expect(result.CRAWL_PROVIDER).toBe('live')
  })

  test('CRAWL_PROVIDER geçersiz değerde reddedilir', () => {
    const result = EnvSchema.safeParse({ CRAWL_PROVIDER: 'canli' })
    expect(result.success).toBe(false)
  })
})
