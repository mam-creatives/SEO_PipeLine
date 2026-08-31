import { sortFindings, type Finding } from '../core/findings.js'
import { escapeHtml } from './htmlEscape.js'
import { findingCardAttrs, impactEffortLabel, SEVERITY_LABEL } from './severityLabel.js'

/**
 * Yamyamlık (cannibalization) bölümü — GSC'nin `page` boyutundan gelen bulgular:
 * aynı sorguda birden fazla sayfa gösterime giriyorsa Google iki sayfa arasında
 * kararsız kalır ve ikisi de birbirinin sıralama gücünü böler.
 */
export const renderCannibalizationFindingsMarkdown = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const lines: string[] = ['### Sayfa Yamyamlığı (Cannibalization)', '']

  for (const finding of sortFindings(findings)) {
    lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}** _(${impactEffortLabel(finding)})_`, '')
    lines.push(finding.explanation, '')
    lines.push(`Kanıt: ${finding.evidence}`, '')
    if (finding.fixSnippet !== null) lines.push('```', finding.fixSnippet, '```', '')
  }

  return lines.join('\n')
}

export const renderCannibalizationFindingsHtml = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const cards = sortFindings(findings)
    .map((finding) => {
      const priority = finding.severity === 'critical' ? 1 : finding.severity === 'high' ? 2 : 3
      const snippet =
        finding.fixSnippet === null ? '' : `<pre><code>${escapeHtml(finding.fixSnippet)}</code></pre>`
      return (
        `<div class="action p${priority}" ${findingCardAttrs(finding)}>` +
        `<strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}</strong>` +
        ` <span class="muted">(${escapeHtml(impactEffortLabel(finding))})</span>` +
        `<p>${escapeHtml(finding.explanation)}</p>` +
        `<p class="muted">Kanıt: ${escapeHtml(finding.evidence)}</p>${snippet}</div>`
      )
    })
    .join('\n')

  return `<h2>Sayfa Yamyamlığı (Cannibalization)</h2>\n${cards}`
}
