import { z } from 'zod'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { FieldCwv } from '../../core/types.js'
import type { CruxProvider } from '../types.js'

const PROVIDER_NAME = 'crux'
const QUERY_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord'
const REQUEST_TIMEOUT_MS = 30_000
/** Cihaz bazlı sorgu yok — tek çağrı, toplu (ALL_FORM_FACTORS). Şema ileride kırılıma açık. */
const FORM_FACTOR = 'ALL_FORM_FACTORS'

/**
 * `p75` çoğu metrikte number, ama `cumulative_layout_shift`'te STRING gelir
 * (ör. "0.00") — ondalık hassasiyeti korumak için. Gerçek mamcreatives.com
 * yanıtına karşı doğrulandı. z.coerce.number() ikisini de doğru ele alır.
 */
const MetricSchema = z
  .object({
    percentiles: z.object({ p75: z.coerce.number() }).passthrough(),
  })
  .passthrough()

/**
 * CrUX yanıtının yalnız tükettiğimiz kısmı. Her metrik anahtarı opsiyonel: bir kayıt
 * bulunsa bile tek tek metrikler yetersiz trafikte sessizce eksik gelebilir
 * (ör. LCP verisi var ama INP henüz yeterli örnek toplamamış).
 */
export const CruxResponseSchema = z
  .object({
    record: z
      .object({
        metrics: z
          .object({
            largest_contentful_paint: MetricSchema.optional(),
            interaction_to_next_paint: MetricSchema.optional(),
            cumulative_layout_shift: MetricSchema.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const buildCruxRequestBody = (key: 'url' | 'origin', value: string): string =>
  JSON.stringify({ [key]: value })

/** CrUX yanıtı → FieldCwv. Saf fonksiyon, ağ olmadan test edilir. 404 burada ele alınmaz — I/O katmanının işi. */
export const cruxResponseToFieldCwv = (raw: unknown, url: string): Result<FieldCwv, ProviderError> => {
  const parsed = CruxResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      new ProviderError(PROVIDER_NAME, `Yanıt beklenen şemaya uymuyor ('${url}'): ${summarizeZodError(parsed.error.issues)}`),
    )
  }
  const metrics = parsed.data.record?.metrics
  if (metrics === undefined) {
    return err(new ProviderError(PROVIDER_NAME, `'${url}' için metrics alanı yok — CrUX yanıtı beklenmeyen biçimde.`))
  }
  return ok({
    url,
    formFactor: FORM_FACTOR,
    lcpMs: metrics.largest_contentful_paint?.percentiles.p75 ?? null,
    inpMs: metrics.interaction_to_next_paint?.percentiles.p75 ?? null,
    cls: metrics.cumulative_layout_shift?.percentiles.p75 ?? null,
  })
}

/** Tek bir CrUX sorgusu; 404'ü ayrı bir durum olarak ('not-found') taşır — hata değil, veri yok demektir. */
const queryOnce = async (
  apiKey: string,
  key: 'url' | 'origin',
  value: string,
): Promise<Result<FieldCwv, ProviderError> | 'not-found'> => {
  try {
    const response = await fetch(`${QUERY_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildCruxRequestBody(key, value),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status === 404) return 'not-found'
    if (!response.ok) {
      return err(new ProviderError(PROVIDER_NAME, `'${value}' sorgusu ${response.status} döndü.`))
    }
    return cruxResponseToFieldCwv(await response.json(), value)
  } catch (cause) {
    return err(new ProviderError(PROVIDER_NAME, `'${value}' için CrUX çağrısı başarısız.`, { cause }))
  }
}

/**
 * CrUX (Chrome UX Report) sağlayıcısı — gerçek kullanıcı p75 alan verisi, rakipler dahil.
 * Sayfa (`url` anahtarı) yeterli trafiğe sahip değilse origin (`origin` anahtarı) ile
 * tekrar denenir — daha az trafikli tek sayfalar yerine site geneli genelde veri taşır.
 * İkisi de 404 dönerse `ok(null)`: bu bir hata değil, "bu site/sayfa için CrUX'ta yeterli
 * veri yok" demektir — küçük sitelerde beklenen bir durumdur, sessizce boş bırakılmaz.
 */
export const createCruxProvider = (apiKey: string): CruxProvider => ({
  name: PROVIDER_NAME,
  isMock: false,
  fetchFieldCwv: async (url: string): Promise<Result<FieldCwv | null, ProviderError>> => {
    const urlAttempt = await queryOnce(apiKey, 'url', url)
    if (urlAttempt !== 'not-found') return urlAttempt

    const origin = new URL(url).origin
    const originAttempt = await queryOnce(apiKey, 'origin', origin)
    if (originAttempt === 'not-found') return ok(null)
    return originAttempt
  },
})
