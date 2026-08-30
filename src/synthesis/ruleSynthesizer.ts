import type { TrendDiff } from '../analysis/diffRuns.js'
import type { AnalysisResult } from '../analysis/runAnalysis.js'
import { CWV_THRESHOLDS, OPPORTUNITY_TOP_COUNT } from '../config/constants.js'
import { sortFindings, type Finding } from '../core/findings.js'

export type ActionCategory =
  | 'trend'
  | 'fırsat'
  | 'teknik'
  | 'on-page'
  | 'links'
  | 'ai-görünürlük'
  | 'indeksleme'
  | 'kod'
  | 'keyword-fırsatı'

/** Site genelinde en yüksek etkili on-page bulguları — hepsini listelemek yönetici özetini boğar. */
const TOP_ONPAGE_FINDINGS = 3
/** Crawler onlarca sayfa/bulgu üretebilir — yönetici özetine yalnız en yüksek etkili N tanesi girer. */
const TOP_CRAWL_FINDINGS = 5
/** Kod denetimi (Faz 3) onlarca dosya/bulgu üretebilir — aynı gerekçeyle sınırlanır. */
const TOP_CODE_FINDINGS = 5
/** Faz 4.4 — keyword fırsatları onlarcaya çıkabilir (rakip başına ~20) — hacme göre ilk N tanesi. */
const TOP_KEYWORD_GAP_ACTIONS = 5

/** Finding.category (İngilizce) → ActionCategory (Türkçe) — crawlFindings üç kategoriyi karıştırır. */
const crawlActionCategory = (category: Finding['category']): ActionCategory => {
  if (category === 'links') return 'links'
  if (category === 'indexing') return 'indeksleme'
  return 'on-page'
}

export interface ActionItem {
  /** 1 = acil, 2 = önemli, 3 = bilgi */
  readonly priority: number
  readonly category: ActionCategory
  readonly text: string
}

export interface SynthesisOutput {
  readonly synthesizer: string
  readonly headline: string
  readonly actions: readonly ActionItem[]
}

const MAX_ACTIONS = 12

/**
 * Kural tabanlı, deterministik sentez — hiçbir API anahtarı gerektirmez.
 * Analiz + diff çıktısını önceliklendirilmiş Türkçe aksiyon listesine çevirir.
 * (ANTHROPIC_API_KEY eklendiğinde Claude tabanlı sentezleyici bunun yerine geçebilir;
 * o da hata verirse rapor bu çıktıya düşer ve hangi sentezleyicinin ürettiği raporda yazar.)
 */
export const synthesizeWithRules = (analysis: AnalysisResult, diff: TrendDiff): SynthesisOutput => {
  const actions: ActionItem[] = []

  // 1) Trend uyarıları — düşüşler her şeyden önce gelir
  for (const alert of diff.alerts) {
    actions.push({
      priority: alert.severity === 'warning' ? 1 : 3,
      category: 'trend',
      text: alert.message,
    })
  }

  // 2) En iyi fırsatlar
  const topOpportunities = analysis.opportunities.slice(0, OPPORTUNITY_TOP_COUNT)
  for (const opportunity of topOpportunities) {
    actions.push({
      priority: 2,
      category: 'fırsat',
      text: `"${opportunity.keyword}" (${opportunity.volume.toLocaleString('tr-TR')} arama/ay, zorluk ${Math.round(opportunity.difficulty * 100)}%): ${opportunity.reason}`,
    })
  }

  // 3) Müşteri sitesinin Core Web Vitals ihlalleri
  for (const evaluation of analysis.techEvaluations.filter((item) => item.isClient)) {
    // Teşhis varsa eşik tekrarı yerine baskın fazı ve suçlu elementi söyle — aksiyon alınabilir olan bu.
    const topFindings = evaluation.diagnosis?.findings.slice(0, 2) ?? []
    if (topFindings.length > 0) {
      for (const finding of topFindings) {
        const culprit = finding.culpritSelector === null ? '' : ` Suçlu element: ${finding.culpritSelector}.`
        actions.push({
          priority: finding.severity === 'critical' ? 1 : 2,
          category: 'teknik',
          text: `${evaluation.audit.url} — ${finding.title}.${culprit} ${finding.explanation}`,
        })
      }
      continue
    }

    const failures: string[] = []
    if (!evaluation.passes.lcp) failures.push(`LCP ${Math.round(evaluation.audit.lcpMs)}ms (eşik ${CWV_THRESHOLDS.lcpMs}ms)`)
    if (!evaluation.passes.inp) failures.push(`INP ${Math.round(evaluation.audit.inpMs)}ms (eşik ${CWV_THRESHOLDS.inpMs}ms)`)
    if (!evaluation.passes.cls) failures.push(`CLS ${evaluation.audit.cls} (eşik ${CWV_THRESHOLDS.cls})`)
    if (failures.length > 0) {
      actions.push({
        priority: 2,
        category: 'teknik',
        text: `${evaluation.audit.url} Core Web Vitals ihlali: ${failures.join(', ')}. Tespit edilen sorunlar: ${evaluation.audit.issues.join('; ') || 'detay yok'}`,
      })
    }
  }

  // 4) On-page SEO bulguları — Lighthouse SEO kategorisinden gelir (bkz. seoSection.ts).
  // Müşterinin kendi sayfalarıyla sınırlı; rakip denetimleri buraya girmez.
  // impact === estimateImpact(severity) (phaseShare'siz) olduğu için sortFindings burada
  // severity sırasıyla aynı zamanda impact sırasıdır.
  const onPageFindings = sortFindings(
    analysis.techEvaluations.filter((item) => item.isClient).flatMap((item) => item.audit.seoFindings ?? []),
  ).slice(0, TOP_ONPAGE_FINDINGS)
  for (const finding of onPageFindings) {
    actions.push({
      priority: finding.severity === 'critical' ? 1 : 2,
      category: 'on-page',
      text: `${finding.url ?? ''} — ${finding.title}. ${finding.explanation}`,
    })
  }

  // 5) İndeksleme sorunları — hepsi zaten critical (bkz. detectIndexingIssues.ts),
  // her zaman öncelik 1: indekslenmeyen sayfa için diğer her şey anlamsızdır.
  for (const finding of analysis.indexingFindings) {
    actions.push({
      priority: 1,
      category: 'indeksleme',
      text: `${finding.url ?? ''} — ${finding.title}. ${finding.explanation}`,
    })
  }

  // 6) Crawler bulguları — on-page + link grafiği + taranabilirlik, en yüksek etkili N tanesi.
  // impact === estimateImpact(severity) (phaseShare'siz) olduğu için sortFindings burada da
  // severity sırasıyla aynı zamanda impact sırasıdır (onPageFindings bloğuyla aynı gerekçe).
  const topCrawlFindings = sortFindings(analysis.crawlFindings).slice(0, TOP_CRAWL_FINDINGS)
  for (const finding of topCrawlFindings) {
    actions.push({
      priority: finding.severity === 'critical' ? 1 : 2,
      category: crawlActionCategory(finding.category),
      text: `${finding.url ?? '(site geneli)'} — ${finding.title}. ${finding.explanation}`,
    })
  }

  // 7) Kod denetimi bulguları (Faz 3) — en yüksek etkili N tanesi. codeLocation varsa metne
  // dosya:satır eklenir, bu bloğun tek farkı: doğrudan "nereyi değiştireceğim" cevabı verir.
  const topCodeFindings = sortFindings(analysis.codeAuditFindings).slice(0, TOP_CODE_FINDINGS)
  for (const finding of topCodeFindings) {
    const location =
      finding.codeLocation == null
        ? ''
        : ` [${finding.codeLocation.file}${finding.codeLocation.line === null ? '' : `:${finding.codeLocation.line}`}]`
    actions.push({
      priority: finding.severity === 'critical' ? 1 : 2,
      category: 'kod',
      text: `${finding.title}${location}. ${finding.explanation}`,
    })
  }

  // 8) AI görünürlük boşlukları — yeni nesil (GEO) cephe
  for (const visibility of analysis.aiVisibility.filter((item) => item.isGap)) {
    const strongest = [...visibility.competitorRates].sort((a, b) => b.rate - a.rate)[0]
    const competitorNote =
      strongest === undefined
        ? ''
        : ` ${strongest.domain} cevapların %${Math.round(strongest.rate * 100)}'inde geçiyor,`
    actions.push({
      priority: 2,
      category: 'ai-görünürlük',
      text: `"${visibility.query}" sorgusunda AI görünürlük boşluğu:${competitorNote} markanız %${Math.round(visibility.clientRate * 100)}'de kalıyor — bu soruya doğrudan cevap veren içerik ve otorite sinyali (GEO) gerekli.`,
    })
  }

  // 9) Keyword fırsatları (Faz 4.4) — "rakipte var, sende yok". Hacme göre büyükten küçüğe ilk N.
  const topKeywordGaps = [...analysis.keywordGaps]
    .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))
    .slice(0, TOP_KEYWORD_GAP_ACTIONS)
  for (const gap of topKeywordGaps) {
    const volumeNote = gap.volume === null ? '' : ` (aylık ~${gap.volume.toLocaleString('tr-TR')} arama)`
    actions.push({
      priority: 3,
      category: 'keyword-fırsatı',
      text: `"${gap.keyword}"${volumeNote} için ${gap.competitorDomain} #${gap.competitorPosition}'de sıralanıyor, siz hiç sıralamıyorsunuz — içerik fırsatı.`,
    })
  }

  const prioritized = [...actions].sort((a, b) => a.priority - b.priority).slice(0, MAX_ACTIONS)

  const warningCount = diff.alerts.filter((alert) => alert.severity === 'warning').length
  const gapCount = analysis.aiVisibility.filter((item) => item.isGap).length
  const topKeyword = topOpportunities[0]?.keyword
  const headline = diff.isBaseline
    ? `İlk analiz tamamlandı: ${analysis.rows.length} keyword, ${analysis.competitors.filter((c) => c.isRealCompetitor).length} gerçek rakip, ${gapCount} AI görünürlük boşluğu.` +
      (topKeyword === undefined ? '' : ` En büyük fırsat: "${topKeyword}".`)
    : `${diff.rankChanges.length} sıra değişimi, ${warningCount} uyarı.` +
      (topKeyword === undefined ? '' : ` Öncelikli fırsat: "${topKeyword}".`)

  return { synthesizer: 'rule-based', headline, actions: prioritized }
}
