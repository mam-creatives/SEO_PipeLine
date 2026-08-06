import { z } from 'zod'
import type {
  ClsAttribution,
  CwvAttribution,
  InpAttribution,
  LcpAttribution,
  TtfbAttribution,
} from '../core/cwv.js'
import { StorageError } from '../core/errors.js'
import type { TechAudit } from '../core/types.js'
import type { Db } from '../storage/db.js'

/** Bu sayıdan az örnekle alan verisi güvenilir değildir — gürültüyü rapor etmeyiz. */
export const MIN_RUM_SAMPLES = 5

/**
 * Tarayıcıdan gelen yük. Alan adları web-vitals Metric nesnesiyle birebir aynıdır;
 * `attribution` doğrudan kütüphanenin attribution build çıktısıdır.
 */
export const RumSampleSchema = z.object({
  url: z.string().url(),
  metric: z.enum(['LCP', 'INP', 'CLS', 'TTFB']),
  value: z.number().finite().nonnegative(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  navigationType: z.string().optional().nullable(),
  attribution: z.unknown().optional().nullable(),
})

export const RumPayloadSchema = z.array(RumSampleSchema).min(1).max(50)

export type RumSample = z.infer<typeof RumSampleSchema>

export const insertRumSamples = (db: Db, samples: readonly RumSample[]): void => {
  const stmt = db.prepare(
    `INSERT INTO rum_samples (receivedAt, url, metric, value, rating, navigationType, attribution)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const receivedAt = new Date().toISOString()
  try {
    db.transaction(() => {
      for (const sample of samples) {
        stmt.run(
          receivedAt,
          sample.url,
          sample.metric,
          sample.value,
          sample.rating,
          sample.navigationType ?? null,
          JSON.stringify(sample.attribution ?? null),
        )
      }
    })()
  } catch (cause) {
    throw new StorageError('RUM örnekleri kaydedilemedi', { cause })
  }
}

interface MetricRow {
  readonly value: number
  readonly attribution: string
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/**
 * Google Core Web Vitals'ı 75. persentil ile değerlendirir — ortalama değil.
 * Temsilci attribution da aynı indeksteki örnekten alınır ki sayı ile açıklama tutarlı olsun.
 */
const percentile75 = (rows: readonly MetricRow[]): MetricRow | null => {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.value - b.value)
  const index = Math.max(0, Math.ceil(0.75 * sorted.length) - 1)
  return sorted[index] ?? null
}

const readMetric = (db: Db, url: string, metric: string): MetricRow | null => {
  const rows = db
    .prepare(`SELECT value, attribution FROM rum_samples WHERE url = ? AND metric = ?`)
    .all(url, metric) as MetricRow[]
  return rows.length < MIN_RUM_SAMPLES ? null : percentile75(rows)
}

const parseJson = (raw: string): Record<string, unknown> => {
  try {
    return asRecord(JSON.parse(raw))
  } catch {
    return {}
  }
}

const toLcpAttribution = (raw: Record<string, unknown>): LcpAttribution | null =>
  Object.keys(raw).length === 0
    ? null
    : {
        target: str(raw['target']),
        url: str(raw['url']),
        timeToFirstByte: num(raw['timeToFirstByte']),
        resourceLoadDelay: num(raw['resourceLoadDelay']),
        resourceLoadDuration: num(raw['resourceLoadDuration']),
        elementRenderDelay: num(raw['elementRenderDelay']),
      }

const toInpAttribution = (raw: Record<string, unknown>): InpAttribution | null => {
  if (Object.keys(raw).length === 0) return null
  const longestScript = asRecord(raw['longestScript'])
  const interactionType = str(raw['interactionType'])
  return {
    interactionTarget: str(raw['interactionTarget']),
    interactionType: interactionType === 'pointer' || interactionType === 'keyboard' ? interactionType : null,
    inputDelay: num(raw['inputDelay']),
    processingDuration: num(raw['processingDuration']),
    presentationDelay: num(raw['presentationDelay']),
    longestScriptUrl: str(longestScript['sourceUrl'] ?? longestScript['url']),
    longestScriptDuration: 'duration' in longestScript ? num(longestScript['duration']) : null,
  }
}

const toClsAttribution = (raw: Record<string, unknown>): ClsAttribution | null =>
  Object.keys(raw).length === 0
    ? null
    : {
        largestShiftTarget: str(raw['largestShiftTarget']),
        largestShiftValue: num(raw['largestShiftValue']),
        largestShiftTime: num(raw['largestShiftTime']),
        loadState: str(raw['loadState']),
      }

const toTtfbAttribution = (raw: Record<string, unknown>): TtfbAttribution | null =>
  Object.keys(raw).length === 0
    ? null
    : {
        waitingDuration: num(raw['waitingDuration']),
        cacheDuration: num(raw['cacheDuration']),
        dnsDuration: num(raw['dnsDuration']),
        connectionDuration: num(raw['connectionDuration']),
        requestDuration: num(raw['requestDuration']),
      }

/**
 * Bir URL için toplanmış RUM verisinden alan (field) kaynaklı TechAudit üretir.
 * Yeterli örnek yoksa null döner — az veriden teşhis üretmek yanıltıcı olurdu.
 *
 * Lab denetiminden farkı: INP burada GERÇEKTİR (gerçek kullanıcı etkileşimi).
 */
export const readFieldAudit = (db: Db, url: string): TechAudit | null => {
  const lcp = readMetric(db, url, 'LCP')
  const inp = readMetric(db, url, 'INP')
  const cls = readMetric(db, url, 'CLS')
  const ttfb = readMetric(db, url, 'TTFB')
  if (lcp === null && inp === null && cls === null) return null

  const attribution: CwvAttribution = {
    source: 'field',
    lcp: lcp === null ? null : toLcpAttribution(parseJson(lcp.attribution)),
    inp: inp === null ? null : toInpAttribution(parseJson(inp.attribution)),
    cls: cls === null ? null : toClsAttribution(parseJson(cls.attribution)),
    ttfb: ttfb === null ? null : toTtfbAttribution(parseJson(ttfb.attribution)),
  }

  return {
    url,
    lcpMs: lcp?.value ?? 0,
    inpMs: inp?.value ?? 0,
    cls: cls?.value ?? 0,
    // Alan verisinde Lighthouse benzeri bileşik skor yoktur; 0 "hesaplanmadı" demektir.
    performanceScore: 0,
    issues: [],
    attribution,
  }
}

export const countRumSamples = (db: Db): number =>
  (db.prepare(`SELECT COUNT(*) AS total FROM rum_samples`).get() as { total: number }).total
