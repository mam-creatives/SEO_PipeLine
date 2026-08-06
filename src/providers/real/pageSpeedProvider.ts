import { z } from 'zod'
import { ProviderError } from '../../core/errors.js'
import { err, type Result } from '../../core/result.js'
import type { TechAudit } from '../../core/types.js'
import { lighthouseResultToTechAudit } from '../lighthouse/lighthouseAdapter.js'
import type { TechAuditProvider } from '../types.js'

const PROVIDER_NAME = 'pagespeed'
const PAGESPEED_BASE_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const REQUEST_TIMEOUT_MS = 90_000

/**
 * PSI yanıtı Lighthouse `lhr` ile BİREBİR aynı `lighthouseResult` alanını taşır,
 * bu yüzden ayrıştırma tamamen ortak adaptöre devredilir. Burada yalnız zarf doğrulanır.
 */
const PageSpeedEnvelopeSchema = z.object({
  lighthouseResult: z.unknown(),
})

export const buildPageSpeedUrl = (apiKey: string, url: string): string => {
  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy: 'mobile',
    locale: 'tr',
    category: 'performance',
  })
  return `${PAGESPEED_BASE_URL}?${params.toString()}`
}

/**
 * PageSpeed Insights sağlayıcısı — lokal Lighthouse çalıştırılamayan ortamlar için yedek
 * (ör. Chrome kurulu olmayan CI). Anahtar zorunludur: anahtarsız çağrılar paylaşımlı
 * IP kotası yüzünden hızla 429 döner.
 */
export const createPageSpeedProvider = (apiKey: string): TechAuditProvider => ({
  name: PROVIDER_NAME,
  isMock: false,
  auditUrl: async (url: string): Promise<Result<TechAudit, ProviderError>> => {
    try {
      const response = await fetch(buildPageSpeedUrl(apiKey, url), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) {
        const hint = response.status === 429 ? ' (kota aşıldı — lokal Lighthouse kullanmayı düşünün)' : ''
        return err(new ProviderError(PROVIDER_NAME, `'${url}' için PSI ${response.status} döndü${hint}.`))
      }

      const envelope = PageSpeedEnvelopeSchema.safeParse(await response.json())
      if (!envelope.success) {
        return err(new ProviderError(PROVIDER_NAME, `PSI yanıtında lighthouseResult yok: ${url}`))
      }
      return lighthouseResultToTechAudit(envelope.data.lighthouseResult, PROVIDER_NAME)
    } catch (cause) {
      return err(new ProviderError(PROVIDER_NAME, `'${url}' için PSI çağrısı başarısız.`, { cause }))
    }
  },
})
