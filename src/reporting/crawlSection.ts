import { sortFindings, type Finding } from '../core/findings.js'
import { escapeHtml } from './htmlEscape.js'
import { EFFORT_LABEL, SEVERITY_LABEL } from './severityLabel.js'

/** url → o sayfaya ait bulgular; site geneli bulgular (sitemap yok vb.) url: null taşır. */
const groupByUrl = (findings: readonly Finding[]): ReadonlyMap<string, readonly Finding[]> => {
  const groups = new Map<string, Finding[]>()
  for (const finding of findings) {
    const key = finding.url ?? '(site geneli)'
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [finding])
    else existing.push(finding)
  }
  return groups
}

/**
 * Crawler bölümü — on-page (title/meta/H1/canonical/schema.org/OG), iç link grafiği
 * (kırık link/öksüz sayfa) ve taranabilirlik (sitemap/robots) bulguları tek yerde.
 * `indexingSection.ts` ile aynı desen: URL bazında grupla, her grup içinde sortFindings.
 */
export const renderCrawlFindingsMarkdown = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const lines: string[] = ['### Site Denetimi (Crawler)', '']

  for (const [url, urlFindings] of groupByUrl(findings)) {
    lines.push(`#### ${url}`, '')
    for (const finding of sortFindings(urlFindings)) {
      lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}** _(${EFFORT_LABEL[finding.effort]})_`, '')
      lines.push(finding.explanation, '')
      lines.push(`_${finding.evidence}_`, '')
      if (finding.fixSnippet !== null) lines.push('```', finding.fixSnippet, '```', '')
    }
  }

  return lines.join('\n')
}

export const renderCrawlFindingsHtml = (findings: readonly Finding[]): string => {
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
          `<p>${escapeHtml(finding.explanation)}</p><p class="muted">${escapeHtml(finding.evidence)}</p>${snippet}</div>`
        )
      })
      .join('\n')
    return `<div class="cwv-card"><h3>${escapeHtml(url)}</h3>${cardFindings}</div>`
  })

  return `<h2>Site Denetimi (Crawler)</h2>\n${cards.join('\n')}`
}
