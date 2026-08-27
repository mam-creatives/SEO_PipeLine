import type { FindingEffort, FindingSeverity } from '../core/findings.js'

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
