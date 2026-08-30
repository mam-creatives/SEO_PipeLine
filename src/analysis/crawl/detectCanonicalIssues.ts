import { estimateImpact, type Finding } from '../../core/findings.js'
import type { CrawledPage } from '../../core/types.js'
import { isNoindexed } from './detectCrawlabilityIssues.js'

const isEvaluable = (page: CrawledPage): boolean => page.statusCode !== null && page.statusCode >= 200 && page.statusCode < 300

/**
 * trailing slash, http/https şeması, www öneki, sondaki index.html ve sorgu parametresi sırası
 * farklarını yok sayar — aksi halde "https://x.com/a" ile "http://www.x.com/a/" teknik olarak
 * aynı sayfa olduğu halde "farklı" sayılıp yanlış pozitif üretirdi.
 */
const normalizeUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.searchParams.sort()
    let pathname = parsed.pathname
    if (pathname.endsWith('/index.html')) pathname = pathname.slice(0, -'index.html'.length)
    if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.slice(0, -1)
    const host = parsed.host.startsWith('www.') ? parsed.host.slice(4) : parsed.host
    return `${host}${pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** Taranmış her sayfayı hem kendi URL'i hem finalUrl'i (yönlendirme sonrası) altında bulunabilir kılar. */
const crawledLookup = (pages: readonly CrawledPage[]): ReadonlyMap<string, CrawledPage> => {
  const byNormalized = new Map<string, CrawledPage>()
  for (const page of pages) {
    byNormalized.set(normalizeUrl(page.url), page)
    if (page.finalUrl !== null) byNormalized.set(normalizeUrl(page.finalUrl), page)
  }
  return byNormalized
}

interface CanonicalPair {
  readonly page: CrawledPage
  readonly target: CrawledPage
}

/** Yalnız hedefi TARANMIŞ sayfalar değerlendirilir — hedef taranmadıysa karar verecek veri yok, uydurulmaz. */
const withCrawledCanonicalTarget = (pages: readonly CrawledPage[], lookup: ReadonlyMap<string, CrawledPage>): readonly CanonicalPair[] =>
  pages.flatMap((page): readonly CanonicalPair[] => {
    if (page.canonicalUrl === null) return []
    const target = lookup.get(normalizeUrl(page.canonicalUrl))
    return target === undefined ? [] : [{ page, target }]
  })

const unreachableTargetFindings = (pairs: readonly CanonicalPair[]): readonly Finding[] =>
  pairs
    .filter(({ target }) => target.fetchError !== null || (target.statusCode !== null && target.statusCode >= 400))
    .map(({ page, target }) => {
      const statusLabel = target.fetchError ?? `HTTP ${target.statusCode}`
      return {
        category: 'indexing',
        severity: 'critical',
        url: page.url,
        culpritSelector: 'link[rel="canonical"]',
        title: 'Canonical hedefi erişilemiyor',
        explanation:
          `Bu sayfa <link rel="canonical"> ile "${target.url}" adresini işaret ediyor ama o adres ${statusLabel} ` +
          'ile sonuçlanıyor. Google\'a "asıl içerik orada" deniyor ama orası erişilemez — sayfa fiilen kanoniksiz kalır.',
        evidence: `canonical: ${target.url} → ${statusLabel}`,
        impact: estimateImpact('critical'),
        effort: 'small',
        fixSnippet: null,
      }
    })

const redirectingTargetFindings = (pairs: readonly CanonicalPair[]): readonly Finding[] =>
  pairs
    .filter(({ target }) => target.redirectChain.length > 0)
    .map(({ page, target }) => ({
      category: 'indexing',
      severity: 'high',
      url: page.url,
      culpritSelector: 'link[rel="canonical"]',
      title: 'Canonical hedefi kendisi bir yönlendirme',
      explanation:
        `Bu sayfa <link rel="canonical"> ile "${target.url}" adresini işaret ediyor ama o adresin kendisi ` +
        `"${target.finalUrl ?? '?'}" adresine yönlendiriyor. Canonical NİHAİ adresi göstermeli — aradaki her hop ` +
        "Google'ın kanonik sinyalini zayıflatır.",
      evidence: `canonical: ${target.url} → 30x → ${target.finalUrl ?? '?'}`,
      impact: estimateImpact('high'),
      effort: 'small',
      fixSnippet: null,
    }))

const canonicalChainFindings = (pairs: readonly CanonicalPair[]): readonly Finding[] =>
  pairs
    .filter(({ target }) => target.canonicalUrl !== null && normalizeUrl(target.canonicalUrl) !== normalizeUrl(target.url))
    .map(({ page, target }) => ({
      category: 'indexing',
      severity: 'high',
      url: page.url,
      culpritSelector: 'link[rel="canonical"]',
      title: 'Canonical zinciri (çift yönlendirme)',
      explanation:
        `Bu sayfa "${target.url}" adresini canonical gösteriyor ama o sayfanın KENDİ canonical'ı da başka bir ` +
        `adresi ("${target.canonicalUrl}") gösteriyor. Google zincirleri takip etmeyi reddedebilir — canonical ` +
        'doğrudan zincirin son halkasını göstermeli.',
      evidence: `${page.url} → canonical → ${target.url} → canonical → ${target.canonicalUrl}`,
      impact: estimateImpact('high'),
      effort: 'small',
      fixSnippet: null,
    }))

/**
 * Faz 5.2 — plandaki "kendine işaret etmiyor" kuralının yerine: o kural her non-self-referencing
 * canonical'ı hataya çevirirdi, oysa bu ÇOK YAYGIN kasıtlı bir kullanımdır (parametre varyantları,
 * baskı sayfaları vb. — Google'ın kendi rehberliği de destekliyor). Bunun yerine her zaman
 * gerçekten hatalı olan tek durum: canonical hedefi noindex'lenmiş bir sayfa.
 */
const canonicalToNoindexedTargetFindings = (pairs: readonly CanonicalPair[]): readonly Finding[] =>
  pairs
    .filter(({ target }) => isNoindexed(target))
    .map(({ page, target }) => ({
      category: 'indexing',
      severity: 'high',
      url: page.url,
      culpritSelector: 'link[rel="canonical"]',
      title: "Canonical, noindex'lenmiş bir sayfayı işaret ediyor",
      explanation:
        `Bu sayfa <link rel="canonical"> ile "${target.url}" adresini gösteriyor ama o sayfa noindex — ` +
        'Google\'a "beni indeksleme" diyor. Sonuç: ne bu sayfa ne de gösterdiği "asıl" sayfa indekslenir.',
      evidence: `canonical: ${target.url} (noindex)`,
      impact: estimateImpact('high'),
      effort: 'medium',
      fixSnippet: null,
    }))

/** Sayfa noindex ama BAŞKA sayfalar buraya canonical veriyor — bir öncekinin ters yönü, farklı sayfada görünür. */
const incomingCanonicalToNoindexedFindings = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const canonicalizersByTarget = new Map<string, CrawledPage[]>()
  for (const page of pages) {
    if (page.canonicalUrl === null) continue
    const key = normalizeUrl(page.canonicalUrl)
    canonicalizersByTarget.set(key, [...(canonicalizersByTarget.get(key) ?? []), page])
  }
  return pages.filter(isNoindexed).flatMap((noindexPage): readonly Finding[] => {
    const key = normalizeUrl(noindexPage.url)
    const canonicalizers = (canonicalizersByTarget.get(key) ?? []).filter((p) => p.url !== noindexPage.url)
    if (canonicalizers.length === 0) return []
    return [
      {
        category: 'indexing',
        severity: 'high',
        url: noindexPage.url,
        culpritSelector: null,
        title: 'Sayfa noindex ama başka sayfalar buraya canonical veriyor',
        explanation:
          `Bu sayfa noindex ile "beni indeksleme" diyor ama ${canonicalizers.length} başka sayfa ` +
          '<link rel="canonical"> ile "asıl içerik burada" diyerek buraya işaret ediyor. Çelişkili sinyal.',
        evidence: `Buraya canonical veren sayfalar: ${canonicalizers.map((p) => p.url).join(', ')}`,
        impact: estimateImpact('high'),
        effort: 'medium',
        fixSnippet: null,
      },
    ]
  })
}

/** Farklı domain'e canonical — içerik sendikasyonu gibi kasıtlı kullanımları da olabilir, bu yüzden düşük önemde ve "doğrulayın" diliyle. */
const crossDomainCanonicalFindings = (pages: readonly CrawledPage[]): readonly Finding[] =>
  pages.flatMap((page): readonly Finding[] => {
    if (page.canonicalUrl === null) return []
    let canonicalHost: string
    let pageHost: string
    try {
      canonicalHost = new URL(page.canonicalUrl).host.replace(/^www\./, '')
      pageHost = new URL(page.url).host.replace(/^www\./, '')
    } catch {
      return []
    }
    if (canonicalHost === pageHost) return []
    return [
      {
        category: 'indexing',
        severity: 'low',
        url: page.url,
        culpritSelector: 'link[rel="canonical"]',
        title: 'Canonical farklı bir domaine işaret ediyor',
        explanation:
          `Bu sayfanın canonical'ı "${page.canonicalUrl}" — kendi domaininde değil. Bu kasıtlı olabilir ` +
          '(içerik sendikasyonu, aynı içeriği yayınlayan başka bir domain) ama kasıtsızsa sayfa kendi ' +
          'domaininde asla "birincil" sayılmaz. Kasıtlı olduğunu doğrulayın.',
        evidence: `canonical: ${page.canonicalUrl}`,
        impact: estimateImpact('low'),
        effort: 'small',
        fixSnippet: null,
      },
    ]
  })

/**
 * Faz 5.2b — canonical DEĞERİNİ gerçekten doğrular; önceki tek kural (`detectOnPageIssues.ts`)
 * yalnız "var mı yok mu" bakıyordu — `canonicalUrl` alanı toplanıyor ama hiçbir kuralda
 * kullanılmıyordu (dış inceleme bulgusu #2'nin bir parçası). Sayfalar-arası analiz
 * (`detectCrossPageIssues.ts` deseni), saf fonksiyon.
 */
export const detectCanonicalIssues = (pages: readonly CrawledPage[]): readonly Finding[] => {
  const evaluable = pages.filter(isEvaluable)
  const lookup = crawledLookup(pages)
  const pairs = withCrawledCanonicalTarget(evaluable, lookup)
  return [
    ...unreachableTargetFindings(pairs),
    ...redirectingTargetFindings(pairs),
    ...canonicalChainFindings(pairs),
    ...canonicalToNoindexedTargetFindings(pairs),
    ...incomingCanonicalToNoindexedFindings(pages),
    ...crossDomainCanonicalFindings(evaluable),
  ]
}
