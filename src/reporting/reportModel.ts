import type { TrendDiff } from '../analysis/diffRuns.js'
import type { AnalysisResult } from '../analysis/runAnalysis.js'
import type { FailedBranch } from '../collectors/runAllCollectors.js'
import type { ProjectConfig } from '../config/schema.js'
import type { RunMeta } from '../core/types.js'
import type { SynthesisOutput } from '../synthesis/ruleSynthesizer.js'

/** Her iki renderer'ın (Markdown + HTML) tükettiği tek rapor modeli. */
export interface ReportModel {
  readonly generatedAt: string
  readonly run: RunMeta
  readonly previousRunId: number | null
  readonly domain: string
  readonly brandName: string
  readonly mockCategories: readonly string[]
  readonly failedBranches: readonly FailedBranch[]
  readonly synthesis: SynthesisOutput
  readonly analysis: AnalysisResult
  readonly diff: TrendDiff
}

export const buildReportModel = (args: {
  readonly run: RunMeta
  readonly previousRunId: number | null
  readonly config: ProjectConfig
  readonly analysis: AnalysisResult
  readonly diff: TrendDiff
  readonly synthesis: SynthesisOutput
  readonly failedBranches: readonly FailedBranch[]
}): ReportModel => ({
  generatedAt: new Date().toISOString(),
  run: args.run,
  previousRunId: args.previousRunId,
  domain: args.config.domain,
  brandName: args.config.brandName,
  mockCategories: args.run.mockCategories,
  failedBranches: args.failedBranches,
  synthesis: args.synthesis,
  analysis: args.analysis,
  diff: args.diff,
})
