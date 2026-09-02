import type { Env, ProjectConfig } from '../config/schema.js'
import { ProviderError } from '../core/errors.js'
import {
  createMockAiVisibilityProvider,
  createMockBacklinkProvider,
  createMockCrawlProvider,
  createMockCruxProvider,
  createMockIndexingProvider,
  createMockKeywordGapProvider,
  createMockKeywordProvider,
  createMockSearchConsoleProvider,
  createMockSerpProvider,
  createMockTechAuditProvider,
} from './mocks/mockProviders.js'
import { createAnthropicAiVisibilityProvider } from './real/anthropicAiVisibilityProvider.js'
import { createCrawlProvider } from './real/crawlProvider.js'
import { createCruxProvider } from './real/cruxProvider.js'
import {
  createDataForSeoBacklinkProvider,
  createDataForSeoKeywordGapProvider,
  createDataForSeoKeywordProvider,
} from './real/dataForSeoProviders.js'
import { createGeminiAiVisibilityProvider } from './real/geminiAiVisibilityProvider.js'
import { createGscAuth } from './real/gscAuth.js'
import { createGscProvider } from './real/gscProvider.js'
import { createGscUrlInspectionProvider } from './real/gscUrlInspectionProvider.js'
import { createLighthouseProvider } from './real/lighthouseProvider.js'
import { createPageSpeedProvider } from './real/pageSpeedProvider.js'
import { createSerpApiProvider } from './real/serpApiProvider.js'
import type { ProviderCategory, ProviderSet } from './types.js'

/** Kategori başına seçim sonucu — hangi sağlayıcı ve gerçek mi mock mu. */
interface Selection<T> {
  readonly provider: T
  readonly isMock: boolean
}

const real = <T>(provider: T): Selection<T> => ({ provider, isMock: false })
const mock = <T>(provider: T): Selection<T> => ({ provider, isMock: true })

/**
 * Çok anahtarlı sağlayıcılarda yarım yapılandırma sessizce mock'a düşmemeli:
 * kullanıcı gerçek veri beklerken sahte veri raporlamak en tehlikeli hatadır.
 */
const requireAllOrNone = (category: string, keys: Readonly<Record<string, string | undefined>>): boolean => {
  const names = Object.keys(keys)
  const present = names.filter((name) => keys[name] !== undefined)
  if (present.length === 0) return false
  if (present.length === names.length) return true
  const missing = names.filter((name) => keys[name] === undefined)
  throw new ProviderError(
    'registry',
    `${category} için anahtarların hepsi gerekli. Eksik: ${missing.join(', ')}. ` +
      `Ya tamamlayın ya da hepsini .env'den kaldırın — yarım yapılandırmayla mock'a düşülmez.`,
  )
}

/**
 * Teknik denetim üç kademe: PSI anahtarı varsa PSI (Chrome'suz ortamlar için),
 * TECH_AUDIT_PROVIDER=lighthouse ise lokal Lighthouse (anahtar/kota gerektirmez
 * ama Chrome şart ve URL başına 10-30sn sürer), aksi halde mock.
 */
const selectTech = (env: Env, config: ProjectConfig): Selection<ProviderSet['tech']> => {
  if (env.PAGESPEED_API_KEY !== undefined) return real(createPageSpeedProvider(env.PAGESPEED_API_KEY))
  if (env.TECH_AUDIT_PROVIDER === 'lighthouse') return real(createLighthouseProvider())
  return mock(createMockTechAuditProvider(config))
}

/**
 * AI görünürlük: Gemini birincil motor çünkü Google AI Overviews'ı besleyen model
 * odur — oradaki görünürlük doğrudan arama sonucuna yansır. Gemini yoksa Anthropic
 * kullanılır (Faz 4.3, Faz 1.7'nin tamamlanması). Tek-motor seçimi bilinçli: eşzamanlı
 * çift-motor karşılaştırma ayrı bir şema/rapor değişikliği gerektirir, bu fazın kapsamı
 * dışında (bkz. genel-plan.md Faz 4 "Kapsam dışı").
 */
const selectAiVisibility = (env: Env, config: ProjectConfig): Selection<ProviderSet['aiVisibility']> => {
  if (env.GEMINI_API_KEY !== undefined) return real(createGeminiAiVisibilityProvider(env.GEMINI_API_KEY))
  if (env.ANTHROPIC_API_KEY !== undefined) return real(createAnthropicAiVisibilityProvider(env.ANTHROPIC_API_KEY))
  return mock(createMockAiVisibilityProvider(config, config.mockSeed))
}

/** CrUX (Chrome UX Report): anahtar yoksa mock. Diğer kategorilerin aksine tek anahtarlı ve opsiyonel — verilmezse rapor bu zenginleştirmeyi atlar, hata vermez. */
const selectCrux = (env: Env): Selection<ProviderSet['crux']> =>
  env.CRUX_API_KEY !== undefined ? real(createCruxProvider(env.CRUX_API_KEY)) : mock(createMockCruxProvider())

/**
 * Crawler anahtar gerektirmez (yalnız fetch) — TECH_AUDIT_PROVIDER=lighthouse ile aynı
 * gerekçeyle açık env bayrağı ister: müşterinin canlı sitesine gerçek istek atar,
 * "anahtarsız = otomatik gerçek" hiçbir yerde yok, burada da olmamalı.
 *
 * `config.crawlEnabled === false` HER ZAMAN env'i ezer (bkz. schema.ts yorumu) — bazı
 * siteler JS-fingerprint tabanlı bir anti-bot katmanı kullanıyor ve crawler'ın GERÇEK
 * içeriği hiç görmesine izin vermiyor (bilgekampus.com'da doğrulandı); `CRAWL_PROVIDER`
 * global olduğu için bu, o tek müşteriyi diğerlerini etkilemeden mock'a düşürmenin yolu.
 */
const selectCrawl = (env: Env, config: ProjectConfig): Selection<ProviderSet['crawl']> =>
  config.crawlEnabled && env.CRAWL_PROVIDER === 'live'
    ? real(createCrawlProvider())
    : mock(createMockCrawlProvider(config))

/**
 * Kategori başına mock/gerçek sağlayıcı seçiminin yapıldığı TEK yer.
 * `mockCategories` sabit bir listeden değil, fiilen yapılan seçimlerden türetilir —
 * rapordaki MOCK banner'ı ve `RunMeta.mockCategories` bunu kullanıyor.
 */
export const selectProviders = (env: Env, config: ProjectConfig): ProviderSet => {
  const dataForSeoLogin = env.DATAFORSEO_LOGIN
  const dataForSeoPassword = env.DATAFORSEO_PASSWORD
  const gscEmail = env.GSC_CLIENT_EMAIL
  const gscKey = env.GSC_PRIVATE_KEY

  const hasDataForSeo = requireAllOrNone('DataForSEO', {
    DATAFORSEO_LOGIN: dataForSeoLogin,
    DATAFORSEO_PASSWORD: dataForSeoPassword,
  })
  const hasGsc = requireAllOrNone('Google Search Console', {
    GSC_CLIENT_EMAIL: gscEmail,
    GSC_PRIVATE_KEY: gscKey,
  })

  const keyword =
    hasDataForSeo && dataForSeoLogin !== undefined && dataForSeoPassword !== undefined
      ? real(createDataForSeoKeywordProvider(dataForSeoLogin, dataForSeoPassword))
      : mock(createMockKeywordProvider())

  const backlink =
    hasDataForSeo && dataForSeoLogin !== undefined && dataForSeoPassword !== undefined
      ? real(createDataForSeoBacklinkProvider(dataForSeoLogin, dataForSeoPassword))
      : mock(createMockBacklinkProvider(config))

  // Aynı DataForSEO kimlik bilgilerini paylaşır — ayrı bir requireAllOrNone çağrısı gerekmez.
  const keywordGap =
    hasDataForSeo && dataForSeoLogin !== undefined && dataForSeoPassword !== undefined
      ? real(createDataForSeoKeywordGapProvider(dataForSeoLogin, dataForSeoPassword))
      : mock(createMockKeywordGapProvider())

  // Tek paylaşılan auth örneği: searchConsole + indexing aynı jeton önbelleğini
  // kullanmalı, yoksa her çalıştırmada iki ayrı OAuth turu atılır (bkz. gscAuth.ts).
  const gscAuth =
    hasGsc && gscEmail !== undefined && gscKey !== undefined ? createGscAuth(gscEmail, gscKey) : null

  const searchConsole =
    gscAuth !== null ? real(createGscProvider(gscAuth)) : mock(createMockSearchConsoleProvider(config))

  const indexing =
    gscAuth !== null ? real(createGscUrlInspectionProvider(gscAuth)) : mock(createMockIndexingProvider())

  const serp =
    env.SERPAPI_KEY !== undefined ? real(createSerpApiProvider(env.SERPAPI_KEY)) : mock(createMockSerpProvider(config))

  const tech = selectTech(env, config)
  const aiVisibility = selectAiVisibility(env, config)
  const crux = selectCrux(env)
  const crawl = selectCrawl(env, config)

  const selections: readonly (readonly [ProviderCategory, boolean])[] = [
    ['keyword', keyword.isMock],
    ['serp', serp.isMock],
    ['backlink', backlink.isMock],
    ['tech', tech.isMock],
    ['aiVisibility', aiVisibility.isMock],
    ['searchConsole', searchConsole.isMock],
    ['indexing', indexing.isMock],
    ['crux', crux.isMock],
    ['crawl', crawl.isMock],
    ['keywordGap', keywordGap.isMock],
  ]

  return {
    keyword: keyword.provider,
    serp: serp.provider,
    backlink: backlink.provider,
    tech: tech.provider,
    aiVisibility: aiVisibility.provider,
    searchConsole: searchConsole.provider,
    indexing: indexing.provider,
    crux: crux.provider,
    crawl: crawl.provider,
    keywordGap: keywordGap.provider,
    mockCategories: selections.flatMap(([category, isMock]) => (isMock ? [category] : [])),
  }
}
