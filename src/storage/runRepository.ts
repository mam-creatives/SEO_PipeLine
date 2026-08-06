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
