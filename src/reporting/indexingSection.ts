import { sortFindings, type Finding } from '../core/findings.js'
import { escapeHtml } from './htmlEscape.js'
import { EFFORT_LABEL, SEVERITY_LABEL } from './severityLabel.js'

/** url → o sayfaya ait bulgular, ilk görülme sırası korunur (URL Inspection sırayla çağrılır). */
const groupByUrl = (findings: readonly Finding[]): ReadonlyMap<string, readonly Finding[]> => {
  const groups = new Map<string, Finding[]>()
  for (const finding of findings) {
    const key = finding.url ?? '(sayfa bağımsız)'
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [finding])
    else existing.push(finding)
  }
  return groups
}

/**
 * İndeksleme durumu bölümü — GSC URL Inspection'dan gelen bulgular (engellenmiş
 * indeksleme, Googlebot getirme hatası, canonical uyuşmazlığı). Yalnız müşteri
 * sayfaları için mevcut; servis hesabı eklenmemişse ya da sorun yoksa boş döner.
 */
export const renderIndexingFindingsMarkdown = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const lines: string[] = ['### İndeksleme Durumu (Search Console)', '']

  for (const [url, urlFindings] of groupByUrl(findings)) {
    lines.push(`#### ${url}`, '')
    for (const finding of sortFindings(urlFindings)) {
      lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}** _(${EFFORT_LABEL[finding.effort]})_`, '')
      lines.push(finding.explanation, '')
      if (finding.fixSnippet !== null) lines.push('```', finding.fixSnippet, '```', '')
    }
  }

  return lines.join('\n')
}

export const renderIndexingFindingsHtml = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const cards = [...groupByUrl(findings)].map(([url, urlFindings]) => {
    const cardFindings = sortFindings(urlFindings)
      .map((finding) => {
        const priority = finding.severity === 'critical' ? 1 : finding.severity === 'high' ? 2 : 3
        const snippet =
          finding.fixSnippet === null ? '' : `<pre><code>${escapeHtml(finding.fixSnippet)}</code></pre>`
        return (
          `<div class="action p${priority}">` +
          `<strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}</strong>` +
          ` <span class="muted">(${escapeHtml(EFFORT_LABEL[finding.effort])})</span>` +
          `<p>${escapeHtml(finding.explanation)}</p>${snippet}</div>`
        )
      })
      .join('\n')
    return `<div class="cwv-card"><h3>${escapeHtml(url)}</h3>${cardFindings}</div>`
  })

  return `<h2>İndeksleme Durumu (Search Console)</h2>\n${cards.join('\n')}`
}
