import { COMPETITOR_REPORT_LIMIT } from '../config/constants.js'
import { renderCwvDiagnosisMarkdown } from './cwvSection.js'
import { renderSeoFindingsMarkdown } from './seoSection.js'
import type { ReportModel } from './reportModel.js'

const percent = (rate: number): string => `%${Math.round(rate * 100)}`
const rankLabel = (rank: number | null): string => (rank === null ? '—' : `#${rank}`)
const passLabel = (passes: boolean): string => (passes ? '✅' : '❌')

/** ReportModel → Markdown rapor. Saf fonksiyon, G/Ç yok. */
export const renderMarkdown = (model: ReportModel): string => {
  const lines: string[] = []
  const push = (line = ''): void => {
    lines.push(line)
  }

  push(`# SEO Araştırma Raporu — ${model.brandName} (${model.domain})`)
  push()
  push(`Çalıştırma: #${model.run.id} · ${model.run.startedAt}` + (model.previousRunId === null ? '' : ` · Karşılaştırma: #${model.previousRunId}`))
  push()

  if (model.mockCategories.length > 0) {
    push(`> ⚠ **MOCK MODE** — Şu kategoriler örnek (sentetik) veriyle çalıştı: ${model.mockCategories.join(', ')}.`)
    push(`> Gerçek veri için .env dosyasına ilgili API anahtarlarını ekleyin (.env.example'a bakın).`)
    push()
  }
  for (const failed of model.failedBranches) {
    push(`> ❌ **${failed.branch} dalı başarısız** — bu bölüm eksik olabilir: ${failed.message}`)
    push()
  }

  push('## Yönetici Özeti')
  push()
  push(model.synthesis.headline)
  push()
  for (const action of model.synthesis.actions) {
    const marker = action.priority === 1 ? '🔴' : action.priority === 2 ? '🟡' : 'ℹ️'
    push(`- ${marker} **[${action.category}]** ${action.text}`)
  }
  push()
  push(`_Sentez: ${model.synthesis.synthesizer}_`)
  push()

  push('## Fırsatlar')
  push()
  push('| Skor | Keyword | Niyet | Hacim/ay | Zorluk | Sıra | Neden |')
  push('|-----:|---------|-------|---------:|-------:|-----:|-------|')
  for (const opportunity of model.analysis.opportunities) {
    push(
      `| ${opportunity.score} | ${opportunity.keyword} | ${opportunity.intent} | ${opportunity.volume.toLocaleString('tr-TR')} | ${percent(opportunity.difficulty)} | ${rankLabel(opportunity.clientRank)} | ${opportunity.reason} |`,
    )
  }
  push()

  push('## Rakip Haritası')
  push()
  push('| Domain | Görünme Oranı | Sınıf | Gerçek Rakip? | Kaynak |')
  push('|--------|--------------:|-------|:-------------:|--------|')
  // Tek keyword'de bir kez görünen onlarca domain listeyi okunmaz kılıyor;
  // gerçek rakipler her hâlükârda gösterilir, gerisi ilk sıralarla sınırlanır.
  const shownCompetitors = model.analysis.competitors
    .filter((competitor, index) => competitor.isRealCompetitor || index < COMPETITOR_REPORT_LIMIT)
    .slice(0, COMPETITOR_REPORT_LIMIT)
  for (const competitor of shownCompetitors) {
    push(
      `| ${competitor.domain} | ${percent(competitor.appearanceRate)} | ${competitor.classification} | ${competitor.isRealCompetitor ? '✅' : '—'} | ${competitor.source} |`,
    )
  }
  const hiddenCount = model.analysis.competitors.length - shownCompetitors.length
  if (hiddenCount > 0) push(`\n_${hiddenCount} domain daha bulundu; hiçbiri gerçek rakip eşiğini geçmedi._`)
  push()

  push('## Küme Görünümü')
  push()
  push('| Küme | Niyet | Keyword Sayısı | Toplam Hacim | Ort. Zorluk | En İyi Sıra | Temsilci |')
  push('|------|-------|---------------:|-------------:|------------:|------------:|----------|')
  for (const cluster of model.analysis.clusters) {
    push(
      `| ${cluster.clusterId} | ${cluster.intent} | ${cluster.keywords.length} | ${cluster.totalVolume.toLocaleString('tr-TR')} | ${percent(cluster.avgDifficulty)} | ${rankLabel(cluster.bestClientRank)} | ${cluster.representativeKeyword} |`,
    )
  }
  push()

  push('## Teknik Sorunlar (Core Web Vitals)')
  push()
  push('| URL | LCP | INP | CLS | Skor | Site |')
  push('|-----|----:|----:|----:|-----:|------|')
  for (const evaluation of model.analysis.techEvaluations) {
    push(
      `| ${evaluation.audit.url} | ${Math.round(evaluation.audit.lcpMs)}ms ${passLabel(evaluation.passes.lcp)} | ${Math.round(evaluation.audit.inpMs)}ms ${passLabel(evaluation.passes.inp)} | ${evaluation.audit.cls} ${passLabel(evaluation.passes.cls)} | ${evaluation.audit.performanceScore} | ${evaluation.isClient ? '**müşteri**' : 'rakip'} |`,
    )
  }
  push()
  // Aynı sorun her sayfada tekrar raporlanıyor (ör. tüm sayfalarda aynı blokan CSS);
  // tekrarlar ayıklanmazsa liste 50 satıra çıkıp okunmaz oluyordu.
  const clientIssues = [
    ...new Set(model.analysis.techEvaluations.filter((item) => item.isClient).flatMap((item) => item.audit.issues)),
  ]
  if (clientIssues.length > 0) {
    push('Tespit edilen sorunlar:')
    push()
    for (const issue of clientIssues) push(`- ${issue}`)
    push()
  }

  const cwvDiagnosis = renderCwvDiagnosisMarkdown(model.analysis.techEvaluations)
  if (cwvDiagnosis !== '') {
    push(cwvDiagnosis)
    push()
  }

  const seoFindings = renderSeoFindingsMarkdown(model.analysis.techEvaluations)
  if (seoFindings !== '') {
    push(seoFindings)
    push()
  }

  push('## AI Görünürlüğü (GEO)')
  push()
  if (model.analysis.aiVisibility.length === 0) {
    push('_Bu çalıştırmada AI görünürlük verisi yok._')
  } else {
    push('| Sorgu | Marka Oranı | En Güçlü Rakip | Boşluk? |')
    push('|-------|------------:|----------------|:-------:|')
    for (const visibility of model.analysis.aiVisibility) {
      const strongest = [...visibility.competitorRates].sort((a, b) => b.rate - a.rate)[0]
      // %0 oranlı bir rakibi "en güçlü" diye göstermek anlamsız — kimse geçmiyor demektir.
      const strongestLabel =
        strongest === undefined || strongest.rate === 0 ? '—' : `${strongest.domain} (${percent(strongest.rate)})`
      push(`| ${visibility.query} | ${percent(visibility.clientRate)} | ${strongestLabel} | ${visibility.isGap ? '⚠️' : '—'} |`)
    }
  }
  push()

  push('## Gerçek Arama Performansı (GSC)')
  push()
  if (model.analysis.gscRows.length === 0) {
    push('_GSC verisi yok._')
  } else {
    push('| Sorgu | Tıklama | Gösterim | CTR | Ort. Sıra |')
    push('|-------|--------:|---------:|----:|----------:|')
    for (const row of model.analysis.gscRows) {
      push(`| ${row.query} | ${row.clicks} | ${row.impressions.toLocaleString('tr-TR')} | ${percent(row.ctr)} | ${row.avgPosition} |`)
    }
  }
  push()

  push('## Son Çalıştırmadan Bu Yana Değişenler')
  push()
  if (model.diff.isBaseline) {
    push('_İlk çalıştırma — karşılaştırma yok. Bir sonraki çalıştırmada bu bölüm dolacak._')
  } else {
    if (model.diff.configMismatch) push('> ⚠ Config iki çalıştırma arasında değişmiş — karşılaştırma yanıltıcı olabilir.')
    if (model.diff.rankChanges.length === 0) {
      push('Sıra değişimi yok.')
    } else {
      push('| Keyword | Önceki | Şimdi | Değişim |')
      push('|---------|-------:|------:|--------:|')
      for (const change of model.diff.rankChanges) {
        const arrow = change.delta > 0 ? `▲ +${change.delta}` : `▼ ${change.delta}`
        push(`| ${change.keyword} | ${rankLabel(change.previousRank)} | ${rankLabel(change.currentRank)} | ${arrow} |`)
      }
    }
    push()
    if (model.diff.cwvDeltas.length > 0) {
      push()
      push('Core Web Vitals değişimi:')
      push()
      push('| URL | LCP | INP | CLS |')
      push('|-----|----:|----:|----:|')
      for (const delta of model.diff.cwvDeltas) {
        const signed = (value: number, unit: string): string =>
          `${value > 0 ? '▲ +' : value < 0 ? '▼ ' : ''}${Math.round(value)}${unit}`
        push(
          `| ${delta.url} | ${signed(delta.lcpDeltaMs, 'ms')} | ${signed(delta.inpDeltaMs, 'ms')} | ${delta.clsDelta.toFixed(3)} |`,
        )
      }
      push()
    }
    if (model.diff.competitorEntries.length > 0) push(`Yeni rakipler: ${model.diff.competitorEntries.join(', ')}`)
    if (model.diff.competitorExits.length > 0) push(`Listeden çıkan rakipler: ${model.diff.competitorExits.join(', ')}`)
    if (model.diff.aiRateDeltas.length > 0) {
      push()
      push('AI görünürlük değişimleri:')
      for (const delta of model.diff.aiRateDeltas) {
        push(`- "${delta.query}": ${percent(delta.previousRate)} → ${percent(delta.currentRate)}`)
      }
    }
  }
  push()
  push('---')
  push(`_Rapor ${model.generatedAt} tarihinde SEO Komuta Merkezi tarafından üretildi._`)

  return lines.join('\n')
}
