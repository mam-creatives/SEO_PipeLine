import { STRIKING_DISTANCE_MAX, STRIKING_DISTANCE_MIN } from '../config/constants.js'
import type { Intent, KeywordSnapshotRow } from '../core/types.js'

export interface Opportunity {
  readonly keyword: string
  readonly clusterId: string
  readonly intent: Intent
  readonly volume: number
  readonly difficulty: number
  readonly clientRank: number | null
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

const reasonFor = (clientRank: number | null): string => {
  if (clientRank === null) return 'Top 10 dışında ama arama hacmi var — yeni içerik fırsatı'
  if (clientRank < STRIKING_DISTANCE_MIN) return 'Zaten üst sırada — pozisyonu koru'
  if (clientRank <= STRIKING_DISTANCE_MAX)
    return `#${clientRank}'de, vuruş mesafesinde — küçük iyileştirme üst sıraya taşıyabilir`
  return 'Sıralama zayıf — kapsamlı içerik yenileme gerekli'
}

export const scoreOpportunity = (row: KeywordSnapshotRow): Opportunity => ({
  keyword: row.keyword,
  clusterId: row.clusterId,
  intent: row.intent,
  volume: row.volume,
  difficulty: row.difficulty,
  clientRank: row.clientRank,
  score: Math.round(normalizeVolume(row.volume) * (1 - row.difficulty) * rankGapFactor(row.clientRank) * 100),
  reason: reasonFor(row.clientRank),
})

/** Tüm keyword'leri skorlar, yüksekten düşüğe sıralar. */
export const rankOpportunities = (rows: readonly KeywordSnapshotRow[]): readonly Opportunity[] =>
  rows.map(scoreOpportunity).sort((a, b) => b.score - a.score || b.volume - a.volume)
