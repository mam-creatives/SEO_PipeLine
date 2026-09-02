import { sortFindings } from '../core/findings.js'
import { escapeHtml } from '../reporting/htmlEscape.js'
import { SEVERITY_LABEL } from '../reporting/severityLabel.js'
import type { LiteAnalysisResult } from './liteAnalysis.js'

/** Bu KISA raporda gösterilecek azami sorun sayısı — mevcut CLI'nin çok bölümlü raporunun küçültülmüş hali DEĞİL. */
const TOP_ISSUES_LIMIT = 5
const TOP_COMPETITORS_LIMIT = 5

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #1a202c; --border: #e2e8f0; --accent: #2b6cb0; --muted: #718096;
    --card-bg: #f7fafc; --p1: #e53e3e; --p2: #d69e2e; --ok-bg: #c6f6d5; --ok-fg: #22543d;
    --fail-bg: #fed7d7; --fail-fg: #742a2a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181d; --fg: #e2e8f0; --border: #2d3748; --accent: #63b3ed; --muted: #a0aec0;
      --card-bg: #1e2229; --ok-bg: #22543d; --ok-fg: #c6f6d5; --fail-bg: #742a2a; --fail-fg: #fed7d7;
    }
  }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; background: var(--bg); color: var(--fg); line-height: 1.5; }
  h1 { font-size: 1.35rem; border-bottom: 2px solid var(--accent); padding-bottom: .5rem; }
  h2 { font-size: 1.05rem; margin-top: 1.75rem; color: var(--accent); }
  .card { border: 1px solid var(--border); border-radius: 8px; padding: .75rem 1rem; margin: .6rem 0; background: var(--card-bg); }
  .muted { color: var(--muted); font-size: .85rem; }
  .badge { display: inline-block; padding: .05rem .5rem; border-radius: 999px; font-size: .8rem; }
  .badge.ok { background: var(--ok-bg); color: var(--ok-fg); }
  .badge.fail { background: var(--fail-bg); color: var(--fail-fg); }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; margin: .5rem 0; }
  th, td { border: 1px solid var(--border); padding: .4rem .6rem; text-align: left; }
  th { background: var(--card-bg); }
`

const cwvRow = (label: string, value: string): string => `<tr><td>${label}</td><td>${value}</td></tr>`

/**
 * Versiyon A (kamuya açık web aracı) için KISA, tek sayfalık HTML rapor. `htmlReport.ts`'i
 * BİLEREK yeniden KULLANMAZ — o çok-müşterili/çok-bölümlü iç rapor için tasarlı, bu aracın
 * kapsamı bilinçli olarak dar (bkz. plan: "çok detaylı vermesine gerek yok").
 */
export const renderLiteReportHtml = (result: LiteAnalysisResult): string => {
  const topIssues = sortFindings([...result.onPageFindings, ...(result.cwvDiagnosis?.findings ?? [])]).slice(0, TOP_ISSUES_LIMIT)

  const issuesHtml =
    topIssues.length === 0
      ? '<p class="muted">Belirgin bir sorun bulunamadı.</p>'
      : topIssues
          .map(
            (finding) =>
              `<div class="card"><strong>${escapeHtml(SEVERITY_LABEL[finding.severity])} — ${escapeHtml(finding.title)}</strong>` +
              `<p class="muted">${escapeHtml(finding.explanation)}</p></div>`,
          )
          .join('\n')

  const cwvHtml =
    result.techAudit === null
      ? '<p class="muted">Core Web Vitals denemesi atlandı ya da başarısız oldu.</p>'
      : `<table>${[
          cwvRow('LCP', `${Math.round(result.techAudit.lcpMs)}ms`),
          cwvRow('INP', `${Math.round(result.techAudit.inpMs)}ms`),
          cwvRow('CLS', result.techAudit.cls.toFixed(3)),
          cwvRow('Performans skoru', `${result.techAudit.performanceScore}/100`),
        ].join('')}</table>`

  const geoHtml =
    result.geoResults.length === 0
      ? '<p class="muted">AI görünürlük denemesi atlandı ya da başarısız oldu.</p>'
      : `<table><thead><tr><th>Soru</th><th>Marka geçiyor mu?</th></tr></thead><tbody>${result.geoResults
          .map(
            (geo) =>
              `<tr><td>${escapeHtml(geo.query)}</td><td><span class="badge ${geo.mentioned ? 'ok' : 'fail'}">${
                geo.mentioned ? 'Evet' : 'Hayır'
              }</span></td></tr>`,
          )
          .join('')}</tbody></table>`

  const competitorsHtml =
    result.competitors === null
      ? ''
      : `<h2>Gerçek Rakip Anlık Görüntüsü</h2>${
          result.competitors.filter((c) => c.isRealCompetitor).length === 0
            ? '<p class="muted">Bu aramada gerçek rakip tespit edilemedi.</p>'
            : `<table><thead><tr><th>Domain</th><th>Görünme Oranı</th></tr></thead><tbody>${result.competitors
                .filter((c) => c.isRealCompetitor)
                .slice(0, TOP_COMPETITORS_LIMIT)
                .map((c) => `<tr><td>${escapeHtml(c.domain)}</td><td>%${Math.round(c.appearanceRate * 100)}</td></tr>`)
                .join('')}</tbody></table>`
        }`

  const warningsHtml =
    result.warnings.length === 0
      ? ''
      : `<p class="muted">${result.warnings.map((warning) => escapeHtml(warning)).join(' · ')}</p>`

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Hızlı Kontrol — ${escapeHtml(result.domain)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>SEO Hızlı Kontrol — ${escapeHtml(result.brandName)} <span class="muted">(${escapeHtml(result.domain)})</span></h1>
<h2>Öne Çıkan Sorunlar</h2>
${issuesHtml}
<h2>Core Web Vitals</h2>
${cwvHtml}
<h2>AI Görünürlüğü</h2>
${geoHtml}
${competitorsHtml}
${warningsHtml}
<hr><p class="muted">Bu, hafif/hızlı bir ön kontrol — GSC ve tam site taraması içermez.</p>
</body>
</html>`
}
