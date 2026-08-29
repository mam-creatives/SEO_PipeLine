import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { openDatabase } from '../storage/db.js'
import { createRun, finishRun } from '../storage/runRepository.js'
import type { ClientTarget } from './discoverClients.js'
import { formatStatusTable, readClientStatus, type ClientStatusRow } from './statusPipeline.js'

let root: string

const target = (overrides: Partial<ClientTarget> = {}): ClientTarget => ({
  configPath: 'config/a.json',
  domain: 'a.com',
  slug: 'a-com',
  dbPath: join(root, 'a-com.db'),
  logPath: 'logs/2026-08-29_a-com.log',
  ...overrides,
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'seo-statuspipeline-test-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('readClientStatus', () => {
  test('DB dosyası yoksa "hiç çalıştırılmamış" döner, hata fırlatmaz ve dosya yaratmaz', () => {
    const row = readClientStatus(target({ dbPath: join(root, 'yok.db') }))
    expect(row).toEqual({ domain: 'a.com', lastRunAt: null, lastStatus: 'hiç çalıştırılmamış', mockCategories: [], lastReportPath: null })
  })

  test('DB var ama hiç run yoksa "hiç çalıştırılmamış" döner', () => {
    const dbPath = join(root, 'empty.db')
    openDatabase(dbPath).close()
    const row = readClientStatus(target({ dbPath }))
    expect(row.lastStatus).toBe('hiç çalıştırılmamış')
  })

  test('son run başarısızsa durumu failed olarak yansıtır, rapor yolu yoktur', () => {
    const dbPath = join(root, 'failed.db')
    const db = openDatabase(dbPath)
    const run = createRun(db, 'h', ['keyword'])
    finishRun(db, run.id, 'failed')
    db.close()

    const row = readClientStatus(target({ dbPath }))
    expect(row.lastStatus).toBe('failed')
    expect(row.mockCategories).toEqual(['keyword'])
    expect(row.lastReportPath).toBeNull()
  })

  test('son run tamamlandıysa rapor yolunu writeReports formülüyle türetir', () => {
    const dbPath = join(root, 'completed.db')
    const db = openDatabase(dbPath)
    const run = createRun(db, 'h', [])
    finishRun(db, run.id, 'completed')
    db.close()

    const row = readClientStatus(target({ dbPath, slug: 'a-com' }))
    const expectedDate = run.startedAt.slice(0, 10)
    expect(row.lastStatus).toBe('completed')
    expect(row.lastReportPath).toBe(`reports/${expectedDate}_a-com/report-run${run.id}.md`)
  })

  test('en son run failed ama önceki completed ise, rapor yolu ÖNCEKİ completed run\'a ait olur', () => {
    const dbPath = join(root, 'mixed.db')
    const db = openDatabase(dbPath)
    const first = createRun(db, 'h', [])
    finishRun(db, first.id, 'completed')
    const second = createRun(db, 'h', [])
    finishRun(db, second.id, 'failed')
    db.close()

    const row = readClientStatus(target({ dbPath, slug: 'a-com' }))
    expect(row.lastStatus).toBe('failed')
    expect(row.lastReportPath).toBe(`reports/${first.startedAt.slice(0, 10)}_a-com/report-run${first.id}.md`)
  })
})

describe('formatStatusTable', () => {
  test('boş listede uygun mesaj döner', () => {
    expect(formatStatusTable([])).toBe("Hiç müşteri config'i bulunamadı.")
  })

  test('her satırı domain · zaman · durum · mock · rapor sırasıyla tek satıra basar', () => {
    const rows: ClientStatusRow[] = [
      { domain: 'a.com', lastRunAt: '2026-08-29T10:00:00.000Z', lastStatus: 'completed', mockCategories: ['crawl'], lastReportPath: 'reports/x/report-run1.md' },
    ]
    expect(formatStatusTable(rows)).toBe('a.com · 2026-08-29T10:00:00.000Z · completed · mock: crawl · reports/x/report-run1.md')
  })

  test('hiç çalıştırılmamış müşteride "—" ve "rapor yok"/"mock yok" gösterir', () => {
    const rows: ClientStatusRow[] = [
      { domain: 'a.com', lastRunAt: null, lastStatus: 'hiç çalıştırılmamış', mockCategories: [], lastReportPath: null },
    ]
    expect(formatStatusTable(rows)).toBe('a.com · — · hiç çalıştırılmamış · mock yok · rapor yok')
  })
})
