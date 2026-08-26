import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { StorageError } from '../core/errors.js'
import type { Finding } from '../core/findings.js'
import type { KeywordSnapshotRow, SerpSnapshot, TechAudit } from '../core/types.js'
import { openDatabase, type Db } from './db.js'
import { applyMigrations, MIGRATIONS } from './migrations.js'
import { getRunSnapshot } from './queryRepository.js'
import { createRun, finishRun, getLatestCompletedRun, getPreviousCompletedRun } from './runRepository.js'
import { insertAiSamples, insertKeywordSnapshots, insertSerpSnapshots, insertTechAudits } from './snapshotRepository.js'

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
    expect(snapshot.serps).toEqual([sampleSerp])
    expect(snapshot.aiSamples[0]?.clientMentioned).toBe(true)
    expect(snapshot.aiSamples[0]?.competitorsMentioned).toEqual(['flo.com.tr'])
  })
})
