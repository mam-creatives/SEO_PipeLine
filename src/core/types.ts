import type { CwvAttribution } from './cwv.js'
import type { Finding } from './findings.js'

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
  /** Lighthouse `categories.seo.score` × 100 — SEO kategorisi çalışmadıysa null. */
  readonly seoScore?: number | null
  /** Lighthouse SEO audit'lerinden türetilen bulgular — audit'ler çalışmadıysa boş dizi. */
  readonly seoFindings?: readonly Finding[]
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
  /** Boş string = sayfa bilinmiyor (v6 öncesi göç edilmiş eski satırlar) — yamyamlık tespiti bunu eler. */
  readonly page: string
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

/**
 * Google Search Console URL Inspection sonucu — SEO'nun en kritik tek sinyali:
 * sayfa gerçekten indekslendi mi, Google hangi canonical'ı seçti. Tahmin değil,
 * Google'ın kendi crawler'ının gördüğü.
 */
export interface IndexStatus {
  readonly url: string
  /** Serbest metin (ör. "Submitted and indexed") — Google API'si burada sabit enum vermiyor. */
  readonly coverageState: string
  readonly robotsTxtState: string
  readonly indexingState: string
  readonly pageFetchState: string
  readonly googleCanonical: string | null
  readonly userCanonical: string | null
  readonly lastCrawlTime: string | null
}

/**
 * CrUX (Chrome UX Report) alan verisi — gerçek kullanıcı p75 ölçümü, rakipler dahil.
 * Herhangi bir metrik null olabilir: CrUX yeterli trafiği olmayan metrikleri sessizce
 * atlar (404 değil, "veri yok" demektir).
 */
export interface FieldCwv {
  readonly url: string
  readonly formFactor: string
  readonly lcpMs: number | null
  readonly inpMs: number | null
  readonly cls: number | null
}

/** Bir sayfadan çıkan tek bir link — iç link grafiğinin kenarı. */
export interface PageLink {
  readonly sourceUrl: string
  readonly targetUrl: string
  readonly anchorText: string
  readonly isInternal: boolean
}

/**
 * Faz 2 crawler'ının tek bir URL için topladığı yapılandırılmış on-page veri.
 * `statusCode`/`fetchError`in ikisi de null olamaz, ikisi de dolu olamaz: fetch başarılıysa
 * `fetchError` null, tamamen başarısızsa (ağ/timeout) `statusCode` null. 4xx/5xx bir HATA
 * DEĞİL — `statusCode` doldurulur, bulguya dönüşür (detectLinkIssues).
 */
export interface CrawledPage {
  readonly url: string
  readonly statusCode: number | null
  /** response.url — yönlendirme zinciri sonrası nihai adres; url ile aynıysa yönlendirme yok. */
  readonly finalUrl: string | null
  readonly fetchError: string | null
  readonly title: string | null
  readonly metaDescription: string | null
  readonly canonicalUrl: string | null
  readonly h1s: readonly string[]
  /** Sırayla görülen başlık seviyeleri, ör. ['h1','h2','h2','h3'] — hiyerarşi atlaması tespiti için. */
  readonly headingOrder: readonly string[]
  readonly hasSchemaOrg: boolean
  readonly schemaTypes: readonly string[]
  /** og:title + og:description + og:image üçü de doluysa true. */
  readonly ogComplete: boolean
  readonly imagesMissingAlt: number
  readonly wordCount: number
  /** meta robots içeriği, ör. "noindex,nofollow" — yoksa null. */
  readonly metaRobots: string | null
  readonly internalLinks: readonly PageLink[]
  readonly externalLinkCount: number
  /** Faz 4.1 — ucuz bir sezgiyle (metin/HTML oranı + script sayısı) "muhtemelen CSR" işareti. Kesinlik değil, bkz. crawlHtmlParser.ts. */
  readonly likelyClientRendered: boolean
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
  readonly indexStatuses: readonly IndexStatus[]
  readonly fieldCwv: readonly FieldCwv[]
  /** `internalLinks` burada hep boş — DB round-trip'te taşınmaz, bkz. migrations.ts v8 yorumu. */
  readonly pages: readonly CrawledPage[]
  readonly pageLinks: readonly PageLink[]
}

export interface KeywordSnapshotRow extends KeywordMetric {
  readonly intent: Intent
  readonly clusterId: string
  /** Müşterinin SERP'teki sırası; top-100 dışıysa null */
  readonly clientRank: number | null
}
