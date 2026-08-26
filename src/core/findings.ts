import type { CwvMetricName } from './cwv.js'

/**
 * Tüm denetim kategorilerinin ortak bulgu şekli.
 *
 * `CwvFinding` (src/analysis/cwv/types.ts) bunun bir alt tipidir — CWV kuralları
 * `metric`/`phase`/`phaseShare`'i zorunlu doldurur. Faz 2/3'te `category` yeni değerler
 * alacak ('links' | 'code'), `codeLocation` doldurulacak; bu tip o zaman değişmez, yalnız
 * kullanılmaya başlar.
 */
export type FindingCategory = 'cwv' | 'onpage' | 'indexing' | 'content'

/** critical = eşik "poor" bandında, high = "needs-improvement", medium = faz bütçesi aşıldı, low = bilgi amaçlı */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low'

/** Düzeltmenin gerektirdiği emek — `impact` ile birlikte önceliklendirme sağlar. */
export type FindingEffort = 'trivial' | 'small' | 'medium' | 'large'

/** Faz 3'te dolar: bulguyu üreten kaynağı render eden dosya/satır. Faz 1/2'de hep null/undefined. */
export interface CodeLocation {
  readonly file: string
  readonly line: number | null
}

/**
 * Tek bir denetim bulgusu. `fixSnippet` ürünün farklılaştırıcısı: öneri metni değil,
 * doğrudan kopyalanabilir düzeltme. `evidence` iddianın dayanağı olan ham ölçüm değeridir
 * (ör. "TTFB 3400ms") — `explanation` yorumlarken `evidence` kanıtı taşır.
 */
export interface Finding {
  readonly category: FindingCategory
  readonly severity: FindingSeverity
  /** Bulgunun ait olduğu sayfa — sayfa bağımsız bulgularda (ör. site geneli) null */
  readonly url: string | null
  /** Suçlu elementin CSS seçicisi — biliniyorsa */
  readonly culpritSelector: string | null
  readonly title: string
  readonly explanation: string
  readonly evidence: string
  /** 0..100 — trafik/dönüşüm etkisi tahmini, önceliklendirme için */
  readonly impact: number
  readonly effort: FindingEffort
  readonly fixSnippet: string | null
  /** Yalnız CWV bulgularında dolu */
  readonly metric?: CwvMetricName
  readonly phase?: string
  readonly phaseShare?: number | null
  readonly codeLocation?: CodeLocation | null
}

const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/**
 * Önce ciddiyet, eşitlikte büyük faz payı önce — sıralama her rapor yüzeyinde aynı olsun.
 * Generic: `T extends Finding` girip aynı alt tiple çıkar (ör. `CwvFinding[]` verilince
 * `CwvFinding[]` döner, `metric`/`phase` zorunluluğu kaybolmaz).
 */
export const sortFindings = <T extends Finding>(findings: readonly T[]): readonly T[] =>
  [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.phaseShare ?? 0) - (a.phaseShare ?? 0),
  )

export const percentLabel = (share: number): string => `%${Math.round(share * 100)}`

const SEVERITY_IMPACT_BASE: Readonly<Record<FindingSeverity, number>> = {
  critical: 70,
  high: 45,
  medium: 25,
  low: 10,
}

/**
 * Ciddiyet + faz payından 0..100 etki tahmini üretir. `phaseShare` yoksa (faz-bağımsız
 * bulgu) yalnız ciddiyet tabanı kullanılır. Kesin bilim değil — göreli sıralama için yeterli.
 */
export const estimateImpact = (severity: FindingSeverity, phaseShare: number | null = null): number => {
  const base = SEVERITY_IMPACT_BASE[severity]
  const shareBonus = phaseShare === null ? 0 : Math.round(phaseShare * 30)
  return Math.min(100, base + shareBonus)
}
