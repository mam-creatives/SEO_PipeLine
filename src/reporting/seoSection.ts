import type { TechEvaluation } from '../analysis/runAnalysis.js'
import type { Finding } from '../core/findings.js'
import { escapeHtml } from './htmlEscape.js'

const SEVERITY_LABEL: Readonly<Record<Finding['severity'], string>> = {
  critical: '🔴 KRİTİK',
  high: '🟡 ÖNEMLİ',
  medium: '🔵 ORTA',
  low: '⚪ BİLGİ',
}

/** Yalnız SEO bulgusu olan denetimler — Lighthouse SEO kategorisi çalışmadıysa (PSI/mock) sessizce atlanır. */
const withSeoFindings = (evaluations: readonly TechEvaluation[]): readonly TechEvaluation[] =>
  evaluations.filter((evaluation) => (evaluation.audit.seoFindings?.length ?? 0) > 0)

/**
 * On-page SEO bölümü — Lighthouse'un zaten döndürdüğü `categories.seo` audit'lerinden
 * (document-title, meta-description, canonical, hreflang, ...) türetilen bulgular.
 * Ek istek/anahtar gerektirmez; performans denetimiyle aynı koşudan gelir.
 */
export const renderSeoFindingsMarkdown = (evaluations: readonly TechEvaluation[]): string => {
  const relevant = withSeoFindings(evaluations)
  if (relevant.length === 0) return ''

  const lines: string[] = ['### On-Page SEO Denetimi', '']

  for (const { audit } of relevant) {
    const score = audit.seoScore
    lines.push(`#### ${audit.url}${score === null || score === undefined ? '' : ` — SEO skoru ${score}/100`}`, '')

    for (const finding of audit.seoFindings ?? []) {
      lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}**`, '')
      lines.push(finding.explanation, '')
      if (finding.culpritSelector !== null) lines.push(`Suçlu element: \`${finding.culpritSelector}\``, '')
      if (finding.fixSnippet !== null) lines.push('```', finding.fixSnippet, '```', '')
    }
  }

  return lines.join('\n')
}

export const renderSeoFindingsHtml = (evaluations: readonly TechEvaluation[]): string => {
  const relevant = withSeoFindings(evaluations)
  if (relevant.length === 0) return ''

  const cards = relevant.map(({ audit }) => {
    const score = audit.seoScore
    const scoreNote = score === null || score === undefined ? '' : ` — SEO skoru ${score}/100`
    const findings = (audit.seoFindings ?? [])
      .map((finding) => {
        const priority = finding.severity === 'critical' ? 1 : finding.severity === 'high' ? 2 : 3
        const culprit =
          finding.culpritSelector === null
            ? ''
            : `<p class="muted">Suçlu element: <code>${escapeHtml(finding.culpritSelector)}</code></p>`
        const snippet =
          finding.fixSnippet === null ? '' : `<pre><code>${escapeHtml(finding.fixSnippet)}</code></pre>`
        return (
          `<div class="action p${priority}">` +
          `<strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}</strong>` +
          `<p>${escapeHtml(finding.explanation)}</p>${culprit}${snippet}</div>`
        )
      })
      .join('\n')

    return `<div class="cwv-card"><h3>${escapeHtml(audit.url)}${escapeHtml(scoreNote)}</h3>${findings}</div>`
  })

  return `<h2>On-Page SEO Denetimi</h2>\n${cards.join('\n')}`
}
