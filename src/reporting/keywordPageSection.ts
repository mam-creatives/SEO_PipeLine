import type { KeywordPageMatch } from '../core/types.js'
import { escapeHtml } from './htmlEscape.js'

/** Hacme göre büyükten küçüğe — en önemli keyword en üstte. */
const sortByVolumeDesc = (matches: readonly KeywordPageMatch[]): readonly KeywordPageMatch[] =>
  [...matches].sort((a, b) => b.volume - a.volume)

const check = (present: boolean): string => (present ? '✅' : '❌')
const sourceLabel = (source: KeywordPageMatch['matchSource']): string =>
  source === 'gsc' ? 'GSC' : source === 'serp' ? 'SERP' : '—'

/**
 * "Keyword ↔ Sayfa Eşlemesi" bölümü — Faz 5.4, hedef keyword'ün hangi sayfayla eşleştiğini ve
 * title/H1/body'de geçip geçmediğini gösterir. `Finding`-tabanlı değil (severity/effort yok) —
 * `keywordGapSection.ts`'in birebir kardeşi, düz tablo.
 */
export const renderKeywordPageMatchesMarkdown = (matches: readonly KeywordPageMatch[]): string => {
  if (matches.length === 0) return ''

  const lines: string[] = [
    '### Keyword ↔ Sayfa Eşlemesi',
    '',
    '| Keyword | Hacim | Eşleşen Sayfa | Title | H1 | Body | Kaynak |',
    '|---|---:|---|:---:|:---:|:---:|---|',
  ]
  for (const match of sortByVolumeDesc(matches)) {
    lines.push(
      `| ${match.keyword} | ${match.volume.toLocaleString('tr-TR')} | ${match.url ?? '—'} | ` +
        `${check(match.inTitle)} | ${check(match.inH1)} | ${check(match.inBody)} | ${sourceLabel(match.matchSource)} |`,
    )
  }
  return lines.join('\n')
}

export const renderKeywordPageMatchesHtml = (matches: readonly KeywordPageMatch[]): string => {
  if (matches.length === 0) return ''

  const rows = sortByVolumeDesc(matches)
    .map(
      (match) =>
        `<tr><td>${escapeHtml(match.keyword)}</td><td>${match.volume.toLocaleString('tr-TR')}</td>` +
        `<td>${match.url === null ? '—' : escapeHtml(match.url)}</td>` +
        `<td>${check(match.inTitle)}</td><td>${check(match.inH1)}</td><td>${check(match.inBody)}</td>` +
        `<td>${escapeHtml(sourceLabel(match.matchSource))}</td></tr>`,
    )
    .join('\n')

  return (
    '<h2>Keyword ↔ Sayfa Eşlemesi</h2>' +
    '<table><thead><tr><th>Keyword</th><th>Hacim</th><th>Eşleşen Sayfa</th><th>Title</th><th>H1</th><th>Body</th><th>Kaynak</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  )
}
