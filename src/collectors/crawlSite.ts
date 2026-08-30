import { CRAWL_CONCURRENCY } from '../config/constants.js'
import type { ProjectConfig } from '../config/schema.js'
import { mapWithConcurrency } from '../core/concurrency.js'
import type { ProviderError } from '../core/errors.js'
import { ok, type Result } from '../core/result.js'
import { extractRootDomain } from '../core/text.js'
import type { CrawledPage } from '../core/types.js'
import type { ProviderSet } from '../providers/types.js'

export interface CrawlResult {
  readonly pages: readonly CrawledPage[]
  readonly sitemapUrls: readonly string[]
}

const isExcludedByConfig = (url: string, excludePaths: readonly string[]): boolean => {
  const path = new URL(url).pathname
  return excludePaths.some((excluded) => path.startsWith(excluded))
}

/** Ağ/timeout hatasını CrawledPage'e düşürür — tek sayfa hatası bütün taramayı düşürmemeli. */
const degradedPage = (url: string, message: string): CrawledPage => ({
  url,
  statusCode: null,
  finalUrl: null,
  fetchError: message,
  title: null,
  metaDescription: null,
  canonicalUrl: null,
  h1s: [],
  headingOrder: [],
  hasSchemaOrg: false,
  schemaTypes: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 0,
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  // Ağ/timeout hatasında sayfa hiç alınamadı — CSR olup olmadığı bilinmez, uydurulmaz.
  likelyClientRendered: false,
})

/**
 * `www`/apex farkını (mamcreatives.com → www.mamcreatives.com 301'i canlıda fiilen var)
 * origin eşitliğiyle değil `extractRootDomain` ile ele alır — aksi halde redirect sonrası
 * bulunan HER iç link "dış link" sayılır ve BFS ilk sayfadan öteye hiç geçemezdi.
 */
const isSameSite = (url: string, domain: string): boolean => {
  try {
    return extractRootDomain(url) === domain
  } catch {
    return false
  }
}

/**
 * robots.txt'in `Sitemap:` satırları varsa onlar kullanılır, yoksa `/sitemap.xml` varsayılan
 * konumu denenir. Birden fazla sitemap URL'i birleştirilip tekilleştirilir.
 */
const resolveSitemapUrls = async (
  providers: ProviderSet,
  origin: string,
  declaredSitemaps: readonly string[],
): Promise<readonly string[]> => {
  const candidates = declaredSitemaps.length > 0 ? declaredSitemaps : [`${origin}/sitemap.xml`]
  const results = await Promise.all(candidates.map((url) => providers.crawl.fetchSitemapUrls(url)))
  return [...new Set(results.flatMap((result) => (result.ok ? result.value : [])))]
}

/**
 * robots.txt + sitemap.xml'i bir kez çeker, sonra seed URL'lerden başlayıp iç linkleri takip
 * ederek dalga dalga (BFS) tarar. Her dalga bir derinlik seviyesidir — `mapWithConcurrency`
 * sabit bir dizi beklediği için kuyruk dinamik değil, derinlik başına toplu işlenir.
 * `crawlMaxPages`/`crawlMaxDepth` aşılınca durur. Tek sayfa hatası (4xx/5xx/timeout) tüm
 * taramayı düşürmez — `CrawledPage.statusCode`/`fetchError`e yazılıp bulguya dönüşür; yalnız
 * robots.txt/sitemap çekimindeki GERÇEK ağ hatası dalın tamamını başarısız sayar.
 */
export const collectCrawl = async (
  providers: ProviderSet,
  config: ProjectConfig,
  seedUrls: readonly string[],
): Promise<Result<CrawlResult, ProviderError>> => {
  const origin = new URL(`https://${config.domain}/`).origin

  const robotsResult = await providers.crawl.fetchRobotsRules(origin)
  if (!robotsResult.ok) return robotsResult
  const robots = robotsResult.value

  const sitemapUrls = await resolveSitemapUrls(providers, origin, robots.sitemaps)

  const visited = new Set<string>()
  const pages: CrawledPage[] = []
  let currentWave = [...new Set(seedUrls)]
  let depth = 0

  while (currentWave.length > 0 && pages.length < config.crawlMaxPages && depth <= config.crawlMaxDepth) {
    const budget = config.crawlMaxPages - pages.length
    const toFetch = currentWave
      .filter((url) => !visited.has(url))
      .filter((url) => isSameSite(url, config.domain))
      .filter((url) => !isExcludedByConfig(url, config.crawlExcludePaths))
      .filter((url) => robots.isAllowed(url))
      .slice(0, budget)

    if (toFetch.length === 0) break
    for (const url of toFetch) visited.add(url)

    const newPages = await mapWithConcurrency(toFetch, CRAWL_CONCURRENCY, async (url) => {
      const result = await providers.crawl.fetchPage(url)
      return result.ok ? result.value : degradedPage(url, result.error.message)
    })
    pages.push(...newPages)

    const nextWave = newPages.flatMap((page) => page.internalLinks.map((link) => link.targetUrl))
    currentWave = [...new Set(nextWave)].filter((url) => !visited.has(url))
    depth += 1
  }

  return ok({ pages, sitemapUrls })
}
