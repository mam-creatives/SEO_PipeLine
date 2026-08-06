import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../core/errors.js'
import { slugify } from '../core/text.js'
import { renderHtml } from './htmlReport.js'
import { renderMarkdown } from './markdownReport.js'
import type { ReportModel } from './reportModel.js'

export interface WrittenReports {
  readonly markdownPath: string
  readonly htmlPath: string
}

/** Raporları reports/<tarih>_<domain>/report-run<id>.{md,html} olarak yazar. */
export const writeReports = (model: ReportModel, baseDir: string): WrittenReports => {
  const dateLabel = model.run.startedAt.slice(0, 10)
  const reportDir = join(baseDir, `${dateLabel}_${slugify(model.domain)}`)
  const markdownPath = join(reportDir, `report-run${model.run.id}.md`)
  const htmlPath = join(reportDir, `report-run${model.run.id}.html`)

  try {
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(markdownPath, renderMarkdown(model), 'utf-8')
    writeFileSync(htmlPath, renderHtml(model), 'utf-8')
  } catch (cause) {
    throw new AppError('REPORT_WRITE_FAILED', `Rapor yazılamadı: ${reportDir}`, { cause })
  }

  return { markdownPath, htmlPath }
}
