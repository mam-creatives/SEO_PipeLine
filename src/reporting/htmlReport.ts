import { COMPETITOR_REPORT_LIMIT, DIFF_FINDINGS_REPORT_LIMIT, GSC_ROWS_REPORT_LIMIT } from '../config/constants.js'
import { capFindingsForDisplay } from '../core/findings.js'
import { slugAnchor } from './anchor.js'
import { renderCannibalizationFindingsHtml } from './cannibalizationSection.js'
import { renderCodeAuditFindingsHtml } from './codeAuditSection.js'
import { renderCrawlFindingsHtml } from './crawlSection.js'
import { CWV_SECTION_STYLE, renderCwvDiagnosisHtml, renderFieldCwvComparisonHtml } from './cwvSection.js'
import { escapeHtml } from './htmlEscape.js'
import { renderIndexingFindingsHtml } from './indexingSection.js'
import { renderKeywordGapsHtml } from './keywordGapSection.js'
import { renderKeywordPageMatchesHtml } from './keywordPageSection.js'
import type { ReportModel } from './reportModel.js'
import { renderSeoFindingsHtml } from './seoSection.js'
import { CATEGORY_LABEL, SEVERITY_LABEL } from './severityLabel.js'

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

const TOC_SECTIONS: readonly string[] = [
  'Yönetici Özeti',
  'Fırsatlar',
  'Rakip Haritası',
  'Küme Görünümü',
  'Teknik Sorunlar (Core Web Vitals)',
  'AI Görünürlüğü (GEO)',
  'Gerçek Arama Performansı (GSC)',
  'Son Çalıştırmadan Bu Yana Değişenler',
]

const sectionHeading = (title: string): string => `<h2 id="${slugAnchor(title)}">${escapeHtml(title)}</h2>`

/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — önceden `:root { color-scheme: light; }` ile sabit
 * hex renkler yazılıydı, koyu temada rapor okuyanlar (çoğu e-posta/tarayıcı istemcisi artık
 * varsayılan koyu) göz yakan beyaz bir sayfa görüyordu. Renkler CSS custom property'ye alındı;
 * `@media (prefers-color-scheme: dark)` yalnız DEĞERLERİ ezer, seçici/yerleşim aynı kalır.
 * `CWV_SECTION_STYLE` (cwvSection.ts) de aynı değişkenleri kullanır — tek palet, iki dosya.
 */
const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #1a202c;
    --border: #e2e8f0;
    --accent: #2b6cb0;
    --muted: #718096;
    --card-bg: #f7fafc;
    --row-alt: #fafafa;
    --banner-mock-bg: #fffbea;
    --banner-mock-border: #f6ad55;
    --banner-error-bg: #fff5f5;
    --banner-error-border: #fc8181;
    --badge-ok-bg: #c6f6d5;
    --badge-ok-fg: #22543d;
    --badge-fail-bg: #fed7d7;
    --badge-fail-fg: #742a2a;
    --action-border: #cbd5e0;
    --p1: #e53e3e;
    --p2: #d69e2e;
    --p3: #4299e1;
    --bar-bg: #edf2f7;
    --code-bg: #1a202c;
    --code-fg: #e2e8f0;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181d;
      --fg: #e2e8f0;
      --border: #2d3748;
      --accent: #63b3ed;
      --muted: #a0aec0;
      --card-bg: #1e2229;
      --row-alt: #1a1d23;
      --banner-mock-bg: #332701;
      --banner-mock-border: #b7791f;
      --banner-error-bg: #3a1414;
      --banner-error-border: #c53030;
      --badge-ok-bg: #22543d;
      --badge-ok-fg: #c6f6d5;
      --badge-fail-bg: #742a2a;
      --badge-fail-fg: #fed7d7;
      --action-border: #4a5568;
      --bar-bg: #2d3748;
      --code-bg: #0d0f12;
      --code-fg: #e2e8f0;
    }
  }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; background: var(--bg); color: var(--fg); line-height: 1.5; }
  h1 { font-size: 1.5rem; border-bottom: 2px solid var(--accent); padding-bottom: .5rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; color: var(--accent); }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; margin: .75rem 0; }
  th, td { border: 1px solid var(--border); padding: .4rem .6rem; text-align: left; }
  th { background: var(--card-bg); }
  tr:nth-child(even) { background: var(--row-alt); }
  .banner { padding: .75rem 1rem; border-radius: 8px; margin: 1rem 0; }
  .banner.mock { background: var(--banner-mock-bg); border: 1px solid var(--banner-mock-border); }
  .banner.error { background: var(--banner-error-bg); border: 1px solid var(--banner-error-border); }
  .badge { display: inline-block; padding: .05rem .45rem; border-radius: 999px; font-size: .75rem; }
  .badge.ok { background: var(--badge-ok-bg); color: var(--badge-ok-fg); }
  .badge.fail { background: var(--badge-fail-bg); color: var(--badge-fail-fg); }
  .action { margin: .4rem 0; padding: .5rem .75rem; border-left: 4px solid var(--action-border); background: var(--card-bg); border-radius: 0 6px 6px 0; }
  .action.p1 { border-color: var(--p1); }
  .action.p2 { border-color: var(--p2); }
  .bar { display: inline-block; width: 90px; height: 8px; background: var(--bar-bg); border-radius: 4px; vertical-align: middle; margin-right: .4rem; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 4px; }
  .muted { color: var(--muted); font-size: .85rem; }
  .toc { position: sticky; top: 0; background: var(--bg); z-index: 1; padding: .5rem 0; margin-bottom: 1rem; border-bottom: 1px solid var(--border); }
  .toc ul { list-style: none; display: flex; flex-wrap: wrap; gap: .25rem 1rem; margin: 0; padding: 0; }
  .toc a { color: var(--accent); text-decoration: none; font-size: .85rem; }
  .toc a:hover { text-decoration: underline; }
  .filterbar { position: sticky; top: 2.4rem; z-index: 1; background: var(--card-bg); border: 1px solid var(--border);
    border-radius: 8px; padding: .5rem .75rem; margin-bottom: 1.25rem; display: flex; flex-wrap: wrap;
    align-items: center; gap: .15rem .9rem; font-size: .85rem; }
  .filterbar label { display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap; cursor: pointer; }
  .filterbar select, .filterbar input[type="search"] { font: inherit; padding: .2rem .4rem; border: 1px solid var(--border);
    border-radius: 4px; background: var(--bg); color: var(--fg); }
  .filterbar input[type="search"] { min-width: 12rem; }
  details.cwv-card > summary { cursor: pointer; list-style: revert; }
  details.cwv-card > summary h3 { display: inline; }
${CWV_SECTION_STYLE}
`

/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — HTML raporu sıfır JS içeriyordu: sıralama,
 * filtreleme, arama, katlama yoktu; canlı `run13`'te crawl bölümü tek başına yüzlerce URL
 * kartı içeriyordu. Bu araç çubuğu ciddiyet/kategori/serbest metinle her `data-severity`
 * taşıyan bulgu kartını (bkz. `findingCardAttrs`, severityLabel.ts) filtreler.
 */
const FILTER_TOOLBAR = `<div class="filterbar" id="filterbar">
  <strong>Filtrele:</strong>
  <label><input type="checkbox" data-sev="critical" checked> 🔴 Kritik</label>
  <label><input type="checkbox" data-sev="high" checked> 🟡 Önemli</label>
  <label><input type="checkbox" data-sev="medium" checked> 🔵 Orta</label>
  <label><input type="checkbox" data-sev="low" checked> ⚪ Bilgi</label>
  <select id="filter-category" aria-label="Kategoriye göre filtrele">
    <option value="">Tüm kategoriler</option>
    ${Object.entries(CATEGORY_LABEL)
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join('')}
  </select>
  <input type="search" id="filter-search" placeholder="Bulgularda ara…" aria-label="Bulgularda ara">
  <span id="filter-count" class="muted"></span>
</div>`

/**
 * XSS SINIRI: bu script model verisinden HİÇBİR interpolasyon içermez — statik bir string
 * olarak gömülür, yalnız DOM'dan `data-*` okur ve `element.hidden` yazar. Arama eşleşmesi
 * `textContent` ile yapılır, `innerHTML` hiç kullanılmaz. Raporun geri kalanındaki titiz
 * `escapeHtml` kaçış disiplini bu dosyada bozulmuyor.
 */
const FILTER_SCRIPT = `(function () {
  var toolbar = document.getElementById('filterbar');
  if (!toolbar) return;
  var severityBoxes = Array.prototype.slice.call(toolbar.querySelectorAll('input[data-sev]'));
  var categorySelect = document.getElementById('filter-category');
  var searchInput = document.getElementById('filter-search');
  var countLabel = document.getElementById('filter-count');
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-severity]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.cwv-card'));

  function activeSeverities() {
    var set = {};
    severityBoxes.forEach(function (box) { if (box.checked) set[box.dataset.sev] = true; });
    return set;
  }

  function apply() {
    var severities = activeSeverities();
    var category = categorySelect.value;
    var query = searchInput.value.trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (card) {
      var show = !!severities[card.dataset.severity]
        && (category === '' || card.dataset.category === category)
        && (query === '' || card.textContent.toLowerCase().indexOf(query) !== -1);
      card.hidden = !show;
      if (show) visible += 1;
    });
    // Bir grubun (crawlSection.ts'in <details class="cwv-card"> URL kartı gibi) TÜM çocukları
    // filtrelendiyse grubu da gizle — aksi halde boş bir başlık asılı kalırdı.
    groups.forEach(function (group) {
      var children = Array.prototype.slice.call(group.querySelectorAll('[data-severity]'));
      if (children.length === 0) return;
      var anyVisible = children.some(function (child) { return !child.hidden; });
      group.hidden = !anyVisible;
    });
    countLabel.textContent = visible + ' / ' + cards.length + ' bulgu gösteriliyor';
  }

  severityBoxes.forEach(function (box) { box.addEventListener('change', apply); });
  categorySelect.addEventListener('change', apply);
  searchInput.addEventListener('input', apply);
  apply();
})();`

/** ReportModel → tek dosyalık, harici varlık gerektirmeyen HTML rapor. */
export const renderHtml = (model: ReportModel): string => {
  const sections: string[] = []

  if (model.mockCategories.length > 0) {
    sections.push(
      `<div class="banner mock"><strong>⚠ MOCK MODE</strong> — Şu kategoriler sentetik veriyle çalıştı: ${escapeHtml(model.mockCategories.join(', '))}. Gerçek veri için <code>.env</code> dosyasına API anahtarlarını ekleyin. Bu kategorilerden gelen tekil bulgular <strong>· 🧪 ÖRNEK VERİ</strong> rozetiyle işaretlenir ve Yönetici Özeti'ne hiç girmez.</div>`,
    )
  }
  for (const failed of model.failedBranches) {
    sections.push(
      `<div class="banner error"><strong>❌ ${escapeHtml(failed.branch)} dalı başarısız</strong> — ${escapeHtml(failed.message)}</div>`,
    )
  }

  sections.push(`${sectionHeading('Yönetici Özeti')}<p>${escapeHtml(model.synthesis.headline)}</p>`)
  sections.push(
    model.synthesis.actions
      .map(
        (action) =>
          `<div class="action p${action.priority}"><strong>[${escapeHtml(action.category)}]</strong> ${escapeHtml(action.text)}</div>`,
      )
      .join('\n'),
  )
  sections.push(`<p class="muted">Sentez: ${escapeHtml(model.synthesis.synthesizer)}</p>`)

  sections.push(sectionHeading('Fırsatlar'))
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

  sections.push(sectionHeading('Rakip Haritası'))
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

  sections.push(sectionHeading('Küme Görünümü'))
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

  sections.push(sectionHeading('Teknik Sorunlar (Core Web Vitals)'))
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

  const codeAuditFindings = renderCodeAuditFindingsHtml(model.analysis.codeAuditFindings)
  if (codeAuditFindings !== '') sections.push(codeAuditFindings)

  const keywordGaps = renderKeywordGapsHtml(model.analysis.keywordGaps)
  if (keywordGaps !== '') sections.push(keywordGaps)

  const keywordPageMatches = renderKeywordPageMatchesHtml(model.analysis.keywordPageMatches)
  if (keywordPageMatches !== '') sections.push(keywordPageMatches)

  sections.push(sectionHeading('AI Görünürlüğü (GEO)'))
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

  sections.push(sectionHeading('Gerçek Arama Performansı (GSC)'))
  if (model.analysis.gscRows.length === 0) {
    sections.push('<p class="muted">GSC verisi yok.</p>')
  } else {
    // markdownReport.ts ile aynı gerekçe: sıralanmamış + yuvarlanmamış avgPosition, bkz. oradaki yorum.
    const sortedGscRows = [...model.analysis.gscRows].sort((a, b) => b.impressions - a.impressions)
    const overflowNote =
      sortedGscRows.length > GSC_ROWS_REPORT_LIMIT
        ? `<p class="muted">+${sortedGscRows.length - GSC_ROWS_REPORT_LIMIT} sorgu daha — tam liste: <code>gsc-run${model.run.id}.csv</code>.</p>`
        : ''
    sections.push(
      `<details open><summary>Sorgu tablosu (${sortedGscRows.length})</summary>${table(
        ['Sorgu', 'Sayfa', 'Tıklama', 'Gösterim', 'CTR', 'Ort. Sıra'],
        sortedGscRows.slice(0, GSC_ROWS_REPORT_LIMIT).map((row) => [
          escapeHtml(row.query),
          row.page === '' ? '—' : escapeHtml(row.page),
          String(row.clicks),
          row.impressions.toLocaleString('tr-TR'),
          percent(row.ctr),
          row.avgPosition.toFixed(1),
        ]),
      )}${overflowNote}</details>`,
    )
  }

  const cannibalizationFindings = renderCannibalizationFindingsHtml(model.analysis.cannibalizationFindings)
  if (cannibalizationFindings !== '') sections.push(cannibalizationFindings)

  sections.push(sectionHeading('Son Çalıştırmadan Bu Yana Değişenler'))
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
    if (model.diff.cwvDeltas.length > 0) {
      const signed = (value: number, unit: string): string =>
        `${value > 0 ? '▲ +' : value < 0 ? '▼ ' : ''}${Math.round(value)}${unit}`
      sections.push(
        '<p class="muted">Core Web Vitals değişimi:</p>' +
          table(
            ['URL', 'LCP', 'INP', 'CLS'],
            model.diff.cwvDeltas.map((delta) => [
              escapeHtml(delta.url),
              signed(delta.lcpDeltaMs, 'ms'),
              signed(delta.inpDeltaMs, 'ms'),
              delta.clsDelta.toFixed(3),
            ]),
          ),
      )
    }
    if (model.diff.crawlDelta.pageCountDelta !== 0) {
      const delta = model.diff.crawlDelta.pageCountDelta
      sections.push(`<p class="muted">Taranan sayfa sayısı: ${delta > 0 ? `+${delta}` : delta} (önceki çalıştırmaya göre)</p>`)
    }
    if (model.diff.competitorEntries.length > 0) {
      sections.push(`<p class="muted">Yeni rakipler: ${escapeHtml(model.diff.competitorEntries.join(', '))}</p>`)
    }
    if (model.diff.competitorExits.length > 0) {
      sections.push(`<p class="muted">Listeden çıkan rakipler: ${escapeHtml(model.diff.competitorExits.join(', '))}</p>`)
    }
    if (model.diff.aiRateDeltas.length > 0) {
      sections.push(
        `<ul>${model.diff.aiRateDeltas
          .map((delta) => `<li>"${escapeHtml(delta.query)}": ${percent(delta.previousRate)} → ${percent(delta.currentRate)}</li>`)
          .join('')}</ul>`,
      )
    }
    // markdownReport.ts ile aynı gerekçe (bkz. oradaki yorum) — dedupe/sırala/kırp, MD paritesi.
    // Faz C — <details open> ile katlanabilir: liste kapaklı ama varsayılan açık, tıklanınca kapatılabilir.
    if (model.diff.resolvedFindings.length > 0) {
      const { shown, hiddenCount } = capFindingsForDisplay(model.diff.resolvedFindings, DIFF_FINDINGS_REPORT_LIMIT)
      const overflowLine = hiddenCount > 0 ? `<li class="muted">+${hiddenCount} bulgu daha — tam liste yukarıdaki bölümlerde.</li>` : ''
      sections.push(
        `<details open><summary>✅ Düzelen bulgular (${shown.length + hiddenCount})</summary><ul>${shown
          .map((f) => `<li>${escapeHtml(f.title)}${f.url === null ? '' : ` — ${escapeHtml(f.url)}`}</li>`)
          .join('')}${overflowLine}</ul></details>`,
      )
    }
    if (model.diff.newFindings.length > 0) {
      const { shown, hiddenCount } = capFindingsForDisplay(model.diff.newFindings, DIFF_FINDINGS_REPORT_LIMIT)
      const overflowLine = hiddenCount > 0 ? `<li class="muted">+${hiddenCount} bulgu daha — tam liste yukarıdaki bölümlerde.</li>` : ''
      sections.push(
        `<details open><summary>🆕 Yeni açılan bulgular (${shown.length + hiddenCount})</summary><ul>${shown
          .map((f) => `<li>${escapeHtml(SEVERITY_LABEL[f.severity])} ${escapeHtml(f.title)}${f.url === null ? '' : ` — ${escapeHtml(f.url)}`}</li>`)
          .join('')}${overflowLine}</ul></details>`,
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
<nav class="toc"><ul>${TOC_SECTIONS.map((title) => `<li><a href="#${slugAnchor(title)}">${escapeHtml(title)}</a></li>`).join('')}</ul></nav>
${FILTER_TOOLBAR}
${sections.join('\n')}
<hr><p class="muted">Rapor ${escapeHtml(model.generatedAt)} tarihinde SEO Komuta Merkezi tarafından üretildi.</p>
<script>${FILTER_SCRIPT}</script>
</body>
</html>`
}
