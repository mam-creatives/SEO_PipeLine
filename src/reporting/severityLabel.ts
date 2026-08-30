import type { Finding, FindingEffort, FindingSeverity } from '../core/findings.js'

/** Rapor genelinde ciddiyet gösterimi — cwvSection/seoSection/indexingSection üçü de kullanır. */
export const SEVERITY_LABEL: Readonly<Record<FindingSeverity, string>> = {
  critical: '🔴 KRİTİK',
  high: '🟡 ÖNEMLİ',
  medium: '🔵 ORTA',
  low: '⚪ BİLGİ',
}

/** Bulgu başlığının yanına eklenen emek rozeti — impact/effort önceliklendirmesini görünür kılar. */
export const EFFORT_LABEL: Readonly<Record<FindingEffort, string>> = {
  trivial: 'triviyal emek',
  small: 'küçük emek',
  medium: 'orta emek',
  large: 'büyük emek',
}

/**
 * Faz 5.6 — `Finding.impact` (0-100) hesaplanıyor ve sıralamada kullanılıyordu ama rapora HİÇ
 * basılmıyordu (dış inceleme bulgusu). Tek noktadan (DRY): tüm bölümler `EFFORT_LABEL[...]`
 * yerine bunu çağırır, etki skoru her yerde aynı biçimde görünür.
 */
export const impactEffortLabel = (finding: Finding): string => `${EFFORT_LABEL[finding.effort]} · etki ${finding.impact}`
