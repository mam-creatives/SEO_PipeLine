import type { CwvAttribution } from '../core/cwv.js'
import { StorageError } from '../core/errors.js'
import type { Finding } from '../core/findings.js'
import type {
  AiVisibilitySample,
  BacklinkProfile,
  Competitor,
  GscRow,
  KeywordSnapshotRow,
  RunSnapshot,
  SerpSnapshot,
  TechAudit,
} from '../core/types.js'
import type { Db } from './db.js'
import { getRunById } from './runRepository.js'

interface SerpResultRow {
  readonly keyword: string
  readonly position: number
  readonly domain: string
  readonly url: string
  readonly hasFeaturedSnippet: number
  readonly hasAiOverview: number
}

/** Düz serp_results satırlarını keyword bazında SerpSnapshot'lara geri toplar. */
const groupSerpRows = (rows: readonly SerpResultRow[]): readonly SerpSnapshot[] => {
  const byKeyword = new Map<string, SerpResultRow[]>()
  for (const row of rows) {
    const existing = byKeyword.get(row.keyword) ?? []
    byKeyword.set(row.keyword, [...existing, row])
  }
  return [...byKeyword.entries()].map(([keyword, keywordRows]) => ({
    keyword,
    entries: keywordRows
      .map((row) => ({ position: row.position, domain: row.domain, url: row.url }))
      .sort((a, b) => a.position - b.position),
    hasFeaturedSnippet: keywordRows.some((row) => row.hasFeaturedSnippet === 1),
    hasAiOverview: keywordRows.some((row) => row.hasAiOverview === 1),
  }))
}

/**
 * attribution sütununu çözer. Migration #2 öncesi satırlar '{}' taşır ve `source`
 * alanı olmadığı için null'a düşer — bozuk JSON da aynı şekilde sessizce null olur,
 * çünkü eksik teşhis verisi denetimin tamamını çöpe atmayı gerektirmez.
 */
const parseAttribution = (raw: string): CwvAttribution | null => {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || !('source' in parsed)) return null
    return parsed as CwvAttribution
  } catch {
    return null
  }
}

/** Bozuk/eksik JSON'da boş dizi döner — SEO bulgusu okunamaması denetimin tamamını geçersiz kılmaz. */
const parseSeoFindings = (raw: string): readonly Finding[] => {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as readonly Finding[]) : []
  } catch {
    return []
  }
}

/** Bir run'ın tüm verisini tek RunSnapshot olarak okur — diff motorunun girdisi. */
export const getRunSnapshot = (db: Db, runId: number): RunSnapshot => {
  const run = getRunById(db, runId)
  if (run === null) {
    throw new StorageError(`Run #${runId} bulunamadı`)
  }

  const keywords = db
    .prepare(`SELECT keyword, volume, difficulty, cpc, intent, clusterId, clientRank FROM keyword_snapshots WHERE runId = ?`)
    .all(runId) as KeywordSnapshotRow[]

  const serpRows = db
    .prepare(`SELECT keyword, position, domain, url, hasFeaturedSnippet, hasAiOverview FROM serp_results WHERE runId = ?`)
    .all(runId) as SerpResultRow[]

  const backlinks = db
    .prepare(`SELECT domain, refDomains, backlinkCount, domainAuthority FROM backlinks WHERE runId = ?`)
    .all(runId) as BacklinkProfile[]

  const techAuditRows = db
    .prepare(
      `SELECT url, lcpMs, inpMs, cls, performanceScore, issues, attribution, seoScore, seoFindings FROM tech_audits WHERE runId = ?`,
    )
    .all(runId) as (Omit<TechAudit, 'issues' | 'attribution' | 'seoFindings'> & {
    issues: string
    attribution: string
    seoScore: number | null
    seoFindings: string
  })[]

  const aiSampleRows = db
    .prepare(
      `SELECT query, model, sampleIndex, clientMentioned, competitorsMentioned, answerExcerpt
       FROM ai_visibility_samples WHERE runId = ?`,
    )
    .all(runId) as (Omit<AiVisibilitySample, 'clientMentioned' | 'competitorsMentioned'> & {
    clientMentioned: number
    competitorsMentioned: string
  })[]

  const gscRows = db
    .prepare(`SELECT query, clicks, impressions, ctr, avgPosition FROM gsc_metrics WHERE runId = ?`)
    .all(runId) as GscRow[]

  const competitorRows = db
    .prepare(`SELECT domain, appearanceRate, classification, isRealCompetitor, source FROM competitors WHERE runId = ?`)
    .all(runId) as (Omit<Competitor, 'isRealCompetitor'> & { isRealCompetitor: number })[]

  return {
    run,
    keywords,
    serps: groupSerpRows(serpRows),
    backlinks,
    techAudits: techAuditRows.map((row) => ({
      ...row,
      issues: JSON.parse(row.issues) as string[],
      attribution: parseAttribution(row.attribution),
      seoFindings: parseSeoFindings(row.seoFindings),
    })),
    aiSamples: aiSampleRows.map((row) => ({
      ...row,
      clientMentioned: row.clientMentioned === 1,
      competitorsMentioned: JSON.parse(row.competitorsMentioned) as string[],
    })),
    gscRows,
    competitors: competitorRows.map((row) => ({ ...row, isRealCompetitor: row.isRealCompetitor === 1 })),
  }
}
