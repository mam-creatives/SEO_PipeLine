import * as cheerio from 'cheerio'
import { CSR_SUSPECT_MIN_SCRIPT_TAGS, CSR_SUSPECT_TEXT_RATIO } from '../../config/constants.js'
import type { CrawledPage, PageLink, RedirectHop } from '../../core/types.js'
import { parseContentType, parseLinkHreflangs, pickSecurityHeaders, parseXRobotsTag } from './crawlHeaderParser.js'

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'
const NON_NAVIGABLE_PROTOCOLS = new Set(['javascript:', 'mailto:', 'tel:', 'sms:'])

/** JSON-LD script içeriğinden `@type`(ler)i çıkarır — dizi ya da tekil obje, `@graph` sarmalı dahil. */
const extractSchemaTypes = ($: cheerio.CheerioAPI): readonly string[] => {
  const types: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim()
    if (raw === '') return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed]
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue
      const graph = (node as Record<string, unknown>)['@graph']
      const candidates = Array.isArray(graph) ? graph : [node]
      for (const candidate of candidates) {
        if (typeof candidate !== 'object' || candidate === null) continue
        const type = (candidate as Record<string, unknown>)['@type']
        if (typeof type === 'string') types.push(type)
        else if (Array.isArray(type)) types.push(...type.filter((t): t is string => typeof t === 'string'))
      }
    }
  })
  return types
}

const resolveLinks = (
  $: cheerio.CheerioAPI,
  baseUrl: string,
): { readonly internalLinks: readonly PageLink[]; readonly externalLinkCount: number } => {
  const baseHost = new URL(baseUrl).host
  const internalLinks: PageLink[] = []
  let externalLinkCount = 0

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (href === undefined || href.trim() === '' || href.startsWith('#')) return

    let resolved: URL
    try {
      resolved = new URL(href, baseUrl)
    } catch {
      return
    }
    if (NON_NAVIGABLE_PROTOCOLS.has(resolved.protocol)) return

    const anchorText = $(el).text().trim()
    if (resolved.host === baseHost) {
      internalLinks.push({ sourceUrl: baseUrl, targetUrl: resolved.href, anchorText, isInternal: true })
    } else {
      externalLinkCount += 1
    }
  })

  return { internalLinks, externalLinkCount }
}

/** `<link rel="alternate" hreflang="...">` etiketlerindeki dil kodlarını toplar — Faz 4.3. */
const hreflangsOf = ($: cheerio.CheerioAPI): readonly string[] => {
  const codes: string[] = []
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const code = $(el).attr('hreflang')
    if (code !== undefined && code.trim() !== '') codes.push(code.trim())
  })
  return codes
}

const wordCountOf = ($: cheerio.CheerioAPI): number => {
  const text = $('body').text().trim()
  if (text === '') return 0
  return text.split(/\s+/).length
}

/**
 * Ucuz CSR (istemci-taraflı render) sezgisi — Faz 4.1. İstemci tarafında render edilen bir
 * sitede (Next.js CSR, Vue, herhangi bir SPA) ham HTML neredeyse boş gelir; crawler bunu
 * yorumlamadan "title yok"/"H1 yok" gibi kendinden emin ama sahte bulgulara çevirirdi
 * (bkz. `detectOnPageIssues.ts`'teki bastırma). Bilimsel bir ölçüm değil: görünür metin / ham
 * HTML boyutu oranı çok düşükse VE script sayısı yüksekse "muhtemelen CSR" işaretlenir — tek
 * başına script sayısı güvenilmez (analytics/chat widget'ları normal sitelerde de yaygın),
 * ikisinin birlikte olması yanlış pozitifi azaltır.
 *
 * JSON-LD scriptleri sayılmaz — yapılandırılmış veridir, CSR sinyali değildir.
 */
export const detectLikelyClientRendered = ($: cheerio.CheerioAPI, rawHtml: string): boolean => {
  if (rawHtml.length === 0) return false
  const visibleTextLength = $('body').text().trim().length
  const textRatio = visibleTextLength / rawHtml.length
  const scriptCount = $('script:not([type="application/ld+json"])').length
  return textRatio < CSR_SUSPECT_TEXT_RATIO && scriptCount >= CSR_SUSPECT_MIN_SCRIPT_TAGS
}

/**
 * Ham HTML → yapılandırılmış on-page veri. Saf fonksiyon — ağ çağrısı yok, statusCode/finalUrl
 * fetch katmanından geçirilir. HTTP durumunu YORUMLAMAZ: 404 gövdesi de aynen ayrıştırılır,
 * "bu bir hata mı" kararı `detectOnPageIssues`/`detectLinkIssues`'a aittir.
 *
 * `headers` — Faz 5.1 — varsayılan `{}`: mevcut çağrı yerlerini (testler dahil) kırmadan
 * opsiyonel kalır, ama gerçek crawlProvider.ts her zaman gerçek yanıt başlıklarını geçirir.
 */
export const parseHtmlPage = (
  html: string,
  url: string,
  statusCode: number,
  finalUrl: string,
  headers: Readonly<Record<string, string>> = {},
  redirectChain: readonly RedirectHop[] = [],
  redirectLoop = false,
): CrawledPage => {
  const $ = cheerio.load(html)

  const descriptionEl = $('meta[name="description"]')
  const metaDescription = descriptionEl.length === 0 ? null : (descriptionEl.attr('content') ?? '')

  const robotsEl = $('meta[name="robots"]')
  const metaRobots = robotsEl.length === 0 ? null : (robotsEl.attr('content') ?? null)

  const headingOrder = $(HEADING_SELECTOR)
    .toArray()
    .map((el) => el.tagName.toLowerCase())
  const h1s = $('h1')
    .toArray()
    .map((el) => $(el).text().trim())

  const schemaTypes = extractSchemaTypes($)
  const imagesMissingAlt = $('img').toArray().filter((el) => $(el).attr('alt') === undefined).length

  const ogTitle = $('meta[property="og:title"]').attr('content')
  const ogDescription = $('meta[property="og:description"]').attr('content')
  const ogImage = $('meta[property="og:image"]').attr('content')
  const ogComplete = ogTitle !== undefined && ogDescription !== undefined && ogImage !== undefined

  const { internalLinks, externalLinkCount } = resolveLinks($, finalUrl)

  return {
    url,
    statusCode,
    finalUrl,
    fetchError: null,
    title: $('title').first().text().trim() || null,
    metaDescription,
    canonicalUrl: $('link[rel="canonical"]').attr('href') ?? null,
    h1s,
    headingOrder,
    hasSchemaOrg: schemaTypes.length > 0,
    schemaTypes,
    ogComplete,
    imagesMissingAlt,
    wordCount: wordCountOf($),
    metaRobots,
    internalLinks,
    externalLinkCount,
    likelyClientRendered: detectLikelyClientRendered($, html),
    // Yer tutucu — BFS derinliğini yalnız orkestrasyon (crawlSite.ts) bilir, burada EZİLİR.
    depth: 0,
    hreflangs: hreflangsOf($),
    xRobotsTag: parseXRobotsTag(headers),
    contentType: parseContentType(headers),
    headerHreflangs: parseLinkHreflangs(headers),
    securityHeaders: pickSecurityHeaders(headers),
    redirectChain,
    redirectLoop,
  }
}
