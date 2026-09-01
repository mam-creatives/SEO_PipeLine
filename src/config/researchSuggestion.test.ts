import { describe, expect, test } from 'vitest'
import type { CrawledPage } from '../core/types.js'
import { buildResearchPrompt, parseResearchSuggestion } from './researchSuggestion.js'

const page: CrawledPage = {
  url: 'https://ornek.com/',
  statusCode: 200,
  finalUrl: 'https://ornek.com/',
  fetchError: null,
  title: 'Örnek Ajans | Dijital Pazarlama',
  metaDescription: 'İstanbul merkezli dijital pazarlama ajansı.',
  canonicalUrl: null,
  h1s: ['Dijital Pazarlama Ajansı'],
  headingOrder: [],
  hasSchemaOrg: false,
  schemaTypes: [],
  schemaFields: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 120,
  bodyText: 'Biz İstanbul merkezli bir dijital pazarlama ajansıyız, SEO ve reklam yönetimi sunuyoruz.',
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

const validSuggestionJson = JSON.stringify({
  brandName: 'Örnek Ajans',
  brandTokens: ['örnek ajans', 'ornek ajans'],
  seedKeywords: ['dijital pazarlama ajansı', 'seo ajansı', 'örnek ajans'],
  seedCompetitors: [],
  aiQueries: ['İstanbul\'da en iyi dijital pazarlama ajansı hangisi?'],
})

describe('buildResearchPrompt', () => {
  test('domaini ve sayfa bağlamını istem metnine gömer', () => {
    const prompt = buildResearchPrompt('ornek.com', page)
    expect(prompt).toContain('ornek.com')
    expect(prompt).toContain('Örnek Ajans | Dijital Pazarlama')
    expect(prompt).toContain('İstanbul merkezli dijital pazarlama ajansı.')
    expect(prompt).toContain('Dijital Pazarlama Ajansı')
  })

  test('markanın adını AI sorularına koymama talimatını içerir', () => {
    expect(buildResearchPrompt('ornek.com', page)).toContain('MARKANIN ADINI İÇERMEYEN')
  })

  test('rakip uydurmama talimatını içerir', () => {
    expect(buildResearchPrompt('ornek.com', page)).toContain('UYDURMA')
  })

  test('h1 yoksa "(yok)" yazar, boş dizi hatası vermez', () => {
    const prompt = buildResearchPrompt('ornek.com', { ...page, h1s: [] })
    expect(prompt).toContain('Başlıklar (H1): (yok)')
  })
})

describe('parseResearchSuggestion', () => {
  test('geçerli JSON metnini doğrulanmış öneriye çevirir', () => {
    const result = parseResearchSuggestion(validSuggestionJson)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.brandName).toBe('Örnek Ajans')
      expect(result.value.seedKeywords).toHaveLength(3)
    }
  })

  test('```json çitiyle sarılmış cevabı da ayrıştırır', () => {
    const fenced = `\`\`\`json\n${validSuggestionJson}\n\`\`\``
    const result = parseResearchSuggestion(fenced)
    expect(result.ok).toBe(true)
  })

  test('seedCompetitors/aiQueries verilmezse boş diziye düşer', () => {
    const minimal = JSON.stringify({
      brandName: 'Örnek Ajans',
      brandTokens: ['örnek ajans'],
      seedKeywords: ['dijital pazarlama ajansı'],
    })
    const result = parseResearchSuggestion(minimal)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.seedCompetitors).toEqual([])
      expect(result.value.aiQueries).toEqual([])
    }
  })

  test('geçersiz JSON için açıklayıcı hata döner', () => {
    const result = parseResearchSuggestion('bu bir JSON değil {{{')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('geçerli JSON değil')
  })

  test('şemaya uymayan JSON için açıklayıcı hata döner (ör. seedKeywords eksik)', () => {
    const result = parseResearchSuggestion(JSON.stringify({ brandName: 'X', brandTokens: ['x'] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('beklenen şemaya uymuyor')
  })

  test('boş dizi alanları (min 1 kuralı ihlali) reddedilir', () => {
    const result = parseResearchSuggestion(
      JSON.stringify({ brandName: 'X', brandTokens: [], seedKeywords: ['x'] }),
    )
    expect(result.ok).toBe(false)
  })
})
