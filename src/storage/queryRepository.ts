import type { CwvAttribution } from '../core/cwv.js'
import { StorageError } from '../core/errors.js'
import type { Finding } from '../core/findings.js'
import type {
  AiVisibilitySample,
  BacklinkProfile,
  Competitor,
  CrawledPage,
  FieldCwv,
  GscRow,
  IndexStatus,
  KeywordGap,
  KeywordSnapshotRow,
  PageLink,
  RedirectHop,
  RunSnapshot,
  SchemaBlock,
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
    .prepare(`SELECT query, page, clicks, impressions, ctr, avgPosition FROM gsc_metrics WHERE runId = ?`)
    .all(runId) as GscRow[]

  const competitorRows = db
    .prepare(`SELECT domain, appearanceRate, classification, isRealCompetitor, source FROM competitors WHERE runId = ?`)
    .all(runId) as (Omit<Competitor, 'isRealCompetitor'> & { isRealCompetitor: number })[]

  const indexStatuses = db
    .prepare(
      `SELECT url, coverageState, robotsTxtState, indexingState, pageFetchState, googleCanonical, userCanonical, lastCrawlTime
       FROM index_status WHERE runId = ?`,
    )
    .all(runId) as IndexStatus[]

  const fieldCwv = db
    .prepare(`SELECT url, formFactor, lcpMs, inpMs, cls FROM field_cwv WHERE runId = ?`)
    .all(runId) as FieldCwv[]

  const keywordGaps = db
    .prepare(`SELECT keyword, competitorDomain, competitorPosition, volume FROM keyword_gaps WHERE runId = ?`)
    .all(runId) as KeywordGap[]

  const pageRows = db
    .prepare(
      `SELECT url, statusCode, finalUrl, fetchError, title, metaDescription, canonicalUrl, h1s, headingOrder,
        hasSchemaOrg, schemaTypes, ogComplete, imagesMissingAlt, wordCount, metaRobots, externalLinkCount,
        likelyClientRendered, depth, hreflangs, xRobotsTag, contentType, headerHreflangs, securityHeaders,
        redirectChain, redirectLoop, schemaFields, bodyText, viewportMeta, langAttribute,
        mixedContentCount, imagesMissingDimensions
       FROM pages WHERE runId = ?`,
    )
    .all(runId) as (Omit<
    CrawledPage,
    | 'h1s'
    | 'headingOrder'
    | 'schemaTypes'
    | 'hasSchemaOrg'
    | 'ogComplete'
    | 'internalLinks'
    | 'likelyClientRendered'
    | 'hreflangs'
    | 'headerHreflangs'
    | 'securityHeaders'
    | 'redirectChain'
    | 'redirectLoop'
    | 'schemaFields'
  > & {
    h1s: string
    headingOrder: string
    schemaTypes: string
    hasSchemaOrg: number
    ogComplete: number
    likelyClientRendered: number
    hreflangs: string
    headerHreflangs: string
    securityHeaders: string
    redirectChain: string
    redirectLoop: number
    schemaFields: string
  })[]

  const pageLinks = db
    .prepare(`SELECT sourceUrl, targetUrl, anchorText, isInternal FROM page_links WHERE runId = ?`)
    .all(runId) as (Omit<PageLink, 'isInternal'> & { isInternal: number })[]

  // Dış denetim bulgusu (2026-08-31, BLOKER 3) — bkz. migrations.ts v18 yorumu.
  const sitemapUrlRows = db.prepare(`SELECT url FROM sitemap_urls WHERE runId = ?`).all(runId) as { url: string }[]

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
    indexStatuses,
    fieldCwv,
    pages: pageRows.map((row) => ({
      ...row,
      h1s: JSON.parse(row.h1s) as string[],
      headingOrder: JSON.parse(row.headingOrder) as string[],
      schemaTypes: JSON.parse(row.schemaTypes) as string[],
      hasSchemaOrg: row.hasSchemaOrg === 1,
      ogComplete: row.ogComplete === 1,
      likelyClientRendered: row.likelyClientRendered === 1,
      hreflangs: JSON.parse(row.hreflangs) as string[],
      headerHreflangs: JSON.parse(row.headerHreflangs) as string[],
      securityHeaders: JSON.parse(row.securityHeaders) as string[],
      redirectChain: JSON.parse(row.redirectChain) as RedirectHop[],
      redirectLoop: row.redirectLoop === 1,
      schemaFields: JSON.parse(row.schemaFields) as SchemaBlock[],
      // Bilinçli: v8 migration yorumundaki tasarım kararı — tam link grafiği page_links'te,
      // round-trip'te sayfa içine geri gömülmüyor (mevcut run'ın bulgu tespiti DB'den değil
      // bellekteki CollectedData'dan çalışıyor, bu alan yalnız geçmiş/diff için var).
      internalLinks: [] as readonly PageLink[],
    })),
    pageLinks: pageLinks.map((row) => ({ ...row, isInternal: row.isInternal === 1 })),
    keywordGaps,
    sitemapUrls: sitemapUrlRows.map((row) => row.url),
  }
}
