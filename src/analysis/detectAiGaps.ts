import { AI_CLIENT_MENTION_WEAK, AI_COMPETITOR_MENTION_STRONG } from '../config/constants.js'
import type { AiVisibilitySample } from '../core/types.js'

export interface CompetitorMentionRate {
  readonly domain: string
  readonly rate: number
}

export interface AiQueryVisibility {
  readonly query: string
  /** Müşteri markasının bu sorgu cevaplarında geçme oranı (0..1) */
  readonly clientRate: number
  readonly competitorRates: readonly CompetitorMentionRate[]
  /** Müşteri zayıf VE en az bir gerçek rakip güçlüyse görünürlük boşluğu */
  readonly isGap: boolean
  readonly sampleCount: number
}

/**
 * Sorgu bazında AI görünürlük analizi. Ham örnekler üzerinden mention oranları
 * okuma anında hesaplanır — örnekleme sayısı ileride değişse de tarihsel veri bozulmaz.
 */
export const detectAiGaps = (
  samples: readonly AiVisibilitySample[],
  realCompetitors: readonly string[],
): readonly AiQueryVisibility[] => {
  const byQuery = new Map<string, AiVisibilitySample[]>()
  for (const sample of samples) {
    const existing = byQuery.get(sample.query) ?? []
    byQuery.set(sample.query, [...existing, sample])
  }

  return [...byQuery.entries()].map(([query, querySamples]) => {
    const sampleCount = querySamples.length
    const clientRate =
      sampleCount === 0 ? 0 : querySamples.filter((sample) => sample.clientMentioned).length / sampleCount

    const competitorRates = realCompetitors.map((domain) => ({
      domain,
      rate:
        sampleCount === 0
          ? 0
          : querySamples.filter((sample) => sample.competitorsMentioned.includes(domain)).length / sampleCount,
    }))

    const strongestCompetitorRate = Math.max(0, ...competitorRates.map(({ rate }) => rate))
    return {
      query,
      clientRate,
      competitorRates,
      isGap: clientRate < AI_CLIENT_MENTION_WEAK && strongestCompetitorRate >= AI_COMPETITOR_MENTION_STRONG,
      sampleCount,
    }
  })
}
