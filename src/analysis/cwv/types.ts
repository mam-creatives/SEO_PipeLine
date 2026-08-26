import type { CwvMetricName, CwvRating, CwvSource } from '../../core/cwv.js'
import type { Finding } from '../../core/findings.js'

export type { FindingSeverity, FindingEffort } from '../../core/findings.js'
export { estimateImpact, percentLabel, sortFindings } from '../../core/findings.js'

/**
 * CWV'ye özgü bulgu — genel `Finding`'in daraltılmış alt tipi (`category: 'cwv'`,
 * `metric`/`phase`/`phaseShare` zorunlu). Alan listesi genel modelle aynı; burada
 * yalnız CWV kurallarının her zaman doldurduğu üç alan zorunlu hale getiriliyor.
 */
export interface CwvFinding extends Finding {
  readonly category: 'cwv'
  readonly metric: CwvMetricName
  /** Hangi faz/sebep suçlandı — rapor ve testler için kararlı kimlik */
  readonly phase: string
  /** Fazın metrik içindeki payı (0..1); faz bazlı olmayan bulgularda null */
  readonly phaseShare: number | null
}

export interface CwvDiagnosis {
  readonly url: string
  readonly source: CwvSource
  readonly ratings: Readonly<Partial<Record<CwvMetricName, CwvRating>>>
  readonly findings: readonly CwvFinding[]
}
