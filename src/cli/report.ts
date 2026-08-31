import { diffRuns } from '../analysis/diffRuns.js'
import { allFindings, runAnalysis } from '../analysis/runAnalysis.js'
import { selectAuditUrls } from '../analysis/selectAuditUrls.js'
import { snapshotToCollectedData } from '../collectors/snapshotToCollectedData.js'
import { loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import { buildReportModel } from '../reporting/reportModel.js'
import { writeReports } from '../reporting/writeReports.js'
import { openDatabase } from '../storage/db.js'
import { getRunSnapshot } from '../storage/queryRepository.js'
import { getLatestCompletedRun, getPreviousCompletedRun, getRunById } from '../storage/runRepository.js'
import { synthesizeWithRules } from '../synthesis/ruleSynthesizer.js'
import { extractRunIdFlag, resolveCliPaths } from './args.js'
import { hasHelpFlag } from './help.js'

const logger = createLogger('report')

const USAGE = `Kullanım: npm run report -- [--config <yol>] [--run <id>]

Yeni veri TOPLAMADAN, veritabanındaki bir snapshot'tan raporları yeniden üretir
(dedupe/kırpma/GSC top-N gibi render kuralları değiştiğinde eski bir run'ı güncel
şablonla yeniden basmak için kullanışlı).

  --config <yol>   config/project.json yerine kullanılacak müşteri config dosyası
  --run <id>       belirli bir run'ı render eder (verilmezse son tamamlanmış run)
  --help, -h       bu metni gösterir`

/** Yeni veri TOPLAMADAN, belirtilen (ya da son tamamlanmış) snapshot'tan raporları yeniden üretir. */
const main = async (): Promise<void> => {
  const argv = process.argv.slice(2)
  if (hasHelpFlag(argv)) {
    console.log(USAGE)
    return
  }
  try {
    const paths = resolveCliPaths(argv, (configPath) => loadProjectConfig(configPath).domain)
    const config = loadProjectConfig(paths.configPath)
    const db = openDatabase(paths.dbPath)
    try {
      // Dış denetim bulgusu (2026-08-31, Faz C) — `getRunById` zaten vardı, hiç kullanılmıyordu;
      // bu komut her zaman SON tamamlanmış run'ı render ediyordu, belirli bir run'a dönmenin yolu yoktu.
      const requestedRunId = extractRunIdFlag(argv)
      const latest = requestedRunId === null ? getLatestCompletedRun(db) : getRunById(db, requestedRunId)
      if (latest === null || latest.status !== 'completed') {
        logger.error(
          requestedRunId === null
            ? 'Tamamlanmış çalıştırma yok — önce `npm run research` çalıştırın.'
            : `Run #${requestedRunId} bulunamadı ya da tamamlanmamış.`,
        )
        process.exitCode = 1
        return
      }

      const snapshot = getRunSnapshot(db, latest.id)
      const deriveAuditUrls = (serps: Parameters<typeof selectAuditUrls>[0]): readonly string[] => selectAuditUrls(serps, config)
      const analysis = runAnalysis(snapshotToCollectedData(snapshot, config, deriveAuditUrls), config, snapshot.run.mockCategories)

      const previousMeta = getPreviousCompletedRun(db, latest.id)
      const previousSnapshot = previousMeta === null ? null : getRunSnapshot(db, previousMeta.id)
      // Faz 5.6 — bulgu-bazlı diff (hangi bulgu düzeldi/yeni açıldı) için önceki run'ın
      // bulguları da ham veriden yeniden hesaplanır — snapshot bulguyu değil ham veriyi taşıyor.
      const previousAnalysis =
        previousSnapshot === null
          ? null
          : runAnalysis(
              snapshotToCollectedData(previousSnapshot, config, deriveAuditUrls),
              config,
              previousSnapshot.run.mockCategories,
            )
      const diff = diffRuns(
        previousSnapshot,
        snapshot,
        previousAnalysis === null ? [] : allFindings(previousAnalysis),
        allFindings(analysis),
      )
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
