import * as cheerio from 'cheerio'

/**
 * sitemap.xml → URL listesi. `<loc>` hem `<url>` (urlset) hem `<sitemap>` (sitemap index)
 * içinde aynı görünür, tek bir seçici ikisini de kapsar. Index'teki alt sitemap'ler bu MVP'de
 * RECURSIVE olarak ayrıca çekilmiyor — yalnız index'in kendi listelediği adresler döner.
 * Bozuk/boş XML hata fırlatmaz, boş dizi döner — sitemap opsiyonel bir zenginleştirmedir.
 */
export const parseSitemapXml = (xml: string): readonly string[] => {
  const $ = cheerio.load(xml, { xmlMode: true })
  return $('loc')
    .toArray()
    .map((el) => $(el).text().trim())
    .filter((loc) => loc !== '')
}
