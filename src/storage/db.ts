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
