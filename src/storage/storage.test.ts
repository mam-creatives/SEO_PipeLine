import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { StorageError } from '../core/errors.js'
import type { Finding } from '../core/findings.js'
import type { CrawledPage, FieldCwv, GscRow, IndexStatus, KeywordSnapshotRow, PageLink, SerpSnapshot, TechAudit } from '../core/types.js'
import { openDatabase, type Db } from './db.js'
import { applyMigrations, MIGRATIONS } from './migrations.js'
import { getRunSnapshot } from './queryRepository.js'
import { createRun, finishRun, getLatestCompletedRun, getPreviousCompletedRun } from './runRepository.js'
import {
  insertAiSamples,
  insertFieldCwv,
  insertGscRows,
  insertIndexStatuses,
  insertKeywordSnapshots,
  insertPageLinks,
  insertPages,
  insertSerpSnapshots,
  insertTechAudits,
} from './snapshotRepository.js'

const sampleKeyword: KeywordSnapshotRow = {
  keyword: 'spor ayakkabı',
  volume: 40000,
  difficulty: 0.7,
  cpc: 4.2,
  intent: 'commercial',
  clusterId: 'ayakkabi-commercial',
  clientRank: 12,
}

const sampleSerp: SerpSnapshot = {
  keyword: 'spor ayakkabı',
  entries: [
    { position: 1, domain: 'flo.com.tr', url: 'https://flo.com.tr/spor' },
    { position: 2, domain: 'trendyol.com', url: 'https://trendyol.com/spor' },
  ],
  hasFeaturedSnippet: false,
  hasAiOverview: true,
}

const sampleSeoFinding: Finding = {
  category: 'onpage',
  severity: 'medium',
  url: 'https://ornek-ayakkabi.com/',
  culpritSelector: null,
  title: 'Sayfada meta description eksik',
  explanation: 'test',
  evidence: 'Description text is empty.',
  impact: 25,
  effort: 'trivial',
  fixSnippet: null,
}

const sampleTechAudit: TechAudit = {
  url: 'https://ornek-ayakkabi.com/',
  lcpMs: 2400,
  inpMs: 180,
  cls: 0.05,
  performanceScore: 82,
  issues: [],
  attribution: null,
  seoScore: 85,
  seoFindings: [sampleSeoFinding],
}

const sampleIndexStatus: IndexStatus = {
  url: 'https://ornek-ayakkabi.com/',
  coverageState: 'Submitted and indexed',
  robotsTxtState: 'ALLOWED',
  indexingState: 'INDEXING_ALLOWED',
  pageFetchState: 'SUCCESSFUL',
  googleCanonical: 'https://ornek-ayakkabi.com/',
  userCanonical: 'https://ornek-ayakkabi.com/',
  lastCrawlTime: '2026-08-01T00:00:00Z',
}

const sampleGscRow: GscRow = {
  query: 'spor ayakkabı',
  page: 'https://ornek-ayakkabi.com/spor',
  clicks: 25,
  impressions: 800,
  ctr: 0.0313,
  avgPosition: 4.2,
}

const sampleFieldCwv: FieldCwv = {
  url: 'https://ornek-ayakkabi.com/',
  formFactor: 'ALL_FORM_FACTORS',
  lcpMs: 2300,
  inpMs: 190,
  cls: 0.04,
}

const sampleCrawledPage: CrawledPage = {
  url: 'https://ornek-ayakkabi.com/',
  statusCode: 200,
  finalUrl: 'https://ornek-ayakkabi.com/',
  fetchError: null,
  title: 'Örnek Ayakkabı',
  metaDescription: 'Açıklama',
  canonicalUrl: 'https://ornek-ayakkabi.com/',
  h1s: ['Örnek Ayakkabı'],
  headingOrder: ['h1', 'h2'],
  hasSchemaOrg: true,
  schemaTypes: ['LocalBusiness'],
  ogComplete: true,
  imagesMissingAlt: 2,
  wordCount: 450,
  metaRobots: null,
  // internalLinks round-trip'te hep [] döner (bkz. migrations.ts v8 yorumu) — round-trip
  // eşitliğinin anlamlı olması için burada da [] veriliyor.
  internalLinks: [],
  externalLinkCount: 3,
}

const samplePageLink: PageLink = {
  sourceUrl: 'https://ornek-ayakkabi.com/',
  targetUrl: 'https://ornek-ayakkabi.com/spor',
  anchorText: 'Spor Ayakkabı',
  isInternal: true,
}

describe('storage', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  test('migration idempotent — ikinci kez uygulamak hata vermez', () => {
    expect(() => applyMigrations(db)).not.toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length)
  })

  test('run yaşam döngüsü: create → finish → latest completed', () => {
    const run = createRun(db, 'hash123', ['keyword'])
    expect(run.status).toBe('running')
    expect(getLatestCompletedRun(db)).toBeNull()

    finishRun(db, run.id, 'completed')
    const latest = getLatestCompletedRun(db)
    expect(latest?.id).toBe(run.id)
    expect(latest?.mockCategories).toEqual(['keyword'])
  })

  test('kapalı run tekrar kapatılamaz', () => {
    const run = createRun(db, 'hash123', [])
    finishRun(db, run.id, 'completed')
    expect(() => finishRun(db, run.id, 'failed')).toThrow(StorageError)
  })

  test('getPreviousCompletedRun doğru run\'ı bulur', () => {
    const first = createRun(db, 'h', [])
    finishRun(db, first.id, 'completed')
    const second = createRun(db, 'h', [])
    finishRun(db, second.id, 'completed')

    expect(getPreviousCompletedRun(db, second.id)?.id).toBe(first.id)
    expect(getPreviousCompletedRun(db, first.id)).toBeNull()
  })

  test('aynı run içinde aynı keyword iki kez eklenemez (UNIQUE)', () => {
    const run = createRun(db, 'h', [])
    insertKeywordSnapshots(db, run.id, [sampleKeyword])
    expect(() => insertKeywordSnapshots(db, run.id, [sampleKeyword])).toThrow(StorageError)
  })

  test('yazılan snapshot aynen geri okunur (round-trip)', () => {
    const run = createRun(db, 'h', [])
    insertKeywordSnapshots(db, run.id, [sampleKeyword])
    insertSerpSnapshots(db, run.id, [sampleSerp])
    insertTechAudits(db, run.id, [sampleTechAudit])
    insertIndexStatuses(db, run.id, [sampleIndexStatus])
    insertGscRows(db, run.id, [sampleGscRow])
    insertFieldCwv(db, run.id, [sampleFieldCwv])
    insertPages(db, run.id, [sampleCrawledPage])
    insertPageLinks(db, run.id, [samplePageLink])
    insertAiSamples(db, run.id, [
      {
        query: 'en iyi ayakkabı mağazası',
        model: 'mock',
        sampleIndex: 0,
        clientMentioned: true,
        competitorsMentioned: ['flo.com.tr'],
        answerExcerpt: 'Örnek Ayakkabı ve FLO öne çıkıyor',
      },
    ])
    finishRun(db, run.id, 'completed')

    const snapshot = getRunSnapshot(db, run.id)
    expect(snapshot.keywords).toEqual([sampleKeyword])
    expect(snapshot.techAudits).toEqual([sampleTechAudit])
    expect(snapshot.indexStatuses).toEqual([sampleIndexStatus])
    expect(snapshot.serps).toEqual([sampleSerp])
    expect(snapshot.gscRows).toEqual([sampleGscRow])
    expect(snapshot.fieldCwv).toEqual([sampleFieldCwv])
    expect(snapshot.pages).toEqual([sampleCrawledPage])
    expect(snapshot.pageLinks).toEqual([samplePageLink])
    expect(snapshot.aiSamples[0]?.clientMentioned).toBe(true)
    expect(snapshot.aiSamples[0]?.competitorsMentioned).toEqual(['flo.com.tr'])
  })

  test('v5 veritabanı en son sürüme sorunsuz yükselir — eski gsc_metrics satırı page="" ile korunur', () => {
    // openDatabase yerine ham Database: v5'e kadar manuel uygulamak için, `beforeEach`'in
    // zaten tam göç ettirdiği paylaşılan `db`'yi (openDatabase → applyMigrations) kullanamayız.
    const legacyDb = new Database(':memory:')
    try {
      for (const [index, migration] of MIGRATIONS.slice(0, 5).entries()) {
        legacyDb.transaction(() => {
          legacyDb.exec(migration)
          legacyDb.pragma(`user_version = ${index + 1}`)
        })()
      }
      const run = createRun(legacyDb, 'h', [])
      legacyDb
        .prepare(`INSERT INTO gsc_metrics (runId, query, clicks, impressions, ctr, avgPosition) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(run.id, 'eski sorgu', 10, 100, 0.1, 5.0)

      applyMigrations(legacyDb)

      expect(legacyDb.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length)
      const rows = legacyDb.prepare(`SELECT query, page FROM gsc_metrics WHERE runId = ?`).all(run.id) as {
        query: string
        page: string
      }[]
      expect(rows).toEqual([{ query: 'eski sorgu', page: '' }])
    } finally {
      legacyDb.close()
    }
  })

  test('v7 veritabanı v8\'e sorunsuz yükselir — pages/page_links tabloları eklenir', () => {
    const legacyDb = new Database(':memory:')
    try {
      for (const [index, migration] of MIGRATIONS.slice(0, 7).entries()) {
        legacyDb.transaction(() => {
          legacyDb.exec(migration)
          legacyDb.pragma(`user_version = ${index + 1}`)
        })()
      }
      expect(legacyDb.pragma('user_version', { simple: true })).toBe(7)

      applyMigrations(legacyDb)

      expect(legacyDb.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length)
      const tables = legacyDb
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pages', 'page_links')`)
        .all() as { name: string }[]
      expect(new Set(tables.map((t) => t.name))).toEqual(new Set(['pages', 'page_links']))
    } finally {
      legacyDb.close()
    }
  })
})
