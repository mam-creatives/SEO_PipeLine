import { describe, expect, test } from 'vitest'
import type { TrendDiff } from '../analysis/diffRuns.js'
import type { AnalysisResult } from '../analysis/runAnalysis.js'
import { synthesizeWithRules } from './ruleSynthesizer.js'

const baselineDiff: TrendDiff = {
  isBaseline: true,
  configMismatch: false,
  rankChanges: [],
  competitorEntries: [],
  competitorExits: [],
  cwvDeltas: [],
  aiRateDeltas: [],
  crawlDelta: { pageCountDelta: 0 },
  alerts: [],
}

const analysis: AnalysisResult = {
  rows: [
    { keyword: 'deri ayakkabı', volume: 9900, difficulty: 0.55, cpc: 3.4, intent: 'commercial', clusterId: 'ayakk-commercial', clientRank: 5 },
  ],
  clusters: [],
  competitors: [
    { domain: 'flo.com.tr', appearanceRate: 0.8, classification: 'business', isRealCompetitor: true, source: 'seed' },
  ],
  opportunities: [
    {
      keyword: 'deri ayakkabı',
      clusterId: 'ayakk-commercial',
      intent: 'commercial',
      volume: 9900,
      difficulty: 0.55,
      clientRank: 5,
      serpFeatures: { hasAiOverview: false, hasFeaturedSnippet: false },
      score: 36,
      reason: 'vuruş mesafesinde',
    },
  ],
  aiVisibility: [
    {
      query: 'En iyi ayakkabı markası?',
      clientRate: 0,
      competitorRates: [{ domain: 'flo.com.tr', rate: 0.67 }],
      isGap: true,
      sampleCount: 3,
    },
  ],
  techEvaluations: [
    {
      audit: { url: 'https://ornek.tr/', lcpMs: 3900, inpMs: 260, cls: 0.18, performanceScore: 54, issues: ['Görsel boyutu eksik'] },
      passes: { lcp: false, inp: false, cls: false },
      isClient: true,
      diagnosis: null,
    },
  ],
  gscRows: [],
  indexingFindings: [],
  cannibalizationFindings: [],
  fieldCwv: [],
  keywordGaps: [],
  crawlFindings: [],
  codeAuditFindings: [],
}

describe('synthesizeWithRules', () => {
  test('baseline başlığı fırsat ve rakip sayısını içerir', () => {
    const output = synthesizeWithRules(analysis, baselineDiff)
    expect(output.synthesizer).toBe('rule-based')
    expect(output.headline).toContain('İlk analiz')
    expect(output.headline).toContain('deri ayakkabı')
  })

  test('teknik ihlal, fırsat ve AI boşluğu aksiyonlara dönüşür', () => {
    const output = synthesizeWithRules(analysis, baselineDiff)
    const categories = output.actions.map((action) => action.category)
    expect(categories).toContain('fırsat')
    expect(categories).toContain('teknik')
    expect(categories).toContain('ai-görünürlük')
  })

  test('uyarı alertleri en yüksek önceliği alır ve başa gelir', () => {
    const diffWithWarning: TrendDiff = {
      ...baselineDiff,
      isBaseline: false,
      alerts: [{ severity: 'warning', message: '"spor ayakkabı" 4. sıradan 8. sıraya düştü.' }],
    }
    const output = synthesizeWithRules(analysis, diffWithWarning)
    expect(output.actions[0]?.priority).toBe(1)
    expect(output.actions[0]?.text).toContain('düştü')
  })

  test('aynı girdi aynı çıktıyı üretir (deterministik)', () => {
    expect(synthesizeWithRules(analysis, baselineDiff)).toEqual(synthesizeWithRules(analysis, baselineDiff))
  })

  test('yüksek impact\'li on-page bulgusu yönetici özetine girer', () => {
    const withOnPageFinding = {
      ...analysis,
      techEvaluations: [
        {
          ...analysis.techEvaluations[0]!,
          audit: {
            ...analysis.techEvaluations[0]!.audit,
            seoScore: 40,
            seoFindings: [
              {
                category: 'onpage' as const,
                severity: 'critical' as const,
                url: 'https://ornek.tr/',
                culpritSelector: null,
                title: 'Arama motorları sayfayı taramasını engelleyen bir direktif buldu',
                explanation: 'test',
                evidence: 'noindex',
                impact: 70,
                effort: 'small' as const,
                fixSnippet: null,
              },
            ],
          },
        },
      ],
    }
    const output = synthesizeWithRules(withOnPageFinding, baselineDiff)
    const onPageAction = output.actions.find((action) => action.category === 'on-page')
    expect(onPageAction?.priority).toBe(1)
    expect(onPageAction?.text).toContain('taramasını engelleyen')
  })

  test('yüksek impact\'li crawl bulgusu (links kategorisi) yönetici özetine girer', () => {
    const withCrawlFinding = {
      ...analysis,
      crawlFindings: [
        {
          category: 'links' as const,
          severity: 'high' as const,
          url: 'https://ornek.tr/',
          culpritSelector: null,
          title: 'Kırık iç link (404)',
          explanation: 'test',
          evidence: 'https://ornek.tr/eski → HTTP 404',
          impact: 45,
          effort: 'trivial' as const,
          fixSnippet: null,
        },
      ],
    }
    const output = synthesizeWithRules(withCrawlFinding, baselineDiff)
    const linksAction = output.actions.find((action) => action.category === 'links')
    expect(linksAction?.text).toContain('Kırık iç link')
  })

  test('rakip sayfaların on-page bulguları yönetici özetine girmez', () => {
    const withCompetitorFinding = {
      ...analysis,
      techEvaluations: [
        {
          ...analysis.techEvaluations[0]!,
          isClient: false,
          audit: {
            ...analysis.techEvaluations[0]!.audit,
            seoScore: 10,
            seoFindings: [
              {
                category: 'onpage' as const,
                severity: 'critical' as const,
                url: 'https://rakip.tr/',
                culpritSelector: null,
                title: 'Rakip sayfa sorunu',
                explanation: 'test',
                evidence: 'test',
                impact: 70,
                effort: 'small' as const,
                fixSnippet: null,
              },
            ],
          },
        },
      ],
    }
    const output = synthesizeWithRules(withCompetitorFinding, baselineDiff)
    expect(output.actions.find((action) => action.category === 'on-page')).toBeUndefined()
  })

  test('yüksek impact\'li kod denetimi bulgusu (kod kategorisi) yönetici özetine dosya:satır ile girer', () => {
    const withCodeFinding = {
      ...analysis,
      codeAuditFindings: [
        {
          category: 'onpage' as const,
          severity: 'high' as const,
          url: null,
          culpritSelector: null,
          title: '<h1> yalnız bir HTML yorumu içinde bulundu',
          explanation: 'test',
          evidence: 'test',
          impact: 60,
          effort: 'small' as const,
          fixSnippet: null,
          codeLocation: { file: 'inc/hizmet.php', line: 45 },
        },
      ],
    }
    const output = synthesizeWithRules(withCodeFinding, baselineDiff)
    const codeAction = output.actions.find((action) => action.category === 'kod')
    expect(codeAction?.text).toContain('yalnız bir HTML yorumu içinde bulundu')
    expect(codeAction?.text).toContain('[inc/hizmet.php:45]')
  })

  test('indeksleme bulgusu öncelik 1 aksiyona dönüşür — indekslenmeyen sayfa her şeyden önce gelir', () => {
    const withIndexingIssue = {
      ...analysis,
      indexingFindings: [
        {
          category: 'indexing' as const,
          severity: 'critical' as const,
          url: 'https://ornek.tr/urun',
          culpritSelector: null,
          title: 'Sayfa Google tarafından indekslenmesi engelleniyor',
          explanation: 'test',
          evidence: 'indexingState: BLOCKED_BY_ROBOTS_TXT',
          impact: 70,
          effort: 'small' as const,
          fixSnippet: null,
        },
      ],
    }
    const output = synthesizeWithRules(withIndexingIssue, baselineDiff)
    const indexingAction = output.actions.find((action) => action.category === 'indeksleme')
    expect(indexingAction?.priority).toBe(1)
    expect(indexingAction?.text).toContain('ornek.tr/urun')
  })

  test('Faz 4.4 — keyword fırsatları hacme göre sıralı aksiyona dönüşür, en yüksek hacimli önce', () => {
    const withKeywordGaps = {
      ...analysis,
      keywordGaps: [
        { keyword: 'düşük hacimli', competitorDomain: 'flo.com.tr', competitorPosition: 5, volume: 100 },
        { keyword: 'yüksek hacimli', competitorDomain: 'flo.com.tr', competitorPosition: 2, volume: 9000 },
      ],
    }
    const output = synthesizeWithRules(withKeywordGaps, baselineDiff)
    const gapActions = output.actions.filter((action) => action.category === 'keyword-fırsatı')
    expect(gapActions).toHaveLength(2)
    expect(gapActions[0]?.text).toContain('yüksek hacimli')
    expect(gapActions[0]?.text).toContain('flo.com.tr')
    expect(gapActions[0]?.text).toContain('#2')
  })

  test('Faz 4.4 — keywordGaps boşsa keyword-fırsatı aksiyonu hiç üretilmez', () => {
    const output = synthesizeWithRules(analysis, baselineDiff)
    expect(output.actions.some((action) => action.category === 'keyword-fırsatı')).toBe(false)
  })
})
