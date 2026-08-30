import type { CollectedData } from '../collectors/runAllCollectors.js'
import { computeCodeAuditFindings } from '../codeaudit/computeCodeAuditFindings.js'
import { linkFindingsToCode } from '../codeaudit/linkFindingsToCode.js'
import type { SourceFile } from '../codeaudit/types.js'
import { CWV_THRESHOLDS } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import { extractRootDomain } from '../core/text.js'
import type { Competitor, FieldCwv, GscRow, KeywordSnapshotRow, TechAudit } from '../core/types.js'
import type { Finding } from '../core/findings.js'
import { buildClusters, buildKeywordRows, type KeywordCluster } from './clusterKeywords.js'
import { diagnoseCwv } from './cwv/diagnose.js'
import type { CwvDiagnosis } from './cwv/types.js'
import { detectCrawlabilityIssues } from './crawl/detectCrawlabilityIssues.js'
import { detectCrossPageIssues } from './crawl/detectCrossPageIssues.js'
import { detectLinkIssues } from './crawl/detectLinkIssues.js'
import { detectOnPageIssues } from './crawl/detectOnPageIssues.js'
import { detectAiGaps, type AiQueryVisibility } from './detectAiGaps.js'
import { detectCannibalization } from './detectCannibalization.js'
import { detectIndexingIssues } from './detectIndexingIssues.js'
import { discoverCompetitors, realCompetitorDomains } from './discoverCompetitors.js'
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

/** Toplanan ham veriyi rapora hazır analiz sonucuna dönüştürür — tamamı saf hesap. */
export const runAnalysis = (collected: CollectedData, config: ProjectConfig): AnalysisResult => {
  const rows = buildKeywordRows(collected.keywords, collected.serps, config)
  const competitors = discoverCompetitors(collected.serps, config)
  const reals = realCompetitorDomains(competitors)

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
      .map((evaluation) => enrichWithCodeLocation(evaluation, collected.sourceFiles)),
    gscRows: collected.gscRows,
    indexingFindings: detectIndexingIssues(collected.indexStatuses),
    cannibalizationFindings: detectCannibalization(collected.gscRows),
    fieldCwv: collected.fieldCwv,
    crawlFindings: [
      ...detectOnPageIssues(collected.crawledPages),
      ...detectLinkIssues(collected.crawledPages, collected.crawlSeedUrls),
      ...detectCrawlabilityIssues(collected.crawledPages, collected.sitemapUrls),
      ...detectCrossPageIssues(collected.crawledPages),
    ],
    codeAuditFindings: computeCodeAuditFindings(collected.sourceFiles, collected.detectedStacks),
  }
}
