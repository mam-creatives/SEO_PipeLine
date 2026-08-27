import { diffRuns } from '../analysis/diffRuns.js'
import { runAnalysis } from '../analysis/runAnalysis.js'
import type { CollectedData } from '../collectors/runAllCollectors.js'
import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { buildReportModel } from '../reporting/reportModel.js'
import { writeReports } from '../reporting/writeReports.js'
import { openDatabase } from '../storage/db.js'
import { getRunSnapshot } from '../storage/queryRepository.js'
import { getLatestCompletedRun, getPreviousCompletedRun } from '../storage/runRepository.js'
import { synthesizeWithRules } from '../synthesis/ruleSynthesizer.js'
import { resolveCliPaths } from './args.js'

const logger = createLogger('report')

/** Yeni veri TOPLAMADAN, son tamamlanmış snapshot'tan raporları yeniden üretir. */
const main = async (): Promise<void> => {
  try {
    const paths = resolveCliPaths(process.argv.slice(2), (configPath) => loadProjectConfig(configPath).domain)
    const config = loadProjectConfig(paths.configPath)
    const db = openDatabase(paths.dbPath)
    try {
      const latest = getLatestCompletedRun(db)
      if (latest === null) {
        logger.error('Tamamlanmış çalıştırma yok — önce `npm run research` çalıştırın.')
        process.exitCode = 1
        return
      }

      const snapshot = getRunSnapshot(db, latest.id)
      const collected: CollectedData = {
        keywords: snapshot.keywords,
        serps: snapshot.serps,
        backlinks: snapshot.backlinks,
        techAudits: snapshot.techAudits,
        aiSamples: snapshot.aiSamples,
        gscRows: snapshot.gscRows,
        indexStatuses: snapshot.indexStatuses,
        fieldCwv: snapshot.fieldCwv,
        failedBranches: [],
      }
      const analysis = runAnalysis(collected, config)

      const previousMeta = getPreviousCompletedRun(db, latest.id)
      const previousSnapshot = previousMeta === null ? null : getRunSnapshot(db, previousMeta.id)
      const diff = diffRuns(previousSnapshot, snapshot)
      const synthesis = synthesizeWithRules(analysis, diff)

      const model = buildReportModel({
        run: latest,
        previousRunId: previousMeta?.id ?? null,
        config,
        analysis,
        diff,
        synthesis,
        failedBranches: [],
      })
      const written = writeReports(model, 'reports')
      logger.info(`Run #${latest.id} raporu yeniden üretildi: ${written.markdownPath}`)
    } finally {
      db.close()
    }
  } catch (error) {
    logger.error('Rapor üretimi başarısız oldu.', error)
    process.exitCode = 1
  }
}

void main()
