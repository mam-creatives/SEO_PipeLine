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

/**
 * Dış denetim bulgusu (2026-08-31) — bare `path.startsWith(excluded)` segment sınırına
 * saygı göstermiyordu: `/cv` kuralı `/cv-hazirlama` gibi TAMAMEN FARKLI bir sayfayı da
 * yanlışlıkla eliyordu. Artık ya tam eşleşme ya da `/`'le devam eden bir alt-yol aranıyor.
 * `excluded` sondaki `/`'i taşıyorsa (kullanıcı `/admin/` gibi yazmış olabilir) önce
 * normalize edilir ki `${normalized}/` çift `//` üretmesin.
 */
const isExcludedByConfig = (url: string, excludePaths: readonly string[]): boolean => {
  const path = new URL(url).pathname
  return excludePaths.some((excluded) => {
    const normalized = excluded.length > 1 && excluded.endsWith('/') ? excluded.slice(0, -1) : excluded
    return path === normalized || path.startsWith(`${normalized}/`)
  })
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
  schemaFields: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 0,
  bodyText: '',
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  // Ağ/timeout hatasında sayfa hiç alınamadı — CSR olup olmadığı bilinmez, uydurulmaz.
  likelyClientRendered: false,
  // Yer tutucu — collectCrawl BFS döngüsünde gerçek derinlikle EZİLİR.
  depth: 0,
  hreflangs: [],
  // Ağ/timeout hatasında hiçbir HTTP yanıtı alınamadı — başlıklar da bilinmez.
  xRobotsTag: null,
  contentType: null,
  headerHreflangs: [],
  securityHeaders: [],
  redirectChain: [],
  redirectLoop: false,
  viewportMeta: null,
  langAttribute: null,
  mixedContentCount: 0,
  imagesMissingDimensions: 0,
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
  // Faz 5.5 — sitemap URL'leri de ilk dalgaya eklenir: iç linkle erişilemeyen ama Google'a
  // indekslenebilir olarak vaat edilen sayfalar da denetlenir. Bilinçli basitleştirme: bu
  // sayfalar `depth: 0` alır (BFS "ek giriş noktası" muamelesi görür) — gerçek tıklama
  // mesafeleri bilinmiyor olabilir, ama link grafiğinde hiç yoksa zaten öksüz bulgusuyla
  // (detectLinkIssues) ayrıca işaretlenirler.
  let currentWave = [...new Set([...seedUrls, ...sitemapUrls])]
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
      const page = result.ok ? result.value : degradedPage(url, result.error.message)
      // Sağlayıcı kendi derinliğini bilemez (yer tutucu 0 döner) — gerçek BFS derinliği burada yazılır.
      return { ...page, depth }
    })
    pages.push(...newPages)

    const nextWave = newPages.flatMap((page) => page.internalLinks.map((link) => link.targetUrl))
    currentWave = [...new Set(nextWave)].filter((url) => !visited.has(url))
    depth += 1
  }

  return ok({ pages, sitemapUrls })
}
