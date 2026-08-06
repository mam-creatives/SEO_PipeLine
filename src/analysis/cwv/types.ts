import type { CwvMetricName, CwvRating, CwvSource } from '../../core/cwv.js'

/** critical = metrik "poor" bandında, high = "needs-improvement", medium = eşik geçilmemiş ama faz bütçesi aşılmış */
export type FindingSeverity = 'critical' | 'high' | 'medium'

/**
 * Tek bir teşhis bulgusu. `fixSnippet` ürünün farklılaştırıcısı:
 * öneri metni değil, doğrudan kopyalanabilir düzeltme.
 */
export interface CwvFinding {
  readonly metric: CwvMetricName
  readonly severity: FindingSeverity
  /** Hangi faz/sebep suçlandı — rapor ve testler için kararlı kimlik */
  readonly phase: string
  /** Fazın metrik içindeki payı (0..1); faz bazlı olmayan bulgularda null */
  readonly phaseShare: number | null
  /** Suçlu elementin CSS seçicisi — biliniyorsa */
  readonly culpritSelector: string | null
  readonly title: string
  readonly explanation: string
  readonly fixSnippet: string | null
}

export interface CwvDiagnosis {
  readonly url: string
  readonly source: CwvSource
  readonly ratings: Readonly<Partial<Record<CwvMetricName, CwvRating>>>
  readonly findings: readonly CwvFinding[]
}

const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
}

/** Önce ciddiyet, eşitlikte büyük pay önce — sıralama her rapor yüzeyinde aynı olsun. */
export const sortFindings = (findings: readonly CwvFinding[]): readonly CwvFinding[] =>
  [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.phaseShare ?? 0) - (a.phaseShare ?? 0),
  )

export const percentLabel = (share: number): string => `%${Math.round(share * 100)}`
