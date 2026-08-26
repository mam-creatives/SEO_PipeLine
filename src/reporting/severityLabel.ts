import type { FindingSeverity } from '../core/findings.js'

/** Rapor genelinde ciddiyet gösterimi — cwvSection/seoSection/indexingSection üçü de kullanır. */
export const SEVERITY_LABEL: Readonly<Record<FindingSeverity, string>> = {
  critical: '🔴 KRİTİK',
  high: '🟡 ÖNEMLİ',
  medium: '🔵 ORTA',
  low: '⚪ BİLGİ',
}
