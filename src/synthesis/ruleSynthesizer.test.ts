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
})
