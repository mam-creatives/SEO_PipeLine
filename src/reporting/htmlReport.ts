import { COMPETITOR_REPORT_LIMIT } from '../config/constants.js'
import { renderCannibalizationFindingsHtml } from './cannibalizationSection.js'
import { renderCrawlFindingsHtml } from './crawlSection.js'
import { CWV_SECTION_STYLE, renderCwvDiagnosisHtml, renderFieldCwvComparisonHtml } from './cwvSection.js'
import { escapeHtml } from './htmlEscape.js'
import { renderIndexingFindingsHtml } from './indexingSection.js'
import type { ReportModel } from './reportModel.js'
import { renderSeoFindingsHtml } from './seoSection.js'

const percent = (rate: number): string => `%${Math.round(rate * 100)}`
const rankLabel = (rank: number | null): string => (rank === null ? '—' : `#${rank}`)
const serpFeaturesLabel = (features: { readonly hasAiOverview: boolean; readonly hasFeaturedSnippet: boolean }): string => {
  const badges: string[] = []
  if (features.hasAiOverview) badges.push('AI Overview')
  if (features.hasFeaturedSnippet) badges.push('Featured Snippet')
  return badges.length > 0 ? escapeHtml(badges.join(', ')) : '—'
}
const passBadge = (passes: boolean, label: string): string =>
  `<span class="badge ${passes ? 'ok' : 'fail'}">${escapeHtml(label)}</span>`

const table = (headers: readonly string[], rows: readonly (readonly string[])[]): string => {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('\n')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

const rateBar = (rate: number): string =>
  `<div class="bar"><div class="bar-fill" style="width:${Math.round(rate * 100)}%"></div></div> ${percent(rate)}`

const STYLE = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; color: #1a202c; line-height: 1.5; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid #2b6cb0; padding-bottom: .5rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; color: #2b6cb0; }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; margin: .75rem 0; }
  th, td { border: 1px solid #e2e8f0; padding: .4rem .6rem; text-align: left; }
  th { background: #f7fafc; }
  tr:nth-child(even) { background: #fafafa; }
  .banner { padding: .75rem 1rem; border-radius: 8px; margin: 1rem 0; }
  .banner.mock { background: #fffbea; border: 1px solid #f6ad55; }
  .banner.error { background: #fff5f5; border: 1px solid #fc8181; }
  .badge { display: inline-block; padding: .05rem .45rem; border-radius: 999px; font-size: .75rem; }
  .badge.ok { background: #c6f6d5; color: #22543d; }
  .badge.fail { background: #fed7d7; color: #742a2a; }
  .action { margin: .4rem 0; padding: .5rem .75rem; border-left: 4px solid #cbd5e0; background: #f7fafc; border-radius: 0 6px 6px 0; }
  .action.p1 { border-color: #e53e3e; }
  .action.p2 { border-color: #d69e2e; }
  .bar { display: inline-block; width: 90px; height: 8px; background: #edf2f7; border-radius: 4px; vertical-align: middle; margin-right: .4rem; }
  .bar-fill { height: 100%; background: #2b6cb0; border-radius: 4px; }
  .muted { color: #718096; font-size: .85rem; }
${CWV_SECTION_STYLE}
`

/** ReportModel → tek dosyalık, harici varlık gerektirmeyen HTML rapor. */
export const renderHtml = (model: ReportModel): string => {
  const sections: string[] = []

  if (model.mockCategories.length > 0) {
    sections.push(
      `<div class="banner mock"><strong>⚠ MOCK MODE</strong> — Şu kategoriler sentetik veriyle çalıştı: ${escapeHtml(model.mockCategories.join(', '))}. Gerçek veri için <code>.env</code> dosyasına API anahtarlarını ekleyin.</div>`,
    )
  }
  for (const failed of model.failedBranches) {
    sections.push(
      `<div class="banner error"><strong>❌ ${escapeHtml(failed.branch)} dalı başarısız</strong> — ${escapeHtml(failed.message)}</div>`,
    )
  }

  sections.push(`<h2>Yönetici Özeti</h2><p>${escapeHtml(model.synthesis.headline)}</p>`)
  sections.push(
    model.synthesis.actions
      .map(
        (action) =>
          `<div class="action p${action.priority}"><strong>[${escapeHtml(action.category)}]</strong> ${escapeHtml(action.text)}</div>`,
      )
      .join('\n'),
  )
  sections.push(`<p class="muted">Sentez: ${escapeHtml(model.synthesis.synthesizer)}</p>`)

  sections.push('<h2>Fırsatlar</h2>')
  sections.push(
    table(
      ['Skor', 'Keyword', 'Niyet', 'Hacim/ay', 'Zorluk', 'Sıra', 'SERP Özellikleri', 'Neden'],
      model.analysis.opportunities.map((opportunity) => [
        `<strong>${opportunity.score}</strong>`,
        escapeHtml(opportunity.keyword),
        opportunity.intent,
        opportunity.volume.toLocaleString('tr-TR'),
        percent(opportunity.difficulty),
        rankLabel(opportunity.clientRank),
        serpFeaturesLabel(opportunity.serpFeatures),
        escapeHtml(opportunity.reason),
      ]),
    ),
  )

  sections.push('<h2>Rakip Haritası</h2>')
  sections.push(
    table(
      ['Domain', 'Görünme Oranı', 'Sınıf', 'Gerçek Rakip?', 'Kaynak'],
      model.analysis.competitors
        .filter((competitor, index) => competitor.isRealCompetitor || index < COMPETITOR_REPORT_LIMIT)
        .slice(0, COMPETITOR_REPORT_LIMIT)
        .map((competitor) => [
        escapeHtml(competitor.domain),
        rateBar(competitor.appearanceRate),
        competitor.classification,
        competitor.isRealCompetitor ? '✅' : '—',
        competitor.source,
      ]),
    ),
  )

  sections.push('<h2>Küme Görünümü</h2>')
  sections.push(
    table(
      ['Küme', 'Niyet', 'Keyword', 'Toplam Hacim', 'Ort. Zorluk', 'En İyi Sıra', 'Temsilci'],
      model.analysis.clusters.map((cluster) => [
        escapeHtml(cluster.clusterId),
        cluster.intent,
        String(cluster.keywords.length),
        cluster.totalVolume.toLocaleString('tr-TR'),
        percent(cluster.avgDifficulty),
        rankLabel(cluster.bestClientRank),
        escapeHtml(cluster.representativeKeyword),
      ]),
    ),
  )

  sections.push('<h2>Teknik Sorunlar (Core Web Vitals)</h2>')
  sections.push(
    table(
      ['URL', 'LCP', 'INP', 'CLS', 'Skor', 'Site'],
      model.analysis.techEvaluations.map((evaluation) => [
        escapeHtml(evaluation.audit.url),
        passBadge(evaluation.passes.lcp, `${Math.round(evaluation.audit.lcpMs)}ms`),
        passBadge(evaluation.passes.inp, `${Math.round(evaluation.audit.inpMs)}ms`),
        passBadge(evaluation.passes.cls, String(evaluation.audit.cls)),
        String(evaluation.audit.performanceScore),
        evaluation.isClient ? '<strong>müşteri</strong>' : 'rakip',
      ]),
    ),
  )
  // Aynı sorun her sayfada tekrar raporlanıyor; tekrarlar ayıklanmazsa liste şişiyor.
  const clientIssues = [
    ...new Set(
      model.analysis.techEvaluations
        .filter((evaluation) => evaluation.isClient)
        .flatMap((evaluation) => evaluation.audit.issues),
    ),
  ]
  if (clientIssues.length > 0) {
    sections.push(`<ul>${clientIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>`)
  }

  const cwvDiagnosis = renderCwvDiagnosisHtml(model.analysis.techEvaluations)
  if (cwvDiagnosis !== '') sections.push(cwvDiagnosis)

  const fieldCwvComparison = renderFieldCwvComparisonHtml(model.analysis.fieldCwv, model.domain)
  if (fieldCwvComparison !== '') sections.push(fieldCwvComparison)

  const seoFindings = renderSeoFindingsHtml(model.analysis.techEvaluations)
  if (seoFindings !== '') sections.push(seoFindings)

  const indexingFindings = renderIndexingFindingsHtml(model.analysis.indexingFindings)
  if (indexingFindings !== '') sections.push(indexingFindings)

  const crawlFindings = renderCrawlFindingsHtml(model.analysis.crawlFindings)
  if (crawlFindings !== '') sections.push(crawlFindings)

  sections.push('<h2>AI Görünürlüğü (GEO)</h2>')
  if (model.analysis.aiVisibility.length === 0) {
    sections.push('<p class="muted">Bu çalıştırmada AI görünürlük verisi yok.</p>')
  } else {
    sections.push(
      table(
        ['Sorgu', 'Marka Oranı', 'En Güçlü Rakip', 'Boşluk?'],
        model.analysis.aiVisibility.map((visibility) => {
          const strongest = [...visibility.competitorRates].sort((a, b) => b.rate - a.rate)[0]
          return [
            escapeHtml(visibility.query),
            rateBar(visibility.clientRate),
            strongest === undefined || strongest.rate === 0
              ? '—'
              : `${escapeHtml(strongest.domain)} (${percent(strongest.rate)})`,
            visibility.isGap ? '⚠️' : '—',
          ]
        }),
      ),
    )
  }

  sections.push('<h2>Gerçek Arama Performansı (GSC)</h2>')
  if (model.analysis.gscRows.length === 0) {
    sections.push('<p class="muted">GSC verisi yok.</p>')
  } else {
    sections.push(
      table(
        ['Sorgu', 'Sayfa', 'Tıklama', 'Gösterim', 'CTR', 'Ort. Sıra'],
        model.analysis.gscRows.map((row) => [
          escapeHtml(row.query),
          row.page === '' ? '—' : escapeHtml(row.page),
          String(row.clicks),
          row.impressions.toLocaleString('tr-TR'),
          percent(row.ctr),
          String(row.avgPosition),
        ]),
      ),
    )
  }

  const cannibalizationFindings = renderCannibalizationFindingsHtml(model.analysis.cannibalizationFindings)
  if (cannibalizationFindings !== '') sections.push(cannibalizationFindings)

  sections.push('<h2>Son Çalıştırmadan Bu Yana Değişenler</h2>')
  if (model.diff.isBaseline) {
    sections.push('<p class="muted">İlk çalıştırma — karşılaştırma yok. Bir sonraki çalıştırmada bu bölüm dolacak.</p>')
  } else {
    if (model.diff.configMismatch) {
      sections.push('<div class="banner mock">⚠ Config iki çalıştırma arasında değişmiş — karşılaştırma yanıltıcı olabilir.</div>')
    }
    sections.push(
      model.diff.rankChanges.length === 0
        ? '<p class="muted">Sıra değişimi yok.</p>'
        : table(
            ['Keyword', 'Önceki', 'Şimdi', 'Değişim'],
            model.diff.rankChanges.map((change) => [
              escapeHtml(change.keyword),
              rankLabel(change.previousRank),
              rankLabel(change.currentRank),
              change.delta > 0 ? `▲ +${change.delta}` : `▼ ${change.delta}`,
            ]),
          ),
    )
    if (model.diff.aiRateDeltas.length > 0) {
      sections.push(
        `<ul>${model.diff.aiRateDeltas
          .map((delta) => `<li>"${escapeHtml(delta.query)}": ${percent(delta.previousRate)} → ${percent(delta.currentRate)}</li>`)
          .join('')}</ul>`,
      )
    }
  }

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SEO Raporu — ${escapeHtml(model.brandName)} #${model.run.id}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>SEO Araştırma Raporu — ${escapeHtml(model.brandName)} <span class="muted">(${escapeHtml(model.domain)})</span></h1>
<p class="muted">Çalıştırma #${model.run.id} · ${escapeHtml(model.run.startedAt)}${model.previousRunId === null ? '' : ` · Karşılaştırma: #${model.previousRunId}`}</p>
${sections.join('\n')}
<hr><p class="muted">Rapor ${escapeHtml(model.generatedAt)} tarihinde SEO Komuta Merkezi tarafından üretildi.</p>
</body>
</html>`
}
