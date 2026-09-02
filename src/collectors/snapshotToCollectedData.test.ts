import { describe, expect, test } from 'vitest'
import type { ProjectConfig } from '../config/schema.js'
import type { RunSnapshot, SerpSnapshot } from '../core/types.js'
import { snapshotToCollectedData } from './snapshotToCollectedData.js'

const config: ProjectConfig = {
  domain: 'ornekayakkabi.com.tr',
  brandName: 'Örnek Ayakkabı',
  brandTokens: ['örnek ayakkabı'],
  seedCompetitors: [],
  seedKeywords: ['spor ayakkabı'],
  aiQueries: [],
  auditUrls: [],
  locale: 'tr-TR',
  mockSeed: 42,
  crawlMaxPages: 300,
  crawlMaxDepth: 5,
  crawlExcludePaths: [],
  crawlEnabled: true,
  codePath: undefined,
}

const makeSnapshot = (overrides: Partial<RunSnapshot> = {}): RunSnapshot => ({
  run: { id: 1, startedAt: '2026-08-31T10:00:00Z', finishedAt: '2026-08-31T10:01:00Z', status: 'completed', configHash: 'h1', mockCategories: [] },
  keywords: [{ keyword: 'spor ayakkabı', volume: 100, difficulty: 0.5, cpc: 1, intent: 'commercial', clusterId: 'c1', clientRank: 5 }],
  serps: [],
  backlinks: [],
  techAudits: [],
  aiSamples: [],
  gscRows: [],
  competitors: [],
  indexStatuses: [],
  fieldCwv: [],
  pages: [],
  pageLinks: [],
  keywordGaps: [],
  sitemapUrls: ['https://ornekayakkabi.com.tr/sitemap.xml'],
  ...overrides,
})

describe('snapshotToCollectedData', () => {
  // Dış denetim düzeltmesi (2026-08-31, BLOKER 3) — önceden sitemapUrls DB'de kalıcı
  // olmadığı için burada hep [] dönüyordu; artık migrations.ts v18 ile persist ediliyor.
  test('sitemapUrls doğrudan snapshot\'tan geçirilir', () => {
    const collected = snapshotToCollectedData(makeSnapshot(), config, () => [])
    expect(collected.sitemapUrls).toEqual(['https://ornekayakkabi.com.tr/sitemap.xml'])
  })

  // crawlSeedUrls önceden hep [] dönüyordu; artık runAllCollectors.ts'teki AYNI formülle
  // (anasayfa + deriveAuditUrls) yeniden hesaplanıyor — DI enjeksiyonu collectors→analysis
  // bağımlılığı oluşturmadan.
  test('crawlSeedUrls anasayfa + deriveAuditUrls sonucundan türer, tekilleştirilir', () => {
    const deriveAuditUrls = (serps: readonly SerpSnapshot[]): readonly string[] => {
      expect(serps).toEqual([])
      return ['https://ornekayakkabi.com.tr/', 'https://ornekayakkabi.com.tr/urun/bot']
    }
    const collected = snapshotToCollectedData(makeSnapshot(), config, deriveAuditUrls)
    expect(collected.crawlSeedUrls).toEqual(['https://ornekayakkabi.com.tr/', 'https://ornekayakkabi.com.tr/urun/bot'])
  })

  test('deriveAuditUrls\'e gerçek snapshot.serps geçirilir', () => {
    const serps: SerpSnapshot[] = [{ keyword: 'spor ayakkabı', entries: [], hasFeaturedSnippet: false, hasAiOverview: false }]
    let received: readonly SerpSnapshot[] | null = null
    snapshotToCollectedData(makeSnapshot({ serps }), config, (s) => {
      received = s
      return []
    })
    expect(received).toEqual(serps)
  })

  // codePath yapılandırılmamışsa (bu testin config'i gibi) collectSourceCode boş döner —
  // önceden zaten hep [] idi, davranış bu uçta değişmedi.
  test('codePath yoksa sourceFiles/detectedStacks boş döner', () => {
    const collected = snapshotToCollectedData(makeSnapshot(), config, () => [])
    expect(collected.sourceFiles).toEqual([])
    expect(collected.detectedStacks).toEqual([])
  })

  test('diğer alanlar snapshot\'tan olduğu gibi geçer', () => {
    const collected = snapshotToCollectedData(makeSnapshot(), config, () => [])
    expect(collected.keywords).toEqual(makeSnapshot().keywords)
    expect(collected.failedBranches).toEqual([])
  })
})
