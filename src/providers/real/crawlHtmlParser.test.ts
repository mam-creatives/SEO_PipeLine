import { describe, expect, test } from 'vitest'
import { parseHtmlPage } from './crawlHtmlParser.js'
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
})
