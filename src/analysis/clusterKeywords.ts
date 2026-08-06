import { INTENT_MARKERS } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import { normalizeTr } from '../core/text.js'
import type { Intent, KeywordMetric, KeywordSnapshotRow, SerpSnapshot } from '../core/types.js'
import { classifyIntent } from './intentRules.js'

const STEM_LENGTH = 5

/** Tüm işaret kelimeleri tek tek kelimelere ayrılmış halde ("en iyi" → "en", "iyi"). */
const MARKER_WORDS: ReadonlySet<string> = new Set(
  [
    ...INTENT_MARKERS.informational,
    ...INTENT_MARKERS.commercial,
    ...INTENT_MARKERS.local,
    ...INTENT_MARKERS.cities,
  ].flatMap((marker) => normalizeTr(marker).split(/\s+/)),
)

const isMarkerToken = (token: string): boolean =>
  [...MARKER_WORDS].some((marker) => token === marker || token.startsWith(marker))

/**
 * Küme kimliği: işaret kelimeleri atıldıktan sonra kalan en uzun (en çok anlam taşıyan)
 * kelimenin kökü + niyet. "kadın ayakkabı" ve "deri ayakkabı bakımı nasıl yapılır"
 * aynı "ayakk" ailesinde ama farklı niyet kümelerinde toplanır.
 */
export const clusterIdFor = (keyword: string, intent: Intent): string => {
  const tokens = normalizeTr(keyword)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !isMarkerToken(token))
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0] ?? 'genel'
  return `${longest.slice(0, STEM_LENGTH)}-${intent}`
}

/** SERP'te müşterinin sırası; top-10'da yoksa null. */
const clientRankFor = (serps: readonly SerpSnapshot[], keyword: string, domain: string): number | null => {
  const serp = serps.find((snapshot) => normalizeTr(snapshot.keyword) === normalizeTr(keyword))
  const entry = serp?.entries.find((candidate) => candidate.domain === domain)
  return entry?.position ?? null
}

/** Ham metrikleri niyet + küme + müşteri sırasıyla zenginleştirir — DB'ye yazılan satırlar. */
export const buildKeywordRows = (
  metrics: readonly KeywordMetric[],
  serps: readonly SerpSnapshot[],
  config: ProjectConfig,
): readonly KeywordSnapshotRow[] =>
  metrics.map((metric) => {
    const intent = classifyIntent(metric.keyword, config.brandTokens)
    return {
      ...metric,
      intent,
      clusterId: clusterIdFor(metric.keyword, intent),
      clientRank: clientRankFor(serps, metric.keyword, config.domain),
    }
  })

export interface KeywordCluster {
  readonly clusterId: string
  readonly intent: Intent
  readonly keywords: readonly string[]
  readonly representativeKeyword: string
  readonly totalVolume: number
  readonly avgDifficulty: number
  readonly bestClientRank: number | null
}

export const buildClusters = (rows: readonly KeywordSnapshotRow[]): readonly KeywordCluster[] => {
  const byCluster = new Map<string, KeywordSnapshotRow[]>()
  for (const row of rows) {
    const existing = byCluster.get(row.clusterId) ?? []
    byCluster.set(row.clusterId, [...existing, row])
  }
  return [...byCluster.entries()]
    .map(([clusterId, clusterRows]) => {
      const representative = [...clusterRows].sort((a, b) => b.volume - a.volume)[0] as KeywordSnapshotRow
      const ranks = clusterRows.map((row) => row.clientRank).filter((rank): rank is number => rank !== null)
      return {
        clusterId,
        intent: representative.intent,
        keywords: clusterRows.map((row) => row.keyword),
        representativeKeyword: representative.keyword,
        totalVolume: clusterRows.reduce((sum, row) => sum + row.volume, 0),
        avgDifficulty:
          clusterRows.reduce((sum, row) => sum + row.difficulty, 0) / Math.max(clusterRows.length, 1),
        bestClientRank: ranks.length > 0 ? Math.min(...ranks) : null,
      }
    })
    .sort((a, b) => b.totalVolume - a.totalVolume)
}
