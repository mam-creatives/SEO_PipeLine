import { rateMetric, type CwvMetricName, type CwvRating } from '../../core/cwv.js'
import type { TechAudit } from '../../core/types.js'
import { diagnoseCls } from './clsRules.js'
import { diagnoseInp } from './inpRules.js'
import { diagnoseLcp } from './lcpRules.js'
import { sortFindings, type CwvDiagnosis } from './types.js'

/**
 * Bir sayfa denetimini teşhise çevirir.
 *
 * attribution yoksa (eski kayıt veya attribution üretemeyen sağlayıcı) null döner —
 * uydurma teşhis üretmektense hiç üretmemek doğru.
 *
 * INP yalnızca `attribution.inp` doluysa değerlendirilir: lab araçları INP ölçemez,
 * gerçek etkileşim gerekir. Lab denetiminde INP raporlamak yanıltıcı olurdu.
 */
export const diagnoseCwv = (audit: TechAudit): CwvDiagnosis | null => {
  const attribution = audit.attribution
  if (attribution === undefined || attribution === null) return null

  const findings = [
    ...(attribution.lcp === null ? [] : diagnoseLcp(audit.lcpMs, attribution.lcp, attribution.ttfb)),
    ...(attribution.inp === null ? [] : diagnoseInp(audit.inpMs, attribution.inp)),
    ...(attribution.cls === null ? [] : diagnoseCls(audit.cls, attribution.cls)),
  ]

  const ratings: Partial<Record<CwvMetricName, CwvRating>> = {
    LCP: rateMetric('LCP', audit.lcpMs),
    CLS: rateMetric('CLS', audit.cls),
    ...(attribution.inp === null ? {} : { INP: rateMetric('INP', audit.inpMs) }),
    ...(attribution.lcp === null ? {} : { TTFB: rateMetric('TTFB', attribution.lcp.timeToFirstByte) }),
  }

  return {
    url: audit.url,
    source: attribution.source,
    ratings,
    findings: sortFindings(findings),
  }
}
