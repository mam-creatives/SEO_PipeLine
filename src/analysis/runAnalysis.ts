import type { CollectedData } from '../collectors/runAllCollectors.js'
import { computeCodeAuditFindings } from '../codeaudit/computeCodeAuditFindings.js'
import { linkFindingsToCode } from '../codeaudit/linkFindingsToCode.js'
import type { SourceFile } from '../codeaudit/types.js'
import { CWV_THRESHOLDS } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import { extractRootDomain } from '../core/text.js'
import type { Competitor, FieldCwv, GscRow, KeywordGap, KeywordPageMatch, KeywordSnapshotRow, TechAudit } from '../core/types.js'
import { withMockFlag, type Finding } from '../core/findings.js'
import { buildClusters, buildKeywordRows, type KeywordCluster } from './clusterKeywords.js'
import { diagnoseCwv } from './cwv/diagnose.js'
import type { CwvDiagnosis } from './cwv/types.js'
import { detectCanonicalIssues } from './crawl/detectCanonicalIssues.js'
import { detectCrawlabilityIssues } from './crawl/detectCrawlabilityIssues.js'
import { detectCrossPageIssues } from './crawl/detectCrossPageIssues.js'
import { detectLinkIssues } from './crawl/detectLinkIssues.js'
import { detectOnPageIssues } from './crawl/detectOnPageIssues.js'
import { detectSchemaIssues } from './crawl/detectSchemaIssues.js'
import { detectAiGaps, type AiQueryVisibility } from './detectAiGaps.js'
import { detectCannibalization } from './detectCannibalization.js'
import { detectIndexingIssues } from './detectIndexingIssues.js'
import { detectKeywordContentIssues } from './detectKeywordContentIssues.js'
import { discoverCompetitors, realCompetitorDomains } from './discoverCompetitors.js'
import { matchKeywordsToPages } from './keywordPageMatch.js'
import { rankOpportunities, type Opportunity } from './scoreOpportunities.js'

export interface TechEvaluation {
  readonly audit: TechAudit
  readonly passes: { readonly lcp: boolean; readonly inp: boolean; readonly cls: boolean }
  readonly isClient: boolean
  /** web-vitals attribution'a dayalı "neden yavaş" teşhisi; attribution yoksa null. */
  readonly diagnosis: CwvDiagnosis | null
}

export interface AnalysisResult {
  readonly rows: readonly KeywordSnapshotRow[]
  readonly clusters: readonly KeywordCluster[]
  readonly competitors: readonly Competitor[]
  readonly opportunities: readonly Opportunity[]
  readonly aiVisibility: readonly AiQueryVisibility[]
  readonly techEvaluations: readonly TechEvaluation[]
  readonly gscRows: readonly GscRow[]
  readonly indexingFindings: readonly Finding[]
  readonly cannibalizationFindings: readonly Finding[]
  readonly fieldCwv: readonly FieldCwv[]
  /** Faz 4.4 — "rakipte var, sende yok" keyword'leri, collectors'tan doğrudan geçirilir (skorlama gerektirmez). */
  readonly keywordGaps: readonly KeywordGap[]
  /** Faz 5.4 — her keyword'ün hangi sayfayla eşleştiği + title/H1/body'de geçip geçmediği. */
  readonly keywordPageMatches: readonly KeywordPageMatch[]
  /** onpage + links + taranabilirlik bulguları birleşik — tek bölümde, sortFindings ile sıralanmış render edilir. */
  readonly crawlFindings: readonly Finding[]
  /** Faz 3 kod denetçisi — config.codePath yapılandırılmamışsa boş dizi. */
  readonly codeAuditFindings: readonly Finding[]
}

/**
 * CWV/on-page bulgularının `culpritSelector`'ını kaynak kodda arayıp `codeLocation` doldurur
 * (Faz 3.5). Yalnız MÜŞTERİNİN kendi denetimleri zenginleştirilir — rakip sitelerin kaynak
 * kodu elimizde yok, `linkFindingsToCode`'u rakip bulgularına uygulamak anlamsız arama yapardı.
 */
const enrichWithCodeLocation = (evaluation: TechEvaluation, sourceFiles: readonly SourceFile[]): TechEvaluation => {
  if (!evaluation.isClient || sourceFiles.length === 0) return evaluation
  return {
    ...evaluation,
    audit: { ...evaluation.audit, seoFindings: linkFindingsToCode(evaluation.audit.seoFindings ?? [], sourceFiles) },
    diagnosis:
      evaluation.diagnosis === null
        ? null
        : { ...evaluation.diagnosis, findings: linkFindingsToCode(evaluation.diagnosis.findings, sourceFiles) },
  }
}

/**
 * Dış denetim bulgusu (2026-08-31) — `tech` kategorisi mock'taysa CWV teşhisi ve Lighthouse
 * SEO bulguları da sentetiktir; `enrichWithCodeLocation`'la aynı iki alanı (`diagnosis.findings`,
 * `audit.seoFindings`) `withMockFlag` ile damgalar.
 */
const stampTechMock = (evaluation: TechEvaluation, isMock: boolean): TechEvaluation => {
  if (!isMock) return evaluation
  return {
    ...evaluation,
    audit: { ...evaluation.audit, seoFindings: withMockFlag(evaluation.audit.seoFindings ?? [], true) },
    diagnosis: evaluation.diagnosis === null ? null : { ...evaluation.diagnosis, findings: withMockFlag(evaluation.diagnosis.findings, true) },
  }
}

/**
 * Faz 5.6 — bulgu-bazlı diff (`diffRuns`) için tüm bulgu kaynaklarını tek diziye toplar.
 * `crawlFindings` zaten on-page/link/taranabilirlik/canonical/schema/keyword-içerik
 * bulgularının birleşimi (Faz 5.1-5.4); CWV per-page teşhis bulguları (`techEvaluations`
 * içinde) ve Lighthouse `seoFindings` kapsam dışı bırakıldı — onlar zaten `cwvDeltas`/mevcut
 * regresyon uyarısıyla ayrıca izleniyor, bilinçli bir basitleştirme.
 */
export const allFindings = (analysis: AnalysisResult): readonly Finding[] => [
  ...analysis.crawlFindings,
  ...analysis.indexingFindings,
  ...analysis.cannibalizationFindings,
  ...analysis.codeAuditFindings,
]

/**
 * Toplanan ham veriyi rapora hazır analiz sonucuna dönüştürür — tamamı saf hesap.
 *
 * `mockCategories` (2026-08-31 dış denetim düzeltmesi) — hangi sağlayıcı kategorilerinin
 * mock çalıştığı; ilgili kategoriden türeyen bulgu ailelerine `Finding.isMock` damgalanır
 * ki rapor katmanı (rozet) ve sentez katmanı (özetten hariç tutma) ayırt edebilsin.
 * Varsayılan `[]` — geriye dönük uyumlu, eski çağrılar "hiçbir şey mock değil" davranır.
 */
export const runAnalysis = (collected: CollectedData, config: ProjectConfig, mockCategories: readonly string[] = []): AnalysisResult => {
  const rows = buildKeywordRows(collected.keywords, collected.serps, config)
  const competitors = discoverCompetitors(collected.serps, config)
  const reals = realCompetitorDomains(competitors)
  const keywordPageMatches = matchKeywordsToPages(rows, collected.crawledPages, collected.gscRows, collected.serps, config.domain)
  const isTechMock = mockCategories.includes('tech')
  const isCrawlMock = mockCategories.includes('crawl')

  return {
    rows,
    clusters: buildClusters(rows),
    competitors,
    opportunities: rankOpportunities(rows, collected.serps),
    aiVisibility: detectAiGaps(collected.aiSamples, reals),
    techEvaluations: collected.techAudits
      .map((audit) => ({
        audit,
        passes: {
          lcp: audit.lcpMs <= CWV_THRESHOLDS.lcpMs,
          inp: audit.inpMs <= CWV_THRESHOLDS.inpMs,
          cls: audit.cls <= CWV_THRESHOLDS.cls,
        },
        isClient: extractRootDomain(audit.url) === config.domain,
        diagnosis: diagnoseCwv(audit),
      }))
      .map((evaluation) => enrichWithCodeLocation(evaluation, collected.sourceFiles))
      .map((evaluation) => stampTechMock(evaluation, isTechMock)),
    gscRows: collected.gscRows,
    indexingFindings: withMockFlag(detectIndexingIssues(collected.indexStatuses), mockCategories.includes('indexing')),
    cannibalizationFindings: withMockFlag(detectCannibalization(collected.gscRows), mockCategories.includes('searchConsole')),
    fieldCwv: collected.fieldCwv,
    keywordGaps: collected.keywordGaps,
    keywordPageMatches,
    crawlFindings: withMockFlag(
      [
        ...detectOnPageIssues(collected.crawledPages),
        ...detectLinkIssues(collected.crawledPages, collected.crawlSeedUrls, collected.sitemapUrls),
        ...detectCrawlabilityIssues(collected.crawledPages, collected.sitemapUrls),
        ...detectCrossPageIssues(collected.crawledPages),
        ...detectCanonicalIssues(collected.crawledPages),
        ...detectSchemaIssues(collected.crawledPages),
        ...detectKeywordContentIssues(keywordPageMatches, collected.crawledPages),
      ],
      isCrawlMock,
    ),
    codeAuditFindings: computeCodeAuditFindings(collected.sourceFiles, collected.detectedStacks),
  }
}
