import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { StorageError } from '../core/errors.js'
import { applyMigrations } from './migrations.js'

export type Db = Database.Database

/** Veritabanını açar, WAL + foreign key ayarlarını yapar ve migration'ları uygular. */
export const openDatabase = (dbPath: string): Db => {
  try {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true })
    }
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    applyMigrations(db)
    return db
  } catch (cause) {
    if (cause instanceof StorageError) throw cause
    throw new StorageError(`Veritabanı açılamadı: ${dbPath}`, { cause })
  }
}

/**
 * Dış denetim bulgusu (2026-08-31) — `pruneOldRuns` eski run'ları CASCADE ile siler ama
 * SQLite silinen sayfaları hemen diske geri vermez (freelist'e eklenir, dosya küçülmez).
 * `researchPipeline.ts` budamadan SONRA çağırır — bir açık transaction/statement YOKKEN
 * çalışmalı, aksi halde SQLite `VACUUM` hata verir.
 */
export const vacuumDatabase = (db: Db): void => {
  try {
    db.exec('VACUUM')
  } catch (cause) {
    throw new StorageError('VACUUM başarısız oldu', { cause })
  }
}
