import type { TrendDiff } from '../analysis/diffRuns.js'
import type { AnalysisResult } from '../analysis/runAnalysis.js'
import { CWV_THRESHOLDS, OPPORTUNITY_TOP_COUNT } from '../config/constants.js'
import { sortFindings } from '../core/findings.js'

export type ActionCategory = 'trend' | 'fırsat' | 'teknik' | 'on-page' | 'ai-görünürlük' | 'indeksleme'

/** Site genelinde en yüksek etkili on-page bulguları — hepsini listelemek yönetici özetini boğar. */
const TOP_ONPAGE_FINDINGS = 3

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

  // 6) AI görünürlük boşlukları — yeni nesil (GEO) cephe
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
