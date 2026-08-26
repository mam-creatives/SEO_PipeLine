import { z } from 'zod'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { IndexStatus } from '../../core/types.js'
import type { IndexingProvider } from '../types.js'
import type { GscAuth } from './gscAuth.js'

const PROVIDER_NAME = 'gsc-url-inspection'
const INSPECT_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const REQUEST_TIMEOUT_MS = 30_000

/**
 * `indexStatusResult` şeması Google'ın resmi Search Console API v1 dokümantasyonundan
 * (bu proje bu turda canlı bir GSC servis hesabına erişemedi — .env'de GSC anahtarları
 * yok — bu yüzden gerçek yanıta karşı DOĞRULANAMADI. Diğer sağlayıcılarda kurulan
 * "tahmine göre değil gerçek yanıta göre yaz" ilkesinin istisnası; ilk canlı koşuda
 * doğrulanmalı. `inspectionResult` içindeki `mobileUsabilityResult`/`richResultsResult`/
 * `ampResult` bilerek okunmuyor — faz1.md yalnız `indexStatusResult`'ı istiyor.
 */
const IndexStatusResultSchema = z
  .object({
    coverageState: z.string().optional(),
    robotsTxtState: z.string().optional(),
    indexingState: z.string().optional(),
    pageFetchState: z.string().optional(),
    googleCanonical: z.string().optional(),
    userCanonical: z.string().optional(),
    lastCrawlTime: z.string().optional(),
  })
  .passthrough()

const InspectionResponseSchema = z
  .object({
    inspectionResult: z
      .object({
        indexStatusResult: IndexStatusResultSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const buildInspectRequestBody = (inspectionUrl: string, siteUrl: string): string =>
  JSON.stringify({ inspectionUrl, siteUrl, languageCode: 'tr-TR' })

/** URL Inspection yanıtı → IndexStatus. Saf fonksiyon, ağ olmadan test edilir. */
export const inspectionResponseToIndexStatus = (raw: unknown, url: string): Result<IndexStatus, ProviderError> => {
  const parsed = InspectionResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      new ProviderError(PROVIDER_NAME, `Yanıt beklenen şemaya uymuyor ('${url}'): ${summarizeZodError(parsed.error.issues)}`),
    )
  }

  const result = parsed.data.inspectionResult?.indexStatusResult
  if (result === undefined) {
    return err(new ProviderError(PROVIDER_NAME, `'${url}' için indexStatusResult yok — inceleme sonucu eksik.`))
  }

  return ok({
    url,
    coverageState: result.coverageState ?? 'bilinmiyor',
    robotsTxtState: result.robotsTxtState ?? 'ROBOTS_TXT_STATE_UNSPECIFIED',
    indexingState: result.indexingState ?? 'INDEXING_STATE_UNSPECIFIED',
    pageFetchState: result.pageFetchState ?? 'PAGE_FETCH_STATE_UNSPECIFIED',
    googleCanonical: result.googleCanonical ?? null,
    userCanonical: result.userCanonical ?? null,
    lastCrawlTime: result.lastCrawlTime ?? null,
  })
}

/**
 * GSC URL Inspection sağlayıcısı — indeksleme durumu, canonical seçimi, robots durumu.
 * Yeni anahtar gerektirmez: `webmasters.readonly` scope'u searchAnalytics ile aynı.
 * Kota: mülk başına günde 2000 sorgu — `MAX_AUDIT_URLS` ile sorun çıkmaz.
 *
 * Yalnız servis hesabının erişebildiği mülke ait URL'ler için çalışır; rakip URL'i
 * verilirse `resolveSiteUrl` hata döner (registry/collectors bunu client URL'leriyle
 * sınırlı tutuyor, ama sağlayıcı seviyesinde de aynı garanti geçerli).
 */
export const createGscUrlInspectionProvider = (auth: GscAuth): IndexingProvider => ({
  name: PROVIDER_NAME,
  isMock: false,
  fetchIndexStatus: async (url: string): Promise<Result<IndexStatus, ProviderError>> => {
    try {
      const token = await auth.getAccessToken()
      if (!token.ok) return token

      const siteUrl = await auth.resolveSiteUrl(token.value, url)
      if (!siteUrl.ok) return siteUrl

      const response = await fetch(INSPECT_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
        body: buildInspectRequestBody(url, siteUrl.value),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        const hint =
          response.status === 403 ? ' (servis hesabının bu mülke erişimi yok ya da Search Console API etkin değil)' : ''
        return err(new ProviderError(PROVIDER_NAME, `'${url}' incelenemedi (${response.status})${hint}.`))
      }
      return inspectionResponseToIndexStatus(await response.json(), url)
    } catch (cause) {
      return err(new ProviderError(PROVIDER_NAME, `'${url}' için URL Inspection çağrısı başarısız.`, { cause }))
    }
  },
})
