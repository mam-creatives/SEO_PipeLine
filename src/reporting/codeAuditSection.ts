import { sortFindings, type Finding } from '../core/findings.js'
import { escapeHtml } from './htmlEscape.js'
import { findingCardAttrs, impactEffortLabel, SEVERITY_LABEL } from './severityLabel.js'

/**
 * `crawlSection.ts`/`indexingSection.ts`'ten farklı olarak `url` DEĞİL `codeLocation.file` ile
 * gruplanır — Faz 3 kod denetim bulgularının tamamı `url: null` taşır (kaynak dosyaya bağlı,
 * canlı bir sayfaya değil); `url`'e göre gruplamak her şeyi tek "(site geneli)" kartına
 * yığardı, dosya bazlı gruplamak "hangi dosyayı düzelteceğim" sorusuna doğrudan cevap verir.
 */
const groupByFile = (findings: readonly Finding[]): ReadonlyMap<string, readonly Finding[]> => {
  const groups = new Map<string, Finding[]>()
  for (const finding of findings) {
    const key = finding.codeLocation?.file ?? '(dosya belirsiz)'
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [finding])
    else existing.push(finding)
  }
  return groups
}

const locationLabel = (finding: Finding): string => (finding.codeLocation?.line === null || finding.codeLocation?.line === undefined ? '' : `:${finding.codeLocation.line}`)

/**
 * Kod denetimi bölümü — agnostik + PHP/Next.js kural setlerinin (Faz 3.2-3.4) ürettiği
 * bulgular. `indexingSection.ts` ile aynı desen: gruplandır, her grup içinde sortFindings.
 */
export const renderCodeAuditFindingsMarkdown = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const lines: string[] = ['### Kod Denetimi', '']

  for (const [file, fileFindings] of groupByFile(findings)) {
    lines.push(`#### ${file}`, '')
    for (const finding of sortFindings(fileFindings)) {
      const location = locationLabel(finding)
      lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}${location}** _(${impactEffortLabel(finding)})_`, '')
      lines.push(finding.explanation, '')
      lines.push(`_${finding.evidence}_`, '')
      if (finding.fixSnippet !== null) lines.push('```', finding.fixSnippet, '```', '')
    }
  }

  return lines.join('\n')
}

export const renderCodeAuditFindingsHtml = (findings: readonly Finding[]): string => {
  if (findings.length === 0) return ''

  const cards = [...groupByFile(findings)].map(([file, fileFindings]) => {
    const cardFindings = sortFindings(fileFindings)
      .map((finding) => {
        const priority = finding.severity === 'critical' ? 1 : finding.severity === 'high' ? 2 : 3
        const location = locationLabel(finding)
        const snippet = finding.fixSnippet === null ? '' : `<pre><code>${escapeHtml(finding.fixSnippet)}</code></pre>`
        return (
          `<div class="action p${priority}" ${findingCardAttrs(finding)}>` +
          `<strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}${escapeHtml(location)}</strong>` +
          ` <span class="muted">(${escapeHtml(impactEffortLabel(finding))})</span>` +
          `<p>${escapeHtml(finding.explanation)}</p><p class="muted">${escapeHtml(finding.evidence)}</p>${snippet}</div>`
        )
      })
      .join('\n')
    return `<div class="cwv-card"><h3>${escapeHtml(file)}</h3>${cardFindings}</div>`
  })

  return `<h2>Kod Denetimi</h2>\n${cards.join('\n')}`
}
