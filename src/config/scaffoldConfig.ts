import { DEFAULT_MOCK_SEED } from './constants.js'
import type { ProjectConfig } from './schema.js'

/**
 * "mamcreatives.com" → "Mamcreatives"; "mam-creatives.com" → "Mam Creatives". En iyi
 * çaba — kullanıcı gerçek yazılışı (ör. "MAM Creatives") ile elle düzeltmeli.
 */
export const guessBrandName = (domain: string): string => {
  const withoutTld = domain.split('.')[0] ?? domain
  return withoutTld
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

/**
 * Kullanıcının yalnız domain vererek ilerleyebilmesi için (bkz. initClient.ts) — domain
 * DIŞINDA hiçbir alan gerçek girdi değil, ya domainden türetilmiş bir TAHMİN (brandName/
 * brandTokens/seedKeywords/auditUrls) ya da güvenli bir boş varsayılan (seedCompetitors/
 * aiQueries/crawlExcludePaths). Şema geçerli (hemen çalışır) ama gerçek SEO değeri için
 * kullanıcı elle zenginleştirmeli — bu ayrım initClient.ts'in konsola bastığı "sıradaki
 * adımlar" listesinde açıkça belirtilir.
 */
export const buildScaffoldConfig = (domain: string): ProjectConfig => {
  const brandName = guessBrandName(domain)
  return {
    domain,
    brandName,
    brandTokens: [brandName.toLowerCase()],
    seedCompetitors: [],
    // Marka adının kendisi tek başına geçerli ama zayıf bir keyword'dür — schema'nın
    // "en az bir keyword" kuralını karşılar, gerçek hedef kelimeler elle eklenmeli.
    seedKeywords: [brandName.toLowerCase()],
    aiQueries: [],
    auditUrls: [`https://${domain}/`],
    locale: 'tr-TR',
    mockSeed: DEFAULT_MOCK_SEED,
    crawlMaxPages: 300,
    crawlMaxDepth: 5,
    crawlExcludePaths: [],
    crawlEnabled: true,
  }
}
