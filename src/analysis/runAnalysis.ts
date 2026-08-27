import type { CollectedData } from '../collectors/runAllCollectors.js'
import { CWV_THRESHOLDS } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import { extractRootDomain } from '../core/text.js'
import type { Competitor, GscRow, KeywordSnapshotRow, TechAudit } from '../core/types.js'
import type { Finding } from '../core/findings.js'
import { buildClusters, buildKeywordRows, type KeywordCluster } from './clusterKeywords.js'
import { diagnoseCwv } from './cwv/diagnose.js'
import type { CwvDiagnosis } from './cwv/types.js'
import { detectAiGaps, type AiQueryVisibility } from './detectAiGaps.js'
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
    techEvaluations: collected.techAudits.map((audit) => ({
      audit,
      passes: {
        lcp: audit.lcpMs <= CWV_THRESHOLDS.lcpMs,
        inp: audit.inpMs <= CWV_THRESHOLDS.inpMs,
        cls: audit.cls <= CWV_THRESHOLDS.cls,
      },
      isClient: extractRootDomain(audit.url) === config.domain,
      diagnosis: diagnoseCwv(audit),
    })),
    gscRows: collected.gscRows,
    indexingFindings: detectIndexingIssues(collected.indexStatuses),
  }
}
