import { containsTr, normalizeTr } from '../core/text.js'
import type { CrawledPage, GscRow, KeywordPageMatch, KeywordSnapshotRow, SerpSnapshot } from '../core/types.js'

/** Bir keyword için, sayfa bilgisi olan (page !== '') GSC satırları arasında en çok gösterim alan sayfa — Google'ın kendi davranışı, en güvenilir kanıt. */
const gscMatchFor = (rows: readonly GscRow[], keyword: string): string | null => {
  const candidates = rows.filter((row) => normalizeTr(row.query) === normalizeTr(keyword) && row.page !== '')
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => b.impressions - a.impressions)[0]?.page ?? null
}

/** GSC'de veri yoksa: SERP'te müşterinin top-10 girdisinin URL'i. */
const serpMatchFor = (serps: readonly SerpSnapshot[], keyword: string, domain: string): string | null => {
  const snapshot = serps.find((s) => normalizeTr(s.keyword) === normalizeTr(keyword))
  return snapshot?.entries.find((entry) => entry.domain === domain)?.url ?? null
}

/** Eşleşen URL'i taranmış sayfalar arasında bulur — url ya da finalUrl'iyle (yönlendirme sonrası). */
const crawledPageFor = (pages: readonly CrawledPage[], url: string): CrawledPage | undefined =>
  pages.find((page) => page.url === url || page.finalUrl === url)

/**
 * Faz 5.4 — hedef keyword ile onu hedeflediği düşünülen sayfayı eşler; on-page sinyal soruları
 * (`inTitle`/`inH1`/`inBody`) böylece cevaplanabilir hale gelir. Eşleşen sayfa taranmadıysa
 * (crawl kapsamı dışında kaldıysa) `matchSource`/`url` yine dolu ama on-page alanları `false` —
 * "doğrulanamadı" demek, "eksik" demek DEĞİL; ama bulgu üretmek için yeterli değil (bkz.
 * detectKeywordContentIssues.ts'in bu ayrımı nasıl ele aldığı).
 */
export const matchKeywordsToPages = (
  rows: readonly KeywordSnapshotRow[],
  pages: readonly CrawledPage[],
  gscRows: readonly GscRow[],
  serps: readonly SerpSnapshot[],
  domain: string,
): readonly KeywordPageMatch[] =>
  rows.map((row): KeywordPageMatch => {
    const gscUrl = gscMatchFor(gscRows, row.keyword)
    const serpUrl = gscUrl === null ? serpMatchFor(serps, row.keyword, domain) : null
    const url = gscUrl ?? serpUrl
    const matchSource: KeywordPageMatch['matchSource'] = gscUrl !== null ? 'gsc' : serpUrl !== null ? 'serp' : 'none'

    if (url === null) {
      return { keyword: row.keyword, volume: row.volume, url: null, inTitle: false, inH1: false, inBody: false, matchSource }
    }

    const page = crawledPageFor(pages, url)
    if (page === undefined) {
      // Eşleşen sayfa crawl kapsamı dışında — on-page sinyali doğrulanamaz, false ile "kanıtsız" işaretlenir.
      return { keyword: row.keyword, volume: row.volume, url, inTitle: false, inH1: false, inBody: false, matchSource }
    }

    return {
      keyword: row.keyword,
      volume: row.volume,
      url,
      inTitle: page.title !== null && containsTr(page.title, row.keyword),
      inH1: page.h1s.some((h1) => containsTr(h1, row.keyword)),
      inBody: containsTr(page.bodyText, row.keyword),
      matchSource,
    }
  })
