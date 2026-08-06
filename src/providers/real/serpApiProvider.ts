import { z } from 'zod'
import { TOP_N_SERP } from '../../config/constants.js'
import { ProviderError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import { extractRootDomain } from '../../core/text.js'
import type { SerpSnapshot } from '../../core/types.js'
import type { SerpProvider } from '../types.js'

const PROVIDER_NAME = 'serpapi'
const SERPAPI_BASE_URL = 'https://serpapi.com/search.json'
const REQUEST_TIMEOUT_MS = 60_000

/**
 * SerpApi yanıtının yalnız tükettiğimiz kısmı. `organic_results` opsiyonel:
 * anahtarın hiç olmaması yapısal bir sorundur (sert hata), boş dizi olması ise
 * meşru "sonuç yok" durumudur — ikisi ayrı ele alınır.
 */
export const SerpApiResponseSchema = z.object({
  error: z.string().optional(),
  organic_results: z
    .array(
      z.object({
        position: z.number().optional(),
        link: z.string(),
        displayed_link: z.string().optional(),
      }),
    )
    .optional(),
  answer_box: z.unknown().optional(),
  ai_overview: z.unknown().optional(),
})

export const buildSerpApiUrl = (apiKey: string, keyword: string): string => {
  const params = new URLSearchParams({
    engine: 'google',
    q: keyword,
    google_domain: 'google.com.tr',
    gl: 'tr',
    hl: 'tr',
    num: String(TOP_N_SERP),
    api_key: apiKey,
  })
  return `${SERPAPI_BASE_URL}?${params.toString()}`
}

/**
 * SerpApi yanıtı → SerpSnapshot. Saf fonksiyon, ağ olmadan test edilir.
 *
 * Pozisyonlar SerpApi'nin kendi `position` alanından DEĞİL, dizi sırasından
 * yeniden numaralandırılır: reklam/SERP özellikleri yüzünden o alanda boşluk
 * olabiliyor ve `UNIQUE(runId, keyword, position)` kısıtı yinelenen değeri kaldırmaz.
 */
export const serpApiResponseToSnapshot = (raw: unknown, keyword: string): Result<SerpSnapshot, ProviderError> => {
  const parsed = SerpApiResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return err(
      new ProviderError(PROVIDER_NAME, `Yanıt beklenen şemaya uymuyor ('${keyword}'): ${parsed.error.message}`),
    )
  }
  if (parsed.data.error !== undefined) {
    return err(new ProviderError(PROVIDER_NAME, `SerpApi hata döndü ('${keyword}'): ${parsed.data.error}`))
  }
  if (parsed.data.organic_results === undefined) {
    // Alanın hiç olmaması yapısal sorundur; boş SERP kaydetmek diff motorunda
    // "tüm keyword'ler top 10'dan düştü" gibi sahte bir alarm üretirdi.
    return err(new ProviderError(PROVIDER_NAME, `Yanıtta organic_results yok ('${keyword}') — sonuç güvenilir değil.`))
  }

  const entries = parsed.data.organic_results.slice(0, TOP_N_SERP).map((result, index) => ({
    position: index + 1,
    domain: extractRootDomain(result.link),
    url: result.link,
  }))

  return ok({
    keyword,
    entries,
    hasFeaturedSnippet: parsed.data.answer_box !== undefined,
    hasAiOverview: parsed.data.ai_overview !== undefined,
  })
}

/** SerpApi Google SERP sağlayıcısı. Ücretsiz kota: 250 arama/ay. */
export const createSerpApiProvider = (apiKey: string): SerpProvider => ({
  name: PROVIDER_NAME,
  isMock: false,
  fetchSerp: async (keyword: string): Promise<Result<SerpSnapshot, ProviderError>> => {
    try {
      const response = await fetch(buildSerpApiUrl(apiKey, keyword), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        const hint =
          response.status === 401
            ? ' (anahtar geçersiz)'
            : response.status === 429
              ? ' (aylık kota bitmiş olabilir)'
              : ''
        return err(new ProviderError(PROVIDER_NAME, `'${keyword}' için SerpApi ${response.status} döndü${hint}.`))
      }
      return serpApiResponseToSnapshot(await response.json(), keyword)
    } catch (cause) {
      return err(new ProviderError(PROVIDER_NAME, `'${keyword}' için SerpApi çağrısı başarısız.`, { cause }))
    }
  },
})
