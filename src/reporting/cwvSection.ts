import type { TechEvaluation } from '../analysis/runAnalysis.js'
import { lcpPhaseShares, type LcpAttribution } from '../core/cwv.js'
import { extractRootDomain } from '../core/text.js'
import type { FieldCwv } from '../core/types.js'
import { escapeHtml } from './htmlEscape.js'
import { mockBadgeLabel, SEVERITY_LABEL } from './severityLabel.js'

const PHASE_LABEL: Readonly<Record<string, string>> = {
  timeToFirstByte: 'Sunucu yanıtı',
  resourceLoadDelay: 'Kaynak keşfi',
  resourceLoadDuration: 'Kaynak indirme',
  elementRenderDelay: 'Element boyama',
}

const PHASE_COLOR: Readonly<Record<string, string>> = {
  timeToFirstByte: '#805ad5',
  resourceLoadDelay: '#dd6b20',
  resourceLoadDuration: '#3182ce',
  elementRenderDelay: '#e53e3e',
}

interface PhaseSegment {
  readonly name: string
  readonly label: string
  readonly ms: number
  readonly share: number
}

const phaseSegments = (lcp: LcpAttribution): readonly PhaseSegment[] => {
  const shares = lcpPhaseShares(lcp)
  const durations: Readonly<Record<string, number>> = {
    timeToFirstByte: lcp.timeToFirstByte,
    resourceLoadDelay: lcp.resourceLoadDelay,
    resourceLoadDuration: lcp.resourceLoadDuration,
    elementRenderDelay: lcp.elementRenderDelay,
  }
  return Object.keys(durations).map((name) => ({
    name,
    label: PHASE_LABEL[name] ?? name,
    ms: durations[name] ?? 0,
    share: shares[name as keyof typeof shares] ?? 0,
  }))
}

const percent = (share: number): string => `%${Math.round(share * 100)}`

const withDiagnosis = (evaluations: readonly TechEvaluation[]): readonly TechEvaluation[] =>
  evaluations.filter((evaluation) => evaluation.diagnosis !== null && evaluation.diagnosis.findings.length > 0)

/**
 * "Neden yavaş" bölümü — pipeline'ın teknik dalını sayı listesinden teşhise çeviren yer.
 * Her URL için LCP faz kırılımı, suçlu element seçicisi ve kopyalanabilir düzeltmeler.
 */
export const renderCwvDiagnosisMarkdown = (evaluations: readonly TechEvaluation[]): string => {
  const relevant = withDiagnosis(evaluations)
  if (relevant.length === 0) return ''

  const lines: string[] = ['### Core Web Vitals Teşhisi', '']

  for (const { audit, diagnosis } of relevant) {
    if (diagnosis === null) continue
    const sourceNote = diagnosis.source === 'lab' ? 'lab ölçümü' : 'gerçek kullanıcı verisi'
    lines.push(`#### ${audit.url}`, '')
    lines.push(
      `LCP ${Math.round(audit.lcpMs)}ms (${diagnosis.ratings.LCP ?? '?'}) · ` +
        `CLS ${audit.cls.toFixed(3)} (${diagnosis.ratings.CLS ?? '?'}) · ` +
        `INP ${diagnosis.ratings.INP ?? 'ölçülmedi — lab INP ölçemez'} · _${sourceNote}_`,
      '',
    )

    const lcp = audit.attribution?.lcp
    if (lcp !== undefined && lcp !== null) {
      lines.push('| LCP fazı | Süre | Pay |', '|----------|-----:|----:|')
      for (const segment of phaseSegments(lcp)) {
        lines.push(`| ${segment.label} | ${Math.round(segment.ms)}ms | ${percent(segment.share)} |`)
      }
      if (lcp.target !== null) lines.push('', `Suçlu element: \`${lcp.target}\``)
      // Metin LCP testi kaynak fazlarına bakar; URL'nin bilinmemesi yetmez
      // (CSS arka plan görselinde de URL çıkarılamaz ama kaynak indirilir).
      if (lcp.resourceLoadDuration === 0 && lcp.resourceLoadDelay === 0) {
        lines.push('', 'LCP bir **metin** — kaynak web fontudur.')
      } else if (lcp.url === null) {
        lines.push('', 'LCP kaynağı bir görsel ama URL çıkarılamadı — büyük ihtimalle CSS `background-image`.')
      }
      lines.push('')
    }

    for (const finding of diagnosis.findings) {
      lines.push(`**${SEVERITY_LABEL[finding.severity]} — ${finding.title}${mockBadgeLabel(finding)}**`, '')
      lines.push(finding.explanation, '')
      if (finding.fixSnippet !== null) {
        lines.push('```', finding.fixSnippet, '```', '')
      }
    }
  }

  return lines.join('\n')
}

export const renderCwvDiagnosisHtml = (evaluations: readonly TechEvaluation[]): string => {
  const relevant = withDiagnosis(evaluations)
  if (relevant.length === 0) return ''

  const cards = relevant.map(({ audit, diagnosis }) => {
    if (diagnosis === null) return ''
    const lcp = audit.attribution?.lcp

    const bar =
      lcp === undefined || lcp === null
        ? ''
        : `<div class="cwv-bar">${phaseSegments(lcp)
            .filter((segment) => segment.share > 0)
            .map(
              (segment) =>
                `<span style="width:${(segment.share * 100).toFixed(1)}%;background:${PHASE_COLOR[segment.name] ?? '#a0aec0'}" title="${escapeHtml(segment.label)}: ${Math.round(segment.ms)}ms"></span>`,
            )
            .join('')}</div>` +
          `<p class="muted">${phaseSegments(lcp)
            .map((segment) => `${escapeHtml(segment.label)} ${Math.round(segment.ms)}ms (${percent(segment.share)})`)
            .join(' · ')}</p>` +
          (lcp.target === null ? '' : `<p class="muted">Suçlu element: <code>${escapeHtml(lcp.target)}</code></p>`)

    const findings = diagnosis.findings
      .map((finding) => {
        const priority = finding.severity === 'critical' ? 1 : finding.severity === 'high' ? 2 : 3
        const snippet =
          finding.fixSnippet === null ? '' : `<pre><code>${escapeHtml(finding.fixSnippet)}</code></pre>`
        return (
          `<div class="action p${priority}">` +
          `<strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}${escapeHtml(mockBadgeLabel(finding))}</strong>` +
          `<p>${escapeHtml(finding.explanation)}</p>${snippet}</div>`
        )
      })
      .join('\n')

    return (
      `<div class="cwv-card"><h3>${escapeHtml(audit.url)}</h3>` +
      `<p>LCP ${Math.round(audit.lcpMs)}ms (${diagnosis.ratings.LCP ?? '?'}) · CLS ${audit.cls.toFixed(3)} (${diagnosis.ratings.CLS ?? '?'}) · ` +
      `INP ${diagnosis.ratings.INP ?? 'ölçülmedi (lab)'}</p>${bar}${findings}</div>`
    )
  })

  return `<h2>Core Web Vitals Teşhisi</h2>\n${cards.join('\n')}`
}

const fieldMsLabel = (ms: number | null): string => (ms === null ? '—' : `${Math.round(ms)}ms`)
const fieldClsLabel = (cls: number | null): string => (cls === null ? '—' : cls.toFixed(3))

/** Müşteri satırları önce — karşılaştırma tablosunda göz kendini bulur. */
const sortClientFirst = (rows: readonly FieldCwv[], clientDomain: string): readonly FieldCwv[] =>
  [...rows].sort((a, b) => {
    const aClient = extractRootDomain(a.url) === clientDomain
    const bClient = extractRootDomain(b.url) === clientDomain
    return aClient === bClient ? 0 : aClient ? -1 : 1
  })

/**
 * CrUX (gerçek kullanıcı) alan verisiyle müşteri-rakip karşılaştırması. Lab verisinden
 * (yukarıdaki teşhis) farkı: burada "ölçülen" değil "gerçek kullanıcıların yaşadığı" p75
 * var — rakip verisi yalnız burada mevcut, Lighthouse/PSI rakip sitede koşamaz.
 */
export const renderFieldCwvComparisonMarkdown = (rows: readonly FieldCwv[], clientDomain: string): string => {
  if (rows.length === 0) return ''

  const lines: string[] = ['### Gerçek Kullanıcı Verisi (CrUX) — Müşteri vs Rakip', '']
  lines.push('| Site | LCP p75 | INP p75 | CLS p75 |')
  lines.push('|------|--------:|--------:|--------:|')
  for (const row of sortClientFirst(rows, clientDomain)) {
    const isClient = extractRootDomain(row.url) === clientDomain
    const label = isClient ? `**${row.url}** (müşteri)` : row.url
    lines.push(`| ${label} | ${fieldMsLabel(row.lcpMs)} | ${fieldMsLabel(row.inpMs)} | ${fieldClsLabel(row.cls)} |`)
  }
  return lines.join('\n')
}

export const renderFieldCwvComparisonHtml = (rows: readonly FieldCwv[], clientDomain: string): string => {
  if (rows.length === 0) return ''

  const body = sortClientFirst(rows, clientDomain)
    .map((row) => {
      const isClient = extractRootDomain(row.url) === clientDomain
      const label = isClient
        ? `<strong>${escapeHtml(row.url)}</strong> <span class="muted">(müşteri)</span>`
        : escapeHtml(row.url)
      return `<tr><td>${label}</td><td>${fieldMsLabel(row.lcpMs)}</td><td>${fieldMsLabel(row.inpMs)}</td><td>${fieldClsLabel(row.cls)}</td></tr>`
    })
    .join('\n')

  return (
    `<h2>Gerçek Kullanıcı Verisi (CrUX) — Müşteri vs Rakip</h2>` +
    `<table><thead><tr><th>Site</th><th>LCP p75</th><th>INP p75</th><th>CLS p75</th></tr></thead>` +
    `<tbody>${body}</tbody></table>`
  )
}

/** htmlReport'un stil bloğuna eklenen teşhis kartı stilleri. */
export const CWV_SECTION_STYLE = `
  .cwv-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: .75rem 1rem; margin: 1rem 0; }
  .cwv-card h3 { font-size: .95rem; margin: 0 0 .25rem; word-break: break-all; }
  .cwv-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin: .5rem 0; }
  .cwv-bar span { display: block; height: 100%; }
  .cwv-card pre { background: #1a202c; color: #e2e8f0; padding: .6rem .8rem; border-radius: 6px;
    overflow-x: auto; font-size: .78rem; line-height: 1.45; }
  .action.p3 { border-color: #4299e1; }
`
