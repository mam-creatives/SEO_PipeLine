import { describe, expect, test } from 'vitest'
import { ProjectConfigSchema } from '../config/schema.js'
import type { Finding } from '../core/findings.js'
import type { AiVisibilitySample, RunSnapshot, SerpSnapshot } from '../core/types.js'
import { buildClusters, buildKeywordRows, clusterIdFor } from './clusterKeywords.js'
import { detectAiGaps } from './detectAiGaps.js'
import { diffRuns } from './diffRuns.js'
import { discoverCompetitors } from './discoverCompetitors.js'
import { classifyDomain } from './domainClassifier.js'
import { classifyIntent } from './intentRules.js'
import { rankOpportunities, scoreOpportunity } from './scoreOpportunities.js'

const config = ProjectConfigSchema.parse({
  domain: 'ornekayakkabi.com.tr',
  brandName: 'Örnek Ayakkabı',
  brandTokens: ['örnek ayakkabı'],
  seedCompetitors: ['flo.com.tr', 'derimod.com.tr'],
  seedKeywords: ['ayakkabı'],
})

const brandTokens = config.brandTokens

const makeSerp = (keyword: string, domains: readonly string[]): SerpSnapshot => ({
  keyword,
  entries: domains.map((domain, index) => ({
    position: index + 1,
    domain,
    url: `https://${domain}/x`,
  })),
  hasFeaturedSnippet: false,
  hasAiOverview: false,
})

describe('classifyIntent', () => {
  test('her niyet türü doğru işaretlenir', () => {
    expect(classifyIntent('ayakkabı nasıl temizlenir', brandTokens)).toBe('informational')
    expect(classifyIntent('ucuz ayakkabı', brandTokens)).toBe('commercial')
    expect(classifyIntent('İstanbul ayakkabı mağazası', brandTokens)).toBe('local')
    expect(classifyIntent('örnek ayakkabı indirim', brandTokens)).toBe('branded')
  })

  test('öncelik: branded > local, local > commercial', () => {
    // hem marka hem şehir içeriyor → branded kazanır
    expect(classifyIntent('İstanbul örnek ayakkabı', brandTokens)).toBe('branded')
    // hem şehir hem ticari işaret içeriyor → local kazanır
    expect(classifyIntent('İstanbul ucuz ayakkabı', brandTokens)).toBe('local')
  })

  test('Türkçe büyük İ harfi doğru normalize edilir', () => {
    expect(classifyIntent('İSTANBUL AYAKKABI MAĞAZASI', brandTokens)).toBe('local')
  })

  test('işaretsiz head-term commercial varsayılır', () => {
    expect(classifyIntent('ayakkabı', brandTokens)).toBe('commercial')
  })
})

describe('clusterIdFor / buildClusters', () => {
  test('aynı aile aynı köke, farklı niyet farklı kümeye düşer', () => {
    expect(clusterIdFor('kadın ayakkabı', 'commercial')).toBe('ayakk-commercial')
    expect(clusterIdFor('deri ayakkabı bakımı nasıl yapılır', 'informational')).toBe('ayakk-informational')
    expect(clusterIdFor('kadın ayakkabı', 'commercial')).not.toBe(
      clusterIdFor('deri ayakkabı bakımı nasıl yapılır', 'informational'),
    )
  })

  test('buildClusters temsilci olarak en yüksek hacmi seçer', () => {
    const rows = buildKeywordRows(
      [
        { keyword: 'ayakkabı', volume: 90500, difficulty: 0.9, cpc: 5 },
        { keyword: 'deri ayakkabı', volume: 9900, difficulty: 0.5, cpc: 3 },
      ],
      [makeSerp('deri ayakkabı', ['flo.com.tr', 'ornekayakkabi.com.tr'])],
      config,
    )
    const clusters = buildClusters(rows)
    expect(clusters[0]?.representativeKeyword).toBe('ayakkabı')
    expect(clusters[0]?.totalVolume).toBe(100400)
    expect(clusters[0]?.bestClientRank).toBe(2)
  })
})

describe('classifyDomain', () => {
  test('pazaryeri, haber ve toplayıcılar business değildir', () => {
    expect(classifyDomain('trendyol.com')).toBe('marketplace')
    expect(classifyDomain('hurriyet.com.tr')).toBe('news')
    expect(classifyDomain('onedio.com')).toBe('aggregator')
    expect(classifyDomain('flo.com.tr')).toBe('business')
  })

  test('subdomain de eşleşir', () => {
    expect(classifyDomain('blog.trendyol.com')).toBe('marketplace')
  })
})

describe('discoverCompetitors', () => {
  test('eşik sınırı: tam %15 gerçek rakip, altı değil', () => {
    // 20 keyword: biri 3'ünde (0.15), diğeri 2'sinde (0.10) görünüyor
    const serps = Array.from({ length: 20 }, (_, index) => {
      const domains = ['bilinmeyen.com']
      if (index < 3) domains.push('esikte.com.tr')
      if (index < 2) domains.push('altinda.com.tr')
      return makeSerp(`kw-${index}`, domains)
    })
    const noSeedConfig = ProjectConfigSchema.parse({ ...config, seedCompetitors: [] })
    const competitors = discoverCompetitors(serps, noSeedConfig)
    expect(competitors.find((c) => c.domain === 'esikte.com.tr')?.isRealCompetitor).toBe(true)
    expect(competitors.find((c) => c.domain === 'altinda.com.tr')?.isRealCompetitor).toBe(false)
  })

  test('pazaryeri yüksek oranla bile gerçek rakip sayılmaz', () => {
    const serps = Array.from({ length: 10 }, (_, index) => makeSerp(`kw-${index}`, ['trendyol.com']))
    const competitors = discoverCompetitors(serps, config)
    const trendyol = competitors.find((c) => c.domain === 'trendyol.com')
    expect(trendyol?.appearanceRate).toBe(1)
    expect(trendyol?.isRealCompetitor).toBe(false)
  })

  test('seed rakipler SERP\'te hiç görünmese de listede kalır', () => {
    const competitors = discoverCompetitors([makeSerp('kw', ['baska.com.tr'])], config)
    const seed = competitors.find((c) => c.domain === 'flo.com.tr')
    expect(seed?.source).toBe('seed')
    expect(seed?.isRealCompetitor).toBe(true)
  })

  test('müşteri domain\'i rakip listesine giremez', () => {
    const competitors = discoverCompetitors([makeSerp('kw', ['ornekayakkabi.com.tr', 'flo.com.tr'])], config)
    expect(competitors.find((c) => c.domain === 'ornekayakkabi.com.tr')).toBeUndefined()
  })
})

describe('scoreOpportunities', () => {
  const baseRow = { cpc: 1, intent: 'commercial' as const, clusterId: 'x' }

  test('vuruş mesafesindeki keyword, 1. sıradakinden yüksek skor alır', () => {
    const strikingDistance = scoreOpportunity({ ...baseRow, keyword: 'a', volume: 5000, difficulty: 0.4, clientRank: 8 })
    const alreadyWinning = scoreOpportunity({ ...baseRow, keyword: 'b', volume: 5000, difficulty: 0.4, clientRank: 1 })
    expect(strikingDistance.score).toBeGreaterThan(alreadyWinning.score)
  })

  test('aynı koşullarda yüksek hacim yüksek skor', () => {
    const high = scoreOpportunity({ ...baseRow, keyword: 'a', volume: 50000, difficulty: 0.5, clientRank: null })
    const low = scoreOpportunity({ ...baseRow, keyword: 'b', volume: 500, difficulty: 0.5, clientRank: null })
    expect(high.score).toBeGreaterThan(low.score)
  })

  test('sıralama skora göre azalan', () => {
    const opportunities = rankOpportunities([
      { ...baseRow, keyword: 'a', volume: 100, difficulty: 0.9, clientRank: 1 },
      { ...baseRow, keyword: 'b', volume: 50000, difficulty: 0.3, clientRank: 8 },
    ])
    expect(opportunities[0]?.keyword).toBe('b')
  })

  test('AI Overview olan sorguda fırsat skoru düşer', () => {
    const row = { ...baseRow, keyword: 'a', volume: 5000, difficulty: 0.4, clientRank: 8 }
    const withoutAiOverview = scoreOpportunity(row, { hasAiOverview: false, hasFeaturedSnippet: false })
    const withAiOverview = scoreOpportunity(row, { hasAiOverview: true, hasFeaturedSnippet: false })
    expect(withAiOverview.score).toBeLessThan(withoutAiOverview.score)
    expect(withAiOverview.reason).toContain('AI Overview')
  })

  test('featured snippet yokken informational niyet primi alır', () => {
    const row = { ...baseRow, intent: 'informational' as const, keyword: 'a', volume: 5000, difficulty: 0.4, clientRank: 8 }
    const withSnippet = scoreOpportunity(row, { hasAiOverview: false, hasFeaturedSnippet: true })
    const withoutSnippet = scoreOpportunity(row, { hasAiOverview: false, hasFeaturedSnippet: false })
    expect(withoutSnippet.score).toBeGreaterThan(withSnippet.score)
  })

  test('bayraklar yoksa skor bugünküyle aynı kalır (regresyon nöbetçisi)', () => {
    const row = { ...baseRow, keyword: 'a', volume: 5000, difficulty: 0.4, clientRank: 8 }
    // scoreOpportunity ikinci argümansız çağrılınca 1.5 öncesiyle bitwise aynı skoru üretmeli.
    expect(scoreOpportunity(row).score).toBe(scoreOpportunity(row, { hasAiOverview: false, hasFeaturedSnippet: false }).score)
  })

  test('rankOpportunities SerpSnapshot verilince ilgili keyword\'ün bayraklarını uygular', () => {
    const opportunities = rankOpportunities(
      [{ ...baseRow, keyword: 'ayakkabı', volume: 5000, difficulty: 0.4, clientRank: 8 }],
      [{ ...makeSerp('ayakkabı', []), hasAiOverview: true }],
    )
    expect(opportunities[0]?.serpFeatures.hasAiOverview).toBe(true)
  })
})

describe('detectAiGaps', () => {
  const makeSample = (
    query: string,
    sampleIndex: number,
    clientMentioned: boolean,
    competitorsMentioned: readonly string[],
  ): AiVisibilitySample => ({
    query,
    model: 'mock-llm',
    sampleIndex,
    clientMentioned,
    competitorsMentioned,
    answerExcerpt: '',
  })

  test('müşteri zayıf + rakip güçlü = boşluk', () => {
    const samples = [
      makeSample('q', 0, false, ['flo.com.tr']),
      makeSample('q', 1, false, ['flo.com.tr']),
      makeSample('q', 2, true, []),
    ]
    const result = detectAiGaps(samples, ['flo.com.tr'])
    expect(result[0]?.clientRate).toBeCloseTo(1 / 3)
    expect(result[0]?.isGap).toBe(true)
  })

  test('müşteri güçlüyse boşluk yok', () => {
    const samples = [
      makeSample('q', 0, true, ['flo.com.tr']),
      makeSample('q', 1, true, ['flo.com.tr']),
      makeSample('q', 2, false, []),
    ]
    expect(detectAiGaps(samples, ['flo.com.tr'])[0]?.isGap).toBe(false)
  })

  test('hiç örnek yoksa boş liste', () => {
    expect(detectAiGaps([], ['flo.com.tr'])).toEqual([])
  })
})

describe('diffRuns', () => {
  const makeSnapshot = (overrides: Partial<RunSnapshot>, configHash = 'h1'): RunSnapshot => ({
    run: {
      id: 1,
      startedAt: '2026-07-27T10:00:00Z',
      finishedAt: '2026-07-27T10:01:00Z',
      status: 'completed',
      configHash,
      mockCategories: [],
    },
    keywords: [],
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
    sitemapUrls: [],
    ...overrides,
  })

  const keywordRow = (keyword: string, clientRank: number | null) => ({
    keyword,
    volume: 1000,
    difficulty: 0.5,
    cpc: 1,
    intent: 'commercial' as const,
    clusterId: 'x',
    clientRank,
  })

  test('ilk çalıştırma baseline döner', () => {
    const diff = diffRuns(null, makeSnapshot({}))
    expect(diff.isBaseline).toBe(true)
    expect(diff.alerts).toEqual([])
  })

  test('sıra düşüşü eşiği aşınca uyarı üretir', () => {
    const prev = makeSnapshot({ keywords: [keywordRow('spor ayakkabı', 4)] })
    const curr = makeSnapshot({ keywords: [keywordRow('spor ayakkabı', 8)] })
    const diff = diffRuns(prev, curr)
    expect(diff.rankChanges[0]?.delta).toBe(-4)
    expect(diff.alerts.some((alert) => alert.severity === 'warning')).toBe(true)
  })

  test('top 10\'a giriş ve çıkış ayrı raporlanır', () => {
    const prev = makeSnapshot({ keywords: [keywordRow('a', 5), keywordRow('b', null)] })
    const curr = makeSnapshot({ keywords: [keywordRow('a', null), keywordRow('b', 3)] })
    const diff = diffRuns(prev, curr)
    expect(diff.alerts.some((alert) => alert.message.includes('top 10\'dan çıktı'))).toBe(true)
    expect(diff.alerts.some((alert) => alert.message.includes('top 10\'a girdi'))).toBe(true)
  })

  test('yeni gerçek rakip alert üretir', () => {
    const competitor = {
      domain: 'yeni.com.tr',
      appearanceRate: 0.4,
      classification: 'business' as const,
      isRealCompetitor: true,
      source: 'discovered' as const,
    }
    const diff = diffRuns(makeSnapshot({}), makeSnapshot({ competitors: [competitor] }))
    expect(diff.competitorEntries).toEqual(['yeni.com.tr'])
  })

  test('config hash farkı uyarı notu üretir', () => {
    const diff = diffRuns(makeSnapshot({}, 'h1'), makeSnapshot({}, 'h2'))
    expect(diff.configMismatch).toBe(true)
  })

  test('LCP regresyonu uyarı üretir', () => {
    const audit = { url: 'https://x.tr/', lcpMs: 2000, inpMs: 100, cls: 0.05, performanceScore: 80, issues: [] }
    const prev = makeSnapshot({ techAudits: [audit] })
    const curr = makeSnapshot({ techAudits: [{ ...audit, lcpMs: 2800 }] })
    const diff = diffRuns(prev, curr)
    expect(diff.cwvDeltas[0]?.lcpDeltaMs).toBe(800)
    expect(diff.alerts.some((alert) => alert.message.includes('LCP'))).toBe(true)
  })

  test('crawlDelta.pageCountDelta taranan sayfa sayısı farkını yansıtır', () => {
    const page = (url: string) => ({
      url,
      statusCode: 200,
      finalUrl: url,
      fetchError: null,
      title: 't',
      metaDescription: 'd',
      canonicalUrl: url,
      h1s: ['h'],
      headingOrder: ['h1'],
      hasSchemaOrg: false,
      schemaTypes: [],
      schemaFields: [],
      ogComplete: false,
      imagesMissingAlt: 0,
      wordCount: 10,
      bodyText: '',
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
    })
    const prev = makeSnapshot({ pages: [page('https://x.tr/')] })
    const curr = makeSnapshot({ pages: [page('https://x.tr/'), page('https://x.tr/yeni')] })
    expect(diffRuns(prev, curr).crawlDelta).toEqual({ pageCountDelta: 1 })
  })

  test('baseline (ilk çalıştırma) crawlDelta.pageCountDelta 0 döner', () => {
    const curr = makeSnapshot({})
    expect(diffRuns(null, curr).crawlDelta).toEqual({ pageCountDelta: 0 })
  })

  const finding = (overrides: Partial<Finding>): Finding => ({
    category: 'onpage',
    severity: 'medium',
    url: 'https://ornek.com/',
    culpritSelector: null,
    title: '<title> etiketi eksik',
    explanation: 'x',
    evidence: 'x',
    impact: 25,
    effort: 'trivial',
    fixSnippet: null,
    ...overrides,
  })

  test('Faz 5.6 — önceki run\'da olup şimdi olmayan bulgu resolvedFindings\'e düşer', () => {
    const prev = makeSnapshot({})
    const curr = makeSnapshot({})
    const diff = diffRuns(prev, curr, [finding({})], [])
    expect(diff.resolvedFindings).toHaveLength(1)
    expect(diff.newFindings).toHaveLength(0)
  })

  test('Faz 5.6 — önceki run\'da olmayıp şimdi olan bulgu newFindings\'e düşer', () => {
    const prev = makeSnapshot({})
    const curr = makeSnapshot({})
    const diff = diffRuns(prev, curr, [], [finding({})])
    expect(diff.newFindings).toHaveLength(1)
    expect(diff.resolvedFindings).toHaveLength(0)
  })

  test('Faz 5.6 — her iki run\'da da aynı bulgu (kategori+başlık+url) ne resolved ne new sayılır', () => {
    const prev = makeSnapshot({})
    const curr = makeSnapshot({})
    const diff = diffRuns(prev, curr, [finding({})], [finding({})])
    expect(diff.resolvedFindings).toEqual([])
    expect(diff.newFindings).toEqual([])
  })

  test('Faz 5.6 — farklı url aynı bulguyu farklı sayar', () => {
    const prev = makeSnapshot({})
    const curr = makeSnapshot({})
    const diff = diffRuns(prev, curr, [finding({ url: 'https://ornek.com/a' })], [finding({ url: 'https://ornek.com/b' })])
    expect(diff.resolvedFindings).toHaveLength(1)
    expect(diff.newFindings).toHaveLength(1)
  })

  test('Faz 5.6 — baseline\'da (ilk çalıştırma) resolvedFindings/newFindings boş döner', () => {
    const diff = diffRuns(null, makeSnapshot({}), [], [finding({})])
    expect(diff.resolvedFindings).toEqual([])
    expect(diff.newFindings).toEqual([])
  })
})
