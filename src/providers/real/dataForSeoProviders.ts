import { z } from 'zod'
import { ProviderError, summarizeZodError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { BacklinkProfile, KeywordGap, KeywordMetric } from '../../core/types.js'
import type { BacklinkProvider, KeywordGapProvider, KeywordProvider } from '../types.js'

const KEYWORD_PROVIDER_NAME = 'dataforseo-keywords'
const BACKLINK_PROVIDER_NAME = 'dataforseo-backlinks'
const KEYWORD_GAP_PROVIDER_NAME = 'dataforseo-keyword-gap'
const REQUEST_TIMEOUT_MS = 60_000
/** Rakip başına dönecek keyword üst sınırı — DataForSEO maliyetini sınırlar (Faz 4.4). */
const KEYWORD_GAP_LIMIT_PER_COMPETITOR = 20

export const DATAFORSEO_KEYWORD_ENDPOINT =
  'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live'
export const DATAFORSEO_BACKLINK_ENDPOINT = 'https://api.dataforseo.com/v3/backlinks/summary/live'
/**
 * DataForSEO Labs — iki domain'in SERP'te kesişimi. `intersections: false` + client-side
 * filtre (first_domain_serp_element null, second dolu) "rakipte var, sende yok" listesini verir.
 * DİKKAT: alan adları DataForSEO'nun dokümante ettiği Labs API şemasının en iyi tahminidir,
 * bu oturumda CANLI doğrulanamadı (bakiye boş) — bkz. dataForSeoResponseToKeywordGaps yorumu.
 */
export const DATAFORSEO_KEYWORD_GAP_ENDPOINT =
  'https://api.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live'

/** DataForSEO konum kodu: 2792 = Türkiye */
export const TURKEY_LOCATION_CODE = 2792
export const TURKISH_LANGUAGE_CODE = 'tr'

/** DataForSEO `rank` alanı 0..1000 ölçeğinde; domainAuthority 0..100 bekliyor. */
const RANK_TO_AUTHORITY_DIVISOR = 10

const DATAFORSEO_OK = 20000
const DATAFORSEO_UNVERIFIED = 40104

/**
 * Zarf şeması. DataForSEO HTTP 200 dönerken bile gövdede hata taşıyabilir
 * (`status_code` 20000 dışında), bu yüzden gövde ayrıca kontrol edilir.
 */
const EnvelopeSchema = z.object({
  status_code: z.number(),
  status_message: z.string().optional(),
  tasks: z
    .array(
      z.object({
        status_code: z.number().optional(),
        status_message: z.string().optional(),
        result: z.unknown().nullable().optional(),
      }),
    )
    .optional(),
})

/**
 * DİKKAT: `competition` sayı DEĞİL, string enum ("LOW"/"MEDIUM"/"HIGH").
 * Sayısal karşılığı ayrı alanda: `competition_index` 0..100.
 * Şema başta sayı beklediği için tüm keyword dalı düşüyordu.
 */
const KeywordResultSchema = z.array(
  z.object({
    keyword: z.string(),
    search_volume: z.number().nullable().optional(),
    competition: z.string().nullable().optional(),
    competition_index: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
  }),
)

/** `competition_index` yoksa string enum'dan makul bir yaklaşıklık üret. */
const COMPETITION_ENUM_TO_DIFFICULTY: Readonly<Record<string, number>> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.85,
}

const toDifficulty = (index: number | null | undefined, label: string | null | undefined): number => {
  if (typeof index === 'number') return Math.min(Math.max(index / 100, 0), 1)
  return label === null || label === undefined ? 0 : (COMPETITION_ENUM_TO_DIFFICULTY[label.toUpperCase()] ?? 0)
}

const BacklinkResultSchema = z.array(
  z.object({
    target: z.string().optional(),
    referring_domains: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    rank: z.number().nullable().optional(),
  }),
)

export const buildBasicAuthHeader = (login: string, password: string): string =>
  `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`

export const buildKeywordRequestBody = (keywords: readonly string[]): string =>
  JSON.stringify([
    { keywords: [...keywords], location_code: TURKEY_LOCATION_CODE, language_code: TURKISH_LANGUAGE_CODE },
  ])

export const buildBacklinkRequestBody = (domain: string): string =>
  JSON.stringify([{ target: domain, internal_list_limit: 1 }])

export const buildKeywordGapRequestBody = (domain: string, competitorDomain: string): string =>
  JSON.stringify([
    {
      target1: domain,
      target2: competitorDomain,
      location_code: TURKEY_LOCATION_CODE,
      language_code: TURKISH_LANGUAGE_CODE,
      intersections: false,
      limit: KEYWORD_GAP_LIMIT_PER_COMPETITOR,
    },
  ])

const SerpElementSchema = z.object({ rank_absolute: z.number().nullable().optional() })

const KeywordGapResultSchema = z.object({
  items: z
    .array(
      z.object({
        keyword_data: z
          .object({
            keyword: z.string(),
            keyword_info: z.object({ search_volume: z.number().nullable().optional() }).optional(),
          })
          .optional(),
        first_domain_serp_element: SerpElementSchema.nullable().optional(),
        second_domain_serp_element: SerpElementSchema.nullable().optional(),
      }),
    )
    .optional(),
})

/** Zarfı doğrular ve ilk görevin `result` alanını çıkarır. */
const extractResult = (raw: unknown, providerName: string): Result<unknown, ProviderError> => {
  const parsed = EnvelopeSchema.safeParse(raw)
  if (!parsed.success) {
    return err(new ProviderError(providerName, `Yanıt beklenen şemaya uymuyor: ${summarizeZodError(parsed.error.issues)}`))
  }
  if (parsed.data.status_code !== DATAFORSEO_OK) {
    const hint =
      parsed.data.status_code === DATAFORSEO_UNVERIFIED
        ? ' — hesabı app.dataforseo.com panelinden doğrulamanız gerekiyor'
        : ''
    return err(
      new ProviderError(
        providerName,
        `DataForSEO ${parsed.data.status_code}: ${parsed.data.status_message ?? 'bilinmeyen hata'}${hint}`,
      ),
    )
  }
  const task = parsed.data.tasks?.[0]
  if (task === undefined) {
    return err(new ProviderError(providerName, 'Yanıtta görev yok.'))
  }
  if (task.status_code !== undefined && task.status_code !== DATAFORSEO_OK) {
    return err(
      new ProviderError(providerName, `Görev hatası ${task.status_code}: ${task.status_message ?? 'bilinmeyen'}`),
    )
  }
  return ok(task.result ?? null)
}

/**
 * Keyword yanıtı → KeywordMetric[]. Saf fonksiyon.
 *
 * **Kardinalite korunur:** DataForSEO veri bulamadığı keyword'ü yanıttan tamamen
 * atar, ama aşağı akıştaki kod (kümeleme, fırsat skoru) girdiyle 1:1 eşleşme
 * bekliyor. Bulunmayan keyword `volume: 0` ile döner — bu "ölçülebilir arama
 * hacmi yok" demektir, uydurma bir değer değil.
 */
export const dataForSeoResponseToMetrics = (
  raw: unknown,
  keywords: readonly string[],
): Result<readonly KeywordMetric[], ProviderError> => {
  const extracted = extractResult(raw, KEYWORD_PROVIDER_NAME)
  if (!extracted.ok) return extracted

  const parsed = KeywordResultSchema.safeParse(extracted.value ?? [])
  if (!parsed.success) {
    return err(new ProviderError(KEYWORD_PROVIDER_NAME, `Keyword sonucu okunamadı: ${summarizeZodError(parsed.error.issues)}`))
  }

  const byKeyword = new Map(parsed.data.map((row) => [row.keyword.toLocaleLowerCase('tr-TR'), row]))
  return ok(
    keywords.map((keyword) => {
      const row = byKeyword.get(keyword.toLocaleLowerCase('tr-TR'))
      return {
        keyword,
        volume: row?.search_volume ?? 0,
        difficulty: toDifficulty(row?.competition_index, row?.competition),
        cpc: row?.cpc ?? 0,
      }
    }),
  )
}

/** Backlink yanıtı → BacklinkProfile. Saf fonksiyon. */
export const dataForSeoResponseToBacklinkProfile = (
  raw: unknown,
  domain: string,
): Result<BacklinkProfile, ProviderError> => {
  const extracted = extractResult(raw, BACKLINK_PROVIDER_NAME)
  if (!extracted.ok) return extracted

  const parsed = BacklinkResultSchema.safeParse(extracted.value ?? [])
  if (!parsed.success) {
    return err(new ProviderError(BACKLINK_PROVIDER_NAME, `Backlink sonucu okunamadı: ${summarizeZodError(parsed.error.issues)}`))
  }
  const row = parsed.data[0]
  if (row === undefined) {
    return err(new ProviderError(BACKLINK_PROVIDER_NAME, `'${domain}' için backlink özeti boş döndü.`))
  }

  return ok({
    // İstenen domain döndürülür, API'nin normalize ettiği `target` değil —
    // aşağı akışta rakip eşleştirmesi istenen ada göre yapılıyor.
    domain,
    refDomains: row.referring_domains ?? 0,
    backlinkCount: row.backlinks ?? 0,
    domainAuthority: (row.rank ?? 0) / RANK_TO_AUTHORITY_DIVISOR,
  })
}

/**
 * domain_intersection yanıtı → KeywordGap[]. Saf fonksiyon.
 *
 * "Gap" tanımı: `first_domain_serp_element` (müşteri) YOK, `second_domain_serp_element`
 * (rakip) VAR — müşteri hiç sıralamıyor, rakip sıralıyor. `intersections: false` istendiği
 * için yanıt hem kesişimi hem tek-taraflı sonuçları içerir, filtre burada yapılır.
 *
 * DİKKAT: alan adları (`keyword_data.keyword_info.search_volume`, `*_domain_serp_element`)
 * DataForSEO Labs API dokümantasyonunun en iyi tahminidir, CANLI doğrulanmadı (bkz. dosya başı
 * yorumu) — şema uyuşmazsa (alan adları farklıysa) sessizce yanlış veri ÜRETMEZ, açık
 * ProviderError döner (`dataForSeoResponseToMetrics`'teki aynı savunmacı desen).
 */
export const dataForSeoResponseToKeywordGaps = (raw: unknown, competitorDomain: string): Result<readonly KeywordGap[], ProviderError> => {
  const extracted = extractResult(raw, KEYWORD_GAP_PROVIDER_NAME)
  if (!extracted.ok) return extracted

  const parsed = z.array(KeywordGapResultSchema).safeParse(extracted.value ?? [])
  if (!parsed.success) {
    return err(new ProviderError(KEYWORD_GAP_PROVIDER_NAME, `Keyword gap sonucu okunamadı: ${summarizeZodError(parsed.error.issues)}`))
  }

  const items = parsed.data[0]?.items ?? []
  return ok(
    items.flatMap((item): KeywordGap[] => {
      const keyword = item.keyword_data?.keyword
      if (keyword === undefined) return []
      const clientRanks = item.first_domain_serp_element?.rank_absolute !== undefined && item.first_domain_serp_element !== null
      const competitorRank = item.second_domain_serp_element?.rank_absolute
      if (clientRanks || competitorRank === undefined || competitorRank === null) return []
      return [
        {
          keyword,
          competitorDomain,
          competitorPosition: competitorRank,
          volume: item.keyword_data?.keyword_info?.search_volume ?? null,
        },
      ]
    }),
  )
}

const postToDataForSeo = async (endpoint: string, authHeader: string, body: string): Promise<Response> =>
  fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

const statusHint = (status: number): string => {
  if (status === 401) return ' (kimlik bilgileri geçersiz)'
  if (status === 402) return ' (bakiye yetersiz)'
  if (status === 403) return ' (hesap doğrulanmamış — app.dataforseo.com panelinden doğrulayın)'
  return ''
}

/** Tüm keyword'ler TEK istekte sorgulanır — endpoint dizi kabul ediyor. */
export const createDataForSeoKeywordProvider = (login: string, password: string): KeywordProvider => ({
  name: KEYWORD_PROVIDER_NAME,
  isMock: false,
  fetchKeywordMetrics: async (keywords) => {
    if (keywords.length === 0) return ok([])
    try {
      const response = await postToDataForSeo(
        DATAFORSEO_KEYWORD_ENDPOINT,
        buildBasicAuthHeader(login, password),
        buildKeywordRequestBody(keywords),
      )
      if (!response.ok) {
        return err(
          new ProviderError(
            KEYWORD_PROVIDER_NAME,
            `DataForSEO ${response.status} döndü${statusHint(response.status)}.`,
          ),
        )
      }
      return dataForSeoResponseToMetrics(await response.json(), keywords)
    } catch (cause) {
      return err(new ProviderError(KEYWORD_PROVIDER_NAME, 'Keyword çağrısı başarısız.', { cause }))
    }
  },
})

export const createDataForSeoBacklinkProvider = (login: string, password: string): BacklinkProvider => ({
  name: BACKLINK_PROVIDER_NAME,
  isMock: false,
  fetchProfile: async (domain) => {
    try {
      const response = await postToDataForSeo(
        DATAFORSEO_BACKLINK_ENDPOINT,
        buildBasicAuthHeader(login, password),
        buildBacklinkRequestBody(domain),
      )
      if (!response.ok) {
        return err(
          new ProviderError(
            BACKLINK_PROVIDER_NAME,
            `'${domain}' için DataForSEO ${response.status} döndü${statusHint(response.status)}.`,
          ),
        )
      }
      return dataForSeoResponseToBacklinkProfile(await response.json(), domain)
    } catch (cause) {
      return err(new ProviderError(BACKLINK_PROVIDER_NAME, `'${domain}' için backlink çağrısı başarısız.`, { cause }))
    }
  },
})

/**
 * Rakip başına AYRI bir domain_intersection çağrısı gerekir (endpoint pairwise) — bu yüzden
 * `fetchGapKeywords` competitorDomains listesini kendi içinde gezer. Liste zaten çağıran
 * tarafta (collectKeywordGaps) KEYWORD_GAP_COMPETITOR_COUNT ile küçük tutulduğu için ayrı bir
 * eşzamanlılık sınırlaması gerekmez (collectBacklinks'teki küçük-liste Promise.all deseniyle
 * aynı gerekçe). Tek bir rakibin başarısız olması TÜM dalı düşürür (mevcut kısmi-hata
 * politikasıyla tutarlı: collectors.ts çağıran taraf zaten dal-seviyesinde tolere ediyor).
 */
export const createDataForSeoKeywordGapProvider = (login: string, password: string): KeywordGapProvider => ({
  name: KEYWORD_GAP_PROVIDER_NAME,
  isMock: false,
  fetchGapKeywords: async (domain, competitorDomains) => {
    if (competitorDomains.length === 0) return ok([])
    const authHeader = buildBasicAuthHeader(login, password)

    const results = await Promise.all(
      competitorDomains.map(async (competitorDomain) => {
        try {
          const response = await postToDataForSeo(DATAFORSEO_KEYWORD_GAP_ENDPOINT, authHeader, buildKeywordGapRequestBody(domain, competitorDomain))
          if (!response.ok) {
            return err(
              new ProviderError(
                KEYWORD_GAP_PROVIDER_NAME,
                `'${competitorDomain}' için DataForSEO ${response.status} döndü${statusHint(response.status)}.`,
              ),
            )
          }
          return dataForSeoResponseToKeywordGaps(await response.json(), competitorDomain)
        } catch (cause) {
          return err(new ProviderError(KEYWORD_GAP_PROVIDER_NAME, `'${competitorDomain}' için keyword gap çağrısı başarısız.`, { cause }))
        }
      }),
    )

    const failed = results.find((result) => !result.ok)
    if (failed !== undefined && !failed.ok) return failed
    return ok(results.flatMap((result) => (result.ok ? result.value : [])))
  },
})
