import { StorageError } from '../core/errors.js'
import type {
  AiVisibilitySample,
  BacklinkProfile,
  Competitor,
  GscRow,
  IndexStatus,
  KeywordSnapshotRow,
  SerpSnapshot,
  TechAudit,
} from '../core/types.js'
import type { Db } from './db.js'

/** Her insert grubu tek transaction'da koşar; UNIQUE ihlali StorageError olarak yüzeye çıkar. */
const inTransaction = (db: Db, label: string, work: () => void): void => {
  try {
    db.transaction(work)()
  } catch (cause) {
    throw new StorageError(`${label} kaydedilemedi`, { cause })
  }
}

export const insertKeywordSnapshots = (db: Db, runId: number, rows: readonly KeywordSnapshotRow[]): void => {
  const stmt = db.prepare(
    `INSERT INTO keyword_snapshots (runId, keyword, volume, difficulty, cpc, intent, clusterId, clientRank)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'Keyword snapshot', () => {
    for (const row of rows) {
      stmt.run(runId, row.keyword, row.volume, row.difficulty, row.cpc, row.intent, row.clusterId, row.clientRank)
    }
  })
}

export const insertSerpSnapshots = (db: Db, runId: number, serps: readonly SerpSnapshot[]): void => {
  const stmt = db.prepare(
    `INSERT INTO serp_results (runId, keyword, position, domain, url, hasFeaturedSnippet, hasAiOverview)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'SERP sonuçları', () => {
    for (const serp of serps) {
      for (const entry of serp.entries) {
        stmt.run(
          runId,
          serp.keyword,
          entry.position,
          entry.domain,
          entry.url,
          serp.hasFeaturedSnippet ? 1 : 0,
          serp.hasAiOverview ? 1 : 0,
        )
      }
    }
  })
}

export const insertBacklinks = (db: Db, runId: number, profiles: readonly BacklinkProfile[]): void => {
  const stmt = db.prepare(
    `INSERT INTO backlinks (runId, domain, refDomains, backlinkCount, domainAuthority) VALUES (?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'Backlink profilleri', () => {
    for (const profile of profiles) {
      stmt.run(runId, profile.domain, profile.refDomains, profile.backlinkCount, profile.domainAuthority)
    }
  })
}

export const insertTechAudits = (db: Db, runId: number, audits: readonly TechAudit[]): void => {
  const stmt = db.prepare(
    `INSERT INTO tech_audits (runId, url, lcpMs, inpMs, cls, performanceScore, issues, attribution, seoScore, seoFindings)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'Teknik denetimler', () => {
    for (const audit of audits) {
      stmt.run(
        runId,
        audit.url,
        audit.lcpMs,
        audit.inpMs,
        audit.cls,
        audit.performanceScore,
        JSON.stringify(audit.issues),
        JSON.stringify(audit.attribution ?? null),
        audit.seoScore ?? null,
        JSON.stringify(audit.seoFindings ?? []),
      )
    }
  })
}

export const insertAiSamples = (db: Db, runId: number, samples: readonly AiVisibilitySample[]): void => {
  const stmt = db.prepare(
    `INSERT INTO ai_visibility_samples (runId, query, model, sampleIndex, clientMentioned, competitorsMentioned, answerExcerpt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'AI görünürlük örnekleri', () => {
    for (const sample of samples) {
      stmt.run(
        runId,
        sample.query,
        sample.model,
        sample.sampleIndex,
        sample.clientMentioned ? 1 : 0,
        JSON.stringify(sample.competitorsMentioned),
        sample.answerExcerpt,
      )
    }
  })
}

export const insertGscRows = (db: Db, runId: number, rows: readonly GscRow[]): void => {
  const stmt = db.prepare(
    `INSERT INTO gsc_metrics (runId, query, page, clicks, impressions, ctr, avgPosition) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'GSC metrikleri', () => {
    for (const row of rows) {
      stmt.run(runId, row.query, row.page, row.clicks, row.impressions, row.ctr, row.avgPosition)
    }
  })
}

export const insertIndexStatuses = (db: Db, runId: number, statuses: readonly IndexStatus[]): void => {
  const stmt = db.prepare(
    `INSERT INTO index_status (runId, url, coverageState, robotsTxtState, indexingState, pageFetchState, googleCanonical, userCanonical, lastCrawlTime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'İndeksleme durumları', () => {
    for (const status of statuses) {
      stmt.run(
        runId,
        status.url,
        status.coverageState,
        status.robotsTxtState,
        status.indexingState,
        status.pageFetchState,
        status.googleCanonical,
        status.userCanonical,
        status.lastCrawlTime,
      )
    }
  })
}

export const insertCompetitors = (db: Db, runId: number, competitors: readonly Competitor[]): void => {
  const stmt = db.prepare(
    `INSERT INTO competitors (runId, domain, appearanceRate, classification, isRealCompetitor, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  inTransaction(db, 'Rakipler', () => {
    for (const competitor of competitors) {
      stmt.run(
        runId,
        competitor.domain,
        competitor.appearanceRate,
        competitor.classification,
        competitor.isRealCompetitor ? 1 : 0,
        competitor.source,
      )
    }
  })
}
