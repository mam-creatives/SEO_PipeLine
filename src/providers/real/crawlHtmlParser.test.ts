import * as cheerio from 'cheerio'
import { describe, expect, test } from 'vitest'
import { detectLikelyClientRendered, parseHtmlPage } from './crawlHtmlParser.js'
import { MAMCREATIVES_HOMEPAGE_HTML } from './fixtures/mamcreativesHomepage.js'

const REQUESTED_URL = 'https://mamcreatives.com/'
const FINAL_URL = 'https://www.mamcreatives.com/'

describe('parseHtmlPage', () => {
  test('gerçek (kusurlu) mamcreatives.com anasayfasını doğru ayrıştırır', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)

    expect(page.url).toBe(REQUESTED_URL)
    expect(page.finalUrl).toBe(FINAL_URL)
    expect(page.statusCode).toBe(200)
    expect(page.fetchError).toBeNull()
    expect(page.title).toBe('MAM Creatives | Reklam Ajansı & Yazılım Şirketi')
    expect(page.canonicalUrl).toBe('https://www.mamcreatives.com/')
  })

  test('boş meta description "" olarak gelir, etiket tamamen yoksa null olur', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.metaDescription).toBe('')

    const noMetaAtAll = parseHtmlPage('<html><head><title>t</title></head><body></body></html>', REQUESTED_URL, 200, FINAL_URL)
    expect(noMetaAtAll.metaDescription).toBeNull()
  })

  test('hiç h1 yoksa boş dizi döner, başlık sırası gerçek DOM sırasını korur', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.h1s).toEqual([])
    expect(page.headingOrder).toEqual(['h3', 'h2', 'h3', 'h4', 'h2', 'h3', 'h3', 'h3'])
  })

  test('schema.org (JSON-LD) yoksa hasSchemaOrg false ve schemaTypes boş', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.hasSchemaOrg).toBe(false)
    expect(page.schemaTypes).toEqual([])
  })

  test('geçerli JSON-LD şema tiplerini çıkarır', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"LocalBusiness","name":"Test"}
    </script></head><body></body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    expect(page.hasSchemaOrg).toBe(true)
    expect(page.schemaTypes).toEqual(['LocalBusiness'])
  })

  test('bozuk JSON-LD sessizce atlanır, sayfanın geri kalanını bozmaz', () => {
    const html = `<html><head><script type="application/ld+json">{ bozuk json </script>
      <title>t</title></head><body></body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    expect(page.hasSchemaOrg).toBe(false)
    expect(page.title).toBe('t')
  })

  test('schemaFields her blok için @type + var olan üst-seviye alan adlarını taşır', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","name":"Ürün","offers":{"price":"100"}}
    </script></head><body></body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    expect(page.schemaFields).toEqual([{ type: 'Product', keys: ['name', 'offers', 'offers.price'] }])
  })

  test('schemaFields iç içe (offers.price gibi) BİR seviye alt anahtarı da çıkarır', () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"Product","offers":{"price":"100","priceCurrency":"TRY"}}
    </script></head><body></body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    const block = page.schemaFields[0]
    expect(block?.keys).toContain('offers.price')
    expect(block?.keys).toContain('offers.priceCurrency')
  })

  test('schema yoksa schemaFields boş dizi döner', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.schemaFields).toEqual([])
  })

  test('viewport meta ve html lang etiketleri ayrıştırılır, yoksa null döner', () => {
    const withBoth = parseHtmlPage(
      '<html lang="tr"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
      REQUESTED_URL,
      200,
      FINAL_URL,
    )
    expect(withBoth.viewportMeta).toBe('width=device-width, initial-scale=1')
    expect(withBoth.langAttribute).toBe('tr')

    const withoutEither = parseHtmlPage('<html><head></head><body></body></html>', REQUESTED_URL, 200, FINAL_URL)
    expect(withoutEither.viewportMeta).toBeNull()
    expect(withoutEither.langAttribute).toBeNull()
  })

  test('düz HTTP kaynaklarını (img/script/link/iframe) mixedContentCount olarak sayar', () => {
    const html = `<html><body>
      <img src="http://x.com/a.jpg">
      <script src="http://x.com/a.js"></script>
      <img src="https://x.com/guvenli.jpg">
      </body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    expect(page.mixedContentCount).toBe(2)
  })

  test('width veya height eksik görselleri imagesMissingDimensions olarak sayar', () => {
    const html = `<html><body>
      <img src="a.jpg" width="100" height="100">
      <img src="b.jpg" width="100">
      <img src="c.jpg">
      </body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    expect(page.imagesMissingDimensions).toBe(2)
  })

  test('og:image var ama og:title/og:description yoksa ogComplete false', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.ogComplete).toBe(false)
  })

  test('og:title + og:description + og:image üçü de doluysa ogComplete true', () => {
    const html = `<html><head>
      <meta property="og:title" content="Başlık">
      <meta property="og:description" content="Açıklama">
      <meta property="og:image" content="https://x.com/img.png">
      </head><body></body></html>`
    const page = parseHtmlPage(html, REQUESTED_URL, 200, FINAL_URL)
    expect(page.ogComplete).toBe(true)
  })

  test('alt özniteliği eksik görselleri sayar', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.imagesMissingAlt).toBe(1)
  })

  test('iç linkleri mutlak URL\'e çözer, javascript:/tel:/mailto: hariç tutulur', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    const targets = page.internalLinks.map((link) => link.targetUrl)

    expect(targets).toContain('https://www.mamcreatives.com/hakkimizda')
    expect(targets).toContain('https://www.mamcreatives.com/hizmet/dijital-pazarlama')
    expect(targets).not.toContain('javascript:void(0);')
    expect(targets.some((t) => t.startsWith('tel:'))).toBe(false)
    expect(targets.some((t) => t.startsWith('mailto:'))).toBe(false)
  })

  test('dış linkleri sayar (instagram.com), iç link listesine dahil etmez', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.externalLinkCount).toBe(1)
    expect(page.internalLinks.some((link) => link.targetUrl.includes('instagram'))).toBe(false)
  })

  test('meta robots içeriği yoksa null, varsa aynen taşınır', () => {
    const noRobots = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(noRobots.metaRobots).toBeNull()

    const withRobots = parseHtmlPage(
      '<html><head><meta name="robots" content="noindex,nofollow"></head><body></body></html>',
      REQUESTED_URL,
      200,
      FINAL_URL,
    )
    expect(withRobots.metaRobots).toBe('noindex,nofollow')
  })

  test('4xx durum kodunu şeffafça taşır — parser HTTP katmanını yorumlamaz', () => {
    const page = parseHtmlPage('<html><head><title>404</title></head><body></body></html>', REQUESTED_URL, 404, REQUESTED_URL)
    expect(page.statusCode).toBe(404)
    expect(page.fetchError).toBeNull()
  })

  test('gerçek mamcreatives.com anasayfası (script yok, içerik dolu) likelyClientRendered false döner', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.likelyClientRendered).toBe(false)
  })

  test('hreflang etiketleri toplanır, yoksa boş dizi döner', () => {
    const withHreflang = parseHtmlPage(
      `<html><head>
        <link rel="alternate" hreflang="tr" href="https://x.com/tr/">
        <link rel="alternate" hreflang="en" href="https://x.com/en/">
      </head><body></body></html>`,
      REQUESTED_URL,
      200,
      FINAL_URL,
    )
    expect(withHreflang.hreflangs).toEqual(['tr', 'en'])

    const withoutHreflang = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(withoutHreflang.hreflangs).toEqual([])
  })

  test('headers verilmezse (varsayılan {}) tüm başlık-türevi alanlar null/boş döner', () => {
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL)
    expect(page.xRobotsTag).toBeNull()
    expect(page.contentType).toBeNull()
    expect(page.headerHreflangs).toEqual([])
    expect(page.securityHeaders).toEqual([])
  })

  test('HTTP başlıkları verilirse X-Robots-Tag/Content-Type/Link-hreflang/güvenlik başlıkları ayrıştırılır', () => {
    const headers = {
      'x-robots-tag': 'noindex',
      'content-type': 'text/html; charset=utf-8',
      link: '<https://x.com/tr/>; rel="alternate"; hreflang="tr"',
      'strict-transport-security': 'max-age=31536000',
    }
    const page = parseHtmlPage(MAMCREATIVES_HOMEPAGE_HTML, REQUESTED_URL, 200, FINAL_URL, headers)
    expect(page.xRobotsTag).toBe('noindex')
    expect(page.contentType).toBe('text/html')
    expect(page.headerHreflangs).toEqual(['tr'])
    expect(page.securityHeaders).toEqual(['strict-transport-security'])
  })
})

describe('detectLikelyClientRendered', () => {
  test('boş body + çok script (SPA kabuğu) → muhtemelen CSR', () => {
    const html = `<!DOCTYPE html><html><head>
      <script src="/static/js/main.abc123.js"></script>
      <script src="/static/js/vendor.def456.js"></script>
      <script src="/static/js/runtime.ghi789.js"></script>
      <script src="https://www.googletagmanager.com/gtag/js"></script>
      <script>window.dataLayer=window.dataLayer||[];</script>
      </head><body><div id="root"></div></body></html>`
    const $ = cheerio.load(html)
    expect(detectLikelyClientRendered($, html)).toBe(true)
  })

  test('içerik-zengin sayfa, çok script olsa bile → CSR değil (metin oranı yüksek)', () => {
    const paragraph = 'Bu gerçek bir içerik paragrafıdır ve tekrar tekrar yazılarak sayfayı doldurur. '.repeat(20)
    const html = `<html><head>
      <script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>
      <script src="/d.js"></script><script src="/e.js"></script>
      </head><body><p>${paragraph}</p></body></html>`
    const $ = cheerio.load(html)
    expect(detectLikelyClientRendered($, html)).toBe(false)
  })

  test('boş body ama script sayısı eşiğin altında → CSR değil (tek başına düşük metin yetmez)', () => {
    const html = `<html><head><script src="/a.js"></script></head><body><div id="root"></div></body></html>`
    const $ = cheerio.load(html)
    expect(detectLikelyClientRendered($, html)).toBe(false)
  })

  test('JSON-LD scripti script sayısına dahil edilmez', () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"WebPage"}</script>
      </head><body><div id="root"></div></body></html>`
    const $ = cheerio.load(html)
    expect(detectLikelyClientRendered($, html)).toBe(false)
  })

  test('boş ham HTML için false döner (savunmacı)', () => {
    const $ = cheerio.load('')
    expect(detectLikelyClientRendered($, '')).toBe(false)
  })
})
