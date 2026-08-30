import type { KeywordGap } from '../core/types.js'
import { escapeHtml } from './htmlEscape.js'

/** Hacme göre büyükten küçüğe — en değerli fırsat en üstte. Hacim bilinmeyenler (null) sona düşer. */
const sortByVolumeDesc = (gaps: readonly KeywordGap[]): readonly KeywordGap[] =>
  [...gaps].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))

const volumeLabel = (volume: number | null): string => (volume === null ? '—' : volume.toLocaleString('tr-TR'))

/**
 * "Keyword Fırsatları" bölümü — Faz 4.4, DataForSEO Labs domain_intersection'dan gelen
 * "rakipte var, sende yok" keyword listesi. `Finding`-tabanlı değil (severity/effort yok,
 * bkz. `KeywordGap` yorumu) — `crawlSection.ts`/`codeAuditSection.ts`'in aksine düz bir
 * tablo, `AI Görünürlüğü` bölümünün (markdownReport.ts/htmlReport.ts) deseniyle aynı.
 */
export const renderKeywordGapsMarkdown = (gaps: readonly KeywordGap[]): string => {
  if (gaps.length === 0) return ''

  const lines: string[] = [
    '### Keyword Fırsatları — Rakipte Var, Sende Yok',
    '',
    '| Keyword | Hacim | Rakip | Pozisyon |',
    '|---|---:|---|---:|',
  ]
  for (const gap of sortByVolumeDesc(gaps)) {
    lines.push(`| ${gap.keyword} | ${volumeLabel(gap.volume)} | ${gap.competitorDomain} | ${gap.competitorPosition} |`)
  }
  return lines.join('\n')
}

export const renderKeywordGapsHtml = (gaps: readonly KeywordGap[]): string => {
  if (gaps.length === 0) return ''

  const rows = sortByVolumeDesc(gaps)
    .map(
      (gap) =>
        `<tr><td>${escapeHtml(gap.keyword)}</td><td>${volumeLabel(gap.volume)}</td>` +
        `<td>${escapeHtml(gap.competitorDomain)}</td><td>${gap.competitorPosition}</td></tr>`,
    )
    .join('\n')

  return (
    '<h2>Keyword Fırsatları — Rakipte Var, Sende Yok</h2>' +
    `<table><thead><tr><th>Keyword</th><th>Hacim</th><th>Rakip</th><th>Pozisyon</th></tr></thead><tbody>${rows}</tbody></table>`
  )
}
