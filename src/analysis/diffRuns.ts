import { RANK_DROP_ALERT_THRESHOLD } from '../config/constants.js'
import type { RunSnapshot } from '../core/types.js'

export interface RankChange {
  readonly keyword: string
  readonly previousRank: number | null
  readonly currentRank: number | null
  /** Pozitif = iyileşme (yukarı çıktı), negatif = düşüş */
  readonly delta: number
}

export interface Alert {
  readonly severity: 'warning' | 'info'
  readonly message: string
}

export interface CwvDelta {
  readonly url: string
  readonly lcpDeltaMs: number
  readonly inpDeltaMs: number
  readonly clsDelta: number
}

export interface AiRateDelta {
  readonly query: string
  readonly previousRate: number
  readonly currentRate: number
}

export interface TrendDiff {
  readonly isBaseline: boolean
  readonly configMismatch: boolean
  readonly rankChanges: readonly RankChange[]
  readonly competitorEntries: readonly string[]
  readonly competitorExits: readonly string[]
  readonly cwvDeltas: readonly CwvDelta[]
  readonly aiRateDeltas: readonly AiRateDelta[]
  readonly alerts: readonly Alert[]
}

const EMPTY_BASELINE: TrendDiff = {
  isBaseline: true,
  configMismatch: false,
  rankChanges: [],
  competitorEntries: [],
  competitorExits: [],
  cwvDeltas: [],
  aiRateDeltas: [],
  alerts: [],
}

/** Sıra karşılaştırmasında "top-10 dışı" 11 sayılır — delta hesabı için. */
const UNRANKED_POSITION = 11

/** AI mention oranında bu kadar düşüş uyarı üretir. */
const AI_RATE_DROP_ALERT = 0.34

/** LCP'de bu kadar ms kötüleşme uyarı üretir. */
const LCP_REGRESSION_ALERT_MS = 500

const clientRankByKeyword = (snapshot: RunSnapshot): ReadonlyMap<string, number | null> =>
  new Map(snapshot.keywords.map((row) => [row.keyword, row.clientRank]))

const clientAiRateByQuery = (snapshot: RunSnapshot): ReadonlyMap<string, number> => {
  const byQuery = new Map<string, { mentioned: number; total: number }>()
  for (const sample of snapshot.aiSamples) {
    const entry = byQuery.get(sample.query) ?? { mentioned: 0, total: 0 }
    byQuery.set(sample.query, {
      mentioned: entry.mentioned + (sample.clientMentioned ? 1 : 0),
      total: entry.total + 1,
    })
  }
  return new Map([...byQuery.entries()].map(([query, { mentioned, total }]) => [query, mentioned / total]))
}

const realCompetitorSet = (snapshot: RunSnapshot): ReadonlySet<string> =>
  new Set(snapshot.competitors.filter((competitor) => competitor.isRealCompetitor).map((c) => c.domain))

/**
 * İki çalıştırma arasındaki değişimleri hesaplar — pipeline'ın asıl değer ürettiği yer.
 * prev null ise ilk çalıştırmadır (baseline), karşılaştırma yapılmaz.
 */
export const diffRuns = (prev: RunSnapshot | null, curr: RunSnapshot): TrendDiff => {
  if (prev === null) return EMPTY_BASELINE

  const alerts: Alert[] = []
  const configMismatch = prev.run.configHash !== curr.run.configHash
  if (configMismatch) {
    alerts.push({
      severity: 'info',
      message: 'Config (keyword/rakip seti) iki çalıştırma arasında değişmiş — karşılaştırma yanıltıcı olabilir.',
    })
  }

  // Sıra değişimleri
  const prevRanks = clientRankByKeyword(prev)
  const currRanks = clientRankByKeyword(curr)
  const allKeywords = [...new Set([...prevRanks.keys(), ...currRanks.keys()])]
  const rankChanges = allKeywords.flatMap((keyword): RankChange[] => {
    const previousRank = prevRanks.get(keyword) ?? null
    const currentRank = currRanks.get(keyword) ?? null
    if (previousRank === currentRank) return []
    return [
      {
        keyword,
        previousRank,
        currentRank,
        delta: (previousRank ?? UNRANKED_POSITION) - (currentRank ?? UNRANKED_POSITION),
      },
    ]
  })
  for (const change of rankChanges) {
    if (change.previousRank !== null && change.currentRank === null) {
      alerts.push({ severity: 'warning', message: `"${change.keyword}" top 10'dan çıktı (önceki sıra: ${change.previousRank}).` })
    } else if (change.previousRank === null && change.currentRank !== null) {
      alerts.push({ severity: 'info', message: `"${change.keyword}" top 10'a girdi (#${change.currentRank}).` })
    } else if (-change.delta >= RANK_DROP_ALERT_THRESHOLD) {
      alerts.push({
        severity: 'warning',
        message: `"${change.keyword}" ${change.previousRank}. sıradan ${change.currentRank}. sıraya düştü.`,
      })
    }
  }

  // Rakip giriş/çıkışları
  const prevCompetitors = realCompetitorSet(prev)
  const currCompetitors = realCompetitorSet(curr)
  const competitorEntries = [...currCompetitors].filter((domain) => !prevCompetitors.has(domain))
  const competitorExits = [...prevCompetitors].filter((domain) => !currCompetitors.has(domain))
  for (const domain of competitorEntries) {
    alerts.push({ severity: 'info', message: `Yeni gerçek rakip tespit edildi: ${domain}` })
  }

  // Core Web Vitals deltaları
  const prevAudits = new Map(prev.techAudits.map((audit) => [audit.url, audit]))
  const cwvDeltas = curr.techAudits.flatMap((audit): CwvDelta[] => {
    const previous = prevAudits.get(audit.url)
    if (previous === undefined) return []
    return [
      {
        url: audit.url,
        lcpDeltaMs: audit.lcpMs - previous.lcpMs,
        inpDeltaMs: audit.inpMs - previous.inpMs,
        clsDelta: audit.cls - previous.cls,
      },
    ]
  })
  for (const delta of cwvDeltas) {
    if (delta.lcpDeltaMs > LCP_REGRESSION_ALERT_MS) {
      alerts.push({
        severity: 'warning',
        message: `${delta.url} LCP ${Math.round(delta.lcpDeltaMs)}ms kötüleşti — performans regresyonu.`,
      })
    }
  }

  // AI görünürlük deltaları (müşteri mention oranı)
  const prevAiRates = clientAiRateByQuery(prev)
  const currAiRates = clientAiRateByQuery(curr)
  const aiRateDeltas = [...currAiRates.entries()].flatMap(([query, currentRate]): AiRateDelta[] => {
    const previousRate = prevAiRates.get(query)
    if (previousRate === undefined || previousRate === currentRate) return []
    return [{ query, previousRate, currentRate }]
  })
  for (const delta of aiRateDeltas) {
    if (delta.previousRate - delta.currentRate >= AI_RATE_DROP_ALERT) {
      alerts.push({
        severity: 'warning',
        message: `"${delta.query}" sorgusunda AI görünürlüğü düştü (${Math.round(delta.previousRate * 100)}% → ${Math.round(delta.currentRate * 100)}%).`,
      })
    }
  }

  return {
    isBaseline: false,
    configMismatch,
    rankChanges,
    competitorEntries,
    competitorExits,
    cwvDeltas,
    aiRateDeltas,
    alerts,
  }
}
