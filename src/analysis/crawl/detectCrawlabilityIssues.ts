import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'

const NOINDEX_PATTERN = /noindex/i
const UNREACHED_SITEMAP_PREVIEW_COUNT = 5

const noSitemapFinding = (sitemapUrls: readonly string[]): Finding | null => {
  if (sitemapUrls.length > 0) return null
  return {
    category: 'indexing',
    severity: 'medium',
    url: null,
    culpritSelector: null,
    title: 'sitemap.xml bulunamadı',
    explanation:
      "robots.txt üzerinden ya da varsayılan konumdan bir sitemap bulunamadı. Sitemap, Google'ın sitenizin " +
      'tüm sayfalarını hızlıca keşfetmesini sağlayan, kurulumu ücretsiz bir sinyaldir.',
    evidence: 'sitemap.xml: (yok)',
    impact: estimateImpact('medium'),
    effort: 'small',
    fixSnippet: 'Sitemap: https://ornek.com/sitemap.xml  # robots.txt sonuna eklenir',
  }
}

/** Sayfa hem noindex diyor hem sitemap'te listeleniyor — Google'a çelişkili sinyal, tarama bütçesi israfı. */
const noindexContradictionFindings = (pages: readonly CrawledPage[], sitemapUrls: readonly string[]): readonly Finding[] => {
  const sitemapSet = new Set(sitemapUrls)
  return pages
    .filter((page) => page.metaRobots !== null && NOINDEX_PATTERN.test(page.metaRobots))
    .filter((page) => sitemapSet.has(page.url) || (page.finalUrl !== null && sitemapSet.has(page.finalUrl)))
    .map((page) => ({
      category: 'indexing',
      severity: 'high',
      url: page.url,
      culpritSelector: 'meta[name="robots"]',
      title: "Sayfa hem noindex hem sitemap'te — çelişkili sinyal",
      explanation:
        `Sayfa meta robots ile "${page.metaRobots}" diyerek Google'a indeksleme diyor ama sitemap.xml'de de ` +
        "listelenerek \"buraya bak\" diyor. Google genelde noindex'e uyar ama bu çelişki tarama bütçesini boşa harcar.",
      evidence: `metaRobots: "${page.metaRobots}", sitemap.xml'de mevcut`,
      impact: estimateImpact('high'),
      effort: 'trivial',
      fixSnippet: null,
    }))
}

/** sitemap.xml'de listelenen ama taranan hiçbir sayfaya (iç link zinciriyle) ulaşılamamış URL'ler. */
const unreachedSitemapUrlFindings = (pages: readonly CrawledPage[], sitemapUrls: readonly string[]): readonly Finding[] => {
  if (sitemapUrls.length === 0) return []
  const crawledSet = new Set<string>()
  for (const page of pages) {
    crawledSet.add(page.url)
    if (page.finalUrl !== null) crawledSet.add(page.finalUrl)
  }
  const unreached = sitemapUrls.filter((url) => !crawledSet.has(url))
  if (unreached.length === 0) return []
  const preview = unreached.slice(0, UNREACHED_SITEMAP_PREVIEW_COUNT).join(', ')
  const rest =
    unreached.length > UNREACHED_SITEMAP_PREVIEW_COUNT ? ` (+${unreached.length - UNREACHED_SITEMAP_PREVIEW_COUNT} daha)` : ''
  return [
    {
      category: 'indexing',
      severity: 'low',
      url: null,
      culpritSelector: null,
      title: `sitemap.xml'de olup taranamayan ${unreached.length} URL`,
      explanation:
        'sitemap.xml bu adresleri listeliyor ama crawler onlara hiçbir iç linkten ulaşamadı — tarama bütçesi ' +
        'sınırına takılmış olabilirler ya da gerçekten hiçbir sayfadan linklenmiyor olabilirler.',
      evidence: `${preview}${rest}`,
      impact: estimateImpact('low'),
      effort: 'medium',
      fixSnippet: null,
    },
  ]
}

/**
 * Sitemap/robots kaynaklı taranabilirlik bulguları — saf fonksiyon.
 * `sitemapUrls` boşsa yalnız "sitemap yok" bulgusu üretir, diğer iki kural sessizce atlanır
 * (karşılaştıracak bir kaynak yok, hata değil).
 */
export const detectCrawlabilityIssues = (pages: readonly CrawledPage[], sitemapUrls: readonly string[]): readonly Finding[] => {
  const noSitemap = noSitemapFinding(sitemapUrls)
  return [
    ...(noSitemap === null ? [] : [noSitemap]),
    ...noindexContradictionFindings(pages, sitemapUrls),
    ...unreachedSitemapUrlFindings(pages, sitemapUrls),
  ]
}
