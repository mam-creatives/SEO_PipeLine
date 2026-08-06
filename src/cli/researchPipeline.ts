import { diffRuns } from '../analysis/diffRuns.js'
import { discoverCompetitors, realCompetitorDomains } from '../analysis/discoverCompetitors.js'
import { runAnalysis } from '../analysis/runAnalysis.js'
import { selectAuditUrls } from '../analysis/selectAuditUrls.js'
import { runAllCollectors } from '../collectors/runAllCollectors.js'
import { loadEnv } from '../config/env.js'
import { computeConfigHash, loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { selectProviders } from '../providers/registry.js'
import { buildReportModel } from '../reporting/reportModel.js'
import { writeReports } from '../reporting/writeReports.js'
import { openDatabase } from '../storage/db.js'
import { getRunSnapshot } from '../storage/queryRepository.js'
import { createRun, finishRun, getPreviousCompletedRun } from '../storage/runRepository.js'
import {
  insertAiSamples,
  insertBacklinks,
  insertCompetitors,
  insertGscRows,
  insertKeywordSnapshots,
  insertSerpSnapshots,
  insertTechAudits,
} from '../storage/snapshotRepository.js'
import { synthesizeWithRules } from '../synthesis/ruleSynthesizer.js'

const logger = createLogger('research')

export interface ResearchOptions {
  readonly configPath: string
  readonly dbPath: string
  readonly reportsDir: string
  readonly envFilePath?: string
}

export interface ResearchOutcome {
  readonly runId: number
  readonly markdownPath: string
  readonly htmlPath: string
  readonly headline: string
  readonly mockCategories: readonly string[]
}

/**
 * Tam araştırma döngüsü: config → provider seçimi → toplama → analiz →
 * snapshot kaydı → önceki run ile diff → sentez → rapor.
 * CLI'dan da testlerden de aynı fonksiyon çağrılır.
 */
export const runResearch = async (options: ResearchOptions): Promise<ResearchOutcome> => {
  const config = loadProjectConfig(options.configPath)
  const env = loadEnv(options.envFilePath ?? '.env')
  const providers = selectProviders(env, config)

  if (providers.mockCategories.length > 0) {
    logger.warn(`⚠ MOCK MODE — sentetik veriyle çalışan kategoriler: ${providers.mockCategories.join(', ')}`)
  }

  const db = openDatabase(options.dbPath)
  try {
    const run = createRun(db, computeConfigHash(config), providers.mockCategories)
    try {
      const collected = await runAllCollectors(providers, config, {
        deriveCompetitorDomains: (serps) => realCompetitorDomains(discoverCompetitors(serps, config)),
        deriveAuditUrls: (serps) => selectAuditUrls(serps, config),
      })
      const analysis = runAnalysis(collected, config)

      insertKeywordSnapshots(db, run.id, analysis.rows)
      insertSerpSnapshots(db, run.id, collected.serps)
      insertBacklinks(db, run.id, collected.backlinks)
      insertTechAudits(db, run.id, collected.techAudits)
      insertAiSamples(db, run.id, collected.aiSamples)
      insertGscRows(db, run.id, collected.gscRows)
      insertCompetitors(db, run.id, analysis.competitors)
      finishRun(db, run.id, 'completed')

      const previousMeta = getPreviousCompletedRun(db, run.id)
      const previousSnapshot = previousMeta === null ? null : getRunSnapshot(db, previousMeta.id)
      const currentSnapshot = getRunSnapshot(db, run.id)

      const diff = diffRuns(previousSnapshot, currentSnapshot)
      const synthesis = synthesizeWithRules(analysis, diff)
      const model = buildReportModel({
        run: currentSnapshot.run,
        previousRunId: previousMeta?.id ?? null,
        config,
        analysis,
        diff,
        synthesis,
        failedBranches: collected.failedBranches,
      })
      const written = writeReports(model, options.reportsDir)

      logger.info(`Run #${run.id} tamamlandı. Rapor: ${written.markdownPath}`)
      return {
        runId: run.id,
        markdownPath: written.markdownPath,
        htmlPath: written.htmlPath,
        headline: synthesis.headline,
        mockCategories: providers.mockCategories,
      }
    } catch (cause) {
      try {
        finishRun(db, run.id, 'failed')
      } catch {
        // run zaten kapanmışsa (ör. rapor yazımı toplamadan sonra patladı) orijinal hata korunur
      }
      throw cause
    }
  } finally {
    db.close()
  }
}
