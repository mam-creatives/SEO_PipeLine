import type { CwvDiagnosis } from '../analysis/cwv/types.js'
import { diagnoseCwv } from '../analysis/cwv/diagnose.js'
import { detectOnPageIssues } from '../analysis/crawl/detectOnPageIssues.js'
import { discoverCompetitors } from '../analysis/discoverCompetitors.js'
import { detectMentions } from '../collectors/detectMentions.js'
import { buildScaffoldConfig, guessBrandName } from '../config/scaffoldConfig.js'
import type { ProviderError } from '../core/errors.js'
import type { Finding } from '../core/findings.js'
import { ok, type Result } from '../core/result.js'
import type { AiAnswer, Competitor, CrawledPage, SerpSnapshot, TechAudit } from '../core/types.js'
import type { DailyBudget } from './rateLimit.js'
import { assertPublicDomain } from './ssrfGuard.js'

export interface GeoCheckResult {
  readonly query: string
  readonly mentioned: boolean
}

export interface LiteAnalysisResult {
  readonly domain: string
  readonly brandName: string
  readonly page: CrawledPage
  readonly onPageFindings: readonly Finding[]
  readonly techAudit: TechAudit | null
  readonly cwvDiagnosis: CwvDiagnosis | null
  readonly geoResults: readonly GeoCheckResult[]
  /** null = bütçe/anahtar yok, bu bölüm hiç denenmedi (ayrı bir "boş" durumundan farklı). */
  readonly competitors: readonly Competitor[] | null
  readonly warnings: readonly string[]
}

/**
 * Ağ çağıran her adım enjekte edilir — `runAllCollectors.ts`'in `CollectorDeps` ve
 * `researchClient.ts`'in `crawlPage` deseniyle aynı gerekçe: bu fonksiyon gerçek ağ
 * çağrısı olmadan test edilebilsin. `server.ts`, `.env`'deki anahtarların varlığına göre
 * (PSI mi Lighthouse mu, Gemini/SerpApi var mı) hangi sağlayıcıyı bağlayacağına karar
 * verir — `null` = o kategori için anahtar yok, bu adım hiç denenmez.
 */
export interface LiteAnalysisDeps {
  readonly crawlPage: (url: string) => Promise<Result<CrawledPage, ProviderError>>
  readonly auditUrl: ((url: string) => Promise<Result<TechAudit, ProviderError>>) | null
  readonly askGeo: ((query: string) => Promise<Result<AiAnswer, ProviderError>>) | null
  readonly fetchSerp: ((keyword: string) => Promise<Result<SerpSnapshot, ProviderError>>) | null
  readonly serpBudget: DailyBudget | null
}

/**
 * Versiyon A (kamuya açık hafif web aracı) orkestrasyonu — mevcut CLI pipeline'ının
 * analiz katmanını yeniden kullanır ama BİLEREK dar bir kapsımda: tek sayfa (anasayfa),
 * GSC/DataForSEO yok, SerpApi yalnız günlük bütçe izin verirse. Hiçbir adım `data/*.db`'ye
 * yazmaz (bkz. plan) — sonuç doğrudan çağıranın (server.ts) render edip döneceği bir
 * in-memory nesne.
 *
 * `assertPublicDomain` HER ZAMAN ilk adım — SSRF koruması, hiçbir sağlayıcı çağrılmadan önce.
 */
export const runLiteAnalysis = async (
  domain: string,
  geoQuestions: readonly string[],
  deps: LiteAnalysisDeps,
): Promise<Result<LiteAnalysisResult, ProviderError>> => {
  const safeDomain = await assertPublicDomain(domain)
  if (!safeDomain.ok) return safeDomain

  const warnings: string[] = []
  const scaffold = buildScaffoldConfig(domain)
  const brandName = guessBrandName(domain)
  const homepageUrl = `https://${domain}/`

  const pageResult = await deps.crawlPage(homepageUrl)
  if (!pageResult.ok) return pageResult
  const page = pageResult.value
  const onPageFindings = detectOnPageIssues([page])

  let techAudit: TechAudit | null = null
  let cwvDiagnosis: CwvDiagnosis | null = null
  if (deps.auditUrl !== null) {
    const techResult = await deps.auditUrl(homepageUrl)
    if (techResult.ok) {
      techAudit = techResult.value
      cwvDiagnosis = diagnoseCwv(techResult.value)
    } else {
      warnings.push(`Core Web Vitals denemesi başarısız: ${techResult.error.message}`)
    }
  } else {
    warnings.push('Core Web Vitals denemesi atlandı — ne PAGESPEED_API_KEY ne Lighthouse yapılandırılmış.')
  }

  const geoResults: GeoCheckResult[] = []
  if (deps.askGeo !== null) {
    for (const query of geoQuestions) {
      const answer = await deps.askGeo(query)
      if (answer.ok) {
        const mentions = detectMentions(answer.value.text, scaffold.brandTokens, [])
        geoResults.push({ query, mentioned: mentions.clientMentioned })
      } else {
        warnings.push(`"${query}" için AI görünürlük denemesi başarısız: ${answer.error.message}`)
      }
    }
  } else {
    warnings.push('AI görünürlük denemesi atlandı — GEMINI_API_KEY yapılandırılmamış.')
  }

  // Rakip anlık görüntüsü — bilerek en pahalı/riskli kalem, yalnız günlük bütçe izin verirse.
  let competitors: readonly Competitor[] | null = null
  if (deps.fetchSerp !== null && deps.serpBudget !== null) {
    if (deps.serpBudget.tryConsume()) {
      const seedKeyword = page.title !== null && page.title.trim() !== '' ? page.title.trim() : brandName
      const serpResult = await deps.fetchSerp(seedKeyword)
      if (serpResult.ok) {
        competitors = discoverCompetitors([serpResult.value], scaffold)
      } else {
        warnings.push(`Rakip anlık görüntüsü başarısız: ${serpResult.error.message}`)
      }
    } else {
      warnings.push('Rakip anlık görüntüsü günlük kota nedeniyle atlandı.')
    }
  }

  return ok({ domain, brandName, page, onPageFindings, techAudit, cwvDiagnosis, geoResults, competitors, warnings })
}
