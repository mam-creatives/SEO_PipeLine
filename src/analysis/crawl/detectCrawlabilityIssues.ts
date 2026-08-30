import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'

const NOINDEX_PATTERN = /noindex/i
const UNREACHED_SITEMAP_PREVIEW_COUNT = 5

/** meta robots VEYA X-Robots-Tag başlığı — ikisi ayrı kanal, biri "noindex" derken diğeri bilmeyebilir. */
export const isNoindexed = (page: CrawledPage): boolean =>
  (page.metaRobots !== null && NOINDEX_PATTERN.test(page.metaRobots)) ||
  (page.xRobotsTag !== null && NOINDEX_PATTERN.test(page.xRobotsTag))

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

/** Sayfa hem noindex diyor (meta ya da HTTP başlığı) hem sitemap'te listeleniyor — çelişkili sinyal, tarama bütçesi israfı. */
const noindexContradictionFindings = (pages: readonly CrawledPage[], sitemapUrls: readonly string[]): readonly Finding[] => {
  const sitemapSet = new Set(sitemapUrls)
  return pages
    .filter(isNoindexed)
    .filter((page) => sitemapSet.has(page.url) || (page.finalUrl !== null && sitemapSet.has(page.finalUrl)))
    .map((page) => {
      const source = page.metaRobots !== null && NOINDEX_PATTERN.test(page.metaRobots) ? 'meta robots' : 'X-Robots-Tag'
      const value = source === 'meta robots' ? page.metaRobots : page.xRobotsTag
      return {
        category: 'indexing',
        severity: 'high',
        url: page.url,
        culpritSelector: source === 'meta robots' ? 'meta[name="robots"]' : null,
        title: "Sayfa hem noindex hem sitemap'te — çelişkili sinyal",
        explanation:
          `Sayfa ${source} ile "${value}" diyerek Google'a indeksleme diyor ama sitemap.xml'de de ` +
          "listelenerek \"buraya bak\" diyor. Google genelde noindex'e uyar ama bu çelişki tarama bütçesini boşa harcar.",
        evidence: `${source}: "${value}", sitemap.xml'de mevcut`,
        impact: estimateImpact('high'),
        effort: 'trivial',
        fixSnippet: null,
      }
    })
}

/**
 * Faz 5.1 — X-Robots-Tag ile noindex'lenmiş sayfa: HTML'de HİÇBİR İZİ yok, tarayıcının
 * "Kaynağı Görüntüle"sinde bile görünmez. `detectOnPageIssues.ts`'in CSR bastırmasından
 * etkilenmez — bu bulgu HTTP katmanına dayanır, HTML ayrıştırmasına değil.
 */
const httpNoindexFindings = (pages: readonly CrawledPage[]): readonly Finding[] =>
  pages
    .filter((page) => page.xRobotsTag !== null && NOINDEX_PATTERN.test(page.xRobotsTag))
    .map((page) => ({
      category: 'indexing',
      severity: 'critical',
      url: page.url,
      culpritSelector: null,
      title: 'Sayfa HTTP başlığıyla indekslemeye kapatılmış',
      explanation:
        `X-Robots-Tag yanıt başlığı "${page.xRobotsTag}" değerini taşıyor. Bu HTML kaynağında hiçbir iz ` +
        'bırakmaz — sayfa kaynağına bakarak bunu fark edemezsiniz, yalnız sunucu yanıtında var. Google bu ' +
        'sayfayı indekslemez; kasıtsız bırakılmış bir sunucu/CDN kuralı olabilir.',
      evidence: `X-Robots-Tag: ${page.xRobotsTag}`,
      impact: estimateImpact('critical'),
      effort: 'small',
      fixSnippet: null,
    }))

/** Sayfa HTML gibi taranmış ama Content-Type başlığı HTML değil — tarayıcı/Google bunu render etmeyebilir. */
const contentTypeMismatchFindings = (pages: readonly CrawledPage[]): readonly Finding[] =>
  pages
    .filter((page) => page.contentType !== null && !page.contentType.includes('html'))
    .map((page) => ({
      category: 'indexing',
      severity: 'low',
      url: page.url,
      culpritSelector: null,
      title: 'Sayfa HTML olarak taranmış ama Content-Type başka bir tip bildiriyor',
      explanation:
        `Yanıtın Content-Type başlığı "${page.contentType}" — "text/html" değil. Google ve tarayıcılar bu ` +
        'bildirime güvenir; içerik gerçekte HTML olsa bile yanlış MIME tipiyle sunuluyorsa render edilmeyebilir.',
      evidence: `Content-Type: ${page.contentType}`,
      impact: estimateImpact('low'),
      effort: 'small',
      fixSnippet: null,
    }))

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

/** Faz 5.5 — HTTPS sayfada düz HTTP'den yüklenen kaynak: tarayıcı genelde bloklar/uyarır. */
const mixedContentFindings = (pages: readonly CrawledPage[]): readonly Finding[] =>
  pages
    .filter((page) => page.url.startsWith('https://') && page.mixedContentCount > 0)
    .map((page) => ({
      category: 'indexing',
      severity: 'high',
      url: page.url,
      culpritSelector: null,
      title: `${page.mixedContentCount} adet karma içerik (mixed content) kaynağı`,
      explanation:
        "Sayfa HTTPS üzerinden sunuluyor ama en az bir kaynağı (görsel/script/link/iframe) düz HTTP'den " +
        'yükleniyor. Tarayıcılar bunu genelde bloklar ya da uyarı gösterir — kullanıcı deneyimini ve güven ' +
        'sinyalini bozar.',
      evidence: `mixedContentCount: ${page.mixedContentCount}`,
      impact: estimateImpact('high'),
      effort: 'small',
      fixSnippet: null,
    }))

/** Faz 5.5 — mevcut tek-yönlü "sitemap'te olup taranamayan" kuralın simetriği: taranmış ama sitemap'te hiç geçmeyen sayfalar. */
const untrackedByCrawlSitemapFindings = (pages: readonly CrawledPage[], sitemapUrls: readonly string[]): readonly Finding[] => {
  if (sitemapUrls.length === 0) return []
  const sitemapSet = new Set(sitemapUrls)
  const untracked = pages.filter(
    (page) => page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300 && !sitemapSet.has(page.url),
  )
  if (untracked.length === 0) return []
  const preview = untracked.slice(0, UNREACHED_SITEMAP_PREVIEW_COUNT).map((p) => p.url).join(', ')
  const rest = untracked.length > UNREACHED_SITEMAP_PREVIEW_COUNT ? ` (+${untracked.length - UNREACHED_SITEMAP_PREVIEW_COUNT} daha)` : ''
  return [
    {
      category: 'indexing',
      severity: 'low',
      url: null,
      culpritSelector: null,
      title: `Taranan ama sitemap.xml'de olmayan ${untracked.length} sayfa`,
      explanation:
        "Bu sayfalar iç link zinciriyle bulundu ve başarıyla tarandı ama sitemap.xml'de listelenmiyor. " +
        "Sitemap'te olmayan sayfalar Google'a doğrudan işaret edilmiyor — keşif tamamen iç link grafiğine kalıyor.",
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
    ...httpNoindexFindings(pages),
    ...noindexContradictionFindings(pages, sitemapUrls),
    ...unreachedSitemapUrlFindings(pages, sitemapUrls),
    ...contentTypeMismatchFindings(pages),
    ...mixedContentFindings(pages),
    ...untrackedByCrawlSitemapFindings(pages, sitemapUrls),
  ]
}
