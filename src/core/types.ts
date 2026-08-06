import type { CwvAttribution } from './cwv.js'

/** Paylaşılan domain tipleri — tüm katmanlar bu tiplere bağımlıdır, tersine bağımlılık yok. */

export type Intent = 'informational' | 'commercial' | 'branded' | 'local'

export type DomainClassification = 'marketplace' | 'news' | 'aggregator' | 'social' | 'business'

export interface KeywordMetric {
  readonly keyword: string
  /** Aylık tahmini arama hacmi */
  readonly volume: number
  /** 0..1 arası zorluk skoru */
  readonly difficulty: number
  readonly cpc: number
}

export interface SerpEntry {
  readonly position: number
  readonly domain: string
  readonly url: string
}

export interface SerpSnapshot {
  readonly keyword: string
  readonly entries: readonly SerpEntry[]
  readonly hasFeaturedSnippet: boolean
  readonly hasAiOverview: boolean
}

export interface BacklinkProfile {
  readonly domain: string
  readonly refDomains: number
  readonly backlinkCount: number
  /** 0..100 arası otorite skoru */
  readonly domainAuthority: number
}

export interface TechAudit {
  readonly url: string
  readonly lcpMs: number
  readonly inpMs: number
  readonly cls: number
  /** 0..100 arası Lighthouse benzeri performans skoru */
  readonly performanceScore: number
  readonly issues: readonly string[]
  /**
   * web-vitals attribution kırılımı — metriğin NEDEN kötü olduğunu söyler.
   * Opsiyonel: attribution üretemeyen sağlayıcılar ve migration öncesi kayıtlar için.
   */
  readonly attribution?: CwvAttribution | null
}

export interface AiAnswer {
  readonly query: string
  readonly model: string
  readonly text: string
}

export interface AiVisibilitySample {
  readonly query: string
  readonly model: string
  readonly sampleIndex: number
  readonly clientMentioned: boolean
  readonly competitorsMentioned: readonly string[]
  readonly answerExcerpt: string
}

export interface GscRow {
  readonly query: string
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly avgPosition: number
}

export interface Competitor {
  readonly domain: string
  /** Keyword setinin ne kadarında top-10'da göründü (0..1) */
  readonly appearanceRate: number
  readonly classification: DomainClassification
  readonly isRealCompetitor: boolean
  readonly source: 'seed' | 'discovered'
}

export interface RunMeta {
  readonly id: number
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly status: 'running' | 'completed' | 'failed'
  readonly configHash: string
  readonly mockCategories: readonly string[]
}

/** Bir çalıştırmanın DB'den okunan tam anlık görüntüsü — diff motorunun girdisi. */
export interface RunSnapshot {
  readonly run: RunMeta
  readonly keywords: readonly KeywordSnapshotRow[]
  readonly serps: readonly SerpSnapshot[]
  readonly backlinks: readonly BacklinkProfile[]
  readonly techAudits: readonly TechAudit[]
  readonly aiSamples: readonly AiVisibilitySample[]
  readonly gscRows: readonly GscRow[]
  readonly competitors: readonly Competitor[]
}

export interface KeywordSnapshotRow extends KeywordMetric {
  readonly intent: Intent
  readonly clusterId: string
  /** Müşterinin SERP'teki sırası; top-100 dışıysa null */
  readonly clientRank: number | null
}
