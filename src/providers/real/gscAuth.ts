import { createSign } from 'node:crypto'
import { z } from 'zod'
import { ProviderError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import { fetchWithRetry } from '../../core/retry.js'
import { extractRootDomain } from '../../core/text.js'

const PROVIDER_NAME = 'google-search-console'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SITES_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const REQUEST_TIMEOUT_MS = 60_000

const TOKEN_LIFETIME_SECONDS = 3600
/** Jeton süresi dolmadan biraz önce yenile — saat kaymasına tolerans. */
const TOKEN_REFRESH_MARGIN_MS = 60_000

const TokenResponseSchema = z.object({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

const SitesResponseSchema = z.object({
  siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string().optional() })).optional(),
})

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

interface CachedToken {
  readonly token: string
  readonly expiresAtMs: number
}

export interface GscAuth {
  readonly getAccessToken: () => Promise<Result<string, ProviderError>>
  readonly resolveSiteUrl: (token: string, domain: string) => Promise<Result<string, ProviderError>>
}

/**
 * GSC OAuth + mülk çözümleme — `searchAnalytics` (gscProvider.ts) ve `urlInspection`
 * (gscUrlInspectionProvider.ts) sağlayıcıları arasında PAYLAŞILMALI, aksi halde her
 * çalıştırmada iki ayrı OAuth turu atılır. Bu yüzden `registry.ts` tek bir `createGscAuth`
 * örneği yaratıp ikisine de geçiriyor — jeton önbelleği bu kapanışın içinde tutulur.
 */
export const createGscAuth = (clientEmail: string, privateKey: string): GscAuth => {
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

    const response = await fetchWithRetry(TOKEN_ENDPOINT, () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }))

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
    const response = await fetchWithRetry(SITES_ENDPOINT, () => ({
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }))
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

  return { getAccessToken, resolveSiteUrl }
}
