import { z } from 'zod'
import { ProviderError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import { fetchWithRetry } from '../../core/retry.js'
import type { GscRow } from '../../core/types.js'
import type { SearchConsoleProvider } from '../types.js'
import type { GscAuth } from './gscAuth.js'

const PROVIDER_NAME = 'google-search-console'
const SITES_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites'
const REQUEST_TIMEOUT_MS = 60_000

const DAY_MS = 86_400_000
/** GSC verisi birkaç gün gecikmeli gelir; son günler eksik görünür. */
const GSC_DATA_LAG_DAYS = 3
const GSC_WINDOW_DAYS = 28
const ROW_LIMIT = 250

export const GscResponseSchema = z.object({
  rows: z
    .array(
      z.object({
        keys: z.array(z.string()),
        clicks: z.number(),
        impressions: z.number(),
        ctr: z.number(),
        position: z.number(),
      }),
    )
    .optional(),
})

export const buildGscQueryEndpoint = (siteUrl: string): string =>
  `${SITES_ENDPOINT}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

export const buildGscRequestBody = (startDate: string, endDate: string): string =>
  JSON.stringify({ startDate, endDate, dimensions: ['query', 'page'], rowLimit: ROW_LIMIT })

const toIsoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Son 28 günlük pencere, veri gecikmesi düşülerek. Saf fonksiyon — test edilebilir. */
export const buildDateRange = (
  now: number = Date.now(),
): { readonly startDate: string; readonly endDate: string } => {
  const endMs = now - GSC_DATA_LAG_DAYS * DAY_MS
  return { startDate: toIsoDate(endMs - (GSC_WINDOW_DAYS - 1) * DAY_MS), endDate: toIsoDate(endMs) }
}

/** GSC yanıtı → GscRow[]. Saf fonksiyon. */
export const gscResponseToRows = (raw: unknown): Result<readonly GscRow[], ProviderError> => {
  const parsed = GscResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return err(new ProviderError(PROVIDER_NAME, `Yanıt beklenen şemaya uymuyor: ${parsed.error.message}`))
  }
  return ok(
    (parsed.data.rows ?? []).flatMap((row): GscRow[] => {
      const query = row.keys[0]
      // page (keys[1]) beklenen ikinci boyut — yoksa satır atlanır, tıpkı query eksikliğinde olduğu gibi.
      const page = row.keys[1]
      if (query === undefined || page === undefined) return []
      return [
        {
          query,
          page,
          clicks: row.clicks,
          impressions: row.impressions,
          // Mock ile aynı yuvarlama; farklı olsa diff motoru sahte delta üretirdi.
          ctr: Number(row.ctr.toFixed(4)),
          avgPosition: row.position,
        },
      ]
    }),
  )
}

/**
 * Google Search Console sağlayıcısı — pipeline'ın tek ölçülmüş (tahmin olmayan)
 * veri kaynağı. Yalnız kendi/müşteri siteniz için çalışır; rakip verisi alınamaz.
 *
 * `auth` dışarıdan (registry.ts) enjekte edilir: `gscUrlInspectionProvider.ts` ile
 * AYNI `GscAuth` örneğini paylaşmalı, yoksa her çalıştırmada iki ayrı OAuth turu atılır.
 *
 * Servis hesabı Search Console'da ilgili mülke eklenmemişse hata döner. GSC omurga
 * dalı değil, çalıştırma devam eder; hata raporda FailedBranch olarak görünür.
 */
export const createGscProvider = (auth: GscAuth): SearchConsoleProvider => ({
  name: PROVIDER_NAME,
  isMock: false,
  fetchPerformance: async (domain: string): Promise<Result<readonly GscRow[], ProviderError>> => {
    try {
      const token = await auth.getAccessToken()
      if (!token.ok) return token

      const siteUrl = await auth.resolveSiteUrl(token.value, domain)
      if (!siteUrl.ok) return siteUrl

      const range = buildDateRange()
      const response = await fetchWithRetry(buildGscQueryEndpoint(siteUrl.value), () => ({
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
        body: buildGscRequestBody(range.startDate, range.endDate),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }))
      if (!response.ok) {
        return err(
          new ProviderError(
            PROVIDER_NAME,
            `'${siteUrl.value}' sorgusu ${response.status} döndü (${range.startDate} → ${range.endDate}).`,
          ),
        )
      }
      return gscResponseToRows(await response.json())
    } catch (cause) {
      return err(new ProviderError(PROVIDER_NAME, `'${domain}' için GSC çağrısı başarısız.`, { cause }))
    }
  },
})
