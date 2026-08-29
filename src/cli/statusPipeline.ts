import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { getLatestCompletedRun, getLatestRun } from '../storage/runRepository.js'
import type { ClientTarget } from './discoverClients.js'

const NEVER_RUN = 'hiç çalıştırılmamış'

export interface ClientStatusRow {
  readonly domain: string
  readonly lastRunAt: string | null
  readonly lastStatus: string
  readonly mockCategories: readonly string[]
  readonly lastReportPath: string | null
}

/**
 * `target.dbPath`'i salt-okunur açar. DB dosyası yoksa "hiç çalıştırılmamış" demektir —
 * bu bir hata değil (bkz. plan X.3), `openDatabase`'in aksine dosyayı YARATMAZ.
 *
 * `lastReportPath` en son TAMAMLANMIŞ run'a aittir (en son run değil — o `failed` olabilir,
 * ve başarısız run rapor üretmeden biter, bkz. researchPipeline.ts). Yol, writeReports.ts'in
 * ürettiği yolla BİREBİR aynı formülle türetilir: `reports/<startedAt'in ilk 10 karakteri
 * (tarih)>_<slug>/report-run<id>.md`.
 */
export const readClientStatus = (target: ClientTarget): ClientStatusRow => {
  if (!existsSync(target.dbPath)) {
    return { domain: target.domain, lastRunAt: null, lastStatus: NEVER_RUN, mockCategories: [], lastReportPath: null }
  }

  const db = new Database(target.dbPath, { readonly: true, fileMustExist: true })
  try {
    const latest = getLatestRun(db)
    if (latest === null) {
      return { domain: target.domain, lastRunAt: null, lastStatus: NEVER_RUN, mockCategories: [], lastReportPath: null }
    }

    const latestCompleted = getLatestCompletedRun(db)
    const lastReportPath =
      latestCompleted === null
        ? null
        : join('reports', `${latestCompleted.startedAt.slice(0, 10)}_${target.slug}`, `report-run${latestCompleted.id}.md`)

    return {
      domain: target.domain,
      lastRunAt: latest.startedAt,
      lastStatus: latest.status,
      mockCategories: latest.mockCategories,
      lastReportPath,
    }
  } finally {
    db.close()
  }
}

/** Konsol tablosu — saf, test edilir. Her satır tek satırlık `·` ayraçlı özet. */
export const formatStatusTable = (rows: readonly ClientStatusRow[]): string => {
  if (rows.length === 0) return "Hiç müşteri config'i bulunamadı."
  return rows
    .map((row) => {
      const mock = row.mockCategories.length > 0 ? `mock: ${row.mockCategories.join(', ')}` : 'mock yok'
      const report = row.lastReportPath ?? 'rapor yok'
      const runAt = row.lastRunAt ?? '—'
      return `${row.domain} · ${runAt} · ${row.lastStatus} · ${mock} · ${report}`
    })
    .join('\n')
}
