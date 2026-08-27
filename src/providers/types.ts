import type { ProviderError } from '../core/errors.js'
import type { Result } from '../core/result.js'
import type {
  AiAnswer,
  BacklinkProfile,
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

export interface ProviderSet {
  readonly keyword: KeywordProvider
  readonly serp: SerpProvider
  readonly backlink: BacklinkProvider
  readonly tech: TechAuditProvider
  readonly aiVisibility: AiVisibilityProvider
  readonly searchConsole: SearchConsoleProvider
  readonly indexing: IndexingProvider
  readonly crux: CruxProvider
  /** Mock çalışan kategoriler — boş değilse raporlarda "MOCK MODE" banner'ı gösterilir. */
  readonly mockCategories: readonly ProviderCategory[]
}
