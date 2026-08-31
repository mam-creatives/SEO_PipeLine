import { dedupeWidespreadFindings, sortFindings, type Finding } from '../core/findings.js'
import { escapeHtml } from './htmlEscape.js'
import { findingCardAttrs, impactEffortLabel, SEVERITY_LABEL } from './severityLabel.js'

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

  for (const [url, urlFindings] of groupByUrl(dedupeWidespreadFindings(findings))) {
    lines.push(`#### ${url}`, '')
    for (const finding of sortFindings(urlFindings)) {
      lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}** _(${impactEffortLabel(finding)})_`, '')
      lines.push(finding.explanation, '')
      lines.push(`_${finding.evidence}_`, '')
      if (finding.codeLocation != null) lines.push(`Kaynak: \`${finding.codeLocation.file}${finding.codeLocation.line === null ? '' : `:${finding.codeLocation.line}`}\``, '')
      if (finding.fixSnippet !== null) lines.push('```', finding.fixSnippet, '```', '')
    }
  }

  return lines.join('\n')
}

export const renderCrawlFindingsHtml = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const cards = [...groupByUrl(dedupeWidespreadFindings(findings))].map(([url, urlFindings]) => {
    const sorted = sortFindings(urlFindings)
    const cardFindings = sorted
      .map((finding) => {
        const priority = finding.severity === 'critical' ? 1 : finding.severity === 'high' ? 2 : 3
        const snippet =
          finding.fixSnippet === null ? '' : `<pre><code>${escapeHtml(finding.fixSnippet)}</code></pre>`
        const codeLocationLine =
          finding.codeLocation == null
            ? ''
            : `<p class="muted">Kaynak: <code>${escapeHtml(finding.codeLocation.file)}${finding.codeLocation.line === null ? '' : `:${finding.codeLocation.line}`}</code></p>`
        return (
          `<div class="action p${priority}" ${findingCardAttrs(finding)}>` +
          `<strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}</strong>` +
          ` <span class="muted">(${escapeHtml(impactEffortLabel(finding))})</span>` +
          `<p>${escapeHtml(finding.explanation)}</p><p class="muted">${escapeHtml(finding.evidence)}</p>${codeLocationLine}${snippet}</div>`
        )
      })
      .join('\n')
    // Faz C — yüzlerce URL kartı sayfayı boğuyordu; kritik/önemli bulgu taşıyanlar açık
    // başlar (dikkat çeker), geri kalanı katlı (tıklanınca açılır, native <details>, JS'siz de çalışır).
    const hasUrgentFinding = sorted.some((finding) => finding.severity === 'critical' || finding.severity === 'high')
    const openAttr = hasUrgentFinding ? ' open' : ''
    return `<details class="cwv-card"${openAttr}><summary><h3>${escapeHtml(url)}</h3></summary>${cardFindings}</details>`
  })

  return `<h2>Site Denetimi (Crawler)</h2>\n${cards.join('\n')}`
}
