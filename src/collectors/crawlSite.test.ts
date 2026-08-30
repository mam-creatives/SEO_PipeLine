import { describe, expect, test } from 'vitest'
import { ProjectConfigSchema } from '../config/schema.js'
import { ProviderError } from '../core/errors.js'
import { err, ok } from '../core/result.js'
import type { CrawledPage } from '../core/types.js'
import type { CrawlProvider, ProviderSet } from '../providers/types.js'
import { collectCrawl } from './crawlSite.js'

const config = ProjectConfigSchema.parse({
  domain: 'ornek.com',
  brandName: 'Örnek',
  brandTokens: ['örnek'],
  seedKeywords: ['x'],
  crawlMaxPages: 60,
  crawlMaxDepth: 3,
})

const emptyPage = (url: string, overrides: Partial<CrawledPage> = {}): CrawledPage => ({
  url,
  statusCode: 200,
  finalUrl: url,
  fetchError: null,
  title: 't',
  metaDescription: 'd',
  canonicalUrl: url,
  h1s: ['h'],
  headingOrder: ['h1'],
  hasSchemaOrg: false,
  schemaTypes: [],
  ogComplete: false,
  imagesMissingAlt: 0,
  wordCount: 10,
  metaRobots: null,
  internalLinks: [],
  externalLinkCount: 0,
  likelyClientRendered: false,
  depth: 0,
  hreflangs: [],
  xRobotsTag: null,
  contentType: null,
  headerHreflangs: [],
  securityHeaders: [],
  redirectChain: [],
  redirectLoop: false,
  ...overrides,
})

/** Basit sahte CrawlProvider — url → CrawledPage eşleşmesi elle verilir, bilinmeyen url ProviderError döner. */
const fakeCrawlProvider = (pagesByUrl: Readonly<Record<string, CrawledPage>>): CrawlProvider => ({
  name: 'fake-crawl',
  isMock: true,
  fetchPage: async (url) => {
    const page = pagesByUrl[url]
    if (page === undefined) return err(new ProviderError('fake-crawl', `bilinmiyor: ${url}`))
    return ok(page)
  },
  fetchRobotsRules: async () => ok({ isAllowed: () => true, sitemaps: [] }),
  fetchSitemapUrls: async () => ok([]),
})

const providersWith = (crawl: CrawlProvider): ProviderSet => ({ crawl }) as unknown as ProviderSet

describe('collectCrawl', () => {
  test('tek seed, iç linksiz — tek sayfa döner', async () => {
    const home = 'https://ornek.com/'
    const provider = fakeCrawlProvider({ [home]: emptyPage(home) })
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pages.map((p) => p.url)).toEqual([home])
  })

  test('seed\'in iç linki keşfedilip bir sonraki dalgada taranır', async () => {
    const home = 'https://ornek.com/'
    const about = 'https://ornek.com/hakkimizda'
    const provider = fakeCrawlProvider({
      [home]: emptyPage(home, {
        internalLinks: [{ sourceUrl: home, targetUrl: about, anchorText: 'Hakkımızda', isInternal: true }],
      }),
      [about]: emptyPage(about),
    })
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(new Set(result.value.pages.map((p) => p.url))).toEqual(new Set([home, about]))
  })

  test('www redirect sonrası bulunan iç linkler dış link sayılmaz (extractRootDomain)', async () => {
    const home = 'https://ornek.com/'
    const wwwHome = 'https://www.ornek.com/'
    const about = 'https://www.ornek.com/hakkimizda'
    const provider = fakeCrawlProvider({
      [home]: emptyPage(home, {
        finalUrl: wwwHome,
        internalLinks: [{ sourceUrl: wwwHome, targetUrl: about, anchorText: 'Hakkımızda', isInternal: true }],
      }),
      [about]: emptyPage(about),
    })
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pages.map((p) => p.url)).toContain(about)
  })

  test('dış domain linkleri taranmaz', async () => {
    const home = 'https://ornek.com/'
    const external = 'https://baska-site.com/'
    const provider = fakeCrawlProvider({
      [home]: emptyPage(home, {
        internalLinks: [{ sourceUrl: home, targetUrl: external, anchorText: 'dış', isInternal: false }],
      }),
    })
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pages.map((p) => p.url)).toEqual([home])
  })

  test('crawlMaxPages bütçesi aşılmaz', async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://ornek.com/sayfa-${i}`)
    const home = 'https://ornek.com/'
    const pagesByUrl: Record<string, CrawledPage> = {
      [home]: emptyPage(home, {
        internalLinks: urls.map((u) => ({ sourceUrl: home, targetUrl: u, anchorText: u, isInternal: true })),
      }),
    }
    for (const u of urls) pagesByUrl[u] = emptyPage(u)
    const limitedConfig = ProjectConfigSchema.parse({ ...config, crawlMaxPages: 3 })
    const result = await collectCrawl(providersWith(fakeCrawlProvider(pagesByUrl)), limitedConfig, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pages.length).toBeLessThanOrEqual(3)
  })

  test('robots.txt disallow ettiği path\'i taramaz', async () => {
    const home = 'https://ornek.com/'
    const admin = 'https://ornek.com/admin'
    const provider: CrawlProvider = {
      name: 'fake-crawl',
      isMock: true,
      fetchPage: async (url) =>
        ok(
          emptyPage(
            url,
            url === home
              ? { internalLinks: [{ sourceUrl: home, targetUrl: admin, anchorText: 'admin', isInternal: true }] }
              : {},
          ),
        ),
      fetchRobotsRules: async () => ok({ isAllowed: (url: string) => !url.includes('/admin'), sitemaps: [] }),
      fetchSitemapUrls: async () => ok([]),
    }
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pages.map((p) => p.url)).not.toContain(admin)
  })

  test('crawlExcludePaths eşleşen path\'i taramaz', async () => {
    const home = 'https://ornek.com/'
    const cart = 'https://ornek.com/cart'
    const provider = fakeCrawlProvider({
      [home]: emptyPage(home, {
        internalLinks: [{ sourceUrl: home, targetUrl: cart, anchorText: 'sepet', isInternal: true }],
      }),
      [cart]: emptyPage(cart),
    })
    const excludingConfig = ProjectConfigSchema.parse({ ...config, crawlExcludePaths: ['/cart'] })
    const result = await collectCrawl(providersWith(provider), excludingConfig, [home])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.pages.map((p) => p.url)).not.toContain(cart)
  })

  test('tek sayfanın ağ hatası (err) tüm taramayı düşürmez — degradedPage\'e döner', async () => {
    const home = 'https://ornek.com/'
    const broken = 'https://ornek.com/kirik'
    const provider: CrawlProvider = {
      name: 'fake-crawl',
      isMock: true,
      fetchPage: async (url) => {
        if (url === broken) return err(new ProviderError('fake-crawl', 'zaman aşımı'))
        return ok(
          emptyPage(url, {
            internalLinks: [{ sourceUrl: home, targetUrl: broken, anchorText: 'kırık', isInternal: true }],
          }),
        )
      },
      fetchRobotsRules: async () => ok({ isAllowed: () => true, sitemaps: [] }),
      fetchSitemapUrls: async () => ok([]),
    }
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const brokenPage = result.value.pages.find((p) => p.url === broken)
      expect(brokenPage?.fetchError).toContain('zaman aşımı')
      expect(brokenPage?.statusCode).toBeNull()
    }
  })

  test('Faz 4.2 — depth BFS seviyesini yansıtır: seed 0, bir dalga sonrası bulunan sayfa 1', async () => {
    const home = 'https://ornek.com/'
    const about = 'https://ornek.com/hakkimizda'
    const provider = fakeCrawlProvider({
      [home]: emptyPage(home, {
        internalLinks: [{ sourceUrl: home, targetUrl: about, anchorText: 'Hakkımızda', isInternal: true }],
      }),
      [about]: emptyPage(about),
    })
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.pages.find((p) => p.url === home)?.depth).toBe(0)
      expect(result.value.pages.find((p) => p.url === about)?.depth).toBe(1)
    }
  })

  test('robots.txt çekimi tamamen başarısız olursa err döner', async () => {
    const home = 'https://ornek.com/'
    const provider: CrawlProvider = {
      name: 'fake-crawl',
      isMock: true,
      fetchPage: async (url) => ok(emptyPage(url)),
      fetchRobotsRules: async () => err(new ProviderError('fake-crawl', 'ağ hatası')),
      fetchSitemapUrls: async () => ok([]),
    }
    const result = await collectCrawl(providersWith(provider), config, [home])
    expect(result.ok).toBe(false)
  })
})
