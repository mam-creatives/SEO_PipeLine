import type { Env, ProjectConfig } from '../config/schema.js'
import { ProviderError } from '../core/errors.js'
import {
  createMockAiVisibilityProvider,
  createMockBacklinkProvider,
  createMockKeywordProvider,
  createMockSearchConsoleProvider,
  createMockSerpProvider,
  createMockTechAuditProvider,
} from './mocks/mockProviders.js'
import { createDataForSeoBacklinkProvider, createDataForSeoKeywordProvider } from './real/dataForSeoProviders.js'
import { createGeminiAiVisibilityProvider } from './real/geminiAiVisibilityProvider.js'
import { createGscProvider } from './real/gscProvider.js'
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
 * odur — oradaki görünürlük doğrudan arama sonucuna yansır. Anthropic sağlayıcısı
 * henüz implemente edilmedi; anahtarı verilirse sessizce mock'a düşmek yerine hata verilir.
 */
const selectAiVisibility = (env: Env, config: ProjectConfig): Selection<ProviderSet['aiVisibility']> => {
  if (env.GEMINI_API_KEY !== undefined) return real(createGeminiAiVisibilityProvider(env.GEMINI_API_KEY))
  if (env.ANTHROPIC_API_KEY !== undefined) {
    throw new ProviderError(
      'registry',
      'ANTHROPIC_API_KEY verildi ama Anthropic sağlayıcısı henüz implemente edilmedi ' +
        '(src/providers/real/anthropicAiVisibilityProvider.ts). GEMINI_API_KEY kullanın ya da anahtarı kaldırın.',
    )
  }
  return mock(createMockAiVisibilityProvider(config, config.mockSeed))
}

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

  const searchConsole =
    hasGsc && gscEmail !== undefined && gscKey !== undefined
      ? real(createGscProvider(gscEmail, gscKey))
      : mock(createMockSearchConsoleProvider(config))

  const serp =
    env.SERPAPI_KEY !== undefined ? real(createSerpApiProvider(env.SERPAPI_KEY)) : mock(createMockSerpProvider(config))

  const tech = selectTech(env, config)
  const aiVisibility = selectAiVisibility(env, config)

  const selections: readonly (readonly [ProviderCategory, boolean])[] = [
    ['keyword', keyword.isMock],
    ['serp', serp.isMock],
    ['backlink', backlink.isMock],
    ['tech', tech.isMock],
    ['aiVisibility', aiVisibility.isMock],
    ['searchConsole', searchConsole.isMock],
  ]

  return {
    keyword: keyword.provider,
    serp: serp.provider,
    backlink: backlink.provider,
    tech: tech.provider,
    aiVisibility: aiVisibility.provider,
    searchConsole: searchConsole.provider,
    mockCategories: selections.flatMap(([category, isMock]) => (isMock ? [category] : [])),
  }
}
