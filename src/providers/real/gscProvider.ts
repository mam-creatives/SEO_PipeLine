import { createSign } from 'node:crypto'
import { z } from 'zod'
import { ProviderError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import { extractRootDomain } from '../../core/text.js'
import type { GscRow } from '../../core/types.js'
import type { SearchConsoleProvider } from '../types.js'

const PROVIDER_NAME = 'google-search-console'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SITES_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const REQUEST_TIMEOUT_MS = 60_000

const TOKEN_LIFETIME_SECONDS = 3600
/** Jeton süresi dolmadan biraz önce yenile — saat kaymasına tolerans. */
const TOKEN_REFRESH_MARGIN_MS = 60_000

const DAY_MS = 86_400_000
/** GSC verisi birkaç gün gecikmeli gelir; son günler eksik görünür. */
const GSC_DATA_LAG_DAYS = 3
const GSC_WINDOW_DAYS = 28
const ROW_LIMIT = 250

const TokenResponseSchema = z.object({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

const SitesResponseSchema = z.object({
  siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string().optional() })).optional(),
})

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
  JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: ROW_LIMIT })

const toIsoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Son 28 günlük pencere, veri gecikmesi düşülerek. Saf fonksiyon — test edilebilir. */
export const buildDateRange = (
  now: number = Date.now(),
): { readonly startDate: string; readonly endDate: string } => {
  const endMs = now - GSC_DATA_LAG_DAYS * DAY_MS
  return { startDate: toIsoDate(endMs - (GSC_WINDOW_DAYS - 1) * DAY_MS), endDate: toIsoDate(endMs) }
}

const base64url = (value: string): string => Buffer.from(value).toString('base64url')

/**
 * Servis hesabı için RS256 JWT üretir (googleapis bağımlılığı olmadan).
 * Private key PEM formatında olmalı — `.env` ayrıştırıcısı `\n` kaçışlarını
 * gerçek satır sonuna çevirmezse bu adım "invalid key" ile patlar.
 */
export const signServiceAccountJwt = (
  clientEmail: string,
  privateKey: string,
  now: number = Date.now(),
): string => {
  const issuedAt = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + TOKEN_LIFETIME_SECONDS,
    }),
  )
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey, 'base64url')
  return `${header}.${claims}.${signature}`
}

/**
 * Search Console mülkünü bulur. İki format mümkün: domain mülkü
 * (`sc-domain:example.com`) veya URL öneki (`https://www.example.com/`).
 * Tahmin etmek yerine hesabın erişebildiği mülkler listelenip eşleştirilir.
 */
export const matchSiteUrl = (siteUrls: readonly string[], domain: string): string | null => {
  const target = extractRootDomain(domain)
  const domainProperty = siteUrls.find((siteUrl) => siteUrl.toLowerCase() === `sc-domain:${target}`)
  if (domainProperty !== undefined) return domainProperty
  return siteUrls.find((siteUrl) => !siteUrl.startsWith('sc-domain:') && extractRootDomain(siteUrl) === target) ?? null
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
      if (query === undefined) return []
      return [
        {
          query,
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

interface CachedToken {
  readonly token: string
  readonly expiresAtMs: number
}

/**
 * Google Search Console sağlayıcısı — pipeline'ın tek ölçülmüş (tahmin olmayan)
 * veri kaynağı. Yalnız kendi/müşteri siteniz için çalışır; rakip verisi alınamaz.
 *
 * Servis hesabı Search Console'da ilgili mülke eklenmemişse hata döner. GSC omurga
 * dalı olmadığı için çalıştırma devam eder, hata raporda FailedBranch olarak görünür.
 */
export const createGscProvider = (clientEmail: string, privateKey: string): SearchConsoleProvider => {
  // Jeton bir saat geçerli; her çağrıda yeniden almak gereksiz tur atmak olur.
  // Kapanış içinde tutulur, sağlayıcı örneği dışına sızmaz.
  let cachedToken: CachedToken | null = null

  const getAccessToken = async (): Promise<Result<string, ProviderError>> => {
    if (cachedToken !== null && cachedToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
      return ok(cachedToken.token)
    }

    let assertion: string
    try {
      assertion = signServiceAccountJwt(clientEmail, privateKey)
    } catch (cause) {
      return err(
        new ProviderError(
          PROVIDER_NAME,
          'JWT imzalanamadı — GSC_PRIVATE_KEY geçerli bir PEM olmalı (satır sonları çözülmüş halde).',
          { cause },
        ),
      )
    }

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const parsed = TokenResponseSchema.safeParse(await response.json())
    if (!parsed.success || parsed.data.access_token === undefined) {
      const detail = parsed.success
        ? `${parsed.data.error ?? ''} ${parsed.data.error_description ?? ''}`.trim()
        : parsed.error.message
      return err(new ProviderError(PROVIDER_NAME, `Erişim jetonu alınamadı (${response.status}): ${detail}`))
    }

    cachedToken = {
      token: parsed.data.access_token,
      expiresAtMs: Date.now() + (parsed.data.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000,
    }
    return ok(parsed.data.access_token)
  }

  const resolveSiteUrl = async (token: string, domain: string): Promise<Result<string, ProviderError>> => {
    const response = await fetch(SITES_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      return err(new ProviderError(PROVIDER_NAME, `Mülk listesi alınamadı (${response.status}).`))
    }
    const parsed = SitesResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      return err(new ProviderError(PROVIDER_NAME, `Mülk listesi okunamadı: ${parsed.error.message}`))
    }

    const siteUrls = (parsed.data.siteEntry ?? []).map((entry) => entry.siteUrl)
    const matched = matchSiteUrl(siteUrls, domain)
    if (matched === null) {
      const visible = siteUrls.length === 0 ? 'hiçbiri' : siteUrls.join(', ')
      return err(
        new ProviderError(
          PROVIDER_NAME,
          `'${domain}' servis hesabının eriştiği mülkler arasında yok. Search Console'da ` +
            `${clientEmail} adresini mülke kullanıcı olarak ekleyin. Şu an erişilebilen mülkler: ${visible}`,
        ),
      )
    }
    return ok(matched)
  }

  return {
    name: PROVIDER_NAME,
    isMock: false,
    fetchPerformance: async (domain: string): Promise<Result<readonly GscRow[], ProviderError>> => {
      try {
        const token = await getAccessToken()
        if (!token.ok) return token

        const siteUrl = await resolveSiteUrl(token.value, domain)
        if (!siteUrl.ok) return siteUrl

        const range = buildDateRange()
        const response = await fetch(buildGscQueryEndpoint(siteUrl.value), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' },
          body: buildGscRequestBody(range.startDate, range.endDate),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
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
  }
}
