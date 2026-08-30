import { AI_SAMPLES_PER_QUERY, CRUX_CONCURRENCY, INDEXING_CONCURRENCY, TECH_AUDIT_CONCURRENCY } from '../config/constants.js'
import { mapWithConcurrency } from '../core/concurrency.js'
import type { ProjectConfig } from '../config/schema.js'
import { ProviderError } from '../core/errors.js'
import { err, ok, type Result } from '../core/result.js'
import type {
  AiVisibilitySample,
  BacklinkProfile,
  FieldCwv,
  GscRow,
  IndexStatus,
  KeywordGap,
  KeywordMetric,
  SerpSnapshot,
  TechAudit,
} from '../core/types.js'
import type { ProviderSet } from '../providers/types.js'
import { detectMentions } from './detectMentions.js'

export const collectKeywords = async (
  providers: ProviderSet,
  config: ProjectConfig,
): Promise<Result<readonly KeywordMetric[], ProviderError>> =>
  providers.keyword.fetchKeywordMetrics(config.seedKeywords)

export const collectSerps = async (
  providers: ProviderSet,
  config: ProjectConfig,
): Promise<Result<readonly SerpSnapshot[], ProviderError>> => {
  const results = await Promise.all(config.seedKeywords.map((keyword) => providers.serp.fetchSerp(keyword)))
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) {
    return err(failed.error)
  }
  return ok(results.flatMap((result) => (result.ok ? [result.value] : [])))
}

export const collectBacklinks = async (
  providers: ProviderSet,
  domains: readonly string[],
): Promise<Result<readonly BacklinkProfile[], ProviderError>> => {
  const results = await Promise.all(domains.map((domain) => providers.backlink.fetchProfile(domain)))
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) {
    return err(failed.error)
  }
  return ok(results.flatMap((result) => (result.ok ? [result.value] : [])))
}

/**
 * TECH_AUDIT_CONCURRENCY ile sınırlı — Lighthouse süreç-global performance.mark()
 * kullandığı için aynı Node sürecinde paralel koşamaz (constants.ts'teki not).
 */
export const collectTechAudits = async (
  providers: ProviderSet,
  urls: readonly string[],
): Promise<Result<readonly TechAudit[], ProviderError>> => {
  const results = await mapWithConcurrency(urls, TECH_AUDIT_CONCURRENCY, (url) => providers.tech.auditUrl(url))
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) {
    return err(failed.error)
  }
  return ok(results.flatMap((result) => (result.ok ? [result.value] : [])))
}

/**
 * Her sorgu AI_SAMPLES_PER_QUERY kez sorulur — LLM cevapları deterministik olmadığından
 * "geçiyor mu" tek örnekle değil, örneklem oranıyla ölçülür.
 */
export const collectAiVisibility = async (
  providers: ProviderSet,
  config: ProjectConfig,
  competitorDomains: readonly string[],
): Promise<Result<readonly AiVisibilitySample[], ProviderError>> => {
  const tasks = config.aiQueries.flatMap((query) =>
    Array.from({ length: AI_SAMPLES_PER_QUERY }, (_, sampleIndex) => ({ query, sampleIndex })),
  )
  const results = await Promise.all(
    tasks.map(async ({ query, sampleIndex }) => {
      const answer = await providers.aiVisibility.askQuery(query, sampleIndex)
      if (!answer.ok) return answer
      const mentions = detectMentions(answer.value.text, config.brandTokens, competitorDomains)
      const sample: AiVisibilitySample = {
        query,
        model: answer.value.model,
        sampleIndex,
        clientMentioned: mentions.clientMentioned,
        competitorsMentioned: mentions.competitorsMentioned,
        answerExcerpt: answer.value.text.slice(0, 300),
      }
      return ok(sample)
    }),
  )
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) {
    return err(failed.error)
  }
  return ok(results.flatMap((result) => (result.ok ? [result.value] : [])))
}

/**
 * URL Inspection yalnız servis hesabının erişebildiği MÜLKE ait URL'ler için çalışır —
 * rakip URL'leri buraya girmez (deriveAuditUrls yalnız müşteri sayfalarını seçer).
 * INDEXING_CONCURRENCY ile sınırlı — Faz 4.3, müşteri/URL sayısı büyüdükçe oran sınırına
 * çarpma riskini `collectTechAudits`'teki aynı gerekçeyle önler.
 */
export const collectIndexStatuses = async (
  providers: ProviderSet,
  urls: readonly string[],
): Promise<Result<readonly IndexStatus[], ProviderError>> => {
  const results = await mapWithConcurrency(urls, INDEXING_CONCURRENCY, (url) => providers.indexing.fetchIndexStatus(url))
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) {
    return err(failed.error)
  }
  return ok(results.flatMap((result) => (result.ok ? [result.value] : [])))
}

/**
 * Faz 4.4 — "rakipte var, sende yok" keyword keşfi. `competitorDomains` çağıran tarafta
 * (runAllCollectors.ts) KEYWORD_GAP_COMPETITOR_COUNT ile zaten küçük tutulur — DataForSEO
 * maliyeti rakip sayısıyla doğrusal büyür.
 */
export const collectKeywordGaps = async (
  providers: ProviderSet,
  domain: string,
  competitorDomains: readonly string[],
): Promise<Result<readonly KeywordGap[], ProviderError>> => providers.keywordGap.fetchGapKeywords(domain, competitorDomains)

export const collectGsc = async (
  providers: ProviderSet,
  config: ProjectConfig,
): Promise<Result<readonly GscRow[], ProviderError>> => providers.searchConsole.fetchPerformance(config.domain)

/**
 * Yeterli trafiği olmayan URL'ler `null` döner (hata değil) — sonuç listesinden
 * sessizce elenir. Bir URL'in gerçek hata dönmesi (ör. ağ hatası) hâlâ dalın
 * tamamını başarısız sayar; "veri yok" ile "istek başarısız" farklı şeylerdir.
 * CRUX_CONCURRENCY ile sınırlı — Faz 4.3, aynı gerekçe.
 */
export const collectFieldCwv = async (
  providers: ProviderSet,
  urls: readonly string[],
): Promise<Result<readonly FieldCwv[], ProviderError>> => {
  const results = await mapWithConcurrency(urls, CRUX_CONCURRENCY, (url) => providers.crux.fetchFieldCwv(url))
  const failed = results.find((result) => !result.ok)
  if (failed !== undefined && !failed.ok) {
    return err(failed.error)
  }
  return ok(results.flatMap((result) => (result.ok && result.value !== null ? [result.value] : [])))
}
