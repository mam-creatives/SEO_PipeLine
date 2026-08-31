import { diffRuns } from '../analysis/diffRuns.js'
import { discoverCompetitors, realCompetitorDomains } from '../analysis/discoverCompetitors.js'
import { allFindings, runAnalysis } from '../analysis/runAnalysis.js'
import { selectAuditUrls } from '../analysis/selectAuditUrls.js'
import { runAllCollectors } from '../collectors/runAllCollectors.js'
import { snapshotToCollectedData } from '../collectors/snapshotToCollectedData.js'
import { RETENTION_RUNS } from '../config/constants.js'
import { loadEnv } from '../config/env.js'
import { computeConfigHash, loadProjectConfig } from '../config/loadConfig.js'
import { createLogger } from '../core/logger.js'
import type { FieldCwv, KeywordGap, PageLink } from '../core/types.js'
import { selectProviders } from '../providers/registry.js'
import { buildReportModel } from '../reporting/reportModel.js'
import { writeReports } from '../reporting/writeReports.js'
import { openDatabase, vacuumDatabase } from '../storage/db.js'
import { getRunSnapshot } from '../storage/queryRepository.js'
import { createRun, finishRun, getPreviousCompletedRun, pruneOldRuns } from '../storage/runRepository.js'
import {
  insertAiSamples,
  insertBacklinks,
  insertCompetitors,
  insertFieldCwv,
  insertGscRows,
  insertIndexStatuses,
  insertKeywordGaps,
  insertKeywordSnapshots,
  insertPageLinks,
  insertPages,
  insertSerpSnapshots,
  insertSitemapUrls,
  insertTechAudits,
} from '../storage/snapshotRepository.js'
import { synthesizeWithRules } from '../synthesis/ruleSynthesizer.js'

const logger = createLogger('research')

/** page_links UNIQUE(runId, sourceUrl, targetUrl) — aynı çift birden fazla sayfa bölümünde tekrarlanabilir (nav + footer). */
const dedupeLinks = (links: readonly PageLink[]): readonly PageLink[] => {
  const byKey = new Map<string, PageLink>()
  for (const link of links) {
    const key = `${link.sourceUrl} ${link.targetUrl}`
    if (!byKey.has(key)) byKey.set(key, link)
  }
  return [...byKey.values()]
}

/**
 * field_cwv UNIQUE(runId, url, formFactor) — CrUX'un origin-fallback'i (bkz. cruxProvider.ts
 * withRequestedUrl yorumu) düzeltildi, ama aynı sınıf hatanın gelecekte başka bir sağlayıcı
 * tuhaflığıyla tekrarlanmaması için ek güvenlik: dedupeLinks'le aynı desen.
 */
const dedupeFieldCwv = (rows: readonly FieldCwv[]): readonly FieldCwv[] => {
  const byKey = new Map<string, FieldCwv>()
  for (const row of rows) {
    const key = `${row.url} ${row.formFactor}`
    if (!byKey.has(key)) byKey.set(key, row)
  }
  return [...byKey.values()]
}

/** keyword_gaps UNIQUE(runId, keyword, competitorDomain) — dedupeFieldCwv'yle aynı defense-in-depth deseni. */
const dedupeKeywordGaps = (rows: readonly KeywordGap[]): readonly KeywordGap[] => {
  const byKey = new Map<string, KeywordGap>()
  for (const row of rows) {
    const key = `${row.keyword} ${row.competitorDomain}`
    if (!byKey.has(key)) byKey.set(key, row)
  }
  return [...byKey.values()]
}

export interface ResearchOptions {
  readonly configPath: string
  readonly dbPath: string
  readonly reportsDir: string
  readonly envFilePath?: string
  /** `--code <yol>` — verildiyse config dosyasındaki codePath'i ezer. */
  readonly codePathOverride?: string
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
  const loadedConfig = loadProjectConfig(options.configPath)
  const config = options.codePathOverride === undefined ? loadedConfig : { ...loadedConfig, codePath: options.codePathOverride }
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
      const analysis = runAnalysis(collected, config, providers.mockCategories)

      insertKeywordSnapshots(db, run.id, analysis.rows)
      insertSerpSnapshots(db, run.id, collected.serps)
      insertBacklinks(db, run.id, collected.backlinks)
      insertTechAudits(db, run.id, collected.techAudits)
      insertAiSamples(db, run.id, collected.aiSamples)
      insertGscRows(db, run.id, collected.gscRows)
      insertIndexStatuses(db, run.id, collected.indexStatuses)
      insertFieldCwv(db, run.id, dedupeFieldCwv(collected.fieldCwv))
      insertPages(db, run.id, collected.crawledPages)
      // Aynı (source, target) çifti bir sayfada birden fazla kez görünebilir (ör. nav +
      // footer'da aynı linke iki kere) — page_links UNIQUE(runId, sourceUrl, targetUrl)
      // olduğu için tekilleştirilir, ilk görülen anchor metni korunur.
      insertPageLinks(db, run.id, dedupeLinks(collected.crawledPages.flatMap((page) => page.internalLinks)))
      insertCompetitors(db, run.id, analysis.competitors)
      insertKeywordGaps(db, run.id, dedupeKeywordGaps(collected.keywordGaps))
      // Dış denetim bulgusu (2026-08-31, BLOKER 3) — bkz. migrations.ts v18 yorumu.
      insertSitemapUrls(db, run.id, collected.sitemapUrls)
      finishRun(db, run.id, 'completed')

      const previousMeta = getPreviousCompletedRun(db, run.id)
      const previousSnapshot = previousMeta === null ? null : getRunSnapshot(db, previousMeta.id)
      const currentSnapshot = getRunSnapshot(db, run.id)

      // Faz 5.6 — bulgu-bazlı diff için önceki run'ın bulguları ham veriden yeniden hesaplanır
      // (snapshot bulguyu değil ham veriyi taşıyor, bkz. diffRuns.ts yorumu).
      const previousAnalysis =
        previousSnapshot === null
          ? null
          : runAnalysis(
              snapshotToCollectedData(previousSnapshot, config, (serps) => selectAuditUrls(serps, config)),
              config,
              previousSnapshot.run.mockCategories,
            )
      const diff = diffRuns(
        previousSnapshot,
        currentSnapshot,
        previousAnalysis === null ? [] : allFindings(previousAnalysis),
        allFindings(analysis),
      )
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

      // Dış denetim bulgusu (2026-08-31) — retention/VACUUM hiç yoktu, DB müşteri başına
      // yılda ~2 GB'a kadar büyüyebiliyordu (bkz. runRepository.ts pruneOldRuns yorumu).
      // Rapor ZATEN yazıldıktan SONRA çalışır — bu run'ın kendi verisini asla etkilemez.
      const prunedCount = pruneOldRuns(db, RETENTION_RUNS)
      if (prunedCount > 0) {
        logger.info(`${prunedCount} eski run silindi (retention: ${RETENTION_RUNS} run) — VACUUM çalıştırılıyor.`)
        vacuumDatabase(db)
      }

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
