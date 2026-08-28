import { ProviderError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { CrawledPage } from '../../core/types.js'
import type { CrawlProvider, RobotsRules } from '../types.js'
import { parseHtmlPage } from './crawlHtmlParser.js'
import { parseRobotsTxt } from './crawlRobotsParser.js'
import { parseSitemapXml } from './crawlSitemapParser.js'

const PROVIDER_NAME = 'crawl'
const REQUEST_TIMEOUT_MS = 20_000
/** Dürüst UA — tarayıcı taklidi yapılmaz, site sahibi loglarında bunun bir bot olduğunu görebilmeli. */
const USER_AGENT = 'SEOPipelineBot/1.0 (+https://github.com/mam-creatives/SEO_PipeLine)'

interface FetchTextResult {
  readonly status: number
  readonly finalUrl: string
  readonly body: string
}

/** Tek ortak I/O: GET + zaman aşımı + dürüst UA. Yalnız ağ/timeout hatası err() döner — HTTP durumu veridir. */
const fetchText = async (url: string): Promise<Result<FetchTextResult, ProviderError>> => {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = await response.text()
    return ok({ status: response.status, finalUrl: response.url, body })
  } catch (cause) {
    return err(new ProviderError(PROVIDER_NAME, `'${url}' için istek başarısız.`, { cause }))
  }
}

/**
 * Crawler sağlayıcısı — anahtar gerektirmez, yalnız `fetch`. `registry.ts` bunu
 * CRAWL_PROVIDER=live açıkça verilmedikçe seçmez (müşterinin canlı sitesine gerçek istek).
 */
export const createCrawlProvider = (): CrawlProvider => ({
  name: PROVIDER_NAME,
  isMock: false,

  fetchPage: async (url: string): Promise<Result<CrawledPage, ProviderError>> => {
    const fetched = await fetchText(url)
    if (!fetched.ok) return fetched
    return ok(parseHtmlPage(fetched.value.body, url, fetched.value.status, fetched.value.finalUrl))
  },

  fetchRobotsRules: async (origin: string): Promise<Result<RobotsRules, ProviderError>> => {
    const robotsUrl = new URL('/robots.txt', origin).href
    const fetched = await fetchText(robotsUrl)
    if (!fetched.ok) return fetched
    // 404 (ya da başka bir hata durumu) → boş metin, parseRobotsTxt "her şeye izin var"a düşer.
    const body = fetched.value.status === 200 ? fetched.value.body : ''
    return ok(parseRobotsTxt(body, robotsUrl))
  },

  fetchSitemapUrls: async (sitemapUrl: string): Promise<Result<readonly string[], ProviderError>> => {
    const fetched = await fetchText(sitemapUrl)
    if (!fetched.ok) return fetched
    if (fetched.value.status !== 200) return ok([])
    return ok(parseSitemapXml(fetched.value.body))
  },
})
