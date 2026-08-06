import { z } from 'zod'

/**
 * Lighthouse `lhr` (LighthouseResult) şeması — PageSpeed Insights API'sinin
 * `lighthouseResult` alanı da BİREBİR aynı yapıdır, bu yüzden tek şema iki kaynağa hizmet eder.
 *
 * Doğrulama iki kademeli:
 *  - Çekirdek metrikler ZORUNLU: yoksa sert hata (sessizce boş denetim üretilmez).
 *  - Insight audit'leri OPSİYONEL: Lighthouse sürümleri arası yeniden adlandırılıyor
 *    (v13'te `largest-contentful-paint-element` → `lcp-breakdown-insight` oldu).
 *    Eksikse attribution null kalır ve rapor bunu açıkça söyler.
 */

const AuditSchema = z
  .object({
    id: z.string().optional(),
    score: z.number().nullable().optional(),
    numericValue: z.number().optional(),
    displayValue: z.string().optional(),
    details: z.unknown().optional(),
  })
  .passthrough()

export const LighthouseResultSchema = z
  .object({
    lighthouseVersion: z.string().optional(),
    requestedUrl: z.string().optional(),
    finalDisplayedUrl: z.string().optional(),
    categories: z.object({
      performance: z.object({ score: z.number().nullable() }),
    }),
    audits: z.record(AuditSchema),
  })
  .passthrough()

export type LighthouseResult = z.infer<typeof LighthouseResultSchema>
export type LighthouseAudits = LighthouseResult['audits']

/** Lighthouse details ağacındaki bir DOM düğümü — suçlu elementin seçicisini taşır. */
export interface LhNodeDetail {
  readonly type: 'node'
  readonly selector?: string
  readonly snippet?: string
  readonly nodeLabel?: string
}

/** lcp-breakdown-insight içindeki faz satırı. `subpart` adları web-vitals ile aynıdır. */
export interface LhSubpartRow {
  readonly subpart: string
  readonly label?: string
  readonly duration: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const isNodeDetail = (value: unknown): value is LhNodeDetail =>
  isRecord(value) && value['type'] === 'node'

export const isSubpartRow = (value: unknown): value is LhSubpartRow =>
  isRecord(value) && typeof value['subpart'] === 'string' && typeof value['duration'] === 'number'

/** `details.items` dizisini güvenle çıkarır — yapı beklenenden farklıysa boş dizi. */
export const detailItems = (details: unknown): readonly unknown[] => {
  if (!isRecord(details)) return []
  const items = details['items']
  return Array.isArray(items) ? items : []
}

export const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {})

export const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null
