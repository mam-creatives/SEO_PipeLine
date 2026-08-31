import { StorageError } from '../core/errors.js'
import type { RunMeta } from '../core/types.js'
import type { Db } from './db.js'

interface RunRow {
  readonly id: number
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly status: string
  readonly configHash: string
  readonly mockCategories: string
}

const rowToRunMeta = (row: RunRow): RunMeta => ({
  id: row.id,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  status: row.status as RunMeta['status'],
  configHash: row.configHash,
  mockCategories: JSON.parse(row.mockCategories) as string[],
})

export const createRun = (db: Db, configHash: string, mockCategories: readonly string[]): RunMeta => {
  const startedAt = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO runs (startedAt, finishedAt, status, configHash, mockCategories)
       VALUES (?, NULL, 'running', ?, ?)`,
    )
    .run(startedAt, configHash, JSON.stringify(mockCategories))
  return {
    id: Number(result.lastInsertRowid),
    startedAt,
    finishedAt: null,
    status: 'running',
    configHash,
    mockCategories,
  }
}

export const finishRun = (db: Db, runId: number, status: 'completed' | 'failed'): void => {
  const result = db
    .prepare(`UPDATE runs SET finishedAt = ?, status = ? WHERE id = ? AND status = 'running'`)
    .run(new Date().toISOString(), status, runId)
  if (result.changes !== 1) {
    throw new StorageError(`Run #${runId} kapatılamadı — bulunamadı ya da zaten kapalı`)
  }
}

/**
 * Son run — durumu ne olursa olsun (running/completed/failed). "Son koşu başarısız
 * mıydı?" sorusunun cevabı tam olarak `failed` satırında; `getLatestCompletedRun`
 * bunu asla göremez çünkü status'e göre filtreler. İkisi yan yana durur (Faz X.3 — status).
 */
export const getLatestRun = (db: Db): RunMeta | null => {
  const row = db.prepare(`SELECT * FROM runs ORDER BY id DESC LIMIT 1`).get() as RunRow | undefined
  return row === undefined ? null : rowToRunMeta(row)
}

export const getLatestCompletedRun = (db: Db): RunMeta | null => {
  const row = db
    .prepare(`SELECT * FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1`)
    .get() as RunRow | undefined
  return row === undefined ? null : rowToRunMeta(row)
}

/** Diff için: verilen run'dan ÖNCE tamamlanmış en yeni run. */
export const getPreviousCompletedRun = (db: Db, beforeRunId: number): RunMeta | null => {
  const row = db
    .prepare(`SELECT * FROM runs WHERE status = 'completed' AND id < ? ORDER BY id DESC LIMIT 1`)
    .get(beforeRunId) as RunRow | undefined
  return row === undefined ? null : rowToRunMeta(row)
}

export const getRunById = (db: Db, runId: number): RunMeta | null => {
  const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined
  return row === undefined ? null : rowToRunMeta(row)
}

/**
 * Dış denetim bulgusu (2026-08-31) — `src/` genelinde retention, pruning, DELETE, VACUUM
 * hiç yoktu. `pages.bodyText` sayfa başına 20 KB'a kadar × 300 sayfa = koşu başına ~6 MB;
 * günlük systemd timer ile müşteri başına yılda ~2 GB'a kadar büyür.
 *
 * Yalnız en yeni `keepCount` run tutulur, gerisi silinir. Her fact tablosu `runId`'yi
 * `ON DELETE CASCADE` ile referans ettiği için (bkz. migrations.ts) ve `db.ts` her zaman
 * `PRAGMA foreign_keys = ON` ayarladığı için `runs` satırını silmek tüm bağlı satırları
 * (keyword_snapshots, pages, page_links, sitemap_urls, ...) da temizler — ayrı ayrı
 * DELETE yazmaya gerek yok.
 *
 * `status`'e BAKMAKSIZIN sıralar — durumu ne olursa olsun en eski run'lar budanır; bir
 * `failed` run'ın sonsuza dek saklanması için özel bir gerekçe yok.
 */
export const pruneOldRuns = (db: Db, keepCount: number): number => {
  const result = db
    .prepare(`DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT ?)`)
    .run(keepCount)
  return result.changes
}
