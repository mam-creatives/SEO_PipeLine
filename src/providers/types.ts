import type { ProviderError } from '../core/errors.js'
import type { Result } from '../core/result.js'
import type {
  AiAnswer,
  BacklinkProfile,
  CrawledPage,
  FieldCwv,
  GscRow,
  IndexStatus,
  KeywordMetric,
  SerpSnapshot,
  TechAudit,
} from '../core/types.js'

export type ProviderCategory =
  | 'keyword'
  | 'serp'
  | 'backlink'
  | 'tech'
  | 'aiVisibility'
  | 'searchConsole'
  | 'indexing'
  | 'crux'
  | 'crawl'

interface ProviderBase {
  readonly name: string
  readonly isMock: boolean
}

export interface KeywordProvider extends ProviderBase {
  readonly fetchKeywordMetrics: (
    keywords: readonly string[],
  ) => Promise<Result<readonly KeywordMetric[], ProviderError>>
}

export interface SerpProvider extends ProviderBase {
  readonly fetchSerp: (keyword: string) => Promise<Result<SerpSnapshot, ProviderError>>
}

export interface BacklinkProvider extends ProviderBase {
  readonly fetchProfile: (domain: string) => Promise<Result<BacklinkProfile, ProviderError>>
}

export interface TechAuditProvider extends ProviderBase {
  readonly auditUrl: (url: string) => Promise<Result<TechAudit, ProviderError>>
}

export interface AiVisibilityProvider extends ProviderBase {
  /** Aynı sorgu farklı sampleIndex ile birden çok kez sorulur — mention oranı örneklemeyle ölçülür. */
  readonly askQuery: (query: string, sampleIndex: number) => Promise<Result<AiAnswer, ProviderError>>
}

export interface SearchConsoleProvider extends ProviderBase {
  readonly fetchPerformance: (domain: string) => Promise<Result<readonly GscRow[], ProviderError>>
}

export interface IndexingProvider extends ProviderBase {
  readonly fetchIndexStatus: (url: string) => Promise<Result<IndexStatus, ProviderError>>
}

export interface CruxProvider extends ProviderBase {
  /** Yeterli trafik yoksa ok(null) döner — 404 hata değil, "veri yok" demektir. */
  readonly fetchFieldCwv: (url: string) => Promise<Result<FieldCwv | null, ProviderError>>
}

/** robots.txt'ten türetilen kurallar — site walker kuyruğa eklemeden önce her URL'i buna sorar. */
export interface RobotsRules {
  readonly isAllowed: (path: string) => boolean
  readonly sitemaps: readonly string[]
}

export interface CrawlProvider extends ProviderBase {
  /** 4xx/5xx hata değil — CrawledPage.statusCode'a yazılır, bulguya dönüşür. Yalnız ağ/timeout hatası err() döner. */
  readonly fetchPage: (url: string) => Promise<Result<CrawledPage, ProviderError>>
  /** robots.txt yoksa (404) her şeye izin veren kurallar döner — "yasak yok" demektir, hata değil. */
  readonly fetchRobotsRules: (origin: string) => Promise<Result<RobotsRules, ProviderError>>
  /** sitemap.xml yoksa boş dizi döner — hata değil. */
  readonly fetchSitemapUrls: (sitemapUrl: string) => Promise<Result<readonly string[], ProviderError>>
}

export interface ProviderSet {
  readonly keyword: KeywordProvider
  readonly serp: SerpProvider
  readonly backlink: BacklinkProvider
  readonly tech: TechAuditProvider
  readonly aiVisibility: AiVisibilityProvider
  readonly searchConsole: SearchConsoleProvider
  readonly indexing: IndexingProvider
  readonly crux: CruxProvider
  readonly crawl: CrawlProvider
  /** Mock çalışan kategoriler — boş değilse raporlarda "MOCK MODE" banner'ı gösterilir. */
  readonly mockCategories: readonly ProviderCategory[]
}
