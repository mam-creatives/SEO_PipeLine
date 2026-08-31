import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../core/errors.js'
import { slugify } from '../core/text.js'
import type { GscRow } from '../core/types.js'
import { renderHtml } from './htmlReport.js'
import { renderMarkdown } from './markdownReport.js'
import type { ReportModel } from './reportModel.js'

export interface WrittenReports {
  readonly markdownPath: string
  readonly htmlPath: string
  /** GSC satırı yoksa (servis hesabı yapılandırılmamış/mock) null — CSV üretilmez. */
  readonly gscCsvPath: string | null
}

/** RFC 4180'in en yalın hali: alan virgül/tırnak/satır sonu içeriyorsa çift tırnağa alınır. */
const escapeCsvField = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — GSC tablosu rapor gövdesinde top-N'e kırpılıyor
 * (bkz. GSC_ROWS_REPORT_LIMIT); kırpılan veri kaybolmasın diye TAM liste burada CSV'ye yazılır.
 */
const renderGscCsv = (rows: readonly GscRow[]): string => {
  const header = 'query,page,clicks,impressions,ctr,avgPosition'
  const lines = rows.map((row) =>
    [row.query, row.page, String(row.clicks), String(row.impressions), row.ctr.toFixed(4), row.avgPosition.toFixed(2)]
      .map(escapeCsvField)
      .join(','),
  )
  return [header, ...lines].join('\n')
}

/** Raporları reports/<tarih>_<domain>/report-run<id>.{md,html,csv} olarak yazar. */
export const writeReports = (model: ReportModel, baseDir: string): WrittenReports => {
  const dateLabel = model.run.startedAt.slice(0, 10)
  const reportDir = join(baseDir, `${dateLabel}_${slugify(model.domain)}`)
  const markdownPath = join(reportDir, `report-run${model.run.id}.md`)
  const htmlPath = join(reportDir, `report-run${model.run.id}.html`)
  const hasGscRows = model.analysis.gscRows.length > 0
  const gscCsvPath = hasGscRows ? join(reportDir, `gsc-run${model.run.id}.csv`) : null

  try {
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(markdownPath, renderMarkdown(model), 'utf-8')
    writeFileSync(htmlPath, renderHtml(model), 'utf-8')
    if (gscCsvPath !== null) writeFileSync(gscCsvPath, renderGscCsv(model.analysis.gscRows), 'utf-8')
  } catch (cause) {
    throw new AppError('REPORT_WRITE_FAILED', `Rapor yazılamadı: ${reportDir}`, { cause })
  }

  return { markdownPath, htmlPath, gscCsvPath }
}
