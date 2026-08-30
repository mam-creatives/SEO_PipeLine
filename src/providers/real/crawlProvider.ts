import { setTimeout as delay } from 'node:timers/promises'
import { CRAWL_REQUEST_DELAY_MS, MAX_REDIRECT_HOPS } from '../../config/constants.js'
import { ProviderError } from '../../core/errors.js'
import { err, ok, type Result } from '../../core/result.js'
import type { CrawledPage, RedirectHop } from '../../core/types.js'
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
  /** Faz 5.1 — `Headers` API zaten lowercase anahtar döner (`entries()`), fetch spesifikasyonu gereği. */
  readonly headers: Readonly<Record<string, string>>
  /** Faz 5.2 — takip edilen yönlendirme adımları; boş dizi = doğrudan 200. */
  readonly redirectChain: readonly RedirectHop[]
  /** Faz 5.2 — zincirde daha önce görülen bir URL'e tekrar düşüldü, takip orada durduruldu. */
  readonly redirectLoop: boolean
}

const isRedirectStatus = (status: number): boolean => status >= 300 && status < 400

const buildFetchResult = async (
  response: Response,
  finalUrl: string,
  redirectChain: readonly RedirectHop[],
  redirectLoop: boolean,
): Promise<FetchTextResult> => ({
  status: response.status,
  finalUrl,
  // Döngü/limit durumunda gövde bir 3xx yanıta ait olabilir (genelde boş/kısa) — .text() yine de güvenli.
  body: await response.text().catch(() => ''),
  headers: Object.fromEntries(response.headers.entries()),
  redirectChain,
  redirectLoop,
})

/**
 * GET + zaman aşımı + dürüst UA — ve `redirect: 'manual'` ile YÖNLENDİRME ZİNCİRİNİ ELLE TAKİP
 * EDER (Faz 5.2). `fetch()`'in varsayılan otomatik takibi ara adımları gizler; yalnız nihai
 * URL'i bilmek redirect zinciri uzunluğunu, döngüleri, 301/302 ayrımını görünmez kılardı.
 * Aynı URL zincirde ikinci kez görülürse `redirectLoop: true` ile durdurulur (sonsuz döngüye
 * girmez); `MAX_REDIRECT_HOPS` aşılırsa da son yanıt "final" sayılıp durdurulur.
 * Yalnız ağ/timeout hatası err() döner — HTTP durumu (3xx dahil) veridir.
 */
const fetchText = async (url: string): Promise<Result<FetchTextResult, ProviderError>> => {
  const redirectChain: RedirectHop[] = []
  const visitedUrls = new Set<string>([url])
  let currentUrl = url

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let response: Response
    try {
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'manual',
      })
    } catch (cause) {
      return err(new ProviderError(PROVIDER_NAME, `'${url}' için istek başarısız.`, { cause }))
    }

    const location = response.headers.get('location')
    const isRedirect = isRedirectStatus(response.status) && location !== null && location.trim() !== ''
    if (!isRedirect || hop === MAX_REDIRECT_HOPS) {
      return ok(await buildFetchResult(response, currentUrl, redirectChain, false))
    }

    let nextUrl: string
    try {
      nextUrl = new URL(location, currentUrl).href
    } catch {
      // Location çözülemedi (bozuk yapılandırma) — burada dur, elimizdeki 3xx yanıtı final say.
      return ok(await buildFetchResult(response, currentUrl, redirectChain, false))
    }

    redirectChain.push({ url: currentUrl, statusCode: response.status })

    if (visitedUrls.has(nextUrl)) {
      return ok(await buildFetchResult(response, currentUrl, redirectChain, true))
    }
    visitedUrls.add(nextUrl)
    currentUrl = nextUrl
  }

  // Yukarıdaki `hop === MAX_REDIRECT_HOPS` dalı her zaman döner — TS'in tamlık denetimi için.
  return err(new ProviderError(PROVIDER_NAME, `'${url}' için yönlendirme sınırı aşıldı.`))
}

/**
 * Crawler sağlayıcısı — anahtar gerektirmez, yalnız `fetch`. `registry.ts` bunu
 * CRAWL_PROVIDER=live açıkça verilmedikçe seçmez (müşterinin canlı sitesine gerçek istek).
 */
export const createCrawlProvider = (): CrawlProvider => ({
  name: PROVIDER_NAME,
  isMock: false,

  fetchPage: async (url: string): Promise<Result<CrawledPage, ProviderError>> => {
    // Nezaket gecikmesi: yalnız GERÇEK sunucuya karşı anlamlı, bu yüzden orkestrasyon
    // katmanında (crawlSite.ts) değil burada — mock/fake sağlayıcılarla testler yavaşlamaz.
    await delay(CRAWL_REQUEST_DELAY_MS)
    const fetched = await fetchText(url)
    if (!fetched.ok) return fetched
    return ok(
      parseHtmlPage(
        fetched.value.body,
        url,
        fetched.value.status,
        fetched.value.finalUrl,
        fetched.value.headers,
        fetched.value.redirectChain,
        fetched.value.redirectLoop,
      ),
    )
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
