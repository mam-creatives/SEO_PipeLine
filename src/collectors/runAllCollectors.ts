import { TECH_AUDIT_COMPETITOR_COUNT } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import { AppError } from '../core/errors.js'
import { createLogger } from '../core/logger.js'
import type {
  AiVisibilitySample,
  BacklinkProfile,
  FieldCwv,
  GscRow,
  IndexStatus,
  KeywordMetric,
  SerpSnapshot,
  TechAudit,
} from '../core/types.js'
import type { ProviderSet } from '../providers/types.js'
import {
  collectAiVisibility,
  collectBacklinks,
  collectFieldCwv,
  collectGsc,
  collectIndexStatuses,
  collectKeywords,
  collectSerps,
  collectTechAudits,
} from './collectors.js'

const logger = createLogger('collectors')

/**
 * SERP verisinden türetilen kararlar analiz katmanından enjekte edilir ki
 * collectors → analysis yönünde bağımlılık oluşmasın.
 */
export interface CollectorDeps {
  readonly deriveCompetitorDomains: (serps: readonly SerpSnapshot[]) => readonly string[]
  readonly deriveAuditUrls: (serps: readonly SerpSnapshot[]) => readonly string[]
}

export interface FailedBranch {
  readonly branch: string
  readonly message: string
}

export interface CollectedData {
  readonly keywords: readonly KeywordMetric[]
  readonly serps: readonly SerpSnapshot[]
  readonly backlinks: readonly BacklinkProfile[]
  readonly techAudits: readonly TechAudit[]
  readonly aiSamples: readonly AiVisibilitySample[]
  readonly gscRows: readonly GscRow[]
  readonly indexStatuses: readonly IndexStatus[]
  readonly fieldCwv: readonly FieldCwv[]
  readonly failedBranches: readonly FailedBranch[]
}

/**
 * Tüm veri dallarını toplar.
 *
 * Kısmi hata politikası: keyword + SERP dalı pipeline'ın omurgasıdır — başarısız olursa
 * AppError fırlatılır ve run 'failed' işaretlenir. Diğer dallar (backlink, teknik, AI, GSC)
 * başarısız olursa boş veriyle devam edilir ve hata failedBranches'e kaydedilir;
 * rapor bu dalların eksik olduğunu açıkça gösterir.
 *
 * `deriveCompetitorDomains`: SERP verisinden rakip domain'leri çıkaran fonksiyon —
 * analiz katmanından enjekte edilir ki collectors analysis'e bağımlı olmasın.
 */
export const runAllCollectors = async (
  providers: ProviderSet,
  config: ProjectConfig,
  deps: CollectorDeps,
): Promise<CollectedData> => {
  // Aşama 1 — omurga: keyword metrikleri + SERP'ler (paralel)
  const [keywordResult, serpResult] = await Promise.all([
    collectKeywords(providers, config),
    collectSerps(providers, config),
  ])
  // Omurga yalnızca SERP'tir: rakip keşfi, müşteri sıralaması ve denetlenecek
  // sayfa seçimi yapısal olarak buna bağlı. Keyword hacmi zenginleştirmedir —
  // sağlayıcı çökerse skorlama zayıflar ama çalıştırma anlamlı kalır ve
  // eksiklik raporda FailedBranch olarak açıkça görünür.
  if (!serpResult.ok) {
    throw new AppError('COLLECT_SPINE_FAILED', `SERP dalı başarısız: ${serpResult.error.message}`)
  }

  const spineFailures: FailedBranch[] = []
  const keywords = keywordResult.ok ? keywordResult.value : []
  if (!keywordResult.ok) {
    logger.warn(`Keyword dalı başarısız, hacim verisi olmadan devam ediliyor: ${keywordResult.error.message}`)
    spineFailures.push({ branch: 'keyword', message: keywordResult.error.message })
  }
  logger.info(`SERP tamam: ${serpResult.value.length} sonuç, ${keywords.length} keyword metriği`)

  // Aşama 2 — SERP'ten rakip domain'leri türet, kalan dalları paralel topla
  const competitorDomains = deps.deriveCompetitorDomains(serpResult.value)
  const backlinkDomains = [...new Set([config.domain, ...config.seedCompetitors, ...competitorDomains])]
  const clientAuditUrls = deps.deriveAuditUrls(serpResult.value)
  const techUrls = [
    ...clientAuditUrls,
    ...competitorDomains.slice(0, TECH_AUDIT_COMPETITOR_COUNT).map((domain) => `https://${domain}/`),
  ]
  logger.info(`Teknik denetim ${techUrls.length} URL için çalışacak.`)

  const [backlinkResult, techResult, aiResult, gscResult, indexResult, cruxResult] = await Promise.all([
    collectBacklinks(providers, backlinkDomains),
    collectTechAudits(providers, techUrls),
    collectAiVisibility(providers, config, backlinkDomains.filter((domain) => domain !== config.domain)),
    collectGsc(providers, config),
    // Yalnız müşteri sayfaları — rakip URL'leri servis hesabının erişemediği bir mülk.
    collectIndexStatuses(providers, clientAuditUrls),
    // Aynı URL seti: müşteri denetim sayfaları + rakip anasayfaları — Lighthouse/PSI'nin
    // lab verisiyle karşılaştırılabilir gerçek kullanıcı p75'i, rakipler dahil.
    collectFieldCwv(providers, techUrls),
  ])

  const failedBranches: FailedBranch[] = [...spineFailures]
  const takeOrEmpty = <T>(branch: string, result: { ok: true; value: T } | { ok: false; error: AppError }): T | [] => {
    if (result.ok) return result.value
    logger.warn(`${branch} dalı başarısız, boş veriyle devam: ${result.error.message}`)
    failedBranches.push({ branch, message: result.error.message })
    return []
  }

  return {
    keywords,
    serps: serpResult.value,
    backlinks: takeOrEmpty('backlink', backlinkResult) as readonly BacklinkProfile[],
    techAudits: takeOrEmpty('teknik denetim', techResult) as readonly TechAudit[],
    aiSamples: takeOrEmpty('AI görünürlük', aiResult) as readonly AiVisibilitySample[],
    gscRows: takeOrEmpty('GSC', gscResult) as readonly GscRow[],
    indexStatuses: takeOrEmpty('indeksleme durumu', indexResult) as readonly IndexStatus[],
    fieldCwv: takeOrEmpty('CrUX alan verisi', cruxResult) as readonly FieldCwv[],
    failedBranches,
  }
}
