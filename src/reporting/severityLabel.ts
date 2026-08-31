import type { Finding, FindingCategory, FindingEffort, FindingSeverity } from '../core/findings.js'

/** Rapor genelinde ciddiyet gösterimi — cwvSection/seoSection/indexingSection üçü de kullanır. */
export const SEVERITY_LABEL: Readonly<Record<FindingSeverity, string>> = {
  critical: '🔴 KRİTİK',
  high: '🟡 ÖNEMLİ',
  medium: '🔵 ORTA',
  low: '⚪ BİLGİ',
}

/** HTML raporundaki kategori filtre dropdown'unun seçenekleri — `FindingCategory` ile elle senkron. */
export const CATEGORY_LABEL: Readonly<Record<FindingCategory, string>> = {
  cwv: 'Core Web Vitals',
  onpage: 'On-Page',
  indexing: 'İndeksleme',
  content: 'İçerik',
  links: 'Linkler',
}

/**
 * Dış denetim bulgusu (2026-08-31, Faz C) — HTML raporunda severity/kategori filtresi için
 * her bulgu kartına eklenen `data-*` öznitelikleri. Değerler kapalı bir enum'dan geldiği
 * (`FindingSeverity`/`FindingCategory`) için `escapeHtml` GEREKMEZ — kullanıcı/3. parti
 * girdisi değil, kod tabanının kendi sabit değer kümesi.
 */
export const findingCardAttrs = (finding: Finding): string => `data-severity="${finding.severity}" data-category="${finding.category}"`

/** Bulgu başlığının yanına eklenen emek rozeti — impact/effort önceliklendirmesini görünür kılar. */
export const EFFORT_LABEL: Readonly<Record<FindingEffort, string>> = {
  trivial: 'triviyal emek',
  small: 'küçük emek',
  medium: 'orta emek',
  large: 'büyük emek',
}

/**
 * Dış denetim bulgusu (2026-08-31, BLOKER 1) — mock sağlayıcıdan gelen bulgular gerçek
 * bulgularla görsel olarak ayrılamıyordu; mock crawler gerçek müşteri domaininde sahte
 * kritik bulgu (title/H1/meta "eksik") ürettiğinde okuyucunun bunu ayırt edecek hiçbir
 * işareti yoktu. Boş string döner (isMock yoksa/false ise) — mevcut render'ları bozmaz.
 */
export const mockBadgeLabel = (finding: Finding): string => (finding.isMock === true ? ' · 🧪 ÖRNEK VERİ' : '')

/**
 * Faz 5.6 — `Finding.impact` (0-100) hesaplanıyor ve sıralamada kullanılıyordu ama rapora HİÇ
 * basılmıyordu (dış inceleme bulgusu). Tek noktadan (DRY): tüm bölümler `EFFORT_LABEL[...]`
 * yerine bunu çağırır, etki skoru her yerde aynı biçimde görünür.
 */
export const impactEffortLabel = (finding: Finding): string =>
  `${EFFORT_LABEL[finding.effort]} · etki ${finding.impact}${mockBadgeLabel(finding)}`
