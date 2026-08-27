import {
  AI_OVERVIEW_OPPORTUNITY_PENALTY,
  FEATURED_SNIPPET_INFORMATIONAL_BONUS,
  STRIKING_DISTANCE_MAX,
  STRIKING_DISTANCE_MIN,
} from '../config/constants.js'
import { normalizeTr } from '../core/text.js'
import type { Intent, KeywordSnapshotRow, SerpSnapshot } from '../core/types.js'

export interface SerpFeatures {
  readonly hasAiOverview: boolean
  readonly hasFeaturedSnippet: boolean
}

const NO_SERP_FEATURES: SerpFeatures = { hasAiOverview: false, hasFeaturedSnippet: false }

export interface Opportunity {
  readonly keyword: string
  readonly clusterId: string
  readonly intent: Intent
  readonly volume: number
  readonly difficulty: number
  readonly clientRank: number | null
  readonly serpFeatures: SerpFeatures
  /** 0..100 arası fırsat skoru */
  readonly score: number
  readonly reason: string
}

/** log10 tabanlı hacim normalizasyonu: 100.000+ hacim ≈ 1.0 */
const normalizeVolume = (volume: number): number => Math.min(Math.log10(Math.max(volume, 1)) / 5, 1)

/**
 * Sıra çarpanı: 4-20 arası "vuruş mesafesi" tam puan alır (küçük iyileştirme büyük fark),
 * top-10 dışı hacimli kelimeler içerik fırsatıdır, 1-3 zaten kazanılmış (koruma modu).
 */
const rankGapFactor = (clientRank: number | null): number => {
  if (clientRank === null) return 0.8
  if (clientRank >= STRIKING_DISTANCE_MIN && clientRank <= STRIKING_DISTANCE_MAX) return 1
  if (clientRank < STRIKING_DISTANCE_MIN) return 0.2
  return 0.6
}

/**
 * AI Overview varken Google cevabı doğrudan gösterildiği için organik CTR ekonomisi
 * düşer — fırsat primi kısılır. Featured snippet yokken niyet 'informational' ise
 * snippet'i kapma fırsatı var ve niyet zaten "cevap arıyorum" — fırsat primi artırılır.
 */
const serpFeatureFactor = (features: SerpFeatures, intent: Intent): number => {
  let factor = 1
  if (features.hasAiOverview) factor *= AI_OVERVIEW_OPPORTUNITY_PENALTY
  if (!features.hasFeaturedSnippet && intent === 'informational') factor *= FEATURED_SNIPPET_INFORMATIONAL_BONUS
  return factor
}

const reasonFor = (clientRank: number | null, features: SerpFeatures): string => {
  const parts: string[] = []
  if (clientRank === null) parts.push('Top 10 dışında ama arama hacmi var — yeni içerik fırsatı')
  else if (clientRank < STRIKING_DISTANCE_MIN) parts.push('Zaten üst sırada — pozisyonu koru')
  else if (clientRank <= STRIKING_DISTANCE_MAX)
    parts.push(`#${clientRank}'de, vuruş mesafesinde — küçük iyileştirme üst sıraya taşıyabilir`)
  else parts.push('Sıralama zayıf — kapsamlı içerik yenileme gerekli')

  if (features.hasAiOverview) parts.push('AI Overview var — organik CTR düşük olabilir')
  if (features.hasFeaturedSnippet) parts.push('featured snippet başka bir sitede')

  return parts.join('; ')
}

export const scoreOpportunity = (
  row: KeywordSnapshotRow,
  features: SerpFeatures = NO_SERP_FEATURES,
): Opportunity => ({
  keyword: row.keyword,
  clusterId: row.clusterId,
  intent: row.intent,
  volume: row.volume,
  difficulty: row.difficulty,
  clientRank: row.clientRank,
  serpFeatures: features,
  score: Math.round(
    normalizeVolume(row.volume) *
      (1 - row.difficulty) *
      rankGapFactor(row.clientRank) *
      serpFeatureFactor(features, row.intent) *
      100,
  ),
  reason: reasonFor(row.clientRank, features),
})

const featuresFor = (serps: readonly SerpSnapshot[], keyword: string): SerpFeatures => {
  const serp = serps.find((snapshot) => normalizeTr(snapshot.keyword) === normalizeTr(keyword))
  return serp === undefined
    ? NO_SERP_FEATURES
    : { hasAiOverview: serp.hasAiOverview, hasFeaturedSnippet: serp.hasFeaturedSnippet }
}

/** Tüm keyword'leri skorlar, yüksekten düşüğe sıralar. `serps` verilmezse bayraksız (nötr) skorlanır. */
export const rankOpportunities = (
  rows: readonly KeywordSnapshotRow[],
  serps: readonly SerpSnapshot[] = [],
): readonly Opportunity[] =>
  rows
    .map((row) => scoreOpportunity(row, featuresFor(serps, row.keyword)))
    .sort((a, b) => b.score - a.score || b.volume - a.volume)
